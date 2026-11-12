// @vitest-environment jsdom
// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/debugFlagsWidget.py,
//  pxr/usdImaging/usdviewq/hydraObserver.cpp,
//  pxr/usdImaging/usdviewq/hydraSceneDebugger.py
// Copyright 2019, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Model and wiring checks of the Hydra Scene Debugger (src/hydra-observer.ts,
// src/hydra-scene-debugger.ts, src/hydra-scene-debugger-view.ts) and the Debug
// Flags window (src/debug-flags.ts) over retained scene indices. Behaviour
// follows usdviewq/hydraObserver.cpp, hydraSceneDebugger.py and
// debugFlagsWidget.py; the native comparison over the engine is
// tests/hydra-scene-debugger-native.test.ts.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  ContainerDataSource, DataSourceLocator, DataSourceLocatorSet, MergingSceneIndex, RetainedContainerDataSource, RetainedSceneIndex,
  RetainedTypedSampledDataSource, SceneIndexNameRegistry, type DataSourceBase,
} from 'typescript-usd/hd'
import { Debug as TfDebug } from 'typescript-usd/tf'
import { UsdviewqHydraObserver, getPendingNotices, locatorSetAsString } from '../src/hydra-observer'
import { HydraSceneDebuggerModel, type TreeItem } from '../src/hydra-scene-debugger'
import { debugFlagPrefixes, debugFlagsWithPrefix } from '../src/debug-flags'
import { defineUsdViewer, type UsdViewerElement } from '../src/usd-viewer'

const container = (entries: Record<string, DataSourceBase>) =>
  RetainedContainerDataSource.new(Object.keys(entries), Object.values(entries))
const prim = (primPath: string, primType = 'mesh', dataSource: InstanceType<typeof ContainerDataSource> = container({})) => ({ primPath, primType, dataSource })
const locators = (...locs: string[][]) => new DataSourceLocatorSet(locs.map(l => new DataSourceLocator(...l)))
const texts = (items: readonly TreeItem[]): unknown[] => items.map(item => [item.text(0), ...(item.expanded ? [texts(item.children)] : [])])

let registered = 0
function registeredScene(): [RetainedSceneIndex, string] {
  const scene = RetainedSceneIndex.new(), name = `test scene ${++registered}`
  SceneIndexNameRegistry.GetInstance().registerNamedSceneIndex(name, scene)
  return [scene, name]
}

describe('UsdviewqHydraObserver (hydraObserver.cpp)', () => {
  it('accumulates notices, merging consecutive ones of a kind (hydraObserver.cpp:216-260)', () => {
    const [scene, name] = registeredScene()
    const observer = new UsdviewqHydraObserver()
    expect(UsdviewqHydraObserver.getRegisteredSceneIndexNames()).toContain(name)
    expect(observer.targetToNamedSceneIndex(name)).toBe(true)
    expect(observer.hasPendingNotices()).toBe(false)
    scene.addPrims([prim('/A')]); scene.addPrims([prim('/B')])
    scene.dirtyPrims([{ primPath: '/A', dirtyLocators: locators(['xform'], ['primvars', 'points']) }])
    scene.removePrims([{ primPath: '/B' }])
    scene.addPrims([prim('/C', 'cube')])
    const notices = getPendingNotices(observer)
    expect(notices.map(([kind]) => kind)).toEqual(['added', 'dirtied', 'removed', 'added'])
    expect(notices[0]![1]).toEqual([['/A', 'mesh'], ['/B', 'mesh']])
    expect(locatorSetAsString((notices[1]![1][0] as [string, DataSourceLocatorSet])[1])).toBe('primvars/points,xform,')
    expect(notices[2]![1]).toEqual(['/B'])
    expect(observer.hasPendingNotices()).toBe(false)
    // Retargeting clears pending notices; disposing stops observing.
    scene.addPrims([prim('/D')])
    observer.targetToNamedSceneIndex(name)
    expect(observer.hasPendingNotices()).toBe(false)
    observer.dispose()
    scene.addPrims([prim('/E')])
    expect(observer.hasPendingNotices()).toBe(false)
  })

  it('walks input scenes by index and breadth first without repeats (hydraObserver.cpp:31-61,112-202)', () => {
    const leaf = RetainedSceneIndex.new(), inner = MergingSceneIndex.new(), top = MergingSceneIndex.new()
    inner.addInputScene(leaf, '/')
    top.addInputScene(leaf, '/'); top.addInputScene(inner, '/')
    SceneIndexNameRegistry.GetInstance().registerNamedSceneIndex('nested', top)
    const observer = new UsdviewqHydraObserver()
    observer.targetToNamedSceneIndex('nested')
    expect(observer.getDisplayName()).toBe('HdMergingSceneIndex')
    expect(observer.getInputDisplayNames([])).toEqual(['HdRetainedSceneIndex', 'HdMergingSceneIndex'])
    expect(observer.getInputDisplayNames([1])).toEqual(['HdRetainedSceneIndex'])
    expect(observer.getInputDisplayNames([0])).toEqual([])
    expect(observer.getNestedInputDisplayNames()).toEqual(['HdMergingSceneIndex', 'HdRetainedSceneIndex', 'HdMergingSceneIndex'])
    expect(observer.targetToInputSceneIndex([2])).toBe(false)
    expect(observer.targetToInputSceneIndex([1, 0])).toBe(true)
    expect(observer.getDisplayName()).toBe('HdRetainedSceneIndex')
    expect(observer.targetToNamedSceneIndex('no such scene')).toBe(false)
    expect(observer.getDisplayName()).toBe('')
    expect(observer.getChildPrimPaths('/')).toEqual([])
    expect(observer.getPrim('/A')).toEqual({ primType: '', dataSource: undefined })
    observer.dispose()
  })
})

describe('Hydra Scene Debugger trees (hydraSceneDebugger.py)', () => {
  it('queries children on expansion and keeps the expanded set across requery', () => {
    const [scene, name] = registeredScene()
    scene.addPrims([prim('/World', ''), prim('/World/Cube'), prim('/World/Cube/Subset', 'geomSubset')])
    const model = new HydraSceneDebuggerModel()
    model.sceneIndexSelected(name)
    const root = model.siTree.topLevelItem(0)!
    expect(root.text(0)).toBe('/')
    root.setExpanded(true)
    root.children[0]!.setExpanded(true)
    root.children[0]!.children[0]!.setExpanded(true)
    expect(texts(model.siTree.children)).toEqual([['/', [['World', [['Cube', [['Subset']]]]]]]])
    expect(model.siTree.contextMenuItems(root.children[0]!.children[0]!)).toEqual(['type: mesh'])
    model.sceneIndexSelected(name)
    expect(texts(model.siTree.children)).toEqual([['/', [['World', [['Cube', [['Subset']]]]]]]])
    model.dispose()
  })

  it('follows added and removed notices without stale or duplicate rows', () => {
    const [scene, name] = registeredScene()
    scene.addPrims([prim('/A'), prim('/A/B')])
    const model = new HydraSceneDebuggerModel()
    model.sceneIndexSelected(name)
    const root = model.siTree.topLevelItem(0)!
    root.setExpanded(true)
    // A child added before its parent is first expanded is listed once
    // (the upstream bug at hydraSceneDebugger.py:414-419 lists it twice).
    scene.addPrims([prim('/A/C', 'cube')])
    model.pollForNotices()
    root.children[0]!.setExpanded(true)
    expect(texts(model.siTree.children)).toEqual([['/', [['A', scene.getChildPrimPaths('/A').map(path => [path.slice(3)])]]]])
    expect(scene.getChildPrimPaths('/A')).toHaveLength(2)
    // Re-adding a removed prim's descendant shows it (hydraSceneDebugger.py:338
    // keeps the descendants' stale items upstream).
    scene.removePrims([{ primPath: '/A' }])
    model.pollForNotices()
    expect(texts(model.siTree.children)).toEqual([['/', []]])
    scene.addPrims([prim('/A/B', 'sphere')])
    model.pollForNotices()
    expect(model.siTree.topLevelItem(0)!.children[0]!.children.map(item => [item.text(0), item.text(1)])).toEqual([['B', 'sphere']])
    model.dispose()
  })

  it('refreshes the selected prim\'s data sources and value on dirtied notices', () => {
    const [scene, name] = registeredScene()
    // A container whose children change in place, as a scene index's data
    // sources do between a dirty notice and the next query.
    class Mutable extends ContainerDataSource {
      constructor(public entries: Record<string, DataSourceBase>) { super() }
      getNames() { return Object.keys(this.entries) }
      Get(name: string) { return this.entries[name] }
    }
    const cube = new Mutable({ size: RetainedTypedSampledDataSource.new(2) })
    scene.addPrims([prim('/Cube', 'cube', container({ cube }))])
    const model = new HydraSceneDebuggerModel()
    model.sceneIndexSelected(name)
    const root = model.siTree.topLevelItem(0)!; root.setExpanded(true)
    model.siTree.setSelected(root.children[0])
    const dsRoot = model.dsTree.topLevelItem(0)!
    expect(dsRoot.text(0)).toBe('<Cube>')
    dsRoot.setExpanded(true); dsRoot.children[0]!.setExpanded(true)
    model.dsTree.setSelected(dsRoot.children[0]!.children[0])
    expect(model.value).toEqual({ header: ['double'], rows: [['2.0']] })
    cube.entries = { size: RetainedTypedSampledDataSource.new(3), flag: RetainedTypedSampledDataSource.new(true) }
    scene.dirtyPrims([{ primPath: '/Cube', dirtyLocators: locators(['cube']) }])
    model.pollForNotices()
    expect(texts(model.dsTree.children)).toEqual([['<Cube>', [['cube', [['size'], ['flag']]]]]])
    expect(model.value).toEqual({ header: ['double'], rows: [['3.0']] })
    model.dispose()
  })
})

describe('Window menu: Hydra Scene Debugger and Debug Flags', () => {
  beforeAll(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }) })
  afterEach(() => { document.body.replaceChildren() })
  const flush = () => new Promise(resolve => setTimeout(resolve, 40))
  function setup() {
    defineUsdViewer()
    const viewer = document.createElement('usd-viewer') as UsdViewerElement
    viewer.runtimeFactory = vi.fn(async () => ({ open: vi.fn().mockResolvedValue([]), select: vi.fn(() => ({ path: null, properties: [] })), frameSelection: vi.fn(), resize: vi.fn(), dispose: vi.fn() }))
    document.body.append(viewer)
    return viewer.shadowRoot!
  }
  const click = (root: ShadowRoot, selector: string) => root.querySelector<HTMLElement>(selector)!.click()

  it('opens the debugger, chooses a scene index, browses and shows a value and the logger', async () => {
    const [scene, name] = registeredScene()
    scene.addPrims([prim('/World', 'xform', container({ visibility: container({ visibility: RetainedTypedSampledDataSource.new(true) }) }))])
    const root = setup()
    click(root, '[data-window="hydraSceneDebugger"]')
    await flush()
    expect(root.querySelector<HTMLElement>('.hsd-window')!.hidden).toBe(false)
    click(root, '.hsd-choose')
    const choice = [...root.querySelectorAll<HTMLButtonElement>('.hsd-choose-popup [data-scene-index]')].find(b => b.textContent === name)!
    choice.click()
    await flush()
    expect(root.querySelector('.hsd-label')!.innerHTML).toBe(`<b><i>( HdRetainedSceneIndex )</i></b> ${name}`)
    expect(root.querySelector<HTMLButtonElement>('.hsd-inputs')!.disabled).toBe(true)
    const rows = () => [...root.querySelectorAll('.hsd-si-tree .tool-tree-row')].map(r => r.textContent)
    expect(rows()).toEqual(['/'])
    root.querySelector<HTMLElement>('.hsd-si-tree [data-toggle]')!.click(); await flush()
    expect(rows()).toEqual(['/', 'Worldxform'])
    root.querySelectorAll<HTMLElement>('.hsd-si-tree .tool-tree-row')[1]!.click(); await flush()
    root.querySelector<HTMLElement>('.hsd-ds-tree [data-toggle]')!.click(); await flush()
    root.querySelector<HTMLElement>('.hsd-ds-tree .tool-tree-row:nth-child(2) [data-toggle]')!.click(); await flush()
    root.querySelector<HTMLElement>('.hsd-ds-tree .tool-tree-row:nth-child(3)')!.click(); await flush()
    expect([...root.querySelectorAll('.hsd-value th,.hsd-value td')].map(c => c.textContent)).toEqual(['bool', 'True'])

    click(root, '.hsd-show-logger'); click(root, '.hsd-record')
    scene.removePrims([{ primPath: '/World' }])
    await flush()
    expect(root.querySelector('.hsd-record')!.textContent).toBe('Stop Recording')
    expect([...root.querySelectorAll('.hsd-log summary')].map(s => s.textContent)).toEqual(['removed'])
    expect(rows()).toEqual(['/'])
    expect(root.querySelector('.hsd-value')!.textContent).toBe('')
  })

  it('lists debug flag prefixes and sets a flag (debugFlagsWidget.py)', () => {
    const root = setup()
    click(root, '[data-window="debugFlags"]')
    const prefixes = [...root.querySelectorAll<HTMLButtonElement>('.debug-flag-prefixes [data-prefix]')].map(b => b.dataset.prefix)
    expect(prefixes).toEqual(debugFlagPrefixes())
    expect(prefixes).toContain('HD')
    root.querySelector<HTMLButtonElement>('[data-prefix="HD"]')!.click()
    const boxes = [...root.querySelectorAll<HTMLInputElement>('.debug-flags-window tbody input')]
    expect(boxes.map(b => b.dataset.flag)).toEqual(debugFlagsWithPrefix('HD'))
    const box = boxes.find(b => b.dataset.flag === 'HD_RPRIM_ADDED')!
    expect(box.checked).toBe(false)
    box.click()
    expect(TfDebug.isDebugSymbolNameEnabled('HD_RPRIM_ADDED')).toBe(true)
    box.click()
    expect(TfDebug.isDebugSymbolNameEnabled('HD_RPRIM_ADDED')).toBe(false)
  })

  it('raises a pressed tool window without moving it, so its close button still works', async () => {
    const root = setup()
    click(root, '[data-window="debugFlags"]')
    click(root, '[data-window="hydraSceneDebugger"]')
    await flush()
    const flags = root.querySelector<HTMLElement>('.debug-flags-window')!, hsd = root.querySelector<HTMLElement>('.hsd-window')!
    expect(Number(hsd.style.zIndex)).toBeGreaterThan(Number(flags.style.zIndex))
    const next = flags.nextSibling, close = flags.querySelector<HTMLElement>('.tool-close')!
    close.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }))
    expect(flags.nextSibling).toBe(next)
    expect(Number(flags.style.zIndex)).toBeGreaterThan(Number(hsd.style.zIndex))
    expect(Number(flags.style.zIndex)).toBeLessThan(40)
    close.click()
    expect(flags.hidden).toBe(true)
  })
})
