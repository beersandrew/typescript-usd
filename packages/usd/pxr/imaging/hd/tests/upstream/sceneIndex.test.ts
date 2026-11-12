// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdSceneIndex.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/imaging/hd/testenv/testHdSceneIndex.cpp
// (registered as testHdSceneIndex in pxr/imaging/hd/CMakeLists.txt).
//
// Each upstream TestX prints to stdout and compares values with
// _CompareValue. The port produces the same text and compares it with the
// stdout of the reference build's testHdSceneIndex, section by section
// (fixtures/testHdSceneIndex/stdout.txt; FIXTURES.md).
// TestMergingSceneIndex and TestMergingSceneIndexPrimAddedNotices are ported
// in mergingSceneIndex.test.ts.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import {
  HdContainerDataSource,
  HdRetainedContainerDataSource,
  HdRetainedTypedSampledDataSource,
  HdSampledDataSource,
  _HdStreamOutValue,
  type HdDataSourceBase,
} from '../../src/dataSource.ts'
import { HdFlatteningSceneIndex } from '../../src/flatteningSceneIndex.ts'
import { HdPrefixingSceneIndex } from '../../src/prefixingSceneIndex.ts'
import { HdDependencyForwardingSceneIndex } from '../../src/dependencyForwardingSceneIndex.ts'
import { HdDependenciesSchema, HdDependenciesSchemaTokens } from '../../src/dependenciesSchema.ts'
import { HdDependencySchema } from '../../src/dependencySchema.ts'
import { HdDataSourceLocator } from '../../src/dataSourceLocator.ts'
import { SdfPathExpression } from 'typescript-usd/sdf/pathExpression'
import { HdFlattenedDataSourceProviders } from '../../src/flattenedDataSourceProviders.ts'
import { HdRetainedSceneIndex } from '../../src/retainedSceneIndex.ts'
import type { HdSceneIndexBase, HdSceneIndexObserver } from '../../src/sceneIndex.ts'
import { HdXformSchema, HdXformSchemaTokens } from '../../src/xformSchema.ts'
import { HdDataSourceLocatorSet } from '../../src/dataSourceLocator.ts'

const _baseline = readFileSync(
  new URL('./fixtures/testHdSceneIndex/stdout.txt', import.meta.url), 'utf8')

/** The lines of the baseline from "<n>) <testName>..." to "...SUCCEEDED". */
function _BaselineSection(testName: string): string {
  const lines = _baseline.split('\n')
  const start = lines.findIndex(l => / \d*\) /.test(' ' + l) && l.endsWith(`) ${testName}...`))
  const end = lines.indexOf('...SUCCEEDED', start)
  return lines.slice(start + 1, end).join('\n') + '\n'
}

let _out = ''
function _Print(s: string): void { _out += s }

/** PrintingSceneIndexObserver, testHdSceneIndex.cpp:40-95 */
class PrintingSceneIndexObserver implements HdSceneIndexObserver {
  constructor(private readonly _prefix: string) {}
  primsAdded(_s: HdSceneIndexBase, entries: { primPath: string; primType: string }[]): void {
    for (const entry of entries) {
      _Print(`${this._prefix}PrimAdded: ${entry.primPath}, ${entry.primType}\n`)
    }
  }
  primsRemoved(_s: HdSceneIndexBase, entries: { primPath: string }[]): void {
    for (const entry of entries) {
      _Print(`${this._prefix}PrimRemoved: ${entry.primPath}, \n`)
    }
  }
  primsDirtied(_s: HdSceneIndexBase,
    entries: { primPath: string; dirtyLocators: Iterable<{ GetString(): string }> }[]): void {
    for (const entry of entries) {
      let line = `${this._prefix}PrimDirtied: ${entry.primPath}, `
      for (const locator of entry.dirtyLocators) {
        line += `${locator.GetString()},`
      }
      _Print(line + '\n')
    }
  }
  primsRenamed(): void {}
}

/** PrintContainer, testHdSceneIndex.cpp:243-274 */
function PrintContainer(container: HdContainerDataSource | undefined, prefix = ''): void {
  if (!container) return
  for (const name of container.getNames()) {
    const childSource: HdDataSourceBase | undefined = container.Get(name)
    if (!childSource) {
      _Print(`${prefix}(@${name})\n`)
      continue
    }
    _Print(`${prefix}@${name}: `)
    if (childSource instanceof HdContainerDataSource) {
      _Print('\n')
      PrintContainer(childSource, prefix + '  ')
    } else if (childSource instanceof HdSampledDataSource) {
      _Print(`${_HdStreamOutValue(childSource.GetValue(0.0))}\n`)
    } else {
      _Print('(unknown)\n')
    }
  }
}

/** PrintSceneIndexPrim, testHdSceneIndex.cpp:276-294 */
function PrintSceneIndexPrim(sceneIndex: HdSceneIndexBase, primPath: string,
  includeChildren: boolean, prefix = ''): void {
  const prim = sceneIndex.getPrim(primPath)
  _Print(`${prefix}${primPath} (${prim.primType})\n`)
  PrintContainer(prim.dataSource, prefix + '  ')
  if (!includeChildren) return
  for (const childPath of sceneIndex.getChildPrimPaths(primPath)) {
    PrintSceneIndexPrim(sceneIndex, childPath, true, prefix)
  }
}

/** GetPrimTransform, testHdSceneIndex.cpp:298-312 */
function GetPrimTransform(sceneIndex: HdSceneIndexBase, primPath: string): GfMatrix4d {
  const prim = sceneIndex.getPrim(primPath)
  const xformSchema = HdXformSchema.getFromParent(prim.dataSource)
  if (xformSchema.isDefined()) {
    const matrixSource = xformSchema.getMatrix()
    if (matrixSource) return matrixSource.getTypedValue(0.0)
  }
  return new GfMatrix4d().setIdentity()
}

/** _CompareValue, testHdSceneIndex.cpp:316-330 (prints "matches." on stdout). */
function _CompareValue(msg: string, v1: GfMatrix4d, v2: GfMatrix4d): boolean {
  if (v1.equals(v2)) {
    _Print(`${msg} matches.\n`)
    return true
  }
  return false
}

function _XformDs(t: [number, number, number]): HdContainerDataSource {
  return HdRetainedContainerDataSource.new([HdXformSchemaTokens.xform], [
    new HdXformSchema.Builder()
      .setMatrix(HdRetainedTypedSampledDataSource.new(new GfMatrix4d().setTranslate(t)))
      .build()])
}

/** TestFlatteningSceneIndex, testHdSceneIndex.cpp:338-488 */
function TestFlatteningSceneIndex(): boolean {
  const sceneIndex = HdRetainedSceneIndex.new()
  const flatteningSceneIndex = HdFlatteningSceneIndex.new(
    sceneIndex, HdFlattenedDataSourceProviders())

  const observer = new PrintingSceneIndexObserver('')
  flatteningSceneIndex.addObserver(observer)

  sceneIndex.addPrims([{ primPath: '/A', primType: 'huh', dataSource: undefined }])
  sceneIndex.addPrims([{ primPath: '/A/B', primType: 'huh', dataSource: _XformDs([0, 0, 10]) }])
  sceneIndex.addPrims([{ primPath: '/A/B/C', primType: 'huh', dataSource: _XformDs([5, 0, 0]) }])

  _Print('\n-- SCENE -----------------------\n')
  PrintSceneIndexPrim(sceneIndex, '/A', true)
  _Print('\n-- FLATTENED SCENE ------------\n')
  PrintSceneIndexPrim(flatteningSceneIndex, '/A', true)

  if (!_CompareValue('INITIAL LEAF SCENE XFORM',
    GetPrimTransform(sceneIndex, '/A/B/C'), new GfMatrix4d().setTranslate([5, 0, 0]))) return false
  if (!_CompareValue('FLATTENED LEAF SCENE XFORM',
    GetPrimTransform(flatteningSceneIndex, '/A/B/C'), new GfMatrix4d().setTranslate([5, 0, 10]))) return false

  _Print('\n-- DIRTYING SCENE ------------\n')
  sceneIndex.addPrims([{ primPath: '/A/B', primType: 'huh', dataSource: _XformDs([0, 0, 20]) }])

  _Print('\n-- SCENE -----------------------\n')
  PrintSceneIndexPrim(sceneIndex, '/A', true)
  _Print('\n-- FLATTENED SCENE ------------\n')
  PrintSceneIndexPrim(flatteningSceneIndex, '/A', true)

  if (!_CompareValue('UPDATED INITIAL LEAF SCENE XFORM',
    GetPrimTransform(sceneIndex, '/A/B/C'), new GfMatrix4d().setTranslate([5, 0, 0]))) return false
  if (!_CompareValue('UPDATED FLATTENED LEAF SCENE XFORM',
    GetPrimTransform(flatteningSceneIndex, '/A/B/C'), new GfMatrix4d().setTranslate([5, 0, 20]))) return false

  _Print('\n-- REMOVING XFORM FROM A/B ON SCENE ----\n')
  sceneIndex.addPrims([{ primPath: '/A/B', primType: 'huh', dataSource: undefined }])

  _Print('\n-- SCENE -----------------------\n')
  PrintSceneIndexPrim(sceneIndex, '/A', true)
  _Print('\n-- FLATTENED SCENE ------------\n')
  PrintSceneIndexPrim(flatteningSceneIndex, '/A', true)

  if (!_CompareValue('FINAL LEAF SCENE XFORM',
    GetPrimTransform(sceneIndex, '/A/B/C'), new GfMatrix4d().setTranslate([5, 0, 0]))) return false
  if (!_CompareValue('FINAL FLATTENED LEAF SCENE XFORM',
    GetPrimTransform(flatteningSceneIndex, '/A/B/C'), new GfMatrix4d().setTranslate([5, 0, 0]))) return false

  return true
}


/** _CompareValue for values compared with operator== upstream. */
function _CompareEq(msg: string, equal: boolean): boolean {
  if (equal) _Print(`${msg} matches.\n`)
  return equal
}

function _ArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/** GetDataSourceFromScene / GetTypedValueFromScene, testHdSceneIndex.cpp:466-490 */
function GetTypedValueFromScene(sceneIndex: HdSceneIndexBase, primPath: string,
  locator: HdDataSourceLocator): unknown {
  const prim = sceneIndex.getPrim(primPath)
  const ds = HdContainerDataSource.Get(prim.dataSource, locator)
  return ds instanceof HdSampledDataSource ? ds.GetValue(0.0) : undefined
}

function _PathDs(p: string) { return HdRetainedTypedSampledDataSource.new(p) }
function _LocDs(...t: string[]) { return HdRetainedTypedSampledDataSource.new(new HdDataSourceLocator(...t)) }

/** TestPrefixingSceneIndex, testHdSceneIndex.cpp:492-670 */
function TestPrefixingSceneIndex(): boolean {
  const sceneIndex = HdRetainedSceneIndex.new()
  const prefixingSceneIndex = HdPrefixingSceneIndex.new(sceneIndex, '/E/F/G')

  sceneIndex.addPrims([{ primPath: '/A', primType: 'huh', dataSource: undefined }])
  sceneIndex.addPrims([{ primPath: '/A/B', primType: 'huh', dataSource: undefined }])
  sceneIndex.addPrims([{ primPath: '/A/C', primType: 'huh',
    dataSource: HdRetainedContainerDataSource.new(['somePath', 'someContainer'], [
      _PathDs('/A/B'),
      HdRetainedContainerDataSource.new(
        ['anotherPath', 'relativePath', 'pathArray', 'pathExpression',
          'relativePathExpression', 'membershipExpression'], [
          _PathDs('/A/B/C/D'),
          _PathDs('F/G'),
          HdRetainedTypedSampledDataSource.new(['/A/B/C/D', '/A/B']),
          HdRetainedTypedSampledDataSource.new(new SdfPathExpression('/A/B')),
          HdRetainedTypedSampledDataSource.new(new SdfPathExpression('F/G')),
          HdRetainedTypedSampledDataSource.new(new SdfPathExpression('/A// - %/A:shadowLink')),
        ]),
    ]) }])

  _Print('\n-- SCENE -----------------------\n')
  PrintSceneIndexPrim(sceneIndex, '/', true)
  _Print('\n-- PREFIXED SCENE --------------\n')
  PrintSceneIndexPrim(prefixingSceneIndex, '/', true)

  const v = (...loc: string[]) =>
    GetTypedValueFromScene(prefixingSceneIndex, '/E/F/G/A/C', new HdDataSourceLocator(...loc))
  const exprText = (x: unknown) => x instanceof SdfPathExpression ? x.getText() : undefined

  if (!_CompareEq('COMPARING TOP-LEVEL ABSOLUTE PATH',
    v('somePath') === '/E/F/G/A/B')) return false
  if (!_CompareEq('COMPARING NESTED ABSOLUTE PATH',
    v('someContainer', 'anotherPath') === '/E/F/G/A/B/C/D')) return false
  if (!_CompareEq('COMPARING NESTED RELATIVED PATH',
    v('someContainer', 'relativePath') === 'F/G')) return false
  if (!_CompareEq('COMPARING PATH ARRAY',
    _ArraysEqual(v('someContainer', 'pathArray') as string[], ['/E/F/G/A/B/C/D', '/E/F/G/A/B']))) return false
  if (!_CompareEq('COMPARING NESTED ABSOLUTE PATH EXPRESSION',
    exprText(v('someContainer', 'pathExpression')) === new SdfPathExpression('/E/F/G/A/B').getText())) return false
  if (!_CompareEq('COMPARING NESTED RELATIVE PATH EXPRESSION',
    exprText(v('someContainer', 'relativePathExpression')) === new SdfPathExpression('F/G').getText())) return false
  if (!_CompareEq('COMPARING NESTED MEMBERSHIP EXPRESSION',
    exprText(v('someContainer', 'membershipExpression')) ===
      new SdfPathExpression('/E/F/G/A// - %/E/F/G/A:shadowLink').getText())) return false

  //
  // Testing GetChildPrimPaths
  //
  const c = (p: string, expected: string[]) => _CompareEq(
    `TESTING GetChildPrimPaths('${p}'))`,
    _ArraysEqual(prefixingSceneIndex.getChildPrimPaths(p), expected))
  if (!c('/E/F/G/A', ['/E/F/G/A/C', '/E/F/G/A/B'])) return false
  if (!c('/E/X/Y/Z', [])) return false
  if (!c('/E/F', ['/E/F/G'])) return false
  if (!c('/E', ['/E/F'])) return false
  if (!c('/E/X', [])) return false
  if (!c('', [])) return false
  if (!c('/', ['/E'])) return false

  return true
}

/** RecordingSceneIndexObserver, testHdSceneIndex.cpp:99-240 (events as a
 *  set of their printed form). */
class RecordingSceneIndexObserver implements HdSceneIndexObserver {
  private _events: string[] = []
  primsAdded(_s: HdSceneIndexBase, entries: { primPath: string; primType: string }[]): void {
    for (const e of entries) this._events.push(`PrimAdded: ${e.primPath}, ${e.primType}`)
  }
  primsRemoved(_s: HdSceneIndexBase, entries: { primPath: string }[]): void {
    for (const e of entries) this._events.push(`PrimRemoved: ${e.primPath}`)
  }
  primsDirtied(_s: HdSceneIndexBase,
    entries: { primPath: string; dirtyLocators: Iterable<{ GetString(): string }> }[]): void {
    for (const e of entries) {
      for (const l of e.dirtyLocators) this._events.push(`PrimDirtied: ${e.primPath}, ${l.GetString()}`)
    }
  }
  primsRenamed(): void {}
  getEventsAsSet(): Set<string> { return new Set(this._events) }
  clear(): void { this._events = [] }
}

function _SetsEqual(a: Set<string>, b: string[]): boolean {
  const bs = new Set(b)
  return a.size === bs.size && [...a].every(x => bs.has(x))
}

function _Deps(entries: [string, HdContainerDataSource][]): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(entries.map(e => e[0]), entries.map(e => e[1]))
}

function _Dep(onPath: string | undefined, onLoc: string, affLoc: string): HdContainerDataSource {
  return new HdDependencySchema.Builder()
    .setDependedOnPrimPath(onPath === undefined ? undefined : _PathDs(onPath))
    .setDependedOnDataSourceLocator(_LocDs(onLoc))
    .setAffectedDataSourceLocator(_LocDs(affLoc))
    .build()
}

function _PrimWithDeps(deps: HdContainerDataSource): HdContainerDataSource {
  return HdRetainedContainerDataSource.new([HdDependenciesSchemaTokens.__dependencies], [deps])
}

/** TestDependencyForwardingSceneIndex, testHdSceneIndex.cpp:962-1214 */
function TestDependencyForwardingSceneIndex(): boolean {
  const retainedScene = HdRetainedSceneIndex.new()
  const dependencyForwardingScene = HdDependencyForwardingSceneIndex.new(retainedScene)
  dependencyForwardingScene.setManualGarbageCollect(true)

  retainedScene.addPrims([{ primPath: '/A', primType: 'group',
    dataSource: HdRetainedContainerDataSource.new([], []) }])
  retainedScene.addPrims([{ primPath: '/B', primType: 'group',
    dataSource: _PrimWithDeps(_Deps([['test', _Dep('/A', 'taco', 'chicken')]])) }])
  retainedScene.addPrims([{ primPath: '/C', primType: 'group',
    dataSource: _PrimWithDeps(_Deps([['test', _Dep('/B', 'chicken', 'salsa')]])) }])
  // ...D->E->F->D->...
  retainedScene.addPrims([{ primPath: '/D', primType: 'group',
    dataSource: _PrimWithDeps(_Deps([['test', _Dep('/E', 'attr2', 'attr1')]])) }])
  retainedScene.addPrims([{ primPath: '/E', primType: 'group',
    dataSource: _PrimWithDeps(_Deps([['test', _Dep('/F', 'attr3', 'attr2')]])) }])
  retainedScene.addPrims([{ primPath: '/F', primType: 'group',
    dataSource: _PrimWithDeps(_Deps([['test', _Dep('/D', 'attr1', 'attr3')]])) }])

  const recordingScene = new RecordingSceneIndexObserver()
  dependencyForwardingScene.addObserver(recordingScene)

  // pulling on the scene causes dependencies to be computed at the visited
  // prim
  PrintSceneIndexPrim(dependencyForwardingScene, '/', true)

  recordingScene.clear()
  retainedScene.dirtyPrims([{ primPath: '/A', dirtyLocators: new HdDataSourceLocatorSet(new HdDataSourceLocator('taco')) }])
  if (!_CompareEq('DIRTYING "/A @taco" ->', _SetsEqual(recordingScene.getEventsAsSet(), [
    'PrimDirtied: /A, taco', 'PrimDirtied: /B, chicken', 'PrimDirtied: /C, salsa']))) return false

  recordingScene.clear()
  retainedScene.dirtyPrims([{ primPath: '/A', dirtyLocators: new HdDataSourceLocatorSet(new HdDataSourceLocator()) }])
  if (!_CompareEq('DIRTYING "/A @(prim level)" ->', _SetsEqual(recordingScene.getEventsAsSet(), [
    'PrimDirtied: /A, ', 'PrimDirtied: /B, chicken', 'PrimDirtied: /C, salsa']))) return false

  // test cycles
  const baseline = ['PrimDirtied: /D, attr1', 'PrimDirtied: /E, attr2', 'PrimDirtied: /F, attr3']
  recordingScene.clear()
  retainedScene.dirtyPrims([{ primPath: '/D', dirtyLocators: new HdDataSourceLocatorSet(new HdDataSourceLocator('attr1')) }])
  if (!_CompareEq('CYCLE CHECK: DIRTYING "/D @attr1" ->',
    _SetsEqual(recordingScene.getEventsAsSet(), baseline))) return false
  recordingScene.clear()
  retainedScene.dirtyPrims([{ primPath: '/E', dirtyLocators: new HdDataSourceLocatorSet(new HdDataSourceLocator('attr2')) }])
  if (!_CompareEq('CYCLE CHECK: DIRTYING "/E @attr2" ->',
    _SetsEqual(recordingScene.getEventsAsSet(), baseline))) return false
  recordingScene.clear()
  retainedScene.dirtyPrims([{ primPath: '/F', dirtyLocators: new HdDataSourceLocatorSet(new HdDataSourceLocator('attr3')) }])
  if (!_CompareEq('CYCLE CHECK: DIRTYING "/E @attr3" ->',
    _SetsEqual(recordingScene.getEventsAsSet(), baseline))) return false

  return true
}

/** testHdSceneIndex.cpp:1218-1252 */
function TestDependencyForwardingSceneIndexEviction_InitScenes() {
  const retainedScene = HdRetainedSceneIndex.new()
  retainedScene.addPrims([{ primPath: '/A', primType: 'group',
    dataSource: HdRetainedContainerDataSource.new([], []) }])
  retainedScene.addPrims([{ primPath: '/B', primType: 'group',
    dataSource: _PrimWithDeps(_Deps([['test', _Dep('/A', 'taco', 'chicken')]])) }])
  retainedScene.addPrims([{ primPath: '/C', primType: 'group',
    dataSource: HdRetainedContainerDataSource.new([], []) }])
  const dependencyForwardingScene = HdDependencyForwardingSceneIndex.new(retainedScene)
  dependencyForwardingScene.setManualGarbageCollect(true)
  // pull on all prims to seed the cache
  PrintSceneIndexPrim(dependencyForwardingScene, '/', true)
  return { retainedScene, dependencyForwardingScene }
}

/** TestDependencyForwardingSceneIndexEviction, testHdSceneIndex.cpp:1254-1416 */
function TestDependencyForwardingSceneIndexEviction(): boolean {
  const run = (removed: string, msg: string, events: string[],
    msgA: string, affected: string[], msgD: string, dependedOn: string[]): boolean => {
    const { retainedScene, dependencyForwardingScene } =
      TestDependencyForwardingSceneIndexEviction_InitScenes()
    const recordingScene = new RecordingSceneIndexObserver()
    dependencyForwardingScene.addObserver(recordingScene)
    retainedScene.removePrims([{ primPath: removed }])
    if (!_CompareEq(msg, _SetsEqual(recordingScene.getEventsAsSet(), events))) return false
    const removedAffectedPrimPaths: string[] = []
    const removedDependedOnPrimPaths: string[] = []
    dependencyForwardingScene.removeDeletedEntries(
      removedAffectedPrimPaths, removedDependedOnPrimPaths)
    if (!_CompareEq(msgA, _ArraysEqual(removedAffectedPrimPaths, affected))) return false
    if (!_CompareEq(msgD, _ArraysEqual(removedDependedOnPrimPaths, dependedOn))) return false
    return true
  }
  // Since nothing depends on B, we should see just the removal event.
  if (!run('/B', 'Removing "/B" ->', ['PrimRemoved: /B'],
    'Remove Affected (affected paths): ', ['/B'],
    'Remove Affected (depended on paths): ', ['/A'])) return false
  // Since B depends on A, we should see it getting a dirty notice in
  // addition to A's removal.
  if (!run('/A', 'Removing "/A" ->', ['PrimRemoved: /A', 'PrimDirtied: /B, chicken'],
    'Remove Depended On (affected paths): ', [],
    'Remove Depended On (depended on paths): ', [])) return false
  // Since nothing depends on C, we should see just the removal event.
  if (!run('/C', 'Removing "/C" ->', ['PrimRemoved: /C'],
    'Remove Prim Without Dependencies (affected paths): ', [],
    'Remove Prim Without Dependencies  (depended on paths): ', [])) return false
  return true
}

/** _MutableRetainedContainerDataSource, testHdSceneIndex.cpp:1460-1505 */
class _MutableRetainedContainerDataSource extends HdContainerDataSource {
  constructor(private readonly _entries: [string, HdDataSourceBase][]) { super() }
  getNames(): string[] { return this._entries.map(e => e[0]) }
  Get(name: string): HdDataSourceBase | undefined {
    return this._entries.find(e => e[0] === name)?.[1]
  }
  Set(name: string, value: HdDataSourceBase): void {
    const e = this._entries.find(x => x[0] === name)
    if (e) e[1] = value
  }
}

/** _MutableRetainedTypedSampledDataSource, testHdSceneIndex.cpp:1507-1525 */
class _MutablePathsDs extends HdRetainedTypedSampledDataSource<string[]> {
  private _v: string[]
  constructor(v: string[]) { super(v); this._v = v }
  setValue(v: string[]): void { this._v = v }
  getTypedValue(): string[] { return this._v }
}

/** _BuildHumanDependenciesDs, testHdSceneIndex.cpp:1527-1566 */
function _BuildHumanDependenciesDs(petsDs: _MutablePathsDs): _MutableRetainedContainerDataSource {
  const deps: [string, HdDataSourceBase][] = []
  for (const petPath of petsDs.getTypedValue()) {
    // .feed -> <Pet>.hungry
    deps.push(['dep_feed_' + petPath, _Dep(petPath, 'hungry', 'feed')])
  }
  // .__dependencies -> .pets
  deps.push(['dep_deps', _Dep(undefined, 'pets', HdDependenciesSchema.getSchemaToken())])
  return new _MutableRetainedContainerDataSource(deps)
}

/** TestDependencyForwardingSceneIndexForDependentDependencies,
 *  testHdSceneIndex.cpp:1568-1720 (+ _InitScenes 1420-1458) */
function TestDependencyForwardingSceneIndexForDependentDependencies(): boolean {
  const BoolDS = (b: boolean) => HdRetainedTypedSampledDataSource.new(b)
  const petsDs = new _MutablePathsDs(['/Dog', '/Cat'])
  const humanContainer = new _MutableRetainedContainerDataSource([
    ['pets', petsDs],
    ['feed', BoolDS(false)],
    [HdDependenciesSchema.getSchemaToken(), _BuildHumanDependenciesDs(petsDs)],
  ])

  const retainedScene = HdRetainedSceneIndex.new()
  retainedScene.addPrims([{ primPath: '/Human', primType: 'group', dataSource: humanContainer }])
  retainedScene.addPrims([{ primPath: '/Dog', primType: 'group',
    dataSource: HdRetainedContainerDataSource.new(['hungry', 'bark'], [BoolDS(false), BoolDS(false)]) }])
  retainedScene.addPrims([{ primPath: '/Cat', primType: 'group',
    dataSource: HdRetainedContainerDataSource.new(['hungry', 'meow'], [BoolDS(false), BoolDS(false)]) }])
  retainedScene.addPrims([{ primPath: '/Tiger', primType: 'group',
    dataSource: HdRetainedContainerDataSource.new(['hungry', 'growl'], [BoolDS(false), BoolDS(false)]) }])
  const dependencyForwardingScene = HdDependencyForwardingSceneIndex.new(retainedScene)
  dependencyForwardingScene.setManualGarbageCollect(true)
  // pull on all prims to seed the cache
  PrintSceneIndexPrim(dependencyForwardingScene, '/', true)

  const recordingScene = new RecordingSceneIndexObserver()
  dependencyForwardingScene.addObserver(recordingScene)

  // We started with 2 pets, /Dog and /Cat.
  // /Human realizes that s/he is a cat person.
  // Add /Tiger and remove /Dog from the pets,
  // and update /Human.__dependencies to reflect this change.
  // This needs to be done before we send the dirty notice, below.
  petsDs.setValue(['/Cat', '/Tiger'])
  humanContainer.Set(HdDependenciesSchema.getSchemaToken(), _BuildHumanDependenciesDs(petsDs))
  retainedScene.dirtyPrims([{ primPath: '/Human', dirtyLocators: new HdDataSourceLocatorSet(new HdDataSourceLocator('pets')) }])

  // /Human.__dependencies depends on /Human.pets, so we should see
  // an additional dirty event.
  if (!_CompareEq('Dirty "/Human.pets" ->', _SetsEqual(recordingScene.getEventsAsSet(), [
    'PrimDirtied: /Human, pets', 'PrimDirtied: /Human, __dependencies']))) return false

  // Validate bookkeeping. /Human no longer depends on /Dog.
  const removedAffectedPrimPaths: string[] = []
  const removedDependedOnPrimPaths: string[] = []
  dependencyForwardingScene.removeDeletedEntries(removedAffectedPrimPaths, removedDependedOnPrimPaths)
  if (!_CompareEq('Remove Affected (affected paths): ',
    _ArraysEqual(removedAffectedPrimPaths, []))) return false
  if (!_CompareEq('Remove Affected (depended on paths): ',
    _ArraysEqual(removedDependedOnPrimPaths, ['/Dog']))) return false

  // Validate that the tables have been updated correctly.
  // 1.
  recordingScene.clear()
  retainedScene.dirtyPrims([{ primPath: '/Tiger', dirtyLocators: new HdDataSourceLocatorSet(new HdDataSourceLocator('hungry')) }])
  if (!_CompareEq('Dirty "/Tiger.hungry" ->', _SetsEqual(recordingScene.getEventsAsSet(), [
    'PrimDirtied: /Tiger, hungry', 'PrimDirtied: /Human, feed']))) return false
  // 2.
  recordingScene.clear()
  retainedScene.dirtyPrims([{ primPath: '/Dog', dirtyLocators: new HdDataSourceLocatorSet(new HdDataSourceLocator('hungry')) }])
  if (!_CompareEq('Dirty "/Dog.hungry" ->', _SetsEqual(recordingScene.getEventsAsSet(), [
    'PrimDirtied: /Dog, hungry']))) return false

  return true
}

describe('testHdSceneIndex', () => {
  it('TestFlatteningSceneIndex', () => {
    _out = ''
    expect(TestFlatteningSceneIndex()).toBe(true)
    expect(_BaselineSection("TestFlatteningSceneIndex").split("\n").length).toBeGreaterThan(100)
    expect(_out).toBe(_BaselineSection('TestFlatteningSceneIndex'))
  })

  for (const [name, fn] of [
    ['TestPrefixingSceneIndex', TestPrefixingSceneIndex],
    ['TestDependencyForwardingSceneIndex', TestDependencyForwardingSceneIndex],
    ['TestDependencyForwardingSceneIndexEviction', TestDependencyForwardingSceneIndexEviction],
    ['TestDependencyForwardingSceneIndexForDependentDependencies',
      TestDependencyForwardingSceneIndexForDependentDependencies],
  ] as const) {
    it(name, () => {
      _out = ''
      expect(fn()).toBe(true)
      expect(_out).toBe(_BaselineSection(name))
    })
  }
})
