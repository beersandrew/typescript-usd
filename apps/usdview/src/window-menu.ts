// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/preferencesUI.ui,
//  pxr/usdImaging/usdviewq/mainWindowUI.ui
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { isMac, shortcutLabel } from './shortcuts'

// OpenUSD v26.11.1 usdviewq/mainWindowUI.ui menuWindow, preferencesUI.ui and
// appController.py:2511-2549 (viewer-only mode), 326-337 (font sizes).
/** viewSettingsDataModel.py:203 fontSize default; preferencesUI.ui spin box minimum 6, QSpinBox maximum 99. */
export const defaultFontSize = 10, minFontSize = 6, maxFontSize = 99
/** appController.py:326-330: BASE_FONT_SZ = size, SMALL_FONT_SZ = int(round(size * 0.8)), in pt (= px on macOS Qt). */
export function fontSizes(size: number) { return { base: `${size}px`, small: `${Math.round(size * 0.8)}px` } }

export const windowUnsupported = {
  interpreter: 'The Python interpreter (usdviewApi console) is not available in the browser viewer.',
  appIcon: 'A web component cannot set the browser window or tab icon.',
} as const
export function windowMenuHtml(mac = isMac()): string {
  const key = (sequence: string) => `<kbd>${shortcutLabel(sequence, mac)}</kbd>`
  return `<details class="menu window-menu"><summary>Window</summary><div class="menu-popup window-popup" role="menu">
    <button type="button" role="menuitem" data-window="viewerMode">Toggle Viewer-Only Mode${key('F11')}</button><hr>
    <button type="button" role="menuitem" disabled title="${windowUnsupported.interpreter}">Interpreter${key('I')}</button>
    <button type="button" role="menuitem" data-window="preferences">Preferences</button>
    <button type="button" role="menuitem" data-window="validation">USD Validation${key('V')}</button>
    <button type="button" role="menuitem" data-window="debugFlags">Debug Flags</button>
    <button type="button" role="menuitem" data-window="hydraSceneDebugger">Hydra Scene Debugger</button>
  </div></details>`
}
export const preferencesDialog = `<style>
.preferences-dialog{background:#383838;color:inherit;border:1px solid #888;padding:14px 18px;min-width:260px;box-shadow:0 8px 30px #0008}
.preferences-dialog::backdrop{background:#0005}.preferences-dialog label{display:flex;align-items:center;gap:10px;margin:8px 0}
.preferences-dialog input{width:60px}.preferences-dialog hr{border:0;border-top:1px solid #555;margin:12px 0}
.preferences-dialog footer{display:flex;gap:8px;justify-content:flex-end}
</style><dialog class="preferences-dialog" aria-label="Preferences"><form class="preferences-form" method="dialog">
<label>Font Size <input name="fontSize" type="number" min="${minFontSize}" max="${maxFontSize}" step="1" required></label>
<label title="${windowUnsupported.appIcon}">App Icon <select name="appIcon" disabled><option>Automatic</option><option>Light</option><option>Dark</option><option>Blue</option></select></label>
<hr><footer><button type="button" data-preferences="apply">Apply</button><button type="button" data-preferences="cancel">Cancel</button><button type="submit" data-preferences="ok">OK</button></footer>
</form></dialog>`

/** Window menu: viewer-only mode and the font-size preference. */
export class WindowControls {
  #fontSize = defaultFontSize
  constructor(private root: ShadowRoot, private host: HTMLElement,private changed:()=>void=()=>{}) {}
  #get<T extends Element>(selector: string): T { return this.root.querySelector<T>(selector)! }
  get fontSize() { return this.#fontSize }
  bind(signal: AbortSignal) {
    const options = { signal }, dialog = this.#get<HTMLDialogElement>('.preferences-dialog')
    const input = this.#get<HTMLInputElement>('.preferences-form [name="fontSize"]')
    const close = () => { if (dialog.close) dialog.close(); else dialog.removeAttribute('open') }
    // preferences.py _apply/_buttonBoxButtonClicked: OK and Apply apply; OK and Cancel close.
    const apply = () => { if (input.checkValidity()) this.setFontSize(input.valueAsNumber) }
    this.#get('[data-window="preferences"]').addEventListener('click', () => {
      input.value = String(this.#fontSize)
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '')
    }, options)
    this.#get('[data-preferences="apply"]').addEventListener('click', apply, options)
    this.#get('[data-preferences="cancel"]').addEventListener('click', close, options)
    this.#get('.preferences-form').addEventListener('submit', event => {
      event.preventDefault()
      if (!input.checkValidity()) { input.reportValidity?.(); return }
      apply(); close()
    }, options)
  }
  setFontSize(size: number) {
    if (!Number.isInteger(size) || size < minFontSize || size > maxFontSize) throw new RangeError(`Font size must be an integer from ${minFontSize} to ${maxFontSize}.`)
    this.#fontSize = size
    const { base, small } = fontSizes(size)
    this.host.style.setProperty('--usd-base-font', base)
    this.host.style.setProperty('--usd-small-font', small)
    this.changed()
  }
  /** appController.py:2519-2549: collapse the prim view and the property/inspector row
   * around the stage view; leaving restores the previous splitter sizes. */
  get viewerMode() { return this.#get('.shell').hasAttribute('data-viewer-only') }
  toggleViewerMode() { this.#get('.shell').toggleAttribute('data-viewer-only', !this.viewerMode);this.changed() }
}
