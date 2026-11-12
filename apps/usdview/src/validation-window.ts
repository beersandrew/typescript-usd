// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/validationWidget.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 usdviewq/validationWidget.py: Window > USD Validation.
// The validators and suites grouped by plugin with a search, the validation
// context options, and the results table. USD work happens in the runtime
// (src/usd-validation.ts, loaded on first use).
//
// The Qt widget's separate "selected validators" list (SelectedValidatorsWidget,
// validationWidget.py:235-324) is the checked rows of the tree here.
import type {
  ValidationResultRow, ValidationTimeRangeOptions, ValidatorEntry, ViewerRuntime,
} from './contracts'

const escape = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

export const validationDialog = `<style>
.validation-dialog{background:#383838;color:#ddd;border:1px solid #888;padding:16px;width:min(1100px,94vw);max-height:90vh;overflow:auto}
.validation-dialog::backdrop{background:#0005}.validation-dialog h2{margin:0 0 8px}
.validation-top{display:flex;gap:16px;align-items:flex-start}.validation-plugins{flex:1;min-width:0}
.validation-tree{max-height:300px;overflow:auto;border:1px solid #555;padding:4px}.validation-tree ul{list-style:none;margin:0;padding-left:16px}
.validation-tree label{display:flex;gap:6px;align-items:baseline}.validation-tree small{color:#aaa}
.validation-options{width:260px}.validation-options fieldset{border:1px solid #555;margin:8px 0}.validation-options label{display:flex;gap:6px;align-items:center;margin:4px 0}
.validation-options input[type=number]{width:90px}.validation-dialog input[type=search]{width:100%;box-sizing:border-box;margin:4px 0}
.validation-results table{width:100%;border-collapse:collapse}.validation-results td,.validation-results th{border:1px solid #555;padding:3px 6px;text-align:left;vertical-align:top;white-space:pre-line}
.validation-results tr[data-row]{cursor:pointer}.validation-results tr[data-row]:hover{background:#444}
.validation-type-Error{background:rgb(220,53,69);font-weight:bold}.validation-type-Warn{background:rgb(218,165,32);font-weight:bold}
.validation-type-Info{background:rgb(23,162,184);font-weight:bold}.validation-type-None{background:rgb(108,117,125);font-weight:bold}
.validation-dialog footer{display:flex;justify-content:flex-end;margin-top:8px}
</style><dialog class="validation-dialog" aria-label="USD Validation"><h2>USD Validation</h2>
<div class="validation-top"><section class="validation-plugins"><p>Available validators/suites (grouped by plugins):</p>
<input type="search" class="validation-search" placeholder="Search by plugins, validators/suites names or docs...">
<div class="validation-tree" role="tree"></div></section>
<section class="validation-options"><p>Validation Context Options:</p>
<label title="If checked, validates based on currently selected prim(s).&#10;If unchecked, validates the entire stage."><input type="checkbox" name="primsSetFromSelection"> Validate selected prim(s)</label>
<label title="If checked, includes all descendant prims of the selected prim(s).&#10;If unchecked, only validates the explicitly selected prim(s)."><input type="checkbox" name="includeDescendantPrims" disabled> Include descendant prims</label>
<fieldset><legend>Time Range Options</legend><select name="timeRangeMode"><option value="currentFrame">Current Frame</option><option value="playbackRange">Playback Range</option><option value="specificTimeRange">Specific Time Range</option></select>
<label>Start Time: <input type="number" name="startTime" value="0" min="-1000000" max="1000000" step="any" disabled></label>
<label>End Time: <input type="number" name="endTime" value="1" min="-1000000" max="1000000" step="any" disabled></label>
<label><input type="checkbox" name="includeDefaultTime"> Include Default Time</label></fieldset>
<button type="button" class="validation-run" disabled>Run Validation</button></section></div>
<section class="validation-results"><h3>Validation Results</h3><input type="search" class="validation-result-search" placeholder="Search validation results by any column..." hidden>
<p class="validation-status">No validation results yet.</p><table hidden><thead><tr><th>Validator Name</th><th>Error Name</th><th>Error Sites</th><th>Message</th><th>Type</th></tr></thead><tbody></tbody></table></section>
<footer><button type="button" class="validation-close">Close</button></footer></dialog>`

/** Window > USD Validation. */
export class ValidationWindow {
  #validators: ValidatorEntry[] = []
  #results: ValidationResultRow[] = []
  #running = false
  constructor(private root: ShadowRoot, private runtime: () => ViewerRuntime | undefined,
    private selectedPaths: () => string[], private select: (primPaths: string[]) => void,
    private playing: () => boolean = () => false) {}
  #get<T extends Element>(selector: string): T { return this.root.querySelector<T>(selector)! }
  #field<T extends HTMLInputElement | HTMLSelectElement>(name: string): T { return this.#get<T>(`.validation-dialog [name="${name}"]`) }

  bind(signal: AbortSignal) {
    const options = { signal }, dialog = this.#get<HTMLDialogElement>('.validation-dialog')
    this.#get('[data-window="validation"]').addEventListener('click', () => { void this.open() }, options)
    this.#get('.validation-close').addEventListener('click', () => { if (dialog.close) dialog.close(); else dialog.removeAttribute('open') }, options)
    this.#get('.validation-search').addEventListener('input', () => this.#filterTree(), options)
    this.#get('.validation-result-search').addEventListener('input', () => this.#filterResults(), options)
    this.#get('.validation-tree').addEventListener('change', event => this.#onItemChanged(event.target as HTMLInputElement), options)
    // validationWidget.py:347-357: descendants only apply to a selection.
    this.#field<HTMLInputElement>('primsSetFromSelection').addEventListener('change', event => {
      this.#field<HTMLInputElement>('includeDescendantPrims').disabled = !(event.target as HTMLInputElement).checked
    }, options)
    // validationWidget.py:386-401: start and end apply to a specific range.
    this.#field<HTMLSelectElement>('timeRangeMode').addEventListener('change', event => {
      const specific = (event.target as HTMLSelectElement).value === 'specificTimeRange'
      this.#field<HTMLInputElement>('startTime').disabled = !specific
      this.#field<HTMLInputElement>('endTime').disabled = !specific
    }, options)
    this.#get('.validation-run').addEventListener('click', () => { void this.run() }, options)
    this.#get('.validation-results tbody').addEventListener('dblclick', event => {
      const row = (event.target as HTMLElement).closest<HTMLElement>('tr[data-row]')
      if (row) this.#onRowDoubleClicked(Number(row.dataset.row))
    }, options)
  }

  /** Opens the window, listing the registered validators (validationWidget.py:58-119). */
  async open(): Promise<void> {
    const dialog = this.#get<HTMLDialogElement>('.validation-dialog')
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '')
    const runtime = this.runtime()
    if (!runtime?.listValidators) return
    const checked = new Set(this.selectedValidators())
    this.#validators = await runtime.listValidators()
    this.#renderTree(checked)
  }

  /** The checked validators' and suites' full names (SelectedValidatorsWidget.getSelectedValidators). */
  selectedValidators(): string[] {
    return [...this.root.querySelectorAll<HTMLInputElement>('.validation-tree input[data-validator]:checked')]
      .map(input => input.dataset.validator!)
  }

  // validationWidget.py:58-119: Select/Deselect All > plugins > validators,
  // sorted by name with "Uncategorized" last.
  #renderTree(checked: Set<string>) {
    const byPlugin = new Map<string, ValidatorEntry[]>()
    for (const entry of this.#validators) byPlugin.set(entry.pluginName, [...byPlugin.get(entry.pluginName) ?? [], entry])
    const plugins = [...byPlugin.keys()].sort((a, b) =>
      a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a < b ? -1 : a > b ? 1 : 0)
    const item = (text: string, doc: string, attrs: string) =>
      `<label><input type="checkbox" ${attrs}><span>${escape(text)}</span> <small>${escape(doc)}</small></label>`
    const pluginHtml = plugins.map(plugin => {
      const doc = plugin === 'Uncategorized' ? "Validators that don't belong to a specific plugin." : `Validators registered by ${plugin} plugin.`
      const children = byPlugin.get(plugin)!.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).map(entry =>
        `<li data-search="${escape(`${plugin} ${entry.name} ${entry.doc}`.toLowerCase())}">${item(entry.name,
          entry.isSuite ? `(Suite) ${entry.doc}` : entry.doc,
          `data-validator="${escape(entry.fullName)}"${checked.has(entry.fullName) ? ' checked' : ''}`)}</li>`).join('')
      return `<li data-plugin="${escape(plugin)}">${item(plugin, doc, `data-plugin-toggle="${escape(plugin)}"`)}<ul>${children}</ul></li>`
    }).join('')
    this.#get('.validation-tree').innerHTML = `<ul>${`<li>${item('Select/Deselect All',
      'Select or deselect all validators/suites.', 'data-all')}<ul>${pluginHtml}</ul></li>`}</ul>`
    this.#syncParents()
    this.#filterTree()
    this.#updateRunButton()
  }

  // validationWidget.py:206-234 (_onItemChanged): toggling a parent toggles
  // its children.
  #onItemChanged(input: HTMLInputElement) {
    const scope = input.dataset.all !== undefined ? this.#get('.validation-tree')
      : input.dataset.pluginToggle !== undefined ? input.closest('li')! : undefined
    if (scope) for (const child of scope.querySelectorAll<HTMLInputElement>('input[data-validator]')) child.checked = input.checked
    this.#syncParents()
    this.#updateRunButton()
  }

  #syncParents() {
    const state = (inputs: HTMLInputElement[], parent: HTMLInputElement) => {
      const on = inputs.filter(i => i.checked).length
      parent.checked = inputs.length > 0 && on === inputs.length
      parent.indeterminate = on > 0 && on < inputs.length
    }
    for (const plugin of this.root.querySelectorAll<HTMLElement>('.validation-tree li[data-plugin]')) {
      state([...plugin.querySelectorAll<HTMLInputElement>('input[data-validator]')], plugin.querySelector<HTMLInputElement>('input[data-plugin-toggle]')!)
    }
    const all = this.root.querySelector<HTMLInputElement>('.validation-tree input[data-all]')
    if (all) state([...this.root.querySelectorAll<HTMLInputElement>('.validation-tree input[data-validator]')], all)
  }

  // validationWidget.py:183-204 (_filterPluginsAndValidators).
  #filterTree() {
    const text = this.#get<HTMLInputElement>('.validation-search').value.toLowerCase()
    for (const plugin of this.root.querySelectorAll<HTMLElement>('.validation-tree li[data-plugin]')) {
      let any = false
      for (const li of plugin.querySelectorAll<HTMLElement>('li[data-search]')) {
        const show = li.dataset.search!.includes(text)
        li.hidden = !show; any ||= show
      }
      plugin.hidden = !any
    }
  }

  /** validationWidget.py:678-683 (updateRunButtonState); the viewer calls it when playback starts or stops. */
  updateRunButtonState() { this.#updateRunButton() }

  // validationWidget.py:678-683 (updateRunButtonState).
  #updateRunButton() {
    this.#get<HTMLButtonElement>('.validation-run').disabled =
      this.#running || this.selectedValidators().length === 0 || this.playing() || !this.runtime()?.runValidation
  }

  /** Runs the checked validators (validationWidget.py:693-743). */
  async run(): Promise<ValidationResultRow[]> {
    const runtime = this.runtime()
    if (!runtime?.runValidation) return []
    const mode = this.#field<HTMLSelectElement>('timeRangeMode').value as ValidationTimeRangeOptions['mode']
    const timeRange: ValidationTimeRangeOptions = { mode, includeDefaultTime: this.#field<HTMLInputElement>('includeDefaultTime').checked }
    if (mode === 'specificTimeRange') {
      timeRange.startTime = this.#field<HTMLInputElement>('startTime').valueAsNumber || 0
      timeRange.endTime = this.#field<HTMLInputElement>('endTime').valueAsNumber || 0
    }
    const fromSelection = this.#field<HTMLInputElement>('primsSetFromSelection').checked
    this.#running = true; this.#updateRunButton()
    const status = this.#get<HTMLElement>('.validation-status')
    try {
      const results = await runtime.runValidation({
        validatorNames: this.selectedValidators(), timeRange,
        ...(fromSelection ? { primPaths: this.selectedPaths(),
          includeDescendantPrims: this.#field<HTMLInputElement>('includeDescendantPrims').checked } : {}),
      })
      this.#populateResults(results)
      return results
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error); status.hidden = false
      return []
    } finally { this.#running = false; this.#updateRunButton() }
  }

  // validationWidget.py:475-543 (populateResultsAndUpdateWidget).
  #populateResults(results: ValidationResultRow[]) {
    this.#results = results
    const table = this.#get<HTMLTableElement>('.validation-results table'), status = this.#get<HTMLElement>('.validation-status')
    const search = this.#get<HTMLInputElement>('.validation-result-search')
    if (results.length === 0) {
      search.hidden = true; table.hidden = true
      status.textContent = 'No validation errors found.'; status.hidden = false
      return
    }
    search.hidden = false; status.hidden = true; table.hidden = false
    table.tBodies[0]!.innerHTML = results.map((row, index) => `<tr data-row="${index}">${[row.validatorName, row.errorName,
      row.sites.join('\n'), row.message].map(text => `<td title="${escape(text)}">${escape(text)}</td>`).join('')}<td class="validation-type-${row.type}">${row.type}</td></tr>`).join('')
    this.#filterResults()
  }

  // validationWidget.py:545-553 (_filterResultRows).
  #filterResults() {
    const text = this.#get<HTMLInputElement>('.validation-result-search').value.toLowerCase()
    for (const row of this.root.querySelectorAll<HTMLTableRowElement>('.validation-results tr[data-row]')) {
      row.hidden = ![...row.cells].some(cell => cell.textContent!.toLowerCase().includes(text))
    }
  }

  // validationWidget.py:564-620 (_onCellDoubleClicked): select the error's
  // prims, or the prim of its properties when they share one.
  #onRowDoubleClicked(index: number) {
    const row = this.#results[index]
    if (!row || row.sites.length === 0) return
    const primOf = (path: string) => path.slice(0, path.indexOf('.') < 0 ? path.length : path.indexOf('.'))
    if (row.propertyPaths.length === 0) { if (row.primPaths.length) this.select(row.primPaths); return }
    if (row.primPaths.length > 1) { this.select(row.primPaths); return }
    const primPath = row.primPaths[0] ?? primOf(row.propertyPaths[0]!)
    if (row.propertyPaths.some(path => primOf(path) !== primPath)) { if (row.primPaths.length) this.select(row.primPaths); return }
    this.select([primPath])
  }
}
