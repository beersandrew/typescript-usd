// @vitest-environment jsdom
// Window > TypeScript Interpreter: the console of OpenUSD 26.11.1
// usdviewq/pythonInterpreter.py (banner, prompts, history, multi-line input,
// completion) in a viewer panel, and usdviewApi (usdviewApi.py) reading and
// driving the viewer over a real stage. The runtime is a fake adapter around
// a real typescript-usd stage (DOM/controller tests, not rendering tests).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage, TimeCode } from 'typescript-usd/usd'
import type { PrimSummary, RuntimeCallbacks, ViewerRuntime, ViewerTimeState } from '../src/contracts'
import { PrimSelectionModel } from '../src/selection-model'
import { defineUsdViewer, UsdViewerElement } from '../src/usd-viewer'
import { initialPrompt, type InterpreterConsole } from '../src/interpreter-console'

const tick = async () => { for (let n = 0; n < 10; n++) await Promise.resolve() }

async function sceneRuntime() {
  const stage = await Stage.open(Layer.createAnonymous())
  stage.definePrim('/World', 'Xform')
  stage.definePrim('/World/A', 'Cube')
  stage.definePrim('/World/B', 'Sphere')
  const model = new PrimSelectionModel()
  let time: ViewerTimeState = { start: 1, end: 10, current: 1, framesPerSecond: 24, timeCodesPerSecond: 24 }
  const summary = (path: string): PrimSummary => {
    const prim = stage.getPrim(path)!
    return { path, name: path.slice(path.lastIndexOf('/') + 1), typeName: prim.typeName, children: prim.getChildren().map(child => summary(child.path)) }
  }
  const tree = () => [summary('/World')]
  const detail = () => {
    const state = model.snapshot()
    return { path: state.focusPath === '/' ? null : state.focusPath, properties: [], selections: state.selections }
  }
  const runtime: ViewerRuntime = {
    open: vi.fn(async () => tree()), getPrimTree: () => tree(),
    select: vi.fn((path, options) => { model.update(path, options?.operation, options?.instanceIndex); return detail() }),
    selectPrims: vi.fn(entries => { model.replace(entries); return detail() }),
    getSelectionState: () => model.snapshot(),
    getStage: () => stage,
    getTimeState: () => time,
    setTime: vi.fn(async (value: number) => { time = { ...time, current: value }; return time }),
    getRendererPlugins: () => ['HdStormRendererPlugin'], getCurrentRendererId: () => 'HdStormRendererPlugin',
    frameSelection: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
  }
  return { stage, runtime, model }
}

async function setup() {
  const { stage, runtime, model } = await sceneRuntime()
  let callbacks!: RuntimeCallbacks
  const viewer = document.createElement('usd-viewer') as UsdViewerElement
  viewer.runtimeFactory = vi.fn(async (_canvas, cb) => { callbacks = cb; return runtime })
  viewer.src = '/fixture.usda'
  document.body.append(viewer)
  await vi.waitFor(() => expect(runtime.open).toHaveBeenCalled())
  await tick()
  return { viewer, runtime, stage, model, root: viewer.shadowRoot!, callbacks: () => callbacks }
}
/** Types `source` into the console and presses Return. */
async function enter(console: InterpreterConsole, source: string) {
  console.input.value = source
  console.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  for (let n = 0; n < 50; n++) await new Promise(resolve => setTimeout(resolve, 0))
}
const key = (console: InterpreterConsole, init: KeyboardEventInit) =>
  console.input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))

beforeAll(() => {
  defineUsdViewer()
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
})
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

// The first panel loads the language and every seeded library module.
describe('Window > TypeScript Interpreter', { timeout: 30_000 }, () => {
  it('opens from the Window menu and from I, once, with the banner and the initial prompt', async () => {
    const { root, viewer } = await setup()
    expect(root.querySelector('.interpreter-window')).toBeNull()
    root.querySelector<HTMLButtonElement>('[data-window="typescriptInterpreter"]')!.click()
    const console = await viewer.openInterpreter()
    const panel = root.querySelector<HTMLElement>('.typescript-interpreter')!
    expect(panel.hidden).toBe(false)
    expect(panel.getAttribute('aria-label')).toBe('TypeScript Interpreter')
    expect(console.text).toMatch(/^TypeScript \(types stripped by Sucrase \d+\.\d+\.\d+\) on .+\.\n/)
    expect(console.text).toContain(initialPrompt)
    expect(initialPrompt).toContain('usdviewApi.stage - The current Usd.Stage.')
    expect(root.querySelector('.typescript-interpreter .interp-prompt')!.textContent).toBe('>>> ')
    panel.querySelector<HTMLButtonElement>('.tool-close')!.click()
    expect(panel.hidden).toBe(true)
    // mainWindowUI.ui showInterpreter: I (labelled on Python Interpreter, which is disabled).
    console.input.blur()
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyI', key: 'i', bubbles: true, cancelable: true }))
    await vi.waitFor(() => expect(panel.hidden).toBe(false))
    expect(root.querySelectorAll('.interpreter-window')).toHaveLength(1)
    expect(await viewer.openInterpreter()).toBe(console)
  })

  it('refreshes the prim tree after an entry adds or removes a prim, as _onPrimsChanged does', async () => {
    const { viewer, root, runtime } = await setup()
    const console = await viewer.openInterpreter()
    expect(root.querySelector('[data-path="/World/C"]')).toBeNull()
    const selects = vi.mocked(runtime.selectPrims!).mock.calls.length
    await enter(console, "usdviewApi.stage.definePrim('/World/C', 'Sphere')")
    expect(root.querySelector('[data-path="/World/C"]')).not.toBeNull()
    // The selection's views refresh too (the property panel reads the new values).
    expect(vi.mocked(runtime.selectPrims!).mock.calls.length).toBeGreaterThan(selects)
    await enter(console, "usdviewApi.stage.removePrim('/World/C')")
    expect(root.querySelector('[data-path="/World/C"]')).toBeNull()
    // An entry that does not change the stage leaves the views alone.
    const after = vi.mocked(runtime.selectPrims!).mock.calls.length
    await enter(console, '1 + 1')
    expect(vi.mocked(runtime.selectPrims!).mock.calls.length).toBe(after)
  })

  it('echoes entries, prints results and errors, and continues incomplete input with ...', async () => {
    const { viewer, root } = await setup()
    const console = await viewer.openInterpreter()
    await enter(console, 'const answer: number = 6 * 7')
    await enter(console, 'answer')
    expect(console.text).toContain('>>> const answer: number = 6 * 7\n>>> answer\n42\n')
    await enter(console, 'function twice(v: number) {')
    expect(root.querySelector('.interp-prompt')!.textContent).toBe('... ')
    await enter(console, '  return v * 2')
    await enter(console, '}')
    expect(root.querySelector('.interp-prompt')!.textContent).toBe('>>> ')
    await enter(console, 'twice(answer)')
    expect(console.text).toContain('... }\n>>> twice(answer)\n84\n')
    await enter(console, 'nope.x')
    const error = root.querySelector('.interp-traceback')!
    expect(error.textContent).toMatch(/^ReferenceError: nope is not defined/)
    await enter(console, 'const = 3')
    expect(root.querySelector('.interp-syntaxError')!.textContent).toContain('SyntaxError: ')
    root.querySelector<HTMLButtonElement>('.interp-clear')!.click()
    expect(console.text).toBe('')
    await enter(console, 'answer')
    expect(console.text).toBe('>>> answer\n42\n')
  })

  it('recalls history with Up and Down, keeping the line being typed', async () => {
    const { viewer } = await setup()
    const console = await viewer.openInterpreter()
    await enter(console, '1')
    await enter(console, '')
    await enter(console, '2')
    expect(console.history).toEqual(['1', '2'])
    console.input.value = 'draft'
    key(console, { key: 'ArrowUp' }); expect(console.input.value).toBe('2')
    key(console, { key: 'ArrowUp' }); expect(console.input.value).toBe('1')
    key(console, { key: 'ArrowUp' }); expect(console.input.value).toBe('1')
    key(console, { key: 'ArrowDown' }); expect(console.input.value).toBe('2')
    key(console, { key: 'ArrowDown' }); expect(console.input.value).toBe('draft')
    key(console, { key: 'p', ctrlKey: true }); expect(console.input.value).toBe('2')
  })

  it('enters each pasted line but the last, and completes with Tab', async () => {
    const { viewer } = await setup()
    const console = await viewer.openInterpreter()
    await console.paste('let total = 1\ntotal += 2\ntotal')
    expect(console.input.value).toBe('total')
    await enter(console, console.input.value)
    expect(console.text).toContain('>>> total += 2\n>>> total\n3\n')
    console.input.value = 'usdviewApi.stageId'
    key(console, { key: 'Tab' })
    expect(console.input.value).toBe('usdviewApi.stageIdentifier')
    console.input.value = 'usdviewApi.sel'
    key(console, { key: 'Tab' })
    expect(console.input.value).toBe('usdviewApi.selected')
    expect(console.text).toContain('usdviewApi.selectedInstances')
  })
})

describe('usdviewApi in the interpreter', { timeout: 30_000 }, () => {
  it('reads the stage, the selection and the frame', async () => {
    const { viewer, stage, root } = await setup()
    const console = await viewer.openInterpreter()
    await enter(console, 'usdviewApi.stage === usdviewApi.dataModel.stage')
    expect(console.text).toMatch(/true\n$/)
    await enter(console, 'usdviewApi.stageIdentifier')
    expect(console.text).toContain(`'${stage.getRootLayer().identifier}'\n`)
    root.querySelector<HTMLElement>('[data-path="/World/A"]')!.click()
    await enter(console, 'usdviewApi.selectedPaths')
    expect(console.text).toMatch(/\[ '\/World\/A' \]\n$/)
    await enter(console, 'usdviewApi.prim')
    expect(console.text).toMatch(/Usd\.Prim\(<\/World\/A>\)\n$/)
    await enter(console, 'usdviewApi.frame')
    expect(console.text).toMatch(/Usd\.TimeCode\(.*1.*\)\n$/)
    await enter(console, 'usdviewApi.computeSelectedPrimsOfType("Cube").length')
    expect(console.text).toMatch(/1\n$/)
    await enter(console, 'usdviewApi.getViewportRendererNames()')
    expect(console.text).toMatch(/\[ 'HdStormRendererPlugin' \]\n$/)
  })

  it('changes the selection and the frame of the viewer', async () => {
    const { viewer, root, runtime, model } = await setup()
    const console = await viewer.openInterpreter()
    await enter(console, "usdviewApi.dataModel.selection.setPrimPath('/World/B')")
    expect(model.snapshot().selections.map(s => s.path)).toEqual(['/World/B'])
    expect(root.querySelector('[data-path="/World/B"]')!.getAttribute('aria-selected')).toBe('true')
    expect(root.querySelector<HTMLInputElement>('.current-path')!.value).toBe('/World/B')
    await enter(console, "usdviewApi.addPrimToSelection(usdviewApi.stage!.getPrim('/World/A')!)")
    expect(model.snapshot().selections.map(s => s.path)).toEqual(['/World/B', '/World/A'])
    await enter(console, 'usdviewApi.clearPrimSelection()')
    expect(model.snapshot().selections.map(s => s.path)).toEqual(['/'])
    await enter(console, "usdviewApi.dataModel.selection.addPrimPath('/World.x')")
    expect(console.text).toMatch(/RangeError: Path must be a prim path/)

    await enter(console, 'usdviewApi.dataModel.currentFrame = new Usd.TimeCode(5)')
    await enter(console, 'usdviewApi.frame.GetValue()')
    expect(console.text).toMatch(/5\n$/)
    await enter(console, 'await usdviewApi.dataModel.frameUpdated()')
    expect(runtime.setTime).toHaveBeenLastCalledWith(5)
    expect(root.querySelector<HTMLInputElement>('[aria-label="Current frame"]')!.value).toBe('5.0')
    expect(new TimeCode(5).GetValue()).toBe(5)
  })

  it('prints status messages and toggles viewer-only mode', async () => {
    const { viewer, root } = await setup()
    const console = await viewer.openInterpreter()
    await enter(console, "usdviewApi.printStatus('hello from the interpreter')")
    expect(root.querySelector('.statusbar')!.textContent).toContain('hello from the interpreter')
    await enter(console, 'usdviewApi.viewerMode = true')
    expect(root.querySelector('.shell')!.hasAttribute('data-viewer-only')).toBe(true)
    await enter(console, 'usdviewApi.viewerMode')
    expect(console.text).toMatch(/true\n$/)
  })
})
