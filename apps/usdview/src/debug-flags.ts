// Ported from OpenUSD 26.11.1: pxr/base/tf/debug.h,
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/debugFlagsWidget.py
// Copyright 2016, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdview's Debug Flags window (Window > Debug Flags), ported from OpenUSD
// 26.11.1 pxr/usdImaging/usdviewq/debugFlagsWidget.py over the library's
// TfDebug registry (pxr/base/tf/debug.h). appController.py:2716-2721 makes
// the window once and shows it again on later requests.
// The window is a panel inside the viewer: see
// PLATFORM-DIVERGENCE(usdview-tool-windows) in hydra-scene-debugger-view.ts.
import { Debug as TfDebug } from 'typescript-usd/tf'
import { ToolWindow } from './hydra-scene-debugger-view'

/** debugFlagsWidget.py:15-18 _GetDebugFlagsWithPrefix */
export function debugFlagsWithPrefix(debugFlagPrefix: string): string[] {
  const prefix = `${debugFlagPrefix}_`
  return TfDebug.getDebugSymbolNames().filter(flag => flag.startsWith(prefix))
}

/** debugFlagsWidget.py:59-65 _populateDebugFlagsListView: the sorted prefixes
 *  (the name up to its first '_' after the first character). */
export function debugFlagPrefixes(): string[] {
  const prefixes = TfDebug.getDebugSymbolNames().map(x => x.indexOf('_') > 0 ? x.slice(0, x.indexOf('_')) : x)
  return [...new Set(prefixes)].sort()
}

/** One row of the table (debugFlagsWidget.py:67-88): Debug Symbol, Description. */
export interface DebugFlagRow { name: string, enabled: boolean, description: string }

/** debugFlagsWidget.py:67-88 _populateDebugFlagsTableView */
export function debugFlagRows(debugFlagPrefix: string): DebugFlagRow[] {
  return debugFlagsWithPrefix(debugFlagPrefix).map(name => ({
    name, enabled: TfDebug.isDebugSymbolNameEnabled(name), description: TfDebug.getDebugSymbolDescription(name),
  }))
}

/** debugFlagsWidget.py:95-97 _onDebugFlagChecked */
export function setDebugFlag(name: string, value: boolean): void {
  TfDebug.setDebugSymbolsByName(name, value)
}

export const debugFlagsStyles = `
.debug-flags-window { min-width:640px; min-height:300px; }
.debug-flags-window .debug-flags-body { flex:1; display:flex; gap:6px; min-height:0; padding:6px; }
.debug-flags-window .debug-flag-prefixes { flex:none; width:160px; margin:0; padding:0; list-style:none; overflow:auto; border:1px solid #252525; background:#373737; }
.debug-flags-window .debug-flag-prefixes button { display:block; width:100%; border:0; border-radius:0; background:transparent; text-align:left; padding:1px 6px; min-height:0; }
.debug-flags-window .debug-flag-prefixes button[aria-selected=true] { background:rgb(189,155,84); color:#363636; }
.debug-flags-window .debug-flag-table-host { flex:1; overflow:auto; border:1px solid #252525; background:#373737; }
.debug-flags-window table { width:100%; border-collapse:collapse; }
.debug-flags-window th { position:sticky; top:0; background:#2f2f2f; font-weight:normal; text-align:left; padding:2px 4px; border-bottom:1px solid #252525; }
.debug-flags-window th:first-child { width:200px; }
.debug-flags-window td { padding:1px 4px; vertical-align:top; }
.debug-flags-window td label { display:flex; align-items:center; gap:4px; white-space:nowrap; }
`

export const debugFlagsHtml = `<section class="tool-window debug-flags-window" role="dialog" aria-label="Debug Flags" hidden><header><h2>Debug Flags</h2><button type="button" class="tool-close" aria-label="Close Debug Flags">✕</button></header>
<div class="debug-flags-body"><ul class="debug-flag-prefixes" role="listbox" aria-label="Debug flag prefixes"></ul><div class="debug-flag-table-host"><table><thead><tr><th>Debug Symbol</th><th>Description</th></tr></thead><tbody></tbody></table></div></div></section>`

/** Window > Debug Flags */
export class DebugFlagsWindow {
  #prefixes: string[] = []
  #selected: string | undefined
  #created = false
  readonly #window: ToolWindow
  constructor(private readonly _element: HTMLElement) {
    // debugFlagsWidget.py:29 setMinimumSize(640, 300)
    this.#window = new ToolWindow(_element, 120, 100, 640, 360)
  }
  get shown(): boolean { return this.#window.shown }

  bind(signal: AbortSignal): void {
    this.#window.bind(signal)
    const list = this._element.querySelector('.debug-flag-prefixes')!
    list.addEventListener('click', event => {
      const prefix = (event.target as Element).closest<HTMLButtonElement>('[data-prefix]')?.dataset.prefix
      if (prefix !== undefined) this.select(prefix)
    }, { signal })
    this._element.querySelector('tbody')!.addEventListener('change', event => {
      const input = event.target as HTMLInputElement
      if (input.dataset.flag) setDebugFlag(input.dataset.flag, input.checked)
    }, { signal })
  }

  /** appController.py:2716-2721 _showDebugFlags */
  show(): void {
    if (!this.#created) {
      // The list is populated once, when the widget is made (debugFlagsWidget.py:38).
      this.#created = true
      this.#prefixes = debugFlagPrefixes()
      const list = this._element.querySelector('.debug-flag-prefixes')!
      list.replaceChildren(...this.#prefixes.map(prefix => {
        const li = document.createElement('li'), button = document.createElement('button')
        button.type = 'button'; button.setAttribute('role', 'option'); button.dataset.prefix = prefix; button.textContent = prefix
        button.setAttribute('aria-selected', 'false')
        li.append(button)
        return li
      }))
    }
    this.#window.show()
  }

  /** debugFlagsWidget.py:90-93 _onFlagSelectionChanged */
  select(prefix: string): void {
    this.#selected = prefix
    for (const button of this._element.querySelectorAll<HTMLButtonElement>('[data-prefix]')) {
      button.setAttribute('aria-selected', String(button.dataset.prefix === prefix))
    }
    const body = this._element.querySelector('tbody')!
    body.replaceChildren(...debugFlagRows(prefix).map(row => {
      const tr = document.createElement('tr')
      const label = document.createElement('label'), input = document.createElement('input')
      input.type = 'checkbox'; input.checked = row.enabled; input.dataset.flag = row.name
      label.append(input, row.name)
      tr.insertCell().append(label)
      tr.insertCell().textContent = row.description
      return tr
    }))
  }
  get selectedPrefix(): string | undefined { return this.#selected }
}
