// @vitest-environment jsdom
// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/mainWindowUI.ui,
//  pxr/usdImaging/usdviewq/primContextMenuItems.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mock/controller tests for the native usdview menus with a fake runtime adapter.
// They check wiring, enablement and commands, not rendering or USD semantics
// (those come from the native oracle in tests/usdview-edit-menu.test.ts).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrimSummary, RuntimeCallbacks, ViewerRuntime } from '../src/contracts'
import type { EditMenuState } from '../src/composition-types'
import { defineUsdViewer, type UsdViewerElement } from '../src/usd-viewer'

const tree: PrimSummary[] = [{ path: '/World', name: 'World', typeName: 'Xform', children: [
  { path: '/World/Mesh', name: 'Mesh', typeName: 'Mesh', children: [] },
  { path: '/World/Cam', name: 'Cam', typeName: 'Camera', children: [] },
] }]
const tick = async () => { for (let n = 0; n < 8; n++) await Promise.resolve() }
const editState = (patch: Partial<EditMenuState> = {}): EditMenuState => ({
  path: '/World/Mesh', name: 'Mesh', interpolation: 'Linear', loadable: false, loaded: true, active: true, inPrototype: false,
  imageable: true, visible: true, sessionVisibility: false, enclosingModel: '/World', boundPreviewMaterial: null,
  boundFullMaterial: { path: '/Looks/Mat', name: 'Mat', generic: true }, camera: false, ...patch })
function adapter(): ViewerRuntime {
  return {
    open: vi.fn().mockResolvedValue(tree),
    select: vi.fn((path: string | null) => ({ path, properties: [] })),
    frameSelection: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
    getEditState: vi.fn((path: string | null) => path ? editState({ path, name: path.split('/').pop()! }) : editState({ path: '/', name: '/', imageable: false, visible: false, loadable: true, loaded: true })),
    getCompositionState: vi.fn(() => ({ path: null, imageable: false, visibility: null, loadable: false, loaded: false, variants: [], layers: [] })),
    applyCompositionCommand: vi.fn(async () => ({ tree, selection: { path: '/World/Mesh', properties: [] } })),
  }
}
function setup(runtime = adapter()) {
  let callbacks!: RuntimeCallbacks
  const viewer = document.createElement('usd-viewer') as UsdViewerElement
  viewer.runtimeFactory = vi.fn(async (_canvas, cb) => { callbacks = cb; return runtime })
  viewer.src = '/fixture.usda'
  document.body.append(viewer)
  return { viewer, runtime, callbacks: () => callbacks, root: viewer.shadowRoot! }
}
const q = <T extends Element = HTMLElement>(root: ShadowRoot, selector: string) => root.querySelector<T>(selector)!
function open(root: ShadowRoot, selector: string) { const menu = q<HTMLDetailsElement>(root, selector); menu.open = true; menu.dispatchEvent(new Event('toggle')); return menu }
const status = (root: ShadowRoot) => q(root, '.status').textContent

beforeAll(() => {
  defineUsdViewer()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

describe('Edit menu', () => {
  it('lists native items in mainWindowUI.ui order and enables them from the selection', async () => {
    const runtime = adapter()
    const { root } = setup(runtime); await tick()
    q<HTMLButtonElement>(root, '[data-path="/World/Mesh"]').click()
    open(root, '.edit-menu')
    expect([...root.querySelectorAll('.edit-popup > button, .edit-popup > hr, .edit-popup > details > summary')].map(e => e.tagName === 'HR' ? '---' : e.firstChild!.textContent))
      .toEqual(['Stage Interpolation', '---', 'Load', 'Unload', '---', 'Activate', 'Deactivate', '---', 'Make Visible', 'Vis Only', 'Make Invisible', 'Remove Session Visibility', 'Reset All Session Visibility'])
    const enabled = Object.fromEntries([...root.querySelectorAll<HTMLButtonElement>('[data-edit]')].map(b => [b.dataset.edit, !b.disabled]))
    expect(enabled).toEqual({ load: false, unload: false, activate: false, deactivate: true, makeVisible: true, visOnly: true, makeInvisible: true, removeSessionVisibility: false, resetAllSessionVisibility: true })
    expect(runtime.getEditState).toHaveBeenLastCalledWith('/World/Mesh')
    expect(q(root, '[data-interpolation="Linear"]').getAttribute('aria-checked')).toBe('true')
    expect(q(root, '[data-interpolation="Held"]').getAttribute('aria-checked')).toBe('false')
  })

  it('applies session-layer commands and reports native status text', async () => {
    const runtime = adapter()
    const { root } = setup(runtime); await tick()
    q<HTMLButtonElement>(root, '[data-path="/World/Mesh"]').click()
    open(root, '.edit-menu')
    q<HTMLButtonElement>(root, '[data-edit="makeInvisible"]').click(); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'visibility', path: '/World/Mesh', action: 'hide' })
    expect(status(root)).toBe('Made selected prims invisible')
    expect(q<HTMLDetailsElement>(root, '.edit-menu').open).toBe(false)
    open(root, '.edit-menu'); q<HTMLButtonElement>(root, '[data-edit="deactivate"]').click(); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'activation', path: '/World/Mesh', active: false })
    expect(status(root)).toBe('Deactivated Mesh.')
    open(root, '.edit-menu'); q<HTMLButtonElement>(root, '[data-edit="resetAllSessionVisibility"]').click(); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'resetVisibility' })
    expect(status(root)).toBe('Removed ALL session visibility opinions.')
  })

  it('treats an empty selection as the pseudo-root: Load/Unload all, Deactivate only warns', async () => {
    const runtime = adapter(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(runtime.applyCompositionCommand!).mockResolvedValue({ tree, selection: { path: null, properties: [] } })
    const { root } = setup(runtime); await tick()
    open(root, '.edit-menu')
    expect(runtime.getEditState).toHaveBeenLastCalledWith(null)
    q<HTMLButtonElement>(root, '[data-edit="unload"]').click(); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'payload', path: '/', loaded: false })
    expect(status(root)).toBe("Unloaded ['/'].")
    vi.mocked(runtime.applyCompositionCommand!).mockClear()
    open(root, '.edit-menu'); q<HTMLButtonElement>(root, '[data-edit="deactivate"]').click(); await tick()
    expect(runtime.applyCompositionCommand).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('WARNING: Cannot change activation of pseudoroot.')
    expect(status(root)).toBe('Deactivated .')
  })

  it('switches Stage Interpolation and resets the timeline like _resetSettings', async () => {
    const runtime = adapter()
    runtime.getTimeState = vi.fn(() => ({ start: 0, end: 10, current: 4, framesPerSecond: 24, timeCodesPerSecond: 24 }))
    runtime.setTime = vi.fn(async (time: number) => ({ start: 0, end: 10, current: time, framesPerSecond: 24, timeCodesPerSecond: 24 }))
    const { root } = setup(runtime); await tick()
    const step = q<HTMLInputElement>(root, '[aria-label="Frame step"]')
    step.value = '2'; step.dispatchEvent(new Event('change')); expect(step.value).toBe('2.0')
    open(root, '.edit-menu')
    q<HTMLButtonElement>(root, '[data-interpolation="Held"]').click(); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'interpolation', interpolation: 'Held' })
    expect(step.value).toBe('1.0')
    expect(q<HTMLInputElement>(root, '[aria-label="Current frame"]').value).toBe('4.0')
  })

  it('disables every edit while a composition change is in flight and shows failures in the status bar', async () => {
    const runtime = adapter()
    let finish!: () => void
    vi.mocked(runtime.applyCompositionCommand!).mockImplementationOnce(() => new Promise((_resolve, reject) => { finish = () => reject(new Error('GPU rejected')) }))
    const { root } = setup(runtime); await tick()
    q<HTMLButtonElement>(root, '[data-path="/World/Mesh"]').click()
    open(root, '.edit-menu'); q<HTMLButtonElement>(root, '[data-edit="makeVisible"]').click(); await tick()
    open(root, '.edit-menu')
    expect([...root.querySelectorAll<HTMLButtonElement>('[data-edit],[data-interpolation]')].every(b => b.disabled)).toBe(true)
    finish(); await tick()
    expect(status(root)).toBe('Edit failed: GPU rejected')
    open(root, '.edit-menu')
    expect(q<HTMLButtonElement>(root, '[data-edit="makeVisible"]').disabled).toBe(false)
  })
})

describe('Window menu', () => {
  it('matches native order, disabling what the browser viewer cannot provide with a reason', async () => {
    const { root } = setup(); await tick()
    const items = [...root.querySelectorAll<HTMLElement>('.window-popup > button, .window-popup > hr')]
    expect(items.map(e => e.tagName === 'HR' ? '---' : e.firstChild!.textContent)).toEqual(['Toggle Viewer-Only Mode', '---', 'Interpreter', 'Preferences', 'USD Validation', 'Debug Flags', 'Hydra Scene Debugger'])
    const disabled = items.filter((e): e is HTMLButtonElement => e instanceof HTMLButtonElement && e.disabled)
    expect(disabled.map(e => e.firstChild!.textContent)).toEqual(['Interpreter'])
    for (const item of disabled) expect(item.title.length).toBeGreaterThan(20)
  })

  it('toggles viewer-only mode, keeping the splitter sizes to restore', async () => {
    const { root, viewer } = setup(); await tick()
    viewer.style.setProperty('--top-split', '30%')
    open(root, '.window-menu'); q<HTMLButtonElement>(root, '[data-window="viewerMode"]').click()
    expect(q(root, '.shell').hasAttribute('data-viewer-only')).toBe(true)
    expect(q<HTMLDetailsElement>(root, '.window-menu').open).toBe(false)
    open(root, '.window-menu'); q<HTMLButtonElement>(root, '[data-window="viewerMode"]').click()
    expect(q(root, '.shell').hasAttribute('data-viewer-only')).toBe(false)
    expect(viewer.style.getPropertyValue('--top-split')).toBe('30%')
  })

  it('applies the font-size preference as native BASE and SMALL sizes', async () => {
    const { root, viewer } = setup(); await tick()
    q<HTMLButtonElement>(root, '[data-window="preferences"]').click()
    const dialog = q<HTMLDialogElement>(root, '.preferences-dialog'), size = q<HTMLInputElement>(root, '.preferences-form [name="fontSize"]')
    expect(dialog.open).toBe(true); expect(size.value).toBe('10')
    expect(q<HTMLSelectElement>(root, '[name="appIcon"]').disabled).toBe(true)
    size.value = '14'; q<HTMLButtonElement>(root, '[data-preferences="apply"]').click()
    expect(viewer.style.getPropertyValue('--usd-base-font')).toBe('14px')
    expect(viewer.style.getPropertyValue('--usd-small-font')).toBe('11px')
    expect(dialog.open).toBe(true)
    size.value = '12'; q<HTMLButtonElement>(root, '[data-preferences="cancel"]').click()
    expect(dialog.open).toBe(false); expect(viewer.style.getPropertyValue('--usd-base-font')).toBe('14px')
    q<HTMLButtonElement>(root, '[data-window="preferences"]').click(); expect(size.value).toBe('14')
    size.value = '5'; q<HTMLFormElement>(root, '.preferences-form').requestSubmit()
    expect(dialog.open).toBe(true); expect(viewer.style.getPropertyValue('--usd-base-font')).toBe('14px')
    size.value = '16'; q<HTMLFormElement>(root, '.preferences-form').requestSubmit()
    expect(dialog.open).toBe(false)
    expect(viewer.style.getPropertyValue('--usd-base-font')).toBe('16px')
    expect(viewer.style.getPropertyValue('--usd-small-font')).toBe('13px')
  })
})

describe('Display menu', () => {
  it('selects each native shading mode when a scene is ready', async () => {
    const runtime=adapter();let settings=(await import('../src/display-settings')).defaultDisplaySettings()
    runtime.getDisplaySettings=()=>({...settings})
    runtime.setDisplaySettings=vi.fn(async patch=>(settings={...settings,...patch}))
    const { root } = setup(runtime); await tick()
    const modes = [...root.querySelectorAll<HTMLButtonElement>('[data-shading-mode]')]
    expect(modes.map(b => b.dataset.shadingMode)).toEqual(['Wireframe', 'WireframeOnSurface', 'Smooth Shaded', 'Flat Shaded', 'Points', 'Geom Only', 'Geom Smooth', 'Geom Flat', 'Hidden Surface Wireframe'])
    expect(modes.every(b=>!b.disabled)).toBe(true)
    expect(modes.filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.shadingMode)).toEqual(['Smooth Shaded'])
    for (const mode of modes) {
      mode.click();await tick()
      expect(runtime.setDisplaySettings).toHaveBeenLastCalledWith({renderMode:mode.dataset.shadingMode})
      expect(mode.getAttribute('aria-checked')).toBe('true')
    }
    expect(q(root, '.display-popup > details.submenu').classList.contains('shading-menu')).toBe(true)
  })

  it('switches selection highlighting and the native highlight colors', async () => {
    const runtime = adapter()
    let settings = { ...(await import('../src/display-settings')).defaultDisplaySettings() }
    runtime.getDisplaySettings = () => ({ ...settings })
    runtime.setDisplaySettings = vi.fn(async patch => (settings = { ...settings, ...patch }))
    const { root } = setup(runtime); await tick()
    const modes = [...root.querySelectorAll<HTMLButtonElement>('[data-highlight-mode]')]
    expect(modes.map(b => [b.dataset.highlightMode, b.getAttribute('aria-checked')])).toEqual([['Never', 'false'], ['Only when paused', 'true'], ['Always', 'false']])
    q<HTMLButtonElement>(root, '[data-highlight-mode="Always"]').click(); await tick()
    expect(runtime.setDisplaySettings).toHaveBeenLastCalledWith({ selHighlightMode: 'Always' })
    expect(q(root, '[data-highlight-mode="Always"]').getAttribute('aria-checked')).toBe('true')
    const colors = [...root.querySelectorAll<HTMLButtonElement>('.highlight-color-menu button')]
    expect(colors.map(b => b.textContent)).toEqual(['Yellow', 'White', 'Cyan'])
    expect(colors.every(b=>!b.disabled)).toBe(true)
    colors[2]!.click();await tick()
    expect(runtime.setDisplaySettings).toHaveBeenLastCalledWith({highlightColor:'Cyan'})
    expect(colors[2]!.getAttribute('aria-checked')).toBe('true')
  })
})

describe('Camera menu viewer images', () => {
  it('names saved images as _saveViewerImage recommends', async () => {
    const { viewerImageFilename } = await import('../src/camera-controls')
    expect(viewerImageFilename('https://example.com/assets/scene.v2.usdz?x=1', null, 1)).toBe('scene.v2_0001.png')
    expect(viewerImageFilename('scene.usda', '/World/Cam', 12.7)).toBe('scene_Cam_0012.png')
    expect(viewerImageFilename('', null, -3.5)).toBe('new_file_-003.png')
  })

  it('copies and saves the captured stage view, and disables both without a capture-capable runtime', async () => {
    const runtime = adapter(), blob = new Blob(['png'], { type: 'image/png' })
    runtime.captureViewerImage = vi.fn(async () => blob)
    runtime.getTimeState = () => ({ start: 0, end: 10, current: 7, framesPerSecond: 24, timeCodesPerSecond: 24 })
    runtime.getCameraState = () => ({ cameras: [{ path: '/World/Cam', label: 'Cam' }], activeCameraPath: '/World/Cam', free: { fovDegrees: 60, aspectRatio: null, nearOverride: null, farOverride: null }, effectiveNear: 1, effectiveFar: 100 })
    const write = vi.fn(async (_items:unknown) => {})
    class FakeClipboardItem { constructor(public items: Record<string, Promise<Blob>>) {} }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem)
    Object.defineProperty(navigator, 'clipboard', { value: { write }, configurable: true })
    URL.createObjectURL = vi.fn(() => 'blob:viewer'); URL.revokeObjectURL = vi.fn()
    const clicks: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download) })
    const { root } = setup(runtime); await tick()
    const requestOrder:string[]=[]
    vi.mocked(runtime.captureViewerImage).mockImplementation(async()=>{requestOrder.push('capture');return blob})
    write.mockImplementation(async()=>{requestOrder.push('write')})
    q<HTMLButtonElement>(root, '.copy-viewer-image').click()
    expect(requestOrder).toEqual(['write'])
    await tick()
    expect(requestOrder).toEqual(['write','capture'])
    const item = (write.mock.calls[0] as unknown as [FakeClipboardItem[]])[0][0]!
    expect(await item.items['image/png']).toBe(blob)
    expect(status(root)).toBe('Copied viewer image to clipboard.')
    vi.mocked(runtime.captureViewerImage).mockRejectedValueOnce(new Error('The scene changed before capture'))
    write.mockImplementationOnce(async(items:unknown)=>{
      const item=(items as FakeClipboardItem[])[0]!
      try{await item.items['image/png']}catch{throw new DOMException('The request is not allowed','NotAllowedError')}
    })
    q<HTMLButtonElement>(root, '.copy-viewer-image').click();await tick()
    expect(status(root)).toBe('Copy failed: The scene changed before capture')
    q<HTMLButtonElement>(root, '.save-viewer-image').click(); await tick()
    expect(clicks).toEqual(['fixture_Cam_0007.png'])
    expect(status(root)).toBe('Saved viewer image as fixture_Cam_0007.png.')
    document.body.replaceChildren()
    const plain = setup(adapter()); await tick()
    expect(q<HTMLButtonElement>(plain.root, '.copy-viewer-image').disabled).toBe(true)
    expect(q<HTMLButtonElement>(plain.root, '.save-viewer-image').disabled).toBe(true)
    vi.unstubAllGlobals(); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
})

describe('prim context menu', () => {
  const rightClick = (root: ShadowRoot, path: string) => {
    const row = [...root.querySelectorAll<HTMLButtonElement>('.prim')].find(b => b.dataset.path === path)!
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }))
    return row
  }
  const items = (root: ShadowRoot) => [...q(root, '.context-menu').children].map(e => e.tagName === 'HR' ? '---' : { text: e.textContent, enabled: !(e as HTMLButtonElement).disabled })

  it('selects the row and shows primContextMenuItems.py entries in order', async () => {
    const runtime = adapter()
    const { root } = setup(runtime); await tick()
    rightClick(root, '/World/Mesh')
    expect(runtime.select).toHaveBeenLastCalledWith('/World/Mesh')
    expect(q(root, '.context-menu').hidden).toBe(false)
    expect(items(root)).toEqual([
      { text: 'Jump to Enclosing Model', enabled: true }, { text: 'Select Bound Preview Material (None)', enabled: false },
      { text: 'Select Bound Full Material (Mat from generic binding)', enabled: true }, '---',
      { text: 'Make Invisible', enabled: true }, { text: 'Vis Only', enabled: true }, { text: 'Remove Session Visibility', enabled: false }, '---',
      { text: 'Unload', enabled: false }, { text: 'Deactivate', enabled: true }, '---',
      { text: 'Copy Prim Path', enabled: true }, { text: 'Copy Enclosing Model (World) Path', enabled: true }, '---',
      { text: 'usdview asset', enabled: false }, { text: 'Set As Active Camera', enabled: false },
      { text: 'Set As Active Render Settings', enabled: false }, { text: 'Set As Active Render Pass Prim', enabled: false }])
    expect([...root.querySelectorAll<HTMLButtonElement>('.context-menu button:disabled')].filter(b => b.title).map(b => b.textContent))
      .toEqual(['usdview asset', 'Set As Active Render Settings', 'Set As Active Render Pass Prim'])
    expect(root.activeElement?.textContent).toBe('Jump to Enclosing Model')
  })

  it('runs edits, navigation, copy and camera actions, then closes', async () => {
    const runtime = adapter()
    runtime.setActiveCamera = vi.fn(path => ({ cameras: [{ path: '/World/Cam', label: 'Cam' }], activeCameraPath: path, free: { fovDegrees: 60, aspectRatio: null, nearOverride: null, farOverride: null }, effectiveNear: 1, effectiveFar: 100 }))
    vi.mocked(runtime.getEditState!).mockImplementation(path => editState({ path: path!, name: path!.split('/').pop()!, camera: path === '/World/Cam' }))
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const { root } = setup(runtime); await tick()
    const choose = (text: string) => [...root.querySelectorAll<HTMLButtonElement>('.context-menu button')].find(b => b.textContent === text)!.click()
    rightClick(root, '/World/Mesh'); choose('Make Invisible'); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'visibility', path: '/World/Mesh', action: 'hide' })
    expect(q(root, '.context-menu').hidden).toBe(true)
    rightClick(root, '/World/Mesh'); choose('Copy Prim Path'); await tick()
    expect(writeText).toHaveBeenLastCalledWith('/World/Mesh')
    rightClick(root, '/World/Mesh'); choose('Jump to Enclosing Model')
    expect(runtime.select).toHaveBeenLastCalledWith('/World')
    rightClick(root, '/World/Cam'); choose('Set As Active Camera')
    expect(runtime.setActiveCamera).toHaveBeenLastCalledWith('/World/Cam')
    expect(q(root, '[data-camera-path="/World/Cam"]').getAttribute('aria-checked')).toBe('true')
  })

  it('opens from the keyboard, moves between enabled items and closes on Escape', async () => {
    const { root } = setup(); await tick()
    const row = [...root.querySelectorAll<HTMLButtonElement>('.prim')].find(b => b.dataset.path === '/World/Mesh')!
    row.focus(); row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true, cancelable: true }))
    expect(q(root, '.context-menu').hidden).toBe(false)
    const menu = q(root, '.context-menu')
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    expect(root.activeElement?.textContent).toBe('Select Bound Full Material (Mat from generic binding)')
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(menu.hidden).toBe(true); expect(root.activeElement).toBe(row)
  })
})

describe('native keyboard shortcuts', () => {
  const key = (code: string, init: KeyboardEventInit = {}, target: EventTarget = document) => {
    const event = new KeyboardEvent('keydown', { code, key: code.replace(/^Key|^Digit/, ''), bubbles: true, composed: true, cancelable: true, ...init })
    target.dispatchEvent(event); return event
  }
  function timedRuntime() {
    const runtime = adapter()
    let current = 0
    runtime.getTimeState = () => ({ start: 0, end: 3, current, framesPerSecond: 24, timeCodesPerSecond: 24 })
    runtime.setTime = vi.fn(async (time: number) => { current = time; return runtime.getTimeState!()! })
    runtime.setPlaybackActive = vi.fn()
    return runtime
  }

  it('maps Qt sequences to macOS Command/Option and labels them as Qt menus do', async () => {
    const { matchesShortcut, shortcutLabel } = await import('../src/shortcuts')
    const event = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)
    expect(matchesShortcut(event({ code: 'KeyH', metaKey: true }), 'Ctrl+H', true)).toBe(true)
    expect(matchesShortcut(event({ code: 'KeyH', ctrlKey: true }), 'Ctrl+H', true)).toBe(false)
    expect(matchesShortcut(event({ code: 'KeyH', ctrlKey: true }), 'Ctrl+H', false)).toBe(true)
    expect(matchesShortcut(event({ code: 'KeyH', key: '˙', altKey: true }), 'Alt+H', true)).toBe(true)
    expect(matchesShortcut(event({ code: 'KeyH', shiftKey: true, metaKey: true }), 'Shift+H', true)).toBe(false)
    expect(matchesShortcut(event({ code: 'Digit9', altKey: true }), 'Alt+9', true)).toBe(true)
    expect(['Shift+H', 'Alt+H', 'Ctrl+H', 'Ctrl+Shift+R', 'F11'].map(s => shortcutLabel(s, true))).toEqual(['⇧H', '⌥H', '⌘H', '⇧⌘R', 'F11'])
    expect(shortcutLabel('Ctrl+Shift+R', false)).toBe('Ctrl+Shift+R')
  })

  it('runs Edit actions from anywhere in the page, but not from text fields, dialogs or when disabled', async () => {
    const runtime = adapter()
    const { root } = setup(runtime); await tick()
    q<HTMLButtonElement>(root, '[data-path="/World/Mesh"]').click()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    expect(key('KeyH', { shiftKey: true }).defaultPrevented).toBe(true); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'visibility', path: '/World/Mesh', action: 'show' })
    key('KeyH', { altKey: true }); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'visibility', path: '/World/Mesh', action: 'isolate' })
    key('KeyH', { ctrlKey: true }); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'visibility', path: '/World/Mesh', action: 'hide' })
    key('KeyH', { ctrlKey: true, shiftKey: true }); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'visibility', path: '/World/Mesh', action: 'show' })
    key('KeyU', { shiftKey: true }); await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenLastCalledWith({ kind: 'resetVisibility' })
    const calls = vi.mocked(runtime.applyCompositionCommand!).mock.calls.length
    expect(key('KeyU', { ctrlKey: true }).defaultPrevented).toBe(false) // no session visibility: disabled
    const search = q<HTMLInputElement>(root, '.prim-search'); search.focus()
    expect(key('KeyH', { shiftKey: true }, search).defaultPrevented).toBe(false)
    search.blur()
    q<HTMLButtonElement>(root, '[data-window="preferences"]').click()
    key('KeyH', { shiftKey: true })
    q<HTMLButtonElement>(root, '[data-preferences="cancel"]').click()
    const outside = document.createElement('input'); document.body.append(outside); outside.focus()
    key('KeyH', { shiftKey: true }, outside); outside.remove()
    await tick()
    expect(runtime.applyCompositionCommand).toHaveBeenCalledTimes(calls)
  })

  it('plays and stops with Space and steps frames with Left/Right, except where the focus keeps the keys', async () => {
    const runtime = timedRuntime()
    const { root } = setup(runtime); await tick()
    const play = q<HTMLButtonElement>(root, '.playback-current button'); play.focus()
    expect(key('Space', { key: ' ' }, play).defaultPrevented).toBe(true)
    expect(runtime.setPlaybackActive).toHaveBeenLastCalledWith(true)
    const up = new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true, composed: true, cancelable: true }); play.dispatchEvent(up)
    expect(up.defaultPrevented).toBe(true)
    key('Space', { key: ' ' }, play); expect(runtime.setPlaybackActive).toHaveBeenLastCalledWith(false)
    await tick(); play.blur()
    const frame = q<HTMLInputElement>(root, '[aria-label="Current frame"]'); frame.value = '0'; frame.dispatchEvent(new Event('change')); await tick()
    vi.mocked(runtime.setTime!).mockClear()
    key('ArrowRight'); key('ArrowRight', { repeat: true }); await tick()
    expect(vi.mocked(runtime.setTime!).mock.calls.map(c => c[0]).at(-1)).toBe(2)
    key('ArrowLeft'); key('ArrowLeft'); key('ArrowLeft'); await tick()
    expect(q<HTMLInputElement>(root, '[aria-label="Current frame"]').value).toBe('3.0') // wraps like _retreatFrame
    const row = q<HTMLButtonElement>(root, '.prim'); row.focus(); vi.mocked(runtime.setTime!).mockClear()
    key('ArrowRight', {}, row); await tick()
    expect(runtime.setTime).not.toHaveBeenCalled()
    const frameInput = q<HTMLInputElement>(root, '[aria-label="Current frame"]'); frameInput.focus()
    expect(key('Space', { key: ' ' }, frameInput).defaultPrevented).toBe(false)
  })

  it('reaches File, Window, Navigation, Show, Display and Camera actions', async () => {
    const runtime = adapter(); runtime.refreshScene = vi.fn(async () => ({ tree, selection: { path: null, properties: [] } }))
    const display = (await import('../src/display-settings')).defaultDisplaySettings()
    runtime.getDisplaySettings = () => display; runtime.setDisplaySettings = vi.fn(async patch => Object.assign(display, patch))
    const { root } = setup(runtime); await tick()
    key('KeyR', { ctrlKey: true }); await tick(); expect(runtime.refreshScene).toHaveBeenLastCalledWith('reload', expect.anything())
    key('KeyR', { ctrlKey: true, shiftKey: true }); await tick(); expect(runtime.refreshScene).toHaveBeenLastCalledWith('reopen', expect.anything())
    key('F11'); expect(q(root, '.shell').hasAttribute('data-viewer-only')).toBe(true)
    key('F11'); expect(q(root, '.shell').hasAttribute('data-viewer-only')).toBe(false)
    key('KeyF', { ctrlKey: true }); expect(root.activeElement).toBe(q(root, '.prim-search'))
    q<HTMLInputElement>(root, '.prim-search').blur()
    key('Digit0', { altKey: true }); expect(q(root, '[data-path="/World"]').getAttribute('aria-expanded')).toBe('false')
    key('Digit9', { altKey: true }); expect(q(root, '[data-path="/World"]').getAttribute('aria-expanded')).toBe('true')
    key('KeyB', { ctrlKey: true }); await tick(); expect(runtime.setDisplaySettings).toHaveBeenLastCalledWith({ showBBoxes: false })
    key('KeyD', { ctrlKey: true }); expect(q(root, '.viewport-hud').hidden).toBe(true)
    key('KeyF'); expect(runtime.frameSelection).toHaveBeenCalled()
  })

})


describe('Material display controls',()=>{
 it('forwards scene materials, backface culling and immediate default material edits',async()=>{
  const {defaultDisplaySettings}=await import('../src/display-settings')
  const runtime=adapter();let settings=defaultDisplaySettings()
  runtime.getDisplaySettings=()=>settings
  runtime.setDisplaySettings=vi.fn(async patch=>(settings={...settings,...patch}))
  const {root}=setup(runtime);await tick()
  for(const [key,value]of [['enableSceneMaterials',false],['cullBackfaces',true]] as const){
   const input=q<HTMLInputElement>(root,`[data-display="${key}"]`);input.checked=value;input.dispatchEvent(new Event('change'));await tick()
   expect(runtime.setDisplaySettings).toHaveBeenLastCalledWith({[key]:value})
  }
  q<HTMLButtonElement>(root,'.material-settings').click()
  const input=q<HTMLInputElement>(root,'[name="defaultMaterialAmbient"]');input.value='0.8';input.dispatchEvent(new Event('change'));await tick()
  expect(runtime.setDisplaySettings).toHaveBeenLastCalledWith({defaultMaterialAmbient:.8})
  q<HTMLButtonElement>(root,'.material-reset').click();await tick()
  expect(runtime.setDisplaySettings).toHaveBeenLastCalledWith({defaultMaterialAmbient:.2,defaultMaterialSpecular:.1})
 })
})


it('routes J to the native framed-view swap without intercepting typed text',async()=>{
 const runtime=adapter();runtime.toggleFramedView=vi.fn(()=>({cameras:[],activeCameraPath:null,free:{fovDegrees:60,aspectRatio:null,nearOverride:null,farOverride:null},effectiveNear:1,effectiveFar:100}))
 const {viewer,root}=setup(runtime);await tick()
 viewer.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyJ',key:'j',bubbles:true,cancelable:true}))
 expect(runtime.toggleFramedView).toHaveBeenCalledOnce()
 const search=q<HTMLInputElement>(root,'.prim-search');search.focus();search.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyJ',key:'j',bubbles:true,composed:true,cancelable:true}))
 expect(runtime.toggleFramedView).toHaveBeenCalledOnce()
})

it('enables dome texture visibility only for a supporting renderer',async()=>{
 const {defaultDisplaySettings}=await import('../src/display-settings')
 const runtime=adapter();let settings=defaultDisplaySettings();let supported=false
 runtime.getDisplaySettings=()=>settings;runtime.setDisplaySettings=vi.fn(async patch=>(settings={...settings,...patch}));runtime.supportsDomeLightTextures=()=>supported
 const {root}=setup(runtime);await tick()
 const input=q<HTMLInputElement>(root,'[data-display=domeLightTexturesVisible]');expect(input.disabled).toBe(true)
 supported=true
 q<HTMLInputElement>(root,'[data-display=sceneLightsEnabled]').dispatchEvent(new Event('change'));await tick()
 expect(input.disabled).toBe(false);input.checked=false;input.dispatchEvent(new Event('change'));await tick()
 expect(runtime.setDisplaySettings).toHaveBeenLastCalledWith({domeLightTexturesVisible:false})
})

it('navigates to native material targets and binding relationships without authoring edits',async()=>{
 const runtime=adapter();runtime.getBindingRelationship=vi.fn(()=>'/World/Mesh.material:binding')
 runtime.selectPrims=vi.fn(entries=>({path:entries[0]?.path??null,selections:[...entries],properties:[{name:'material:binding',typeName:'relationship',value:'</Looks/Mat>'}]}))
 const {root}=setup(runtime);await tick();q<HTMLButtonElement>(root,'[data-path="/World/Mesh"]').click()
 open(root,'.navigation-menu');q<HTMLButtonElement>(root,'[data-navigation="full"]').click()
 expect(runtime.selectPrims).toHaveBeenLastCalledWith([{path:'/Looks/Mat'}])
 q<HTMLButtonElement>(root,'[data-path="/World/Mesh"]').click();open(root,'.navigation-menu');q<HTMLButtonElement>(root,'[data-navigation="fullRel"]').click()
 expect(runtime.getBindingRelationship).toHaveBeenLastCalledWith('/World/Mesh','full')
 expect(runtime.selectPrims).toHaveBeenLastCalledWith([{path:'/World/Mesh'}])
 expect(root.querySelector('[data-property-row="material:binding"]')?.classList.contains('selected')).toBe(true)
 expect(runtime.applyCompositionCommand).not.toHaveBeenCalled()
})
it('shows native HUD sections, changes column visibility and navigates nested menus by keyboard',async()=>{
 const runtime=adapter();const {defaultDisplaySettings}=await import('../src/display-settings');runtime.getDisplaySettings=defaultDisplaySettings;runtime.setDisplaySettings=vi.fn(async patch=>({...defaultDisplaySettings(),...patch}));runtime.getSubtreeHudInfo=vi.fn(()=>({Prims:3,Mesh:1,CVs:0,Verts:3,Faces:1}))
 const {root}=setup(runtime);await tick()
 const info=q<HTMLInputElement>(root,'[data-hud="info"]');info.click();expect(q<HTMLElement>(root,'.hud-info').hidden).toBe(false);expect(q(root,'.hud-info').textContent).toContain('Prims: 3')
 const performance=q<HTMLInputElement>(root,'[data-hud="performance"]');performance.click();expect(q<HTMLElement>(root,'.hud-performance').hidden).toBe(true)
 const type=q<HTMLInputElement>(root,'[data-tree-column="1"]');type.click();expect(q(root,'.hierarchy').hasAttribute('data-hide-column-1')).toBe(true);type.click();expect(q(root,'.hierarchy').hasAttribute('data-hide-column-1')).toBe(false)
 const menu=open(root,'.display-menu'),summary=q<HTMLElement>(root,'.display-menu>summary');summary.focus();summary.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))
 expect(root.activeElement?.textContent).toBe('Shading Mode')
 ;(root.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))
 expect(root.activeElement?.getAttribute('data-shading-mode')).toBe('Wireframe')
 ;(root.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))
 expect(root.activeElement?.textContent).toBe('Shading Mode');expect(menu.open).toBe(true)
})

it('enables the default dome checkbox for a ready runtime and applies its persisted display flag',async()=>{
 const runtime=adapter();let settings={...(await import('../src/display-settings')).defaultDisplaySettings(),domeLightEnabled:false}
 runtime.getDisplaySettings=()=>settings
 runtime.setDisplaySettings=vi.fn(async patch=>(settings={...settings,...patch}))
 const {root}=setup(runtime);await tick()
 const input=q<HTMLInputElement>(root,'[data-display=domeLightEnabled]')
 expect(input.disabled).toBe(false);expect(input.checked).toBe(false)
 input.click();await tick()
 expect(runtime.setDisplaySettings).toHaveBeenLastCalledWith({domeLightEnabled:true})
 expect(input.checked).toBe(true)
})

describe('menus on a touch screen', () => {
  const enter = (element: Element, pointerType: string) => {
    const event = new Event('pointerenter'); Object.assign(event, { pointerType }); element.dispatchEvent(event)
  }
  it('opens a submenu on mouse hover but not on a tap, whose click toggles it once', async () => {
    const { root } = setup(); await tick()
    const display = q<HTMLDetailsElement>(root, 'details.menu:has(> .display-popup)')
    display.open = true
    const submenu = q<HTMLDetailsElement>(root, '.display-popup > details.submenu')
    enter(submenu, 'touch')
    expect(submenu.open).toBe(false)
    enter(submenu, 'mouse')
    expect(submenu.open).toBe(true)
  })
})
