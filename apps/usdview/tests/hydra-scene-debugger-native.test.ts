// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/hydraObserver.cpp,
//  pxr/usdImaging/usdviewq/hydraSceneDebugger.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Controller test (no browser, nothing drawn): usdview's Hydra Scene Debugger
// observer (src/hydra-observer.ts, usdviewq/hydraObserver.cpp) and its value
// and notice models (src/hydra-scene-debugger.ts, usdviewq/hydraSceneDebugger.py)
// over the viewer's engine (src/stage-view-engine.ts: UsdImagingGLEngine on
// HgiWebGPU) on the stub GPU device of the Node perf driver
// (scripts/viewer-perf/null-gpu.ts).
//
// Expected values come only from the native OpenUSD 26.11.1 capture
// in tests/fixtures/hydraSceneDebugger (FIXTURES.md): the same observer calls over
// UsdImagingGL.Engine on Storm (GL) rendering the same stage and edits.
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Frustum as GfFrustum, Vec3d as GfVec3d } from 'typescript-usd/gf'
import { ContainerDataSource, DataSourceLocator, SampledDataSource, VectorDataSource, type DataSourceBase } from 'typescript-usd/hd'
import native from './fixtures/hydraSceneDebugger/expected.json' with { type: 'json' }
import { installGpuGlobals, createNullDevice } from '../scripts/viewer-perf/null-gpu'
import { StageViewEngine, prepareStorm, createHgi } from '../src/stage-view-engine'
import { defaultDisplaySettings } from '../src/display-settings'
import { UsdviewqHydraObserver, getPendingNotices, locatorSetAsString } from '../src/hydra-observer'
import { HydraSceneDebuggerModel, NoticeLog, valueModel, type InputMenuItem, type NameLabel, type TreeItem, type TreeWidget } from '../src/hydra-scene-debugger'

// The task controller prim carries the engine's id: an address natively
// (engine.cpp:1865-1868), a counter here.
const norm = (path: string) => path.replace(/^(\/_UsdImaging_GL)_[0-9a-fx]+/, '$1_<id>')
let stage: Stage, engine: StageViewEngine, observer: UsdviewqHydraObserver
const frustum = new GfFrustum(); frustum.setPosition(new GfVec3d(0, 2, 10))
const camera = { view: frustum.computeViewMatrix(), projection: frustum.computeProjectionMatrix(), eye: [0, 2, 10] as const, scenePath: null }
const render = () => engine.Render(camera, 64, 64)

beforeAll(async () => {
  installGpuGlobals()
  await prepareStorm()
  stage = (await Stage.open(fileURLToPath(new URL('./fixtures/hydraSceneDebugger/stage.usda', import.meta.url))))!
  const settings = defaultDisplaySettings()
  engine = new StageViewEngine(createHgi(createNullDevice().device), stage, 0, settings, 64, 64)
  engine.applySettings(settings, false)
  render()
  observer = new UsdviewqHydraObserver()
}, 60_000)
afterAll(() => { observer?.dispose(); engine?.destroy() })

type Described = { kind: string, children?: [string, Described | null][], count?: number }
function describeDs(ds: DataSourceBase | undefined, depth: number): Described {
  if (ds instanceof ContainerDataSource) {
    const children: [string, Described | null][] = []
    for (const name of ds.getNames()) {
      const child = ds.Get(name)
      if (child !== undefined) children.push([name, depth > 0 ? describeDs(child, depth - 1) : null])
    }
    return { kind: 'container', children }
  }
  if (ds instanceof VectorDataSource) return { kind: 'vector', count: ds.getNumElements() }
  if (ds instanceof SampledDataSource) return { kind: 'sampled' }
  return { kind: ds !== undefined ? 'other' : 'none' }
}

// Prims, values and notices are compared from
// HdsiUnboundMaterialPruningSceneIndex, the input the native capture targets
// (tests/fixtures/hydraSceneDebugger).
const sharedName = 'HdsiUnboundMaterialPruningSceneIndex'
function targetShared(o: UsdviewqHydraObserver): void {
  o.targetToNamedSceneIndex(native.registeredNames[0]!)
  expect(o.targetToNestedInputSceneIndex(o.getNestedInputDisplayNames().indexOf(sharedName))).toBe(true)
}

describe('UsdviewqHydraObserver over the engine (native capture)', () => {
  it('lists and targets the registered terminal scene index', () => {
    expect(UsdviewqHydraObserver.getRegisteredSceneIndexNames()).toEqual(native.registeredNames)
    expect(observer.targetToNamedSceneIndex(native.registeredNames[0]!)).toBe(native.targeted)
    expect(observer.getDisplayName()).toBe(native.terminal.displayName)
    expect(observer.getChildPrimPaths('/').map(norm)).toEqual(native.terminal.rootChildren)
    expect(observer.getChildPrimPaths('/World')).toEqual(native.terminal.worldChildren)
  })
  it('lists the scene index inputs as the Inputs menu does', () => {
    observer.targetToNamedSceneIndex(native.registeredNames[0]!)
    type Node = { name: string, inputs: Node[] }
    const tree = (indices: number[]): Node[] => observer.getInputDisplayNames(indices).map((name, i) => ({ name, inputs: tree([...indices, i]) }))
    // C++ names a class in an anonymous namespace "(anonymous namespace)::";
    // see PLATFORM-DIVERGENCE(hd-scene-index-type-name).
    const plain = (name: string) => name.replace('(anonymous namespace)::', '')
    const nativeTree = (nodes: Node[]): Node[] => nodes.map(n => ({ name: plain(n.name), inputs: nativeTree(n.inputs) }))
    expect(tree([])).toEqual(nativeTree(native.terminal.inputs))
    expect(observer.getNestedInputDisplayNames()).toEqual(native.terminal.nestedInputDisplayNames.map(plain))
  })
  it('targets a nested input scene index', () => {
    targetShared(observer)
    expect(observer.getDisplayName()).toBe(native.shared.displayName)
  })
  for (const expected of native.shared.prims) it(`shows ${expected.path}'s type and data sources`, () => {
    targetShared(observer)
    const prim = observer.getPrim(expected.path)
    expect(prim.primType).toBe(expected.type)
    expect(describeDs(prim.dataSource, 1)).toEqual(expected.dataSource)
  })
  for (const [label, expected] of Object.entries(native.shared.values)) it(`shows the value of ${label}`, () => {
    targetShared(observer)
    const path = label.startsWith('sphere') ? '/World/Sphere' : '/World/Cube'
    const ds = ContainerDataSource.Get(observer.getPrim(path).dataSource, new DataSourceLocator(...expected.locator.split('/')))
    const model = valueModel(ds)
    if ('kind' in expected) expect(model).toBeUndefined()
    else expect(model).toEqual({ header: [expected.type], rows: expected.rows.map(row => [row]) })
  })
})

describe('HydraSceneDebugger window (native capture)', () => {
  type Dump = { texts: string[], expanded: boolean, indicator: string, children: Dump[] }
  const indicator = (item: TreeItem) => item.showIndicator === undefined ? 'DontShowIndicatorWhenChildless' : item.showIndicator ? 'ShowIndicator' : 'DontShowIndicator'
  const dumpItem = (item: TreeItem): Dump => ({ texts: [...item.texts].map(t => t ?? ''), expanded: item.expanded, indicator: indicator(item), children: item.children.map(dumpItem) })
  const dump = (tree: TreeWidget): Dump => ({ texts: [], expanded: false, indicator: 'DontShowIndicatorWhenChildless', children: tree.children.map(dumpItem) })
  const normDump = (d: Dump): Dump => ({ ...d, texts: d.texts.map(t => t.replace(/^(_UsdImaging_GL)_[0-9a-fx]+$/, '$1_<id>')), children: d.children.map(normDump) })
  const find = (item: TreeItem, text: string) => item.children.find(child => child.text(0) === text)!
  const label = (l: NameLabel | undefined) => l && `<b><i>( ${l.displayName} )</i></b> ${l.suffix}`
  const findInput = (items: InputMenuItem[]): number[] | undefined => {
    for (const item of items) { if (item.name === sharedName) return item.indices; const found = findInput(item.children); if (found) return found }
  }

  it('chooses, browses, selects, records and follows edits as native', async () => {
    const w = new HydraSceneDebuggerModel()
    try {
      expect(w.registeredSceneIndexNames()).toEqual(native.panel.chooser)
      w.sceneIndexSelected(native.registeredNames[0]!)
      expect(label(w.nameLabel)).toBe(native.panel.labelAfterChoose)
      expect(dump(w.siTree)).toEqual(native.panel.treeAfterChoose)

      w.inputSelected(findInput(w.inputsMenu())!)
      expect(label(w.nameLabel)).toBe(native.panel.labelAfterInput)
      expect(w.goToInputEnabled).toBe(native.panel.inputsEnabled)
      const root = w.siTree.topLevelItem(0)!; root.setExpanded(true)
      const world = find(root, 'World'); world.setExpanded(true)
      expect(normDump(dump(w.siTree))).toEqual(normDump(native.panel.treeExpanded))

      w.siTree.setSelected(find(world, 'Cube'))
      const dsRoot = w.dsTree.topLevelItem(0)!; dsRoot.setExpanded(true)
      const primvars = find(dsRoot, 'primvars'); primvars.setExpanded(true)
      const points = find(primvars, 'points'); points.setExpanded(true)
      expect(dump(w.dsTree)).toEqual(native.panel.dsTree)
      w.dsTree.setSelected(find(points, 'primvarValue'))
      expect(w.value).toEqual(native.panel.valueSelected)

      const logger = w.showLogger()
      logger.toggleRecordingState()
      expect(logger.label).toBe(native.panel.loggerLabel.replace(/<\/?[bi]>/g, ''))

      targetShared(observer)
      observer.clearPendingNotices()
      w.observer.clearPendingNotices()
      stage.setEditTarget(stage.getSessionLayer())
      const edits: [string, () => Promise<unknown> | unknown][] = [
        ['set /World/Cube.size = 3', () => stage.getAttributeAtPath('/World/Cube.size')!.set(3)],
        ['define Cone /World/Cone', () => stage.definePrim('/World/Cone', 'Cone')],
        ['deactivate /World/Sphere', () => stage.getPrim('/World/Sphere')!.setActive(false)],
      ]
      const actual = []
      for (const [edit, run] of edits) {
        await run()
        await stage.flushChanges()
        render()
        w.pollForNotices()
        actual.push({ edit, notices: getPendingNotices(observer).map(([kind, entries]) => [kind, entries.map(entry =>
          typeof entry === 'string' ? norm(entry) : [norm(entry[0]), typeof entry[1] === 'string' ? entry[1] : locatorSetAsString(entry[1])])]),
          value: w.value })
      }
      expect(actual).toEqual(native.edits)
      expect(normDump(dump(w.siTree))).toEqual(normDump(native.panel.treeAfterEdits))
      expect(NoticeLog.headerLabels).toEqual(native.panel.loggerHeader)
      expect(logger.entries.map(e => [e.type, e.entries])).toEqual(native.panel.logger)
    } finally { w.dispose() }
  })
})
