// @vitest-environment jsdom
// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/stageView.py, pxr/usd/usd/notice.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mock-runtime tests (not browser tests): a fake Storm engine and fake GPU
// objects exercise the runtime's ownership, transactions and races. Drawing
// is verified in Safari by the asset-acceptance harness.
import { RaiseWarning as TfRaiseWarning,TfDiagnosticMgr,Notice as TfNotice } from 'typescript-usd/tf'
vi.mock('../src/review-bounds', () => ({computeSelectionBounds: () => ({ComputeAlignedRange: () => ({IsEmpty: () => true})}), reviewBounds: (...args: unknown[]) => { mocks.bounds(...args); return new Float32Array(0) }}))
vi.mock('../src/viewport-overlays', () => ({ ViewportAxes: class { draw(...args: unknown[]) { mocks.axes(...args) } destroy() {} }, ViewportBoundingBoxes: class { draw() {} destroy() {} }, ViewportOverlayLayer: class { begin(...args: unknown[]) { return mocks.overlayBegin(...args) } composite(...args: unknown[]) { mocks.overlayComposite(...args) } destroy() {} }, stencilOps: () => ({}) }))
vi.mock('../src/viewport-presentation', () => ({ ViewportPresentation: class { draw() {} } }))
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const mocks = vi.hoisted(() => ({ scopes: [] as {dispose: ReturnType<typeof vi.fn>}[], bounds: vi.fn(), axes: vi.fn(), overlayBegin: vi.fn((..._args: unknown[]) => ({ overlayLayerView: true })), overlayComposite: vi.fn(), boundRange: null as null | {min:number[],max:number[]}, open: vi.fn(), openMasked: vi.fn(), engine: vi.fn(), prepareExec: vi.fn() }))
vi.mock('typescript-usd/ar/_internal', async importOriginal => {
  const original = await importOriginal<typeof import('typescript-usd/ar/_internal')>()
  return {...original, _interim_createResolverScopedCacheContext: (context: Parameters<typeof original._interim_createResolverScopedCacheContext>[0]) => {
    const scope = original._interim_createResolverScopedCacheContext(context)
    const tracked = {...scope, dispose: vi.fn(scope.dispose)}
    mocks.scopes.push(tracked)
    return tracked
  }}
})
vi.mock('typescript-usd/usdMtlx', () => ({}))
vi.mock('typescript-usd/hdSt/materialx', () => ({}))
vi.mock('typescript-usd/usd', async importOriginal => ({ ...await importOriginal<typeof import('typescript-usd/usd')>(), Stage: { open: mocks.open,openMasked:mocks.openMasked } }))
vi.mock('typescript-usd/usdGeom', async importOriginal => ({ ...await importOriginal<typeof import('typescript-usd/usdGeom')>(), BBoxCache: class {
  computeWorldBound() { return { ComputeAlignedRange: () => ({ IsEmpty: () => !mocks.boundRange || mocks.boundRange.min.some((v,i)=>v>mocks.boundRange!.max[i]!), getMin:()=>({data:mocks.boundRange!.min}), getMax:()=>({data:mocks.boundRange!.max}) }) } }
  computePointInstanceWorldBound() { return this.computeWorldBound() }
} }))
vi.mock('../src/exec-scene-index', async importOriginal => ({ ...await importOriginal<typeof import('../src/exec-scene-index')>(), prepareExecSceneIndex: async (...args: unknown[]) => { await mocks.prepareExec(...args) } }))
// The engine (src/stage-view-engine.ts) is replaced by a fake.
vi.mock('../src/imaging', () => ({ StageViewEngine: function(...args: unknown[]) { return mocks.engine(...args) }, createHgi: () => ({}), prepareStorm: async () => {} }))

import { createRuntime, loadImaging, loadMaterialX } from '../src/runtime'
import { Notice as UsdNotice } from 'typescript-usd/usd'
// The lazy imaging and MaterialX chunks are loaded once, as after a page's first scene.
beforeAll(async () => { await loadImaging(); await loadMaterialX() })
import startupNative from './fixtures/usdviewStartup/expected.json' with {type:'json'}
import optionsNative from './fixtures/startupOptions/expected.json' with {type:'json'}
import {parseStartupOptions} from '../src/startup-options'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const tick = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
/** The Prim surface the prim tree and property view read (src/prim-tree.ts, src/property-view.ts). */
function mockPrim(path: string, typeName: string, children: object[] = []) {
  return { path, typeName, isActive: true, isDefined: true, isAbstract: false, isA: () => false, hasAPI: () => false, isModel: () => false, isInstance: () => false, isInstanceProxy: () => false, isInPrototype: () => false,
    hasAuthoredMetadata: () => false, hasAuthoredPayloads: () => false, getMetadata: (): unknown => undefined, getFilteredChildren: () => children,
    getAttr: () => ({ getValue: () => 'none' }), getPropertyNames: () => [], attrNames: [] as string[] }
}
function stage(path: string, typeName = 'Mesh') {
  const prim = mockPrim(path, typeName), root = mockPrim('/', '', [prim])
  return { findLoadable: () => [] as string[], getRootLayer: () => ({ getField: () => undefined }), getCompositionErrors: () => [] as { toString(): string }[], traverse: () => [path], getPrim: (p: string) => p === path ? prim : p === '/' ? root : undefined,
    getChildPrimPaths: (p: string) => p === '/' ? [path] : [], getAllChildPrimPaths: (p: string) => p === '/' ? [path] : [],
    getMetadata: (): unknown => undefined, dispose: vi.fn() }
}
type Camera = {view: unknown, projection: unknown, eye: number[], scenePath?: string | null, fitWindow?: boolean}
type Hit = {hitPrimPath: string, hitInstanceIndex: number, instancerContext: [string, number][]}
/** A fake StageViewEngine: records draws, settings, selection and picks. */
function fakeEngine() {
  const texture = (format: string) => ({ format, createView: () => ({}) })
  return {
    Render: vi.fn<(camera: Camera, width: number, height: number) => void>(), applySettings: vi.fn(), SetTime: vi.fn(),
    GetAovTextures: () => ({ color: texture('rgba16float'), colorMSAA: texture('rgba16float'), depthMSAA: texture('depth32float-stencil8') }),
    isConverged: vi.fn(() => true), setSelection: vi.fn(),
    pick: vi.fn<(frustum: unknown, x: number, y: number, width: number, height: number) => Promise<Hit | null>>().mockResolvedValue(null),
    getDrawableCount: vi.fn(() => 1), destroy: vi.fn(),
  }
}
/** Sends the ObjectsChanged notice a stage sends for an edit (usd/notice.h). */
function stageChanged(source: object, resynced: string[] = ['/']) {
  new UsdNotice.ObjectsChanged(source as never, new Map(resynced.map(path => [path, []]))).send(source)
}
/** Records the stage notice listeners registered from now on, and whether
 *  each was revoked. */
function trackListeners() {
  const register = TfNotice.Register.bind(TfNotice), keys: {revoked: boolean}[] = []
  vi.spyOn(TfNotice, 'Register').mockImplementation(((type: never, callback: never, sender?: object) => {
    const key = register(type, callback, sender), entry = {revoked: false}, revoke = key.revoke.bind(key)
    keys.push(entry); key.revoke = () => { entry.revoked = true; revoke() }
    return key
  }) as typeof TfNotice.Register)
  return keys
}
type FakeEngine = ReturnType<typeof fakeEngine>
function setup(features: GPUFeatureName[] = []) {
  const context = { configure: vi.fn(), unconfigure: vi.fn(), getCurrentTexture: () => ({ createView: () => ({}) }) }
  const resolvePass = {end:vi.fn()}
  const encoder = {beginRenderPass:vi.fn(()=>resolvePass),finish:vi.fn(()=>({}))}
  const device = {createCommandEncoder:vi.fn(()=>encoder),queue:{submit:vi.fn(),onSubmittedWorkDone:vi.fn().mockResolvedValue(undefined)}, destroy: vi.fn(), addEventListener: vi.fn(), lost: new Promise(() => {}),
    pushErrorScope: vi.fn(), popErrorScope: vi.fn().mockResolvedValue(null), createTexture: vi.fn() }
  const requestDevice = vi.fn(async () => device)
  const gpu = { requestAdapter: async () => ({ features: new Set(features), limits: {}, requestDevice }), getPreferredCanvasFormat: () => 'bgra8unorm' }
  Object.defineProperty(navigator, 'gpu', { value: gpu, configurable: true })
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as GPUCanvasContext)
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 150, width: 300, height: 150, toJSON() {} })
  canvas.setPointerCapture = vi.fn(); canvas.hasPointerCapture = () => false
  const callbacks = { selectionChanged: vi.fn(), statusChanged: vi.fn(), geometryChanged: vi.fn() }
  const engine = fakeEngine()
  mocks.engine.mockReturnValue(engine)
  return { canvas, callbacks, context, device, requestDevice, encoder, engine }
}
/** Each new engine the runtime constructs after this call (display/composition fallbacks). */
function nextEngine(changes: Partial<FakeEngine> = {}) { const e = {...fakeEngine(), ...changes}; mocks.engine.mockReturnValueOnce(e); return e }
const eyes = (engine: FakeEngine) => engine.Render.mock.calls.map(([camera]) => camera.eye)
function click(canvas: HTMLCanvasElement, modifiers: {shiftKey?: boolean, ctrlKey?: boolean, metaKey?: boolean} = {}, at: [number, number] = [100, 50]) {
  for (const type of ['pointerdown', 'pointerup']) {
    const event = new Event(type)
    Object.assign(event, { pointerId: 1, button: 0, clientX: at[0], clientY: at[1], shiftKey: false, ctrlKey: false, metaKey: false, ...modifiers })
    canvas.dispatchEvent(event)
  }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.boundRange=null
  vi.stubGlobal('GPUTextureUsage', { RENDER_ATTACHMENT: 16, TEXTURE_BINDING:4 })
  vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(1))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const sceneDiagnostics = (runtime: {getDiagnostics?: () => readonly {severity: string, message: string}[]}) => runtime.getDiagnostics!()
const draw = () => vi.mocked(requestAnimationFrame).mock.calls.at(-1)?.[0](0)

describe('runtime resource ownership', () => {
  it('builds one Storm engine for the stage with the display settings and the canvas size', async () => {
    const s = setup(); mocks.open.mockResolvedValue(stage('/Model'))
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/model.usda')
    expect(mocks.engine).toHaveBeenCalledOnce()
    const [, opened, time, settings, width, height] = mocks.engine.mock.calls[0]!
    expect(opened).toBe(await mocks.open.mock.results[0]!.value)
    expect(time).toBe(0); expect(settings).toMatchObject({ renderMode: 'Smooth Shaded', complexity: 'low' })
    expect([width, height]).toEqual([300, 150])
    expect(s.engine.applySettings).toHaveBeenCalledWith(expect.objectContaining({ renderMode: 'Smooth Shaded' }), false)
    expect(s.engine.Render).toHaveBeenCalled()
    expect(s.callbacks.statusChanged.mock.calls.at(-1)![0]).toMatch(/^Loaded · 1 geometry prim\(s\) · TypeScript Storm \/ WebGPU/)
    runtime.dispose(); await tick()
    expect(s.engine.destroy).toHaveBeenCalledOnce()
  })
  // rootDataModel.py:77-102 and appController.py:2493-2509: usdview redraws
  // on the stage's ObjectsChanged notices; the engine applies them in Render.
  it('redraws after stage changes and revokes its stage listener', async () => {
    const s = setup(), source = stage('/Model'); mocks.open.mockResolvedValue(source)
    const keys = trackListeners()
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/model.usda')
    draw(); s.engine.Render.mockClear()
    vi.mocked(requestAnimationFrame).mockClear()
    stageChanged(source)
    expect(requestAnimationFrame).toHaveBeenCalled()
    draw()
    expect(s.engine.Render).toHaveBeenCalled()
    expect(keys.length).toBe(1)
    runtime.dispose(); await tick()
    expect(keys.every(k => k.revoked)).toBe(true)
  })
  // stageView.py:1543-1548: a frame that is not converged (Storm textures
  // still loading) is drawn again shortly while paused.
  it('draws again until the engine is converged while paused', async () => {
    vi.useFakeTimers({toFake: ['setTimeout']})
    try {
      const s = setup(); mocks.open.mockResolvedValue(stage('/Model'))
      const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/model.usda')
      s.engine.isConverged.mockReturnValue(false)
      runtime.setAxesVisible!(true); draw(); expect(s.engine.Render).toHaveBeenCalledTimes(3)
      s.engine.Render.mockClear(); vi.mocked(requestAnimationFrame).mockClear()
      vi.advanceTimersByTime(5)
      expect(requestAnimationFrame).toHaveBeenCalledOnce()
      draw(); expect(s.engine.Render).toHaveBeenCalledOnce()
      s.engine.isConverged.mockReturnValue(true)
      vi.advanceTimersByTime(5); draw()
      expect(s.engine.Render).toHaveBeenCalledTimes(2)
      vi.mocked(requestAnimationFrame).mockClear(); vi.advanceTimersByTime(50)
      expect(requestAnimationFrame).not.toHaveBeenCalled()
      // Playback does not wait for convergence.
      s.engine.isConverged.mockReturnValue(false); runtime.setPlaybackActive!(true)
      draw(); vi.mocked(requestAnimationFrame).mockClear(); vi.advanceTimersByTime(50)
      expect(requestAnimationFrame).not.toHaveBeenCalled()
      runtime.dispose(); await tick()
    } finally { vi.useRealTimers() }
  })
  it('keeps the presented image while Storm waits for textures, then presents the converged draw', async () => {
    vi.useFakeTimers({toFake: ['setTimeout']})
    try {
      const s = setup(); mocks.open.mockResolvedValue(stage('/Model'))
      const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/model.usda')
      draw()
      const present = vi.spyOn(s.context, 'getCurrentTexture')
      s.engine.isConverged.mockReturnValue(false)
      runtime.setAxesVisible!(true); draw()
      // Storm drew nothing (hdSt/src/renderPass.ts): nothing presented.
      expect(present).not.toHaveBeenCalled()
      s.engine.isConverged.mockReturnValue(true)
      vi.advanceTimersByTime(5); draw()
      expect(present).toHaveBeenCalledOnce()
      runtime.dispose(); await tick()
    } finally { vi.useRealTimers() }
  })
  it.each(optionsNative.views)('matches full native $name camera/selection startup', async n => {
    const {Stage:RealStage} = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const {Layer} = await import('typescript-usd/sdf')
    const real = await RealStage.open(Layer.createInMemory('startup-view.usda', readFileSync('public/assets/cameraControls/scene.usda','utf8')))
    const s = setup(); mocks.open.mockResolvedValue(real); mocks.boundRange = n.bounds ? {min:n.bounds[0]!,max:n.bounds[1]!} : null
    const query = new URLSearchParams(); for (let i = 0; i < n.args.length; i += 2) query.set(n.args[i]!.slice(2), n.args[i+1]!)
    const runtime = await createRuntime(s.canvas, s.callbacks); runtime.resize(800,600,1); runtime.setStartupOptions!(parseStartupOptions(query).options); await runtime.open('/startup.usda')
    expect(runtime.getCameraState!().activeCameraPath).toBe(n.cameraPath)
    expect(runtime.getSelectionState!().selections.map(p => p.path)).toEqual(n.selection)
    for (const eye of eyes(s.engine)) eye.forEach((v, i) => expect(v).toBeCloseTo(n.eye[i]!, 5))
    for (const [, , matrix] of mocks.axes.mock.calls) (matrix as Float32Array).forEach((v, i) => expect(v).toBeCloseTo(n.matrix[i]!, 5))
    expect(mocks.axes).toHaveBeenCalled()
    runtime.dispose(); await tick()
  })
  it.each(optionsNative.cameras)('matches native camera lookup $request', async n => {
    const {Stage:RealStage} = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd'); const {Layer} = await import('typescript-usd/sdf')
    const real = await RealStage.open(Layer.createInMemory('camera-lookup.usda', readFileSync('public/assets/cameraControls/scene.usda','utf8')))
    const s = setup(); mocks.open.mockResolvedValue(real)
    const runtime = await createRuntime(s.canvas, s.callbacks); runtime.setStartupOptions!({camera:n.request}); await runtime.open('/camera.usda')
    expect(runtime.getCameraState!().activeCameraPath).toBe(n.path); if (n.warning) expect(runtime.getDiagnostics!().map(d => d.message)).toContain(n.warning)
    runtime.dispose(); await tick()
  })
  it('creates a fresh native free camera when zero bounds replace a previously framed stage', async () => {
    const n = startupNative.replacement, s = setup(); mocks.open.mockResolvedValue(stage('/A'))
    mocks.boundRange = {min:n.before.min,max:n.before.max}
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/before.usda')
    const second = nextEngine()
    mocks.boundRange = {min:[0,0,0],max:[0,0,0]}; mocks.open.mockResolvedValue(stage('/Zero')); await runtime.open('/zero.usda')
    const eye = eyes(second).at(-1)!
    eye.forEach((v, i) => expect(v).toBeCloseTo(n.center[i]!+(i===2?n.dist:0), 10)); runtime.dispose(); await tick()
  })
  it.each(optionsNative.times)('uses native URL frame overrides $options', async n => {
    const s = setup(); mocks.open.mockResolvedValue({...stage('/A'),startTimeCode:2,endTimeCode:10,timeCodesPerSecond:24,getFramesPerSecond:()=>24})
    const query = new URLSearchParams(Object.entries(n.options).map(([k,v]) => [k,String(v)]))
    const runtime = await createRuntime(s.canvas, s.callbacks); runtime.setStartupOptions!(parseStartupOptions(query).options); await runtime.open('/frames.usda')
    const info = runtime.getTimeState!()!; expect(info.current).toBe(n.current); expect(info.start).toBe(n.start); expect(info.end).toBe(n.end); expect(info.hasTimeSamples).toBe(n.hasSamples); expect(info.stageStart).toBe(2); expect(info.stageEnd).toBe(10)
    expect(mocks.engine.mock.calls[0]![2]).toBe(n.current)
    if (n.warning) expect(runtime.getDiagnostics!().map(d => d.message)).toContain(n.warning)
    runtime.dispose(); await tick()
  })
  it('opens a population mask before publication and rejects reconfiguration of a committed scene', async () => {
    const s = setup(), paths = ['/World/A']; mocks.openMasked.mockResolvedValue(stage('/World/A'))
    const runtime = await createRuntime(s.canvas, s.callbacks); runtime.setStartupOptions!({populationMask:paths}); paths.push('/World/B'); await runtime.open('/masked.usda')
    expect(mocks.open).not.toHaveBeenCalled(); expect(mocks.openMasked).toHaveBeenCalledOnce(); expect(mocks.openMasked.mock.calls[0]![1].getPaths()).toEqual(['/World/A'])
    expect(() => runtime.setStartupOptions!({camera:'/Missing'})).toThrow('before opening'); runtime.dispose(); await tick()
  })
  it.each(startupNative.frames)('matches native $name startup bounds framing', async n => {
    const s = setup(); mocks.open.mockResolvedValue(stage('/A'))
    mocks.boundRange = {min:n.min,max:n.max}
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/bounds.usda')
    const eye = eyes(s.engine).at(-1)!
    expect(eye[0]).toBeCloseTo(n.center[0]!, 10)
    expect(eye[1]).toBeCloseTo(n.center[1]!, 10)
    expect(eye[2]).toBeCloseTo(n.center[2]!+n.dist, 10)
    runtime.dispose(); await tick()
  })
  it('opens through native main_cam and supplies its actual eye to the renderer', async () => {
    const {Stage:RealStage} = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const {Layer} = await import('typescript-usd/sdf')
    const n = startupNative.cameras.find(row => row.name === 'translated')!
    const stage = await RealStage.open(Layer.createInMemory('primary-camera.usda','#usda 1.0\n'+n.source))
    const s = setup(); mocks.open.mockResolvedValue(stage)
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/primary-camera.usda')
    expect(runtime.getCameraState!().activeCameraPath).toBe(n.selected)
    for (const eye of eyes(s.engine)) expect(eye).toEqual(n.eye)
    runtime.dispose(); await tick()
  })
  // A stage composes each prim's schema type once (stage.cpp:3513-3536,
  // primTypeInfo.cpp:12-38), so the OpenExec plugins (execIr's
  // IrFkController and IrSwitchController) must be registered before the
  // stage opens; registered after it, exec computes the authored fallbacks.
  it('prepares the OpenExec plugins before it opens the stage', async () => {
    const s = setup(); mocks.open.mockResolvedValue(stage('/Model'))
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/model.usda')
    expect(mocks.prepareExec).toHaveBeenCalledOnce()
    expect(mocks.prepareExec.mock.invocationCallOrder[0]!).toBeLessThan(mocks.open.mock.invocationCallOrder[0]!)
    runtime.dispose(); await tick()
  })
  it('opens native reversed ranges at zero without an active playback range', async () => {
    const {Stage:RealStage} = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const {Layer} = await import('typescript-usd/sdf')
    const n = startupNative.times.find(row => row.name === 'reversed')!
    const stage = await RealStage.open(Layer.createInMemory('reversed-time.usda',`#usda 1.0\n(${n.sourceMetadata})\ndef Cube "A" {}`))
    const s = setup(); mocks.open.mockResolvedValue(stage)
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/reversed.usda')
    expect(runtime.getTimeState!()).toMatchObject({current:n.current,start:n.rangeStart,end:n.rangeEnd,stageStart:n.stageStart,stageEnd:n.stageEnd,hasTimeSamples:n.hasTimeSamples})
    expect(runtime.getDiagnostics!()).toContainEqual({severity:'warning',message:n.warning})
    runtime.dispose(); await tick()
  })

  it('reports scene capability claims the viewer profile does not cover as warnings',async()=>{
    const {Stage:RealStage}=await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const {Layer}=await import('typescript-usd/sdf')
    const {Registry:PlugRegistry}=await import('typescript-usd/plug')
    // The served plugInfo document, registered as main.ts registers it ('#' lines are comments).
    const plugInfo=readFileSync('public/plugins/typescript-usd-web-profile/plugInfo.json','utf8')
    PlugRegistry.GetInstance().RegisterPlugins(JSON.parse(plugInfo.split('\n').filter(line=>!/^\s*#/.test(line)).join('\n')))
    const stage=await RealStage.open(Layer.createInMemory('claims.usda',`#usda 1.0
def Cube "A" (
    prepend apiSchemas = ["ClaimsAPI"]
    customData = {
        dictionary profilesInfo = {
            dictionary capabilityUsages = {
                token "usd.core.colorspace" = "hard"
            }
        }
    }
)
{
}
`))
    const s=setup();mocks.open.mockResolvedValue(stage)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/claims.usda')
    expect(runtime.getDiagnostics!()).toContainEqual({severity:'warning',message:"Capability 'usd.core.colorspace' (hard), claimed by </A>, is not covered by profile typescript-usd.web: the scene may display incorrectly."})
    runtime.dispose();await tick()
  })
  it.each(startupNative.invalidRates)('warns about invalid authored time rate $timeCodesPerSecond and keeps metadata intact',async n=>{
    const {Stage:RealStage}=await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const {Layer}=await import('typescript-usd/sdf')
    const stage=await RealStage.open(Layer.createInMemory('invalid-rate.usda',`#usda 1.0\n(${n.sourceMetadata})\ndef Cube "A" {}`))
    const s=setup();mocks.open.mockResolvedValue(stage)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/invalid-rate.usda')
    expect(runtime.getTimeState!()!.timeCodesPerSecond).toBe(n.framesPerSecond)
    expect(stage.timeCodesPerSecond).toBe(n.timeCodesPerSecond)
    expect(runtime.getDiagnostics!()).toContainEqual({severity:'warning',message:expect.stringContaining(`Invalid timeCodesPerSecond (${n.timeCodesPerSecond})`)})
    runtime.dispose();await tick()
  })

  it.each(startupNative.invalidRates)('warns about invalid authored time rate $timeCodesPerSecond and keeps metadata intact',async n=>{
    const {Stage:RealStage}=await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const {Layer}=await import('typescript-usd/sdf')
    const stage=await RealStage.open(Layer.createInMemory('invalid-rate.usda',`#usda 1.0\n(${n.sourceMetadata})\ndef Cube "A" {}`))
    const s=setup();mocks.open.mockResolvedValue(stage)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/invalid-rate.usda')
    expect(runtime.getTimeState!()!.timeCodesPerSecond).toBe(n.framesPerSecond)
    expect(stage.timeCodesPerSecond).toBe(n.timeCodesPerSecond)
    expect(runtime.getDiagnostics!()).toContainEqual({severity:'warning',message:expect.stringContaining(`Invalid timeCodesPerSecond (${n.timeCodesPerSecond})`)})
    runtime.dispose();await tick()
  })
  it.each([false, true])('requests the optional features Storm uses only when supported (%s)', async supported => {
    const s = setup(supported ? ['float32-filterable'] : [])
    const runtime = await createRuntime(s.canvas, s.callbacks)
    expect(s.requestDevice).toHaveBeenCalledWith({requiredFeatures: supported ? ['float32-filterable'] : []})
    runtime.dispose(); await tick()
  })
  it('refreshes transactionally with native reload/reopen state and time clamping', async () => {
    const {Stage: RealStage} = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const {Layer} = await import('typescript-usd/sdf')
    const make = (end:number) => RealStage.open(Layer.createInMemory(`refresh-${end}-${Math.random()}.usda`, `#usda 1.0\n(startTimeCode = 0; endTimeCode = ${end})\ndef Cube "A" {}`))
    const first=await make(24), refreshed=await make(10), reopened=await make(8)
    const s=setup();mocks.open.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error('transport failed')).mockResolvedValueOnce(refreshed).mockResolvedValueOnce(reopened)
    const runtime=await createRuntime(s.canvas,s.callbacks)
    await expect(runtime.refreshScene!('reload')).rejects.toThrow('Load a scene')
    await runtime.open('/refresh.usda')
    first.setEditTarget(first.getSessionLayer());first.getPrim('/A')!.createAttribute('visibility','token').set('invisible');await first.flushChanges()
    runtime.select('/A');await runtime.setTime!(20)
    runtime.setCameraSettings!({fovDegrees:45});await runtime.setDisplaySettings!({background:'White'})
    await expect(runtime.refreshScene!('reload')).rejects.toThrow('transport failed')
    expect(runtime.getTimeState!()!.current).toBe(20)
    expect(runtime.getCompositionState!('/A').visibility).toBe('invisible')
    const reload=await runtime.refreshScene!('reload')
    expect(reload.selection.path).toBe('/A');expect(runtime.getTimeState!()!.current).toBe(10)
    expect(runtime.getCompositionState!('/A').visibility).toBe('invisible')
    const reopen=await runtime.refreshScene!('reopen')
    expect(reopen.selection.path).toBe(null);expect(runtime.getTimeState!()!.current).toBe(8)
    expect(runtime.getCompositionState!('/A').visibility).toBe('inherited')
    expect(runtime.getDisplaySettings!().background).toBe('White');expect(runtime.getCameraState!().free.fovDegrees).toBe(45)
    runtime.dispose();await tick()
  })

  it('blocks export without a stable loaded scene and after disposal', async () => {
    const s = setup(), next = deferred<ReturnType<typeof stage>>()
    mocks.open.mockResolvedValueOnce(stage('/A')).mockReturnValueOnce(next.promise)
    const runtime = await createRuntime(s.canvas, s.callbacks)
    await expect(runtime.exportStage!('session')).rejects.toThrow('Load a scene')
    await runtime.open('/a.usda')
    const pending = runtime.open('/b.usda')
    await expect(runtime.exportStage!('flattened')).rejects.toThrow('Wait for the current scene update')
    next.resolve(stage('/B'))
    await pending
    runtime.dispose()
    await expect(runtime.exportStage!('session')).rejects.toThrow('Load a scene')
    await tick()
  })

  it('collects library warnings and errors posted while building and after commit', async () => {
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{}),error=vi.spyOn(console,'error').mockImplementation(()=>{})
    const s = setup(), a = stage('/A')
    mocks.open.mockImplementationOnce(async () => {
      TfRaiseWarning('Loading ./textures/missing.jpg failed! Using fallback value: 0')
      return a
    })
    const runtime = await createRuntime(s.canvas, s.callbacks)
    await runtime.open('/a.usda')
    expect(sceneDiagnostics(runtime)).toEqual([{severity: 'warning', message: expect.stringContaining('missing.jpg failed!')}])
    TfRaiseWarning('Could not find texture rgb for node Diffuse')
    TfRaiseWarning('Could not find texture rgb for node Diffuse')
    expect(sceneDiagnostics(runtime).map(d => d.message)).toEqual([expect.stringContaining('missing.jpg failed!'), expect.stringContaining('Could not find texture rgb')])
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenNthCalledWith(1,expect.stringContaining('missing.jpg failed!'))
    expect(warn).toHaveBeenNthCalledWith(2,'Could not find texture rgb for node Diffuse')
    TfDiagnosticMgr.GetInstance().postError('Material diagnostic error')
    expect(error).toHaveBeenCalledWith('Material diagnostic error')

    runtime.dispose()
    TfRaiseWarning('After dispose')
    expect(runtime.getDiagnostics!().some(d => d.message.includes('After dispose'))).toBe(false)
  })
  it('lists WebGPU validation errors from Storm as error diagnostics and still loads the scene', async () => {
    vi.spyOn(console,'error').mockImplementation(()=>{})
    const s = setup(); mocks.open.mockResolvedValue(stage('/A'))
    s.device.popErrorScope.mockResolvedValueOnce({ message: 'var with storage address space cannot be used by vertex stage' })
    const runtime = await createRuntime(s.canvas, s.callbacks)
    await runtime.open('/a.usda')
    expect(runtime.getDiagnostics!()).toContainEqual({severity:'error',message:'WebGPU: var with storage address space cannot be used by vertex stage'})
    expect(runtime.select('/A').path).toBe('/A')
    expect(s.callbacks.statusChanged.mock.calls.at(-1)![0]).toMatch(/^Loaded/)
    const uncaptured = s.device.addEventListener.mock.calls.find(([type]) => type === 'uncapturederror')![1] as (event: {error: {message: string}}) => void
    uncaptured({error: {message: 'setPipeline: invalid RenderPipeline'}})
    expect(runtime.getDiagnostics!()).toContainEqual({severity:'error',message:'WebGPU: setPipeline: invalid RenderPipeline'})
    draw(); expect(s.engine.Render).toHaveBeenCalled()
    runtime.dispose(); await tick()
  })
  it('does not diagnose NURBS, tet meshes or implicit surfaces, which Storm draws', async () => {
    const {Stage:RealStage}=await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const {Layer}=await import('typescript-usd/sdf')
    const source=await RealStage.open(Layer.createInMemory('gprims.usda',`#usda 1.0
def NurbsPatch "Patch" {}
def TetMesh "Tets" {}
def NurbsCurves "Curve" {}
def Sphere "Ball" {}
def Capsule "Pill" {}
`))
    const s=setup();mocks.open.mockResolvedValue(source)
    s.engine.getDrawableCount.mockReturnValue(0)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/gprims.usda')
    const messages=runtime.getDiagnostics!().map(d=>d.message)
    // Storm approximates NURBS (HdSt_NurbsApproximatingSceneIndexPlugin), converts tet
    // meshes (HdSt_TetMeshConversionSceneIndexPlugin) and meshes implicit surfaces
    // (HdSt_ImplicitSurfaceSceneIndexPlugin): nothing to diagnose.
    expect(messages.some(m=>/Patch|Tets|Curve|Ball|Pill|not drawn yet/.test(m))).toBe(false)
    expect(s.callbacks.statusChanged).toHaveBeenLastCalledWith('Loaded · No drawable geometry · Stage available for inspection')
    runtime.dispose(); await tick()
  })
  it('diagnoses scene features the faithful stack does not draw yet', async () => {
    const {Stage:RealStage}=await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const {Layer}=await import('typescript-usd/sdf')
    const source=await RealStage.open(Layer.createInMemory('coverage.usda',`#usda 1.0
def Volume "Smoke" {}
def Mesh "Ball" {
    uniform token subdivisionScheme = "catmullClark"
}
def Shader "Surface" {
    uniform token info:id = "ND_standard_surface_surfaceshader"
}
`))
    const s=setup();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/coverage.usda')
    const messages=()=>runtime.getDiagnostics!().map(d=>d.message)
    // Storm draws volumes (HdxOitVolumeRenderTask reads the depth AOV): nothing to diagnose.
    expect(messages().some(m=>m.startsWith('Volumes'))).toBe(false)
    // Storm draws MaterialX (typescript-usd/hdSt/materialx): nothing to diagnose.
    expect(messages().some(m=>m.includes('MaterialX'))).toBe(false)
    expect(messages().some(m=>m.startsWith('Smooth subdivision'))).toBe(false)
    // Uniform subdivision (Storm's default refinement) is drawn: nothing to diagnose.
    await runtime.setDisplaySettings!({complexity:'medium'})
    expect(messages().some(m=>m.startsWith('Smooth subdivision'))).toBe(false)
    expect(s.engine.applySettings).toHaveBeenLastCalledWith(expect.objectContaining({complexity:'medium'}),false)
    await runtime.setDisplaySettings!({renderMode:'Points'})
    // HgiWebGPU emulates wide points (Safari: the points asset is within 21 px of usdrecord).
    expect(messages().some(m=>m.startsWith('Points wider than one pixel'))).toBe(false)
    expect(mocks.engine).toHaveBeenCalledOnce()
    runtime.dispose();await tick()
  })

  it('renders at the new size during resize instead of waiting for an animation frame', async () => {
    const s=setup();mocks.open.mockResolvedValue(stage('/A'))
    const runtime=await createRuntime(s.canvas,s.callbacks)
    await runtime.open('/a.usda')
    const renders=s.engine.Render.mock.calls.length, frames=vi.mocked(requestAnimationFrame).mock.calls.length
    runtime.resize(640,360,2)
    expect(s.canvas.width).toBe(1280);expect(s.canvas.height).toBe(720)
    expect(s.engine.Render.mock.calls.length).toBe(renders+1)
    expect(s.engine.Render.mock.calls.at(-1)!.slice(1)).toEqual([1280,720])
    expect(vi.mocked(requestAnimationFrame).mock.calls.length).toBe(frames)
    runtime.dispose();await tick()
  })
  // Mock/controller test. The browser counterpart is the asset-acceptance
  // fixture translucent_overlay (Safari, against usdrecord): Storm's OIT
  // resolve writes only the resolved color AOV (hdx/taskControllerSceneIndex.cpp
  // :284-305,330-339), so the overlays never resolve the multisampled color again.
  it('draws overlays into their own layer over Storm\'s multisampled depth and blends it over the resolved color', async () => {
    const s=setup();mocks.open.mockResolvedValue(stage('/A'))
    const runtime=await createRuntime(s.canvas,s.callbacks)
    mocks.overlayBegin.mockClear();mocks.overlayComposite.mockClear();mocks.axes.mockClear()
    await runtime.open('/a.usda')
    draw()
    expect(mocks.axes).toHaveBeenCalled()
    expect(mocks.axes.mock.calls.at(-1)![0]).toEqual({ overlayLayerView: true })
    // One cleared layer and one composite per drawn frame.
    expect(mocks.overlayBegin.mock.calls.length).toBe(mocks.axes.mock.calls.length)
    expect(mocks.overlayComposite.mock.calls.length).toBe(mocks.axes.mock.calls.length)
    expect(s.engine.Render.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.overlayBegin.mock.invocationCallOrder.at(-1)!)
    expect(mocks.axes.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.overlayComposite.mock.invocationCallOrder.at(-1)!)
    expect(s.encoder.beginRenderPass.mock.calls.some(call => ((call as unknown[])[0] as {colorAttachments:{resolveTarget?:unknown}[]}).colorAttachments.some(a => a.resolveTarget))).toBe(false)
    mocks.overlayBegin.mockClear();mocks.overlayComposite.mockClear();runtime.setAxesVisible!(false);draw()
    expect(mocks.overlayBegin).not.toHaveBeenCalled()
    expect(mocks.overlayComposite).not.toHaveBeenCalled()
    runtime.dispose();await tick()
  })
  it('closes failed opens and retains the archive scope across retained display changes', async () => {
    const s=setup(),source=stage('/A')
    const runtime=await createRuntime(s.canvas,s.callbacks)
    mocks.open.mockRejectedValueOnce(new Error('read failed'))
    await expect(runtime.open('/missing.usda')).rejects.toThrow('read failed')
    expect(mocks.scopes.at(-1)!.dispose).toHaveBeenCalledTimes(1)
    mocks.open.mockResolvedValue(source)
    await runtime.open('/a.usda')
    const retained=mocks.scopes.at(-1)!
    await runtime.setDisplaySettings!({complexity:'medium'})
    expect(retained.dispose).not.toHaveBeenCalled()
    runtime.dispose();await tick()
    expect(retained.dispose).toHaveBeenCalledTimes(1)
  })

  it('opens an explicit local asset root through a per-load resolver context', async () => {
    const s=setup(),source=stage('/Local')
    mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks)
    const tree=await runtime.openFiles!({rootPath:'folder/root.usda',files:[{path:'folder/root.usda',file:new File(['#usda 1.0'],'root.usda')}]})
    expect(tree[0]!.path).toBe('/Local')
    expect(mocks.open.mock.calls[0]![0]).toMatch(/^https:\/\/local-file\.invalid\/[^/]+\/folder\/root\.usda$/)
    expect(mocks.open.mock.calls[0]![1].resolverContext).toBeDefined()
    runtime.dispose();await tick();expect(source.dispose).toHaveBeenCalledTimes(1)
  })

  it('preserves the previous scene when an invalid local mount fails before Stage.open', async () => {
    const s=setup(),source=stage('/Previous'),file=new File([''],'root.usda')
    mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks)
    await runtime.open('/previous.usda')
    await expect(runtime.openFiles!({rootPath:'root.usda',files:[{path:'root.usda',file},{path:'root.usda',file}]})).rejects.toThrow('Duplicate local asset path')
    expect(mocks.open).toHaveBeenCalledTimes(1)
    expect(runtime.select('/Previous').path).toBe('/Previous')
    expect(source.dispose).not.toHaveBeenCalled()
    runtime.dispose()
  })

  it('disposes an aborted local asset-set stage when its pending open completes', async () => {
    const s=setup(),source=stage('/Local'),pending=deferred<ReturnType<typeof stage>>()
    mocks.open.mockReturnValue(pending.promise)
    const runtime=await createRuntime(s.canvas,s.callbacks),abort=new AbortController()
    const opening=runtime.openFiles!({rootPath:'root.usda',files:[{path:'root.usda',file:new File([''],'root.usda')}]},abort.signal)
    const rejected=expect(opening).rejects.toMatchObject({name:'AbortError'})
    await tick();abort.abort();pending.resolve(source);await rejected
    expect(source.dispose).toHaveBeenCalledTimes(1)
    expect(runtime.select('/Local').path).toBeNull()
    runtime.dispose()
  })

  it('rejects display changes while a scene is opening', async () => {
    const s = setup(), source = deferred<ReturnType<typeof stage>>()
    mocks.open.mockReturnValue(source.promise)
    const runtime = await createRuntime(s.canvas,s.callbacks)
    const opening = runtime.open('/first.usda')
    await expect(runtime.setDisplaySettings!({cameraLightEnabled:false})).rejects.toThrow('Wait for the scene load')
    source.resolve(stage('/A'));await opening
    expect(runtime.getDisplaySettings!().cameraLightEnabled).toBe(true)
    runtime.dispose()
  })

  it('applies display changes to the retained engine and rolls them back when the draw fails', async () => {
    const s = setup(), source = stage('/A')
    mocks.open.mockResolvedValue(source)
    const runtime = await createRuntime(s.canvas,s.callbacks)
    await runtime.open('/first.usda'); runtime.select('/A')
    await runtime.setDisplaySettings!({complexity:'veryhigh', renderMode:'Wireframe'})
    expect(runtime.getDisplaySettings!()).toMatchObject({complexity:'veryhigh', renderMode:'Wireframe'})
    expect(s.engine.applySettings).toHaveBeenLastCalledWith(expect.objectContaining({complexity:'veryhigh', renderMode:'Wireframe'}), false)
    s.engine.Render.mockImplementationOnce(() => { throw new Error('unsupported refinement level 3') })
    await expect(runtime.setDisplaySettings!({complexity:'medium'})).rejects.toThrow('unsupported refinement level 3')
    expect(runtime.getDisplaySettings!().complexity).toBe('veryhigh')
    expect(s.engine.applySettings).toHaveBeenLastCalledWith(expect.objectContaining({complexity:'veryhigh'}), false)
    expect(mocks.engine).toHaveBeenCalledOnce()
    expect(s.engine.destroy).not.toHaveBeenCalled()
    expect(source.dispose).not.toHaveBeenCalled()
    expect(runtime.select('/A').path).toBe('/A')
    runtime.dispose()
  })
  it('waits for a texture first requested by a display change before publishing it', async () => {
    const s = setup(); mocks.open.mockResolvedValue(stage('/A'))
    const runtime = await createRuntime(s.canvas,s.callbacks); await runtime.open('/a.usda')
    const initial = runtime.getDisplaySettings!()
    let complete = false
    s.engine.isConverged.mockReturnValue(false)
    const changing = runtime.setDisplaySettings!({domeLightEnabled:true}).then(value => { complete = true; return value })
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(complete).toBe(false); expect(runtime.getDisplaySettings!()).toEqual(initial)
    s.engine.isConverged.mockReturnValue(true); await changing
    expect(runtime.getDisplaySettings!().domeLightEnabled).toBe(true)
    // HdxSkydomeTask draws dome light textures: no coverage diagnostic.
    expect(runtime.getDiagnostics!().map(d=>d.message)).not.toContainEqual(expect.stringMatching(/^Dome light textures/))
    runtime.dispose(); await tick()
  })
  it('restores settings when a draw while textures load fails, and cancels on disposal', async () => {
    const s = setup(); mocks.open.mockResolvedValue(stage('/A'))
    const runtime = await createRuntime(s.canvas,s.callbacks); await runtime.open('/a.usda')
    const initial = runtime.getDisplaySettings!()
    s.engine.isConverged.mockReturnValueOnce(false)
    s.engine.Render.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('default dome draw failed') })
    await expect(runtime.setDisplaySettings!({domeLightEnabled:true,cameraLightEnabled:false})).rejects.toThrow('default dome draw failed')
    expect(runtime.getDisplaySettings!()).toEqual(initial)
    expect(s.engine.applySettings).toHaveBeenLastCalledWith(initial, false)
    s.engine.isConverged.mockReturnValue(false)
    const changing = runtime.setDisplaySettings!({domeLightEnabled:true})
    const rejected = expect(changing).rejects.toMatchObject({name:'AbortError'})
    await tick(); runtime.dispose(); await rejected; await tick()
    expect(runtime.getDisplaySettings!().domeLightEnabled).toBe(false)
    expect(s.engine.destroy).toHaveBeenCalledOnce()
  })
  it('opens a stage with composition errors and reports them as warnings', async () => {
    const warn=vi.spyOn(console,'warn').mockImplementation(()=>{})
    const s = setup(), first = stage('/A'), incomplete = stage('/Incomplete')
    nextEngine(); nextEngine()
    mocks.open.mockResolvedValueOnce(first).mockResolvedValueOnce(incomplete)
    const diagnosticsChanged = vi.fn()
    const runtime = await createRuntime(s.canvas, {...s.callbacks, diagnosticsChanged})
    await runtime.open('/first.usda')
    expect(sceneDiagnostics(runtime)).toEqual([])
    const message = 'Could not open asset @missing.usda@ for reference introduced by @/incomplete.usda@</Incomplete>'
    incomplete.getCompositionErrors = () => [{toString: () => message}]
    await runtime.open('/incomplete.usda')
    expect(sceneDiagnostics(runtime)).toEqual([{severity: 'warning', message}])
    expect(diagnosticsChanged).toHaveBeenLastCalledWith([{severity: 'warning', message}])
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(runtime.select('/Incomplete').path).toBe('/Incomplete')
    expect(s.callbacks.statusChanged).toHaveBeenLastCalledWith(expect.stringContaining('Loaded ·'))
    expect(s.callbacks.statusChanged.mock.calls.at(-1)?.[0]).not.toContain('warning(s)')
    expect(warn).toHaveBeenCalledTimes(1) // the composition error
    const reopened=stage('/Incomplete');reopened.getCompositionErrors=incomplete.getCompositionErrors
    mocks.open.mockResolvedValueOnce(reopened)
    await runtime.open('/incomplete.usda')
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(message)

    runtime.dispose()
  })

  it('waits for texture readiness and validates a textured draw before committing', async () => {
    const s = setup(), source = stage('/A')
    s.engine.isConverged.mockReturnValue(false)
    mocks.open.mockResolvedValue(source)
    const runtime = await createRuntime(s.canvas, s.callbacks)
    const opening = runtime.open('/textured.usda')
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(s.engine.Render.mock.calls.length).toBeGreaterThan(1) // Offscreen validation draws until converged.
    expect(runtime.select('/A').path).toBeNull()
    expect(s.callbacks.statusChanged).toHaveBeenCalledWith('Loading scene textures…')
    expect(s.callbacks.statusChanged.mock.calls.some(([message]) => message.startsWith('Loaded'))).toBe(false)
    const validations = s.engine.Render.mock.calls.length
    s.engine.isConverged.mockReturnValue(true)
    await opening
    expect(s.engine.Render.mock.calls.length).toBeLessThanOrEqual(validations + 2) // A converged validation, then the visible draw.
    expect(runtime.select('/A').path).toBe('/A')
    runtime.dispose(); await tick()
    expect(source.dispose).toHaveBeenCalledTimes(1)
  })
  it('preserves the committed scene when a draw of a replacement with loading textures fails', async () => {
    const s = setup(), first = stage('/A'), second = stage('/B')
    mocks.open.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    const runtime = await createRuntime(s.canvas, s.callbacks)
    await runtime.open('/first.usda')
    const candidate = nextEngine(); candidate.isConverged.mockReturnValue(false)
    candidate.Render.mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('missing texture') })
    s.callbacks.statusChanged.mockClear(); s.callbacks.selectionChanged.mockClear()
    const opening = runtime.open('/broken.usda')
    const rejected = expect(opening).rejects.toThrow('missing texture')
    await tick()
    expect(runtime.select('/A').path).toBe('/A')
    expect(runtime.select('/B').path).toBeNull()
    await rejected
    expect(second.dispose).toHaveBeenCalledTimes(1)
    expect(candidate.destroy).toHaveBeenCalledTimes(1)
    expect(first.dispose).not.toHaveBeenCalled()
    expect(s.engine.destroy).not.toHaveBeenCalled()
    expect(runtime.select('/A').path).toBe('/A')
    expect(s.callbacks.statusChanged.mock.calls.some(([message]) => message.startsWith('Loaded'))).toBe(false)
    runtime.dispose(); await tick()
    expect(first.dispose).toHaveBeenCalledTimes(1)
  })
  it('releases a cancelled candidate while its textures load without another draw', async () => {
    const s = setup(), source = stage('/A')
    s.engine.isConverged.mockReturnValue(false)
    mocks.open.mockResolvedValue(source)
    const runtime = await createRuntime(s.canvas, s.callbacks), abort = new AbortController()
    const opening = runtime.open('/slow.usda', abort.signal)
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    abort.abort()
    await rejected
    expect(s.engine.Render).toHaveBeenCalledTimes(1)
    expect(source.dispose).toHaveBeenCalledTimes(1)
    expect(s.engine.destroy).toHaveBeenCalledTimes(1)
    expect(runtime.select('/A').path).toBeNull()
    runtime.dispose()
  })
  it('disposes an in-flight texture candidate immediately and never cleans it twice', async () => {
    const s = setup(), source = stage('/A')
    s.engine.isConverged.mockReturnValue(false)
    mocks.open.mockResolvedValue(source)
    const runtime = await createRuntime(s.canvas, s.callbacks)
    const opening = runtime.open('/slow.usda')
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    runtime.dispose()
    expect(source.dispose).toHaveBeenCalledTimes(1)
    expect(s.engine.destroy).toHaveBeenCalledTimes(1)
    await rejected; await tick()
    expect(s.engine.Render).toHaveBeenCalledTimes(1)
    expect(source.dispose).toHaveBeenCalledTimes(1)
    expect(s.engine.destroy).toHaveBeenCalledTimes(1)
    expect(s.device.destroy).toHaveBeenCalledTimes(1)
  })
  it('destroys a device when canvas configuration fails', async () => {
    const s = setup()
    s.context.configure.mockImplementation(() => { throw new Error('configuration failed') })
    await expect(createRuntime(s.canvas, s.callbacks)).rejects.toThrow('configuration failed')
    expect(s.device.destroy).toHaveBeenCalledTimes(1)
  })

  it('releases a stage whose engine construction fails before validating a draw', async () => {
    const s = setup(), source = stage('/A')
    mocks.open.mockResolvedValue(source)
    mocks.engine.mockImplementationOnce(() => { throw new Error('adapter failed') })
    const runtime = await createRuntime(s.canvas, s.callbacks)
    await expect(runtime.open('/a.usda')).rejects.toThrow('adapter failed')
    expect(s.engine.Render).not.toHaveBeenCalled()
    expect(source.dispose).toHaveBeenCalledTimes(1)
    expect(s.device.pushErrorScope.mock.calls.length).toBe(s.device.popErrorScope.mock.calls.length)
    expect(s.callbacks.statusChanged.mock.calls.some(([message]) => message.startsWith('Loaded'))).toBe(false)
    runtime.dispose()
  })
  it('keeps a candidate uncommitted until validation, and releases it when aborted', async () => {
    const s = setup(), source = stage('/A'), validation = deferred<GPUError | null>()
    mocks.open.mockResolvedValue(source)
    s.device.popErrorScope.mockReturnValueOnce(validation.promise)
    const runtime = await createRuntime(s.canvas, s.callbacks)
    const abort = new AbortController()
    const opening = runtime.open('/a.usda', abort.signal)
    const rejected = expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    await tick()
    expect(runtime.select('/A').path).toBeNull()
    abort.abort(); validation.resolve(null)
    await rejected
    expect(source.dispose).toHaveBeenCalledTimes(1)
    expect(s.engine.destroy).toHaveBeenCalledTimes(1)
    expect(s.callbacks.statusChanged.mock.calls.some(([message]) => message.startsWith('Loaded'))).toBe(false)
    runtime.dispose()
  })
  it('keeps instance identity for selection API calls and clears it for whole-prim selection', async () => {
    const s = setup(), current = stage('/I/Prototype/Mesh'), getPrim = current.getPrim
    current.getPrim = path => path === '/I' ? { ...getPrim('/I/Prototype/Mesh')!, typeName: 'PointInstancer' } : getPrim(path)
    mocks.open.mockResolvedValue(current)
    const runtime = await createRuntime(s.canvas, s.callbacks)
    await runtime.open('/instances.usda')
    expect(runtime.select('/I/Prototype/Mesh', {instanceIndex: 7})).toMatchObject({ path: '/I/Prototype/Mesh', instanceIndex: 7, instancerPath: '/I', selections: [{path:'/I/Prototype/Mesh',instanceIndices:[7]}] })
    draw()
    expect(mocks.bounds).toHaveBeenLastCalledWith(current,0,'/I',7,expect.any(Object),[{path:'/I/Prototype/Mesh',instanceIndices:[7]}])
    expect(runtime.select('/I/Prototype/Mesh').instanceIndex).toBeUndefined()
    runtime.dispose()
  })
})

async function composedStage() {
  const { Stage: ActualStage } = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
  const { Layer } = await import('typescript-usd/sdf')
  const layer = Layer.createAnonymous('review.usda')
  layer.importFromString(`#usda 1.0
(
    startTimeCode = 2
    endTimeCode = 4
)
def Xform "World" (
    variants = { string content = "full" }
    prepend variantSets = "content"
) {
    double weight.timeSamples = { 2: 10, 4: 30 }
    variantSet "content" = {
        "full" {
            def Cube "Shape" {}
        }
        "empty" {}
    }
}
`)
  return ActualStage.open(layer)
}
describe('review and timeline runtime integration', () => {
  it('syncs visibility edits into the retained engine and refreshes bounds', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    runtime.select('/World/Shape')
    s.engine.Render.mockClear();mocks.bounds.mockClear()
    const keys=trackListeners()
    const result=await runtime.applyCompositionCommand!({kind:'visibility',path:'/World/Shape',action:'hide'})
    expect(result.selection.path).toBe('/World/Shape')
    expect(runtime.getCompositionState!('/World/Shape').visibility).toBe('invisible')
    expect(mocks.engine).toHaveBeenCalledOnce()
    expect(s.engine.Render).toHaveBeenCalled()
    expect(s.engine.destroy).not.toHaveBeenCalled()
    expect(mocks.bounds).toHaveBeenCalled()
    expect(keys.length).toBe(1);expect(keys.every(k=>k.revoked)).toBe(true) // the composition listener is revoked
    runtime.dispose()
  })
  it('returns the current hierarchy on an empty reset without renderer work', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    runtime.select('/World/Shape')
    const session=source.getSessionLayer().exportToString()
    s.engine.Render.mockClear();s.device.pushErrorScope.mockClear()
    const result=await runtime.applyCompositionCommand!({kind:'resetVisibility'})
    expect(result.tree[0]?.children[0]?.path).toBe('/World/Shape')
    expect(result.selection.path).toBe('/World/Shape')
    expect(source.getSessionLayer().exportToString()).toBe(session)
    expect(s.device.pushErrorScope).not.toHaveBeenCalled()
    expect(mocks.engine).toHaveBeenCalledOnce()
    runtime.dispose()
  })
  it('restores stage, engine and selection after a rejected visibility draw, then permits another edit', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    runtime.select('/World/Shape')
    const session=source.getSessionLayer().exportToString(), settings=runtime.getDisplaySettings!()
    s.engine.Render.mockImplementationOnce(()=>{throw new Error('visibility draw failed')})
    const keys=trackListeners()
    await expect(runtime.applyCompositionCommand!({kind:'visibility',path:'/World/Shape',action:'hide'})).rejects.toThrow('visibility draw failed')
    expect(source.getSessionLayer().exportToString()).toBe(session)
    expect(runtime.getCompositionState!('/World/Shape').visibility).toBe('inherited')
    expect(runtime.getDisplaySettings!()).toEqual(settings)
    expect(s.engine.destroy).not.toHaveBeenCalled()
    expect(runtime.getSelectionState!().selections.map(e=>e.path)).toEqual(['/World/Shape'])
    expect(keys.length).toBe(1);expect(keys.every(k=>k.revoked)).toBe(true) // the composition listener is revoked
    await runtime.applyCompositionCommand!({kind:'visibility',path:'/World/Shape',action:'hide'})
    expect(runtime.getCompositionState!('/World/Shape').visibility).toBe('invisible')
    expect(mocks.engine).toHaveBeenCalledOnce()
    runtime.dispose()
  })
  it('rolls back a visibility edit when the final visible draw fails', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    runtime.select('/World/Shape')
    const session=source.getSessionLayer().exportToString()
    // The visible draw is the one that presents Storm's AOVs (it asks for
    // them after its Render; validation renders do not).
    let failVisible=true
    const aovTextures=s.engine.GetAovTextures
    vi.spyOn(s.engine,'GetAovTextures').mockImplementation(()=>{if(failVisible){failVisible=false;throw new Error('visible draw failed')}return aovTextures()})
    await expect(runtime.applyCompositionCommand!({kind:'visibility',path:'/World/Shape',action:'hide'})).rejects.toThrow('visible draw failed')
    expect(source.getSessionLayer().exportToString()).toBe(session)
    expect(runtime.getCompositionState!('/World/Shape').visibility).toBe('inherited')
    expect(s.engine.destroy).not.toHaveBeenCalled()
    await runtime.applyCompositionCommand!({kind:'visibility',path:'/World/Shape',action:'hide'})
    expect(runtime.getCompositionState!('/World/Shape').visibility).toBe('invisible')
    runtime.dispose()
  })
  it('reports failed retained renderer recovery and blocks further edits', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    s.engine.Render.mockImplementation(()=>{throw new Error('sync failed')})
    const keys=trackListeners()
    await expect(runtime.applyCompositionCommand!({kind:'visibility',path:'/World/Shape',action:'hide'})).rejects.toThrow('renderer rollback failed')
    expect(runtime.getCompositionState!('/World/Shape').visibility).toBe('inherited')
    await expect(runtime.applyCompositionCommand!({kind:'resetVisibility'})).rejects.toThrow('renderer rollback failed')
    expect(keys.length).toBe(1);expect(keys.every(k=>k.revoked)).toBe(true) // the composition listener is revoked
    runtime.dispose()
  })
  it('uses authored initial time and reevaluates selected property values', async () => {
    const s=setup(), source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks)
    await runtime.open('/review.usda')
    // Python str(float) (common.py GetShortStringForValue).
    expect(runtime.getTimeState!()).toMatchObject({start:2,end:4,current:2})
    expect(runtime.select('/World').properties.find(p=>p.name==='weight')?.value).toBe('10.0')
    await runtime.setTime!(3)
    expect(runtime.select('/World').properties.find(p=>p.name==='weight')?.value).toBe('20.0')
    expect(s.engine.SetTime).toHaveBeenLastCalledWith(3)
    runtime.dispose()
  })
  it('serializes pending frame updates and restores time after a failed frame draw', async () => {
    const s=setup(), source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    // A paused step settles its textures (settleImaging) before it completes.
    s.engine.isConverged.mockReturnValue(false)
    const changing=runtime.setTime!(3)
    await expect(runtime.setTime!(4)).rejects.toThrow('already in progress')
    await expect(runtime.applyCompositionCommand!({kind:'resetVisibility'})).rejects.toThrow('current scene update')
    s.engine.isConverged.mockReturnValue(true);await changing
    s.engine.Render.mockImplementationOnce(()=>{throw new Error('bad animated buffer')})
    await expect(runtime.setTime!(4)).rejects.toThrow('bad animated buffer')
    expect(runtime.getTimeState!()?.current).toBe(3)
    expect(s.engine.SetTime).toHaveBeenLastCalledWith(3)
    runtime.dispose()
  })
  // stageView.py:1213-1223: one updateGL per frame change. A paused step
  // draws once and presents it, with no further draw queued.
  it('renders and presents a paused time step once', async () => {
    const s=setup(), source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    const present=vi.spyOn(s.context,'getCurrentTexture')
    s.engine.Render.mockClear();vi.mocked(requestAnimationFrame).mockClear()
    await runtime.setTime!(3)
    expect(s.engine.Render).toHaveBeenCalledOnce();expect(present).toHaveBeenCalledOnce()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    runtime.dispose()
  })
  // appController.py:3885-3889: playback renders each frame without the
  // property view, HUD geometry counts or camera refresh, which follow when it
  // stops (appController.py:2121); paintGL (stageView.py:1576-1600) does not
  // wait on GPU errors.
  it('plays a frame with one render, without waiting on GPU error scopes or per-frame UI refreshes', async () => {
    const s=setup(), source=await composedStage();mocks.open.mockResolvedValue(source)
    const callbacks={...s.callbacks,cameraChanged:vi.fn(),timeChanged:vi.fn()}
    const runtime=await createRuntime(s.canvas,callbacks);await runtime.open('/review.usda')
    runtime.setPlaybackActive!(true)
    const present=vi.spyOn(s.context,'getCurrentTexture')
    s.engine.Render.mockClear();vi.mocked(requestAnimationFrame).mockClear()
    callbacks.cameraChanged.mockClear();callbacks.timeChanged.mockClear();callbacks.geometryChanged.mockClear();callbacks.selectionChanged.mockClear()
    s.device.popErrorScope.mockReturnValue(new Promise(() => {}))
    await runtime.setTime!(3)
    expect(runtime.getTimeState!()!.current).toBe(3)
    expect(s.engine.Render).toHaveBeenCalledOnce();expect(present).toHaveBeenCalledOnce()
    expect(requestAnimationFrame).not.toHaveBeenCalled()
    expect(callbacks.timeChanged).toHaveBeenCalledOnce()
    expect(callbacks.cameraChanged).not.toHaveBeenCalled();expect(callbacks.geometryChanged).not.toHaveBeenCalled();expect(callbacks.selectionChanged).not.toHaveBeenCalled()
    expect(s.device.pushErrorScope.mock.calls.length).toBe(s.device.popErrorScope.mock.calls.length)
    runtime.setPlaybackActive!(false)
    expect(callbacks.selectionChanged).toHaveBeenCalledOnce();expect(callbacks.cameraChanged).toHaveBeenCalledOnce()
    runtime.dispose()
  })
  it('reports playback GPU errors when their scopes resolve and stops at the next frame on out-of-memory', async () => {
    const s=setup(), source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    runtime.setPlaybackActive!(true)
    const validation=deferred<{message:string}|null>(),memory=deferred<{message:string}|null>()
    s.device.popErrorScope.mockReturnValueOnce(validation.promise).mockReturnValueOnce(memory.promise)
    await runtime.setTime!(3)
    validation.resolve({message:'invalid bind group'});memory.resolve({message:'buffer allocation failed'});await tick()
    expect(sceneDiagnostics(runtime)).toContainEqual({severity:'error',message:'WebGPU: invalid bind group'})
    expect(s.callbacks.statusChanged).toHaveBeenLastCalledWith(expect.stringContaining('WebGPU memory allocation while drawing a frame: buffer allocation failed'))
    await expect(runtime.setTime!(4)).rejects.toThrow('buffer allocation failed')
    expect(runtime.getTimeState!()!.current).toBe(3)
    runtime.dispose()
  })
  it('settles textures a new frame requests before publishing it', async () => {
    const s=setup(), source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    let complete=false
    s.engine.isConverged.mockReturnValue(false)
    const changing=runtime.setTime!(3).then(()=>{complete=true})
    await new Promise(resolve=>setTimeout(resolve,30));expect(complete).toBe(false);expect(runtime.getTimeState!()!.current).toBe(2)
    s.engine.isConverged.mockReturnValue(true);await changing
    expect(runtime.getTimeState!()!.current).toBe(3)
    runtime.dispose()
  })
  it('applies variants to the retained engine at current time, accepts empty scenes and clears vanished selection', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda');await runtime.setTime!(3)
    runtime.select('/World/Shape');runtime.setCameraSettings!({fovDegrees:45})
    const camera=runtime.getCameraState!()
    s.engine.getDrawableCount.mockReturnValue(0)
    const result=await runtime.applyCompositionCommand!({kind:'variant',path:'/World',set:'content',selection:'empty'})
    expect(result.tree[0]?.children).toEqual([]);expect(result.selection.path).toBeNull()
    expect(runtime.getCameraState!()).toEqual(camera)
    expect(runtime.getTimeState!()?.current).toBe(3)
    expect(s.engine.SetTime).toHaveBeenLastCalledWith(3)
    expect(mocks.engine).toHaveBeenCalledOnce()
    runtime.dispose()
  })
  it('deactivates on the session layer and clears the selection as native does', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    runtime.select('/World/Shape')
    expect(runtime.getEditState!('/World/Shape')).toMatchObject({path:'/World/Shape',active:true,imageable:true})
    const result=await runtime.applyCompositionCommand!({kind:'activation',path:'/World/Shape',active:false})
    expect(result.selection.path).toBeNull()
    expect(source.getSessionLayer().getPrimAtPath('/World/Shape')?.getActive()).toBe(false)
    expect(source.getRootLayer().getPrimAtPath('/World/Shape')).toBeUndefined()
    expect(runtime.getEditState!('/World/Shape').active).toBe(false)
    runtime.dispose()
  })
  it('removes session visibility and switches stage interpolation on the retained engine', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    runtime.select('/World/Shape')
    await runtime.applyCompositionCommand!({kind:'visibility',path:'/World/Shape',action:'hide'})
    expect(runtime.getEditState!('/World/Shape').sessionVisibility).toBe(true)
    const result=await runtime.applyCompositionCommand!({kind:'removeVisibility',path:'/World/Shape'})
    expect(result.selection.path).toBe('/World/Shape')
    expect(runtime.getCompositionState!('/World/Shape').visibility).toBe('inherited')
    expect(runtime.getEditState!(null).interpolation).toBe('Linear')
    await runtime.applyCompositionCommand!({kind:'interpolation',interpolation:'Held'})
    expect(runtime.getEditState!(null).interpolation).toBe('Held')
    expect(mocks.engine).toHaveBeenCalledOnce()
    runtime.dispose()
  })
  it('validates selection highlight modes (highlighting itself needs HdxSelectionTask)', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    await runtime.setDisplaySettings!({selHighlightMode:'Always'})
    expect(runtime.getDisplaySettings!().selHighlightMode).toBe('Always')
    await expect(runtime.setDisplaySettings!({selHighlightMode:'Sometimes' as never})).rejects.toThrow('selection highlight mode')
    runtime.dispose()
  })
  it('captures a fresh frame and waits for an in-flight animated update before snapshotting', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    const order: string[]=[]
    s.engine.Render.mockImplementation(() => { order.push('render') })
    s.canvas.toBlob=vi.fn((done: BlobCallback, type?: string) => { order.push(`toBlob ${type}`); done(new Blob(['png'],{type:type??''})) })
    const image=await runtime.captureViewerImage!()
    expect(image.type).toBe('image/png'); expect(order).toEqual(['render','toBlob image/png'])
    const changing=runtime.setTime!(3)
    const duringPlayback=runtime.captureViewerImage!()
    await changing
    expect((await duringPlayback).type).toBe('image/png')
    expect(runtime.getTimeState!()!.current).toBe(3)
    s.canvas.toBlob=vi.fn((done: BlobCallback) => done(null))
    await expect(runtime.captureViewerImage!()).rejects.toThrow('could not be encoded')
    runtime.dispose()
    await expect(runtime.captureViewerImage!()).rejects.toThrow('Load a scene')
  })
  it('falls back to a new engine when a variant does not sync, and restores the retained one if that fails', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    const session=source.getSessionLayer().exportToString()
    let failRetained=true
    s.engine.Render.mockImplementation(()=>{if(failRetained&&source.getPrim('/World/Shape')===undefined){failRetained=false;throw new Error('retained sync failed')}})
    const candidate=nextEngine();candidate.Render.mockImplementation(()=>{throw new Error('unsupported bound material')})
    await expect(runtime.applyCompositionCommand!({kind:'variant',path:'/World',set:'content',selection:'empty'})).rejects.toThrow('unsupported bound material')
    expect(source.getSessionLayer().exportToString()).toBe(session)
    expect(source.getPrim('/World/Shape')?.typeName).toBe('Cube')
    expect(s.engine.destroy).not.toHaveBeenCalled()
    expect(candidate.destroy).toHaveBeenCalledTimes(1)
    runtime.dispose()
  })
  it('applies a composition edit that introduces composition errors and reports them as warnings', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda')
    vi.spyOn(source,'getCompositionErrors').mockImplementation(()=>source.getVariantSets('/World').getVariantSet('content').getVariantSelection()==='empty' ? [{toString:()=> 'Unresolved payload in review candidate'}] as ReturnType<typeof source.getCompositionErrors> : [])
    await runtime.applyCompositionCommand!({kind:'variant',path:'/World',set:'content',selection:'empty'})
    expect(source.getVariantSets('/World').getVariantSet('content').getVariantSelection()).toBe('empty')
    expect(sceneDiagnostics(runtime)).toEqual([{severity:'warning',message:'Unresolved payload in review candidate'}])
    runtime.dispose()
  })
  it('keeps the session on a failed edit draw and blocks concurrent updates', async () => {
    const s=setup(),source=await composedStage();mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/review.usda');runtime.select('/World/Shape')
    const session=source.getSessionLayer().exportToString(), validation=deferred<null>()
    s.device.popErrorScope.mockReturnValueOnce(validation.promise)
    const changing=runtime.applyCompositionCommand!({kind:'visibility',path:'/World/Shape',action:'hide'})
    await expect(runtime.setTime!(3)).rejects.toThrow('Wait')
    await expect(runtime.setDisplaySettings!({complexity:'medium'})).rejects.toThrow('composition update')
    await tick();validation.reject(new Error('GPU scope failure'))
    await expect(changing).rejects.toThrow('GPU scope failure')
    expect(source.getSessionLayer().exportToString()).toBe(session)
    expect(runtime.select('/World/Shape').path).toBe('/World/Shape')
    expect(s.engine.destroy).not.toHaveBeenCalled()
    runtime.dispose()
  })
})

// Native usdview stageView._processBBoxes skips bounds while playing unless
// showBBoxPlayback is set, then restores the current-time box on pause.
it('skips playback bounds, honors the explicit override and restores current-time bounds on pause',async()=>{
 const s=setup();mocks.open.mockResolvedValue(stage('/Mesh'))
 const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/scene.usda')
 mocks.bounds.mockClear();runtime.setPlaybackActive!(true)
 await runtime.setTime!(1);expect(mocks.bounds).not.toHaveBeenCalled()
 await runtime.setDisplaySettings!({showBBoxPlayback:true})
 await runtime.setTime!(2);expect(mocks.bounds).toHaveBeenCalled()
 await runtime.setDisplaySettings!({showBBoxPlayback:false});mocks.bounds.mockClear()
 await runtime.setTime!(3);expect(mocks.bounds).not.toHaveBeenCalled()
 runtime.setPlaybackActive!(false)
 const callback=vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];callback(0)
 expect(mocks.bounds).toHaveBeenLastCalledWith(expect.anything(),3,null,undefined,expect.objectContaining({showBBoxes:true}), [{path:'/'}])
 runtime.dispose()
})


// USD permits stages without boundable prims; native usdview keeps their stage
// tree available. GPU objects here are mocks: Safari acceptance verifies drawing.
describe('geometry-free stage review', () => {
  async function actualStage(text: string) {
    const { Stage: ActualStage } = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const { Layer } = await import('typescript-usd/sdf')
    return ActualStage.open(Layer.createInMemory(`empty-${Math.random()}.usda`, '#usda 1.0\n' + text))
  }
  it.each(['', 'def Camera "Camera" {}', 'def Material "Look" {}', 'over "World" {\n double weight = 2\n}'])('opens an inspection-only stage (%s)', async text => {
    const s=setup(),source=await actualStage(text)
    s.engine.getDrawableCount.mockReturnValue(0);mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks),tree=await runtime.open('/component.usda')
    expect(tree.map(p=>p.path)).toEqual(source.getAllChildPrimPaths('/'))
    expect(runtime.getGeometryState!()).toEqual({drawableCount:0,canFrameSelection:true})
    expect(s.callbacks.statusChanged).toHaveBeenLastCalledWith('Loaded · No drawable geometry · Stage available for inspection')
    if(tree.length) {
      expect(runtime.select(tree[0]!.path).path).toBe(tree[0]!.path)
      expect(runtime.inspect!(tree[0]!.path)).not.toBeNull()
    }
    expect(runtime.getCompositionState!(null)).toBeTruthy()
    const camera=runtime.getCameraState!();runtime.frameSelection();expect(runtime.getCameraState!()).toEqual(camera)
    await runtime.setTime!(1)
    expect(runtime.getTimeState!()!.current).toBe(1)
    runtime.dispose()
  })
  it('retains native all-children override/class inspection trees through reload and composition',async()=>{
    const s=setup(),text=readFileSync('tests/fixtures/empty-stage-inspection/root.usda','utf8')
    const expected=JSON.parse(readFileSync('tests/fixtures/empty-stage-inspection/expected.json','utf8'))
    const source=await actualStage(text.replace('#usda 1.0','')),reloaded=await actualStage(text.replace('#usda 1.0',''))
    s.engine.getDrawableCount.mockReturnValue(0);nextEngine({getDrawableCount:vi.fn(()=>0)});mocks.open.mockResolvedValueOnce(source).mockResolvedValueOnce(reloaded)
    const runtime=await createRuntime(s.canvas,s.callbacks)
    const flatten=(nodes: import('../src/contracts').PrimSummary[]):string[]=>nodes.flatMap(p=>[p.path,...flatten(p.children)])
    expect(flatten(await runtime.open('/component.usda'))).toEqual(expected.allPaths)
    expect([...source.traverse()]).toEqual(expected.defaultPaths)
    expect(runtime.select('/World/Look').path).toBe('/World/Look')
    expect(runtime.inspect!('/World/Look')).not.toBeNull()
    expect(flatten((await runtime.refreshScene!('reload')).tree)).toEqual(expected.allPaths)
    expect(flatten((await runtime.applyCompositionCommand!({kind:'resetVisibility'})).tree)).toEqual(expected.allPaths)
    runtime.dispose()
  })
  it('replaces geometry with a camera-only stage and restores geometry on a later open', async()=>{
    const s=setup(),first=await actualStage('def Cube "Cube" {}'),second=await actualStage('def Camera "Camera" {}'),third=await actualStage('def Cube "Other" {}')
    mocks.open.mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(third)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/cube.usda')
    expect(runtime.getGeometryState!().drawableCount).toBe(1)
    nextEngine({getDrawableCount:vi.fn(()=>0)});await runtime.open('/camera.usda')
    runtime.select('/Camera');runtime.setActiveCamera!('/Camera')
    const camera=runtime.getCameraState!();runtime.frameSelection();expect(runtime.getCameraState!()).toEqual(camera)
    nextEngine();await runtime.open('/other.usda')
    expect(runtime.getGeometryState!().drawableCount).toBe(1)
    expect(runtime.select('/Other').path).toBe('/Other')
    expect(s.callbacks.geometryChanged.mock.calls.map(([state])=>state.drawableCount)).toContain(0)
    runtime.dispose()
  })
  it('retains an inspection-only stage after a failed replacement', async()=>{
    const s=setup(),source=await actualStage('def Material "Look" {}')
    s.engine.getDrawableCount.mockReturnValue(0)
    mocks.open.mockResolvedValueOnce(source).mockRejectedValueOnce(new Error('Invalid USDA syntax'))
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/look.usda');runtime.select('/Look')
    await expect(runtime.open('/malformed.usda')).rejects.toThrow('Invalid USDA syntax')
    expect(runtime.select('/Look').path).toBe('/Look');expect(runtime.inspect!('/Look')).not.toBeNull()
    expect(runtime.getGeometryState!().drawableCount).toBe(0)
    runtime.dispose()
  })
  it('counts the rprims drawn with the current render tags', async()=>{
    const s=setup(),source=await actualStage('def Cube "A" {}');mocks.open.mockResolvedValue(source)
    const runtime=await createRuntime(s.canvas,s.callbacks);await runtime.open('/cube.usda')
    expect(runtime.getGeometryState!().drawableCount).toBe(1)
    s.engine.getDrawableCount.mockReturnValue(0);await runtime.setDisplaySettings!({displayProxy:false});expect(runtime.getGeometryState!().drawableCount).toBe(0)
    s.engine.getDrawableCount.mockReturnValue(1);await runtime.setDisplaySettings!({displayProxy:true});expect(runtime.getGeometryState!().drawableCount).toBe(1)
    runtime.dispose()
  })
})

describe('deferred payloads (mock runtime, not a browser test)', () => {
  it('opens with payloads unloaded, commits, and reports the deferred set', async () => {
    const s = setup(), st = stage('/Model') as ReturnType<typeof stage> & { findLoadable: () => string[] }
    st.findLoadable = () => ['/Model']
    const prim = st.getPrim('/Model')! as ReturnType<typeof mockPrim> & { isLoaded?: boolean, isGroup?: () => boolean, getFilteredDescendants?: () => unknown[] }
    Object.assign(prim, { isLoaded: false, isGroup: () => false, hasAuthoredPayloads: () => true, getFilteredDescendants: () => [] })
    mocks.open.mockResolvedValue(st)
    const progress = vi.fn()
    const runtime = await createRuntime(s.canvas, { ...s.callbacks, loadProgress: progress })
    await runtime.open('/model.usda')
    expect(mocks.open.mock.calls[0]![1]).toMatchObject({ loadPayloads: false })
    expect(runtime.getDeferredPayloads!()).toEqual(['/Model'])
    expect(progress.mock.calls.at(-1)![0]).toMatchObject({ phase: 'payloads', payloads: { requested: 1, done: 0, failed: 0 } })
    // A rebuild replaces the pipeline but not the committed scene's deferred set.
    await runtime.setDisplaySettings!({ complexity: 'medium' })
    expect(runtime.getDeferredPayloads!()).toEqual(['/Model'])
    prim.isLoaded = true
    runtime.reportPayloadProgress!({ loaded: 1, phase: 'done' })
    expect(runtime.getDeferredPayloads!()).toEqual([])
    expect(progress.mock.calls.at(-1)![0]).toMatchObject({ phase: 'done', payloads: { requested: 1, done: 1 } })
  })
  async function payloadStage() {
    const { Stage: ActualStage } = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const { Layer } = await import('typescript-usd/sdf')
    const layer = Layer.createAnonymous('payloads.usda')
    layer.importFromString(`#usda 1.0
def Xform "World" {
    def "Model" (payload = </ModelSource>) {}
}
class "ModelSource" {
    def Cube "Shape" {}
}
`)
    return ActualStage.open(layer, { loadPayloads: false })
  }
  it('syncs a payload load into the retained engine', async () => {
    const s = setup(), source = await payloadStage(); mocks.open.mockResolvedValue(source)
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/payloads.usda')
    s.engine.Render.mockClear()
    await runtime.applyCompositionCommand!({ kind: 'loadAndUnload', load: ['/World/Model'], unload: [] })
    expect(source.getPrim('/World/Model/Shape')).toBeTruthy()
    expect(mocks.engine).toHaveBeenCalledOnce()
    expect(s.engine.Render).toHaveBeenCalled()
    expect(s.engine.destroy).not.toHaveBeenCalled()
    runtime.dispose()
  })
  it('falls back to a new engine when the retained payload sync fails', async () => {
    const s = setup(), source = await payloadStage(); mocks.open.mockResolvedValue(source)
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/payloads.usda')
    const next = nextEngine()
    s.engine.Render.mockImplementationOnce(() => { throw new Error('retained sync failed') })
    await runtime.applyCompositionCommand!({ kind: 'loadAndUnload', load: ['/World/Model'], unload: [] })
    expect(source.getPrim('/World/Model/Shape')).toBeTruthy()
    expect(mocks.engine).toHaveBeenCalledTimes(2)
    expect(s.engine.destroy).toHaveBeenCalledTimes(1)
    expect(next.destroy).not.toHaveBeenCalled()
    runtime.dispose()
  })
  it('?progressive=0 keeps the native LoadAll open', async () => {
    const s = setup(); mocks.open.mockResolvedValue(stage('/Model'))
    const runtime = await createRuntime(s.canvas, s.callbacks)
    runtime.setStartupOptions!({ progressive: false })
    await runtime.open('/model.usda')
    expect(mocks.open.mock.calls[0]![1]).toMatchObject({ loadPayloads: true })
    expect(runtime.getDeferredPayloads!()).toEqual([])
  })
})

// Viewport picking and selection highlighting through the engine (mock
// runtime, not a browser test: the engine's TestIntersection and selection
// highlighting are verified in Safari). usdview's flow: stageView.py:
// 1788-1824 (click), 1989-2075 (pick frustum, pickObject), appController.py:
// 5007-5100 (onPrimSelected, pick modes and modifiers), stageView.py:
// 1086-1114 (_processSelection) and 1510-1519 (selection highlight mode).
describe('viewport picking (mock runtime, not a browser test)', () => {
  async function pickStage() {
    const { Stage: ActualStage } = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const { Layer } = await import('typescript-usd/sdf')
    return ActualStage.open(Layer.createInMemory(`pick-${Math.random()}.usda`, readFileSync('tests/fixtures/usdviewSelection/stage.usda', 'utf8')))
  }
  async function opened() {
    const s = setup(), source = await pickStage(); mocks.open.mockResolvedValue(source)
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/pick.usda')
    runtime.setAxesVisible!(true); draw() // a drawn frame to pick in
    return { s, runtime, source }
  }
  const hit = (hitPrimPath: string, hitInstanceIndex = -1, instancerContext: [string, number][] = []) => ({ hitPrimPath, hitInstanceIndex, instancerContext })
  const paths = (runtime: Awaited<ReturnType<typeof opened>>['runtime']) => runtime.getSelectionState!().selections.map(e => [e.path, e.instanceIndices ?? -1])

  it('picks the clicked pixel of the drawn frame and selects the top-level prim', async () => {
    const { s, runtime } = await opened()
    s.engine.pick.mockResolvedValueOnce(hit('/World/Native/Geom'))
    click(s.canvas); await tick()
    expect(s.engine.pick).toHaveBeenCalledOnce()
    const [frustum, x, y, width, height] = s.engine.pick.mock.calls[0]!
    expect(frustum).toBeTruthy(); expect([x, y, width, height]).toEqual([100, 50, 300, 150])
    // Select Prims: an instance proxy selects its instance (appController.py:5050-5060).
    expect(paths(runtime)).toEqual([['/World/Native', -1]])
    expect(s.callbacks.selectionChanged).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/World/Native' }))
    runtime.dispose(); await tick()
  })
  it('adds with Shift, toggles with Ctrl or Command, replaces without, and clears on the background', async () => {
    const { s, runtime } = await opened()
    s.engine.pick.mockResolvedValueOnce(hit('/World/A')); click(s.canvas); await tick()
    expect(paths(runtime)).toEqual([['/World/A', -1]])
    s.engine.pick.mockResolvedValueOnce(hit('/World/B')); click(s.canvas, { shiftKey: true }); await tick()
    expect(paths(runtime)).toEqual([['/World/A', -1], ['/World/B', -1]])
    s.engine.pick.mockResolvedValueOnce(hit('/World/A')); click(s.canvas, { metaKey: true }); await tick()
    expect(paths(runtime)).toEqual([['/World/B', -1]])
    s.engine.pick.mockResolvedValueOnce(hit('/World/C')); click(s.canvas, { ctrlKey: true }); await tick()
    expect(paths(runtime)).toEqual([['/World/B', -1], ['/World/C', -1]])
    // A background click with a modifier keeps the selection.
    s.engine.pick.mockResolvedValueOnce(null); click(s.canvas, { shiftKey: true }); await tick()
    expect(paths(runtime)).toEqual([['/World/B', -1], ['/World/C', -1]])
    s.engine.pick.mockResolvedValueOnce(hit('/World/C')); click(s.canvas); await tick()
    expect(paths(runtime)).toEqual([['/World/C', -1]])
    s.engine.pick.mockResolvedValueOnce(null); click(s.canvas); await tick()
    expect(paths(runtime)).toEqual([['/', -1]])
    runtime.dispose(); await tick()
  })
  it('selects point instances by the top-level instancer context in Select Instances', async () => {
    const { s, runtime } = await opened()
    runtime.setPickMode!('instances')
    s.engine.pick.mockResolvedValueOnce(hit('/World/PI/Prototype/Geom', 1, [['/World/PI', 1]])); click(s.canvas); await tick()
    expect(paths(runtime)).toEqual([['/World/PI', [1]]])
    expect(s.callbacks.selectionChanged).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/World/PI', instanceIndex: 1, instancerPath: '/World/PI' }))
    s.engine.pick.mockResolvedValueOnce(hit('/World/PI/Prototype/Geom', 0, [['/World/PI', 0]])); click(s.canvas, { shiftKey: true }); await tick()
    expect(paths(runtime)).toEqual([['/World/PI', [0, 1]]])
    runtime.setPickMode!('prims')
    s.engine.pick.mockResolvedValueOnce(hit('/World/PI/Prototype/Geom', 0, [['/World/PI', 0]])); click(s.canvas); await tick()
    expect(paths(runtime)).toEqual([['/World/PI', -1]])
    runtime.dispose(); await tick()
  })
  it('hands the LCD selection and the highlight mode to the engine', async () => {
    const { s, runtime } = await opened()
    runtime.selectPrims!([{ path: '/World' }, { path: '/World/A' }, { path: '/World/PI', instanceIndices: [0, 1] }])
    draw()
    expect(s.engine.setSelection).toHaveBeenLastCalledWith([{ path: '/World' }], true)
    runtime.selectPrims!([{ path: '/World/A' }, { path: '/World/PI', instanceIndices: [1] }]); draw()
    expect(s.engine.setSelection).toHaveBeenLastCalledWith([{ path: '/World/A' }, { path: '/World/PI', instanceIndices: [1] }], true)
    // Only when paused (the default): no highlights during playback.
    runtime.setPlaybackActive!(true); draw()
    expect(s.engine.setSelection).toHaveBeenLastCalledWith(expect.anything(), false)
    runtime.setPlaybackActive!(false); draw()
    expect(s.engine.setSelection).toHaveBeenLastCalledWith(expect.anything(), true)
    await runtime.setDisplaySettings!({ selHighlightMode: 'Never' }); draw()
    expect(s.engine.setSelection).toHaveBeenLastCalledWith(expect.anything(), false)
    // An unchanged selection is not sent again (_rendererSelectionNeedsUpdate).
    const calls = s.engine.setSelection.mock.calls.length; draw(); runtime.setAxesVisible!(false); draw()
    expect(s.engine.setSelection.mock.calls.length).toBe(calls)
    runtime.dispose(); await tick()
  })
  it('ignores a pick whose view changed during the readback, and drags do not pick', async () => {
    const { s, runtime } = await opened()
    runtime.select('/World/A')
    const readback = deferred<ReturnType<typeof hit> | null>()
    s.engine.pick.mockReturnValueOnce(readback.promise)
    click(s.canvas); await tick()
    runtime.setCameraSettings!({ fovDegrees: 45 }) // the view changes
    readback.resolve(hit('/World/B')); await tick()
    expect(paths(runtime)).toEqual([['/World/A', -1]])
    const down = new Event('pointerdown'), move = new Event('pointermove'), up = new Event('pointerup')
    Object.assign(down, { pointerId: 2, button: 0, clientX: 10, clientY: 10 }); Object.assign(move, { pointerId: 2, clientX: 40, clientY: 10 }); Object.assign(up, { pointerId: 2, button: 0, clientX: 40, clientY: 10 })
    s.canvas.dispatchEvent(down); s.canvas.dispatchEvent(move); s.canvas.dispatchEvent(up); await tick()
    expect(s.engine.pick).toHaveBeenCalledOnce()
    runtime.dispose(); await tick()
  })
  it('keeps a pick whose frame changed time during the readback, as usdview picks during playback', async () => {
    const { s, runtime } = await opened()
    const readback = deferred<ReturnType<typeof hit> | null>()
    s.engine.pick.mockReturnValueOnce(readback.promise)
    click(s.canvas); await tick()
    void runtime.setTime!(3)?.catch(() => {}); await tick() // a playback frame, not a view change
    readback.resolve(hit('/World/B')); await tick()
    expect(paths(runtime)).toEqual([['/World/B', -1]])
    runtime.dispose(); await tick()
  })
  it('reports the rollover prim under the pointer (appController.py:5114-5200)', async () => {
    const { s, runtime } = await opened()
    s.engine.pick.mockResolvedValueOnce(hit('/World/Model/Geom'))
    expect(await runtime.getRolloverInfo!(150, 75)).toEqual({ path: '/World/Model/Geom', typeName: 'Cube' })
    expect(s.engine.pick.mock.calls[0]!.slice(1)).toEqual([150, 75, 300, 150])
    s.engine.pick.mockResolvedValueOnce(null)
    expect(await runtime.getRolloverInfo!(150, 75)).toBeNull()
    runtime.dispose(); await tick()
  })
  it('draws a scene camera by path and the free camera by its matrices (stageView.py:1424-1435)', async () => {
    const s = setup(), source = await pickStage()
    source.getSessionLayer().importFromString('#usda 1.0\ndef Camera "Cam" {}\n')
    mocks.open.mockResolvedValue(source)
    const runtime = await createRuntime(s.canvas, s.callbacks); await runtime.open('/pick.usda')
    runtime.setActiveCamera!('/Cam'); draw()
    expect(s.engine.Render.mock.calls.at(-1)![0]).toMatchObject({ scenePath: '/Cam', fitWindow: false })
    runtime.setActiveCamera!(null); draw()
    expect(s.engine.Render.mock.calls.at(-1)![0]).toMatchObject({ scenePath: null })
    runtime.dispose(); await tick()
  })
})

describe('load schedule (mock runtime, not a browser test)', () => {
  // ?loadSchedule=1 (src/load-schedule.ts; docs/viewer-contracts.md): the
  // stage opens unloaded with the start frame's carriers, and each frame
  // change loads the carriers scheduled at it before the frame draws.
  const openScheduled = async ({loadSchedule = true, ...options}: {progressive?: boolean, loadSchedule?: boolean | 'unset'} = {}) => {
    const scene = await import('./load-schedule-scene')
    const { Stage: ActualStage } = await vi.importActual<typeof import('typescript-usd/usd')>('typescript-usd/usd')
    const s = setup(), loads: [string[], string[]][] = []
    let opened: Awaited<ReturnType<typeof ActualStage.open>>
    mocks.open.mockImplementation(async (_url: string, openOptions: {loadPayloads?: boolean}) => {
      opened = (await ActualStage.open(scene.scheduleSceneUrl, {resolverContext: scene.scheduleSceneContext(), loadPayloads: openOptions.loadPayloads !== false}))!
      const loadAndUnload = opened.loadAndUnload.bind(opened)
      opened.loadAndUnload = (load, unload, policy) => { loads.push([[...load], [...unload]]); return loadAndUnload(load, unload, policy) }
      return opened
    })
    const runtime = await createRuntime(s.canvas, s.callbacks)
    runtime.setStartupOptions!({...options, ...loadSchedule === 'unset' ? {} : {loadSchedule}})
    await runtime.open('/root.usda')
    return {s, runtime, loads, scene, stage: () => opened!}
  }
  it('opens unloaded with the start frame\'s carriers and keeps the rest of the payloads streaming', async () => {
    const {runtime, loads, scene, stage} = await openScheduled()
    expect(mocks.open.mock.calls[0]![1]).toMatchObject({ loadPayloads: false })
    expect(loads).toEqual([[[scene.A], []]])
    expect(!!stage().getPrim(`${scene.A}/Unit/M`)).toBe(true)
    expect(!!stage().getPrim(`${scene.B}/Unit/M`)).toBe(false)
    expect(runtime.getDeferredPayloads!()).toEqual(['/Scene/Loose'])
    runtime.dispose()
  })
  it('with progressive=0 loads the payloads outside the schedule at open too', async () => {
    const {runtime, loads, scene} = await openScheduled({progressive: false})
    expect(loads).toEqual([[[scene.A, '/Scene/Loose'], []]])
    expect(runtime.getDeferredPayloads!()).toEqual([])
    runtime.dispose()
  })
  it('applies a scene\'s schedule when loadSchedule is unset (PLATFORM-DIVERGENCE(usdview-load-schedule-default))', async () => {
    const {runtime, loads, scene, stage} = await openScheduled({loadSchedule: 'unset'})
    expect(loads).toEqual([[[scene.A], []]])
    expect(!!stage().getPrim(`${scene.B}/Unit/M`)).toBe(false)
    await runtime.setTime!(133)
    expect(loads.at(-1)).toEqual([[scene.B], []])
    runtime.dispose()
  })
  it('with loadSchedule=0 loads every payload and ignores the schedule', async () => {
    const {runtime, loads} = await openScheduled({loadSchedule: false})
    expect(loads).toEqual([])
    await runtime.setTime!(400)
    expect(loads).toEqual([])
    runtime.dispose()
  })
  it('loads and unloads on frame change before the frame draws', async () => {
    const {s, runtime, loads, scene, stage} = await openScheduled()
    const order: string[] = []
    s.engine.SetTime.mockImplementation(() => { order.push(`SetTime ${loads.length}`) })
    await runtime.setTime!(100)
    expect(loads).toHaveLength(1)
    await runtime.setTime!(133)
    expect(loads.at(-1)).toEqual([[scene.B], []])
    await runtime.setTime!(400)
    expect(loads.at(-1)).toEqual([[scene.C], [scene.A, scene.B]])
    expect(order).toEqual(['SetTime 1', 'SetTime 2', 'SetTime 3'])
    expect(!!stage().getPrim(`${scene.A}/Unit/M`)).toBe(false)
    expect(!!stage().getPrim(`${scene.C}/Unit/M`)).toBe(true)
    runtime.dispose()
  })
})
