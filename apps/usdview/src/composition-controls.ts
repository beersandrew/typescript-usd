import { ViewerBusyError, type ViewerRuntime } from './contracts'
import type { CompositionCommand, CompositionResult } from './composition-types'
export const compositionMenu = '<button type="button" class="composition-open" disabled>Composition / Visibility…</button>'
export const compositionDialog = `<style>.composition-dialog{background:#383838;color:#ddd;border:1px solid #888;padding:20px;width:min(650px,90vw)}.composition-dialog::backdrop{background:#0005}.composition-dialog label{display:flex;gap:12px;align-items:center;margin:8px 0}.composition-layers{max-height:220px;overflow:auto;overflow-wrap:anywhere}.composition-dialog select{max-width:250px}.composition-error{color:#ffbd9c}.composition-dialog footer{text-align:right;margin-top:16px}</style>
<dialog class="composition-dialog" aria-label="Composition and visibility"><h2>Composition and Visibility</h2><p>Review changes use the session layer. Source files are unchanged.</p><p class="composition-path"></p><div class="composition-variants"></div><p class="composition-visibility"></p><div><button data-review="show">Show</button> <button data-review="hide">Hide</button> <button data-review="isolate">Isolate</button> <button data-review="resetVisibility">Reset Session Visibility</button></div><p><button data-review="load">Load Payloads</button> <button data-review="unload">Unload Payloads</button></p><h3>Layers</h3><p>Checked layers are muted.</p><div class="composition-layers"></div><p class="composition-error" role="alert"></p><footer><button class="composition-close">Close</button></footer></dialog>`
export class CompositionControls {
  private working = false
  private blocked = true
  constructor(private root: ShadowRoot, private runtime: () => ViewerRuntime | undefined, private selected: () => string | null, private changed: (result: CompositionResult, command: CompositionCommand) => void, private workingChanged: (busy: boolean) => void = () => {}) {}
  private get<T extends Element>(selector: string): T { return this.root.querySelector<T>(selector)! }
  bind(signal: AbortSignal) {
    const dialog = this.get<HTMLDialogElement>('.composition-dialog')
    this.get('.composition-open').addEventListener('click', () => { this.refresh(); if(dialog.showModal) dialog.showModal(); else dialog.setAttribute('open','') }, {signal})
    this.get('.composition-close').addEventListener('click', () => { if(dialog.close) dialog.close(); else dialog.removeAttribute('open') }, {signal})
    dialog.addEventListener('click', event => {
      const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-review]')?.dataset.review
      if (!action) return
      const path = this.selected()
      if (action === 'resetVisibility') void this.apply({kind:'resetVisibility'})
      else if (path && (action === 'load' || action === 'unload')) void this.apply({kind:'payload',path,loaded:action==='load'})
      else if (path && (action === 'show' || action === 'hide' || action === 'isolate')) void this.apply({kind:'visibility',path,action})
    }, {signal})
  }
  busy(value: boolean) { this.blocked = value; this.refresh() }
  refresh() {
    const runtime = this.runtime(), state = this.blocked ? undefined : runtime?.getCompositionState?.(this.selected()), disabled = this.blocked || this.working || !runtime?.applyCompositionCommand
    this.get<HTMLButtonElement>('.composition-open').disabled = disabled
    this.get('.composition-path').textContent = state?.path ?? 'Select a prim to edit variants, visibility or payloads.'
    this.get('.composition-visibility').textContent = state?.visibility ? `Computed visibility: ${state.visibility}` : ''
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-review]')) {
      const action = button.dataset.review
      button.disabled = disabled || (action==='resetVisibility' ? !state : action==='load'||action==='unload' ? !state?.loadable : !state?.imageable)
    }
    const variants = this.get('.composition-variants'); variants.replaceChildren()
    for (const variant of state?.variants ?? []) {
      const label = document.createElement('label'), select = document.createElement('select')
      label.append(document.createTextNode(variant.name)); select.add(new Option('Use authored selection',''))
      for (const name of variant.choices) select.add(new Option(name,name))
      select.value = variant.selection; select.disabled = disabled
      select.addEventListener('change', () => { void this.apply({kind:'variant',path:state!.path!,set:variant.name,selection:select.value}) })
      label.append(select); variants.append(label)
    }
    const layers = this.get('.composition-layers'); layers.replaceChildren()
    for (const layer of state?.layers ?? []) {
      const label = document.createElement('label'), input = document.createElement('input')
      input.type='checkbox'; input.checked=layer.muted; input.disabled=disabled||!layer.canMute
      input.addEventListener('change', () => { void this.apply({kind:'layer',identifier:layer.identifier,muted:input.checked}) })
      label.append(input,document.createTextNode(layer.identifier)); layers.append(label)
    }
  }
  get available() { const runtime = this.runtime(); return !this.blocked && !this.working && !!runtime?.applyCompositionCommand }
  /** One serialized session-layer edit path for the dialog, Edit menu, prim context menu and shortcuts. */
  async run(command: CompositionCommand): Promise<{ ok: true, result: CompositionResult } | { ok: false, error: unknown }> {
    const runtime = this.runtime()
    if(!this.available || !runtime?.applyCompositionCommand) return { ok: false, error: new ViewerBusyError('Wait for the current scene update before editing.') }
    this.working=true; this.workingChanged(true); this.get('.composition-error').textContent=''; this.refresh()
    try { const result = await runtime.applyCompositionCommand(command); this.changed(result, command); return { ok: true, result } }
    catch(error) { return { ok: false, error } }
    finally {this.working=false;this.workingChanged(false);this.refresh()}
  }
  private async apply(command: CompositionCommand) {
    const outcome = await this.run(command)
    if (!outcome.ok) this.get('.composition-error').textContent=outcome.error instanceof Error?outcome.error.message:String(outcome.error)
  }
}
