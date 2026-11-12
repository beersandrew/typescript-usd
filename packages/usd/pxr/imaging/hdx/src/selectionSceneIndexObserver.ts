// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdx/selectionSceneIndexObserver.cpp,
//  pxr/imaging/hdx/selectionSceneIndexObserver.h,
//  pxr/imaging/hd/sceneIndexObserver.cpp
// Copyright 2021, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/selectionSceneIndexObserver.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - WorkParallelForEach and the result mutex are serial loops.
// - HdInstanceIndicesVectorSchema is the HdVectorDataSource
//   HdSelectionSchema::GetNestedInstanceIndices returns, each element read
//   through HdInstanceIndicesSchema.
// - HdSceneIndexObserver::ConvertPrimsRenamedToRemovedAndAdded
//   (hd/sceneIndexObserver.cpp:15-77) is inlined in PrimsRenamed.
// - TRACE_FUNCTION scopes are not ported.

import {
  ContainerDataSource as HdContainerDataSource,
  InstanceIndicesSchema as HdInstanceIndicesSchema,
  InstancerTopologySchema as HdInstancerTopologySchema,
  Selection as HdSelection,
  SelectionsSchema as HdSelectionsSchema,
  type AddedPrimEntry,
  type DirtiedPrimEntry,
  type RemovedPrimEntry,
  type RenamedPrimEntry,
  type SceneIndexBase as HdSceneIndexBase,
  type SceneIndexObserver as HdSceneIndexObserver,
  type SelectionSchema as HdSelectionSchema,
} from 'typescript-usd/hd'

/** selectionSceneIndexObserver.cpp:36-56 */
function _PopulateFromSceneIndex(sceneIndex: HdSceneIndexBase, path: string,
  result: HdSelection): void {
  _AddToSelection(sceneIndex, path, result)
  const childPaths = sceneIndex.getChildPrimPaths(path)
  for (const childPath of childPaths) {
    _PopulateFromSceneIndex(sceneIndex, childPath, result)
  }
}

/** selectionSceneIndexObserver.cpp:104-134. Wraps
 *  HdInstancerTopologySchema::ComputeInstanceIndicesForProto. */
function _GetInstanceIndicesForPrototypeIndex(sceneIndex: HdSceneIndexBase,
  instancerPath: string, prototypeIndex: number): number[] {
  const instancerTopologySchema = HdInstancerTopologySchema.getFromParent(
    sceneIndex.getPrim(instancerPath).dataSource)

  const prototypesDs = instancerTopologySchema.getPrototypes()
  if (!prototypesDs) {
    return []
  }

  const prototypes = [...(prototypesDs.getTypedValue(0.0) as Iterable<string>)]
  if (prototypeIndex < 0 || prototypeIndex >= prototypes.length) {
    return []
  }

  return instancerTopologySchema.computeInstanceIndicesForProto(
    prototypes[prototypeIndex]!)
}

/** selectionSceneIndexObserver.cpp:136-168. Calls
 *  HdInstancerTopologySchema::ComputeInstanceIndicesForProto using the
 *  instancer and prototype from the HdInstanceIndicesSchema. */
function _GetInstanceIndicesForPrototype(sceneIndex: HdSceneIndexBase,
  instanceIndicesSchema: HdInstanceIndicesSchema): number[] {
  const instancerPathDs = instanceIndicesSchema.getInstancer()
  if (!instancerPathDs) {
    return []
  }
  const instancerPath = String(instancerPathDs.getTypedValue(0.0))
  if (!instancerPath) {
    return []
  }

  const prototypeIndexDs = instanceIndicesSchema.getPrototypeIndex()
  if (!prototypeIndexDs) {
    return []
  }

  return _GetInstanceIndicesForPrototypeIndex(
    sceneIndex,
    instancerPath,
    prototypeIndexDs.getTypedValue(0.0) as number)
}

/** selectionSceneIndexObserver.cpp:170-184. Instance indices from instance
 *  indices schema. */
function _GetSelectedInstanceIndices(
  selectedInstanceIndicesSchema: HdInstanceIndicesSchema): number[] {
  const dataSource = selectedInstanceIndicesSchema.getInstanceIndices()
  if (!dataSource) {
    return []
  }
  return [...(dataSource.getTypedValue(0.0) as Iterable<number>)]
}

/** selectionSceneIndexObserver.cpp:186-228. Converts from instance indices
 *  to instance ids; also gives the number of instance ids, that is of
 *  visible instances of the given prototype. */
function _GetSelectedInstanceIdsAndNumForPrototypeFromIndices(
  instanceIndicesForPrototype: readonly number[],
  selectedInstanceIndices: readonly number[]): [number[], number] {
  const sorted = new Set(selectedInstanceIndices)

  const selectedInstanceIds: number[] = []

  const n = instanceIndicesForPrototype.length
  for (let i = 0; i < n; i++) {
    if (sorted.has(instanceIndicesForPrototype[i]!)) {
      selectedInstanceIds.push(i)
    }
  }

  return [selectedInstanceIds, n]
}

/** selectionSceneIndexObserver.cpp:230-248. Convert data in schema to
 *  instance ids. */
function _GetSelectedInstanceIdsAndNumForPrototype(sceneIndex: HdSceneIndexBase,
  selectedInstanceIndicesSchema: HdInstanceIndicesSchema): [number[], number] {
  return _GetSelectedInstanceIdsAndNumForPrototypeFromIndices(
    _GetInstanceIndicesForPrototype(sceneIndex, selectedInstanceIndicesSchema),
    _GetSelectedInstanceIndices(selectedInstanceIndicesSchema))
}

/** selectionSceneIndexObserver.cpp:250-323. Encodes the instance ids chosen
 *  at each level of nested instancing as a single nested instance id. */
function _GetSelectedNestedInstanceIds(sceneIndex: HdSceneIndexBase,
  selectedNestedInstanceIndices: { getNumElements(): number, getElement(i: number): unknown }): number[] {
  const depth = selectedNestedInstanceIndices.getNumElements()
  if (depth === 0) {
    return []
  }

  let selectedNestedInstanceIds = [0]

  // Going from outer most to inner most instancer.
  for (let d = 0; d < depth; d++) {
    const element = selectedNestedInstanceIndices.getElement(d)
    const [selectedInstanceIdsForPrototype, num] =
      _GetSelectedInstanceIdsAndNumForPrototype(
        sceneIndex,
        new HdInstanceIndicesSchema(
          element instanceof HdContainerDataSource ? element : undefined))

    const n = selectedNestedInstanceIds.length
    const m = selectedInstanceIdsForPrototype.length

    // Multiply number of nested instances by number of instances selected
    // at this nesting level.
    const newSelectedNestedInstanceIds = new Array<number>(n * m)
    for (let i = 0; i < n; i++) {
      const nestedIdBase = num * selectedNestedInstanceIds[i]!
      for (let j = 0; j < m; j++) {
        newSelectedNestedInstanceIds[i * m + j] =
          nestedIdBase + selectedInstanceIdsForPrototype[j]!
      }
    }

    selectedNestedInstanceIds = newSelectedNestedInstanceIds
  }

  return selectedNestedInstanceIds
}

/** selectionSceneIndexObserver.cpp:325-380. Given one of the data sources
 *  under the selections locator for the prim at path in the scene index,
 *  process it and add to result. */
function _AddSelectionSchemaToSelection(sceneIndex: HdSceneIndexBase,
  selectionSchema: HdSelectionSchema, primPath: string, result: HdSelection): void {
  // Only support fully selected for now.
  const ds = selectionSchema.getFullySelected()
  if (!ds) {
    return
  }

  if (!ds.getTypedValue(0.0)) {
    return
  }

  // Retrieve instancing information.
  const selectedNestedInstanceIndices = selectionSchema.getNestedInstanceIndices()

  if (selectedNestedInstanceIndices && selectedNestedInstanceIndices.getNumElements() > 0) {
    // HdSelection::AddInstance expects nested instance ids.
    const selectedNestedInstanceIds =
      _GetSelectedNestedInstanceIds(sceneIndex, selectedNestedInstanceIndices)

    // For HdSelection::AddInstance, nothing is everything.
    // That is, passing an empty array selects all instances.
    // This is not what we intent here. An empty array can result,
    // if a user selects an instance proxy path to an invis'd instance.
    if (selectedNestedInstanceIds.length > 0) {
      result.addInstance(
        HdSelection.HighlightModeSelect,
        primPath,
        selectedNestedInstanceIds)
    }
  } else {
    result.addRprim(
      HdSelection.HighlightModeSelect,
      primPath)
  }
}

/** selectionSceneIndexObserver.cpp:382-416. Query prim at path in scene
 *  index for selections data source and add to result. */
function _AddToSelection(sceneIndex: HdSceneIndexBase, primPath: string,
  result: HdSelection): void {
  const selectionsSchema = HdSelectionsSchema.getFromParent(
    sceneIndex.getPrim(primPath).dataSource)
  if (!selectionsSchema.isDefined()) {
    return
  }

  const n = selectionsSchema.getNumElements()
  for (let i = 0; i < n; ++i) {
    const selectionSchema = selectionsSchema.getElement(i)
    _AddSelectionSchemaToSelection(sceneIndex, selectionSchema, primPath, result)
  }
}

/** selectionSceneIndexObserver.h:20-69. Queries each prim of the given
 *  scene index for the HdSelectionsSchema to compute a HdSelection. */
export class HdxSelectionSceneIndexObserver implements HdSceneIndexObserver {
  private _sceneIndex: HdSceneIndexBase | undefined = undefined
  private _version: number
  private _selection: HdSelection
  private _dirtiedPrims = new Set<string>()

  /** selectionSceneIndexObserver.cpp:30-34 */
  constructor() {
    this._version = 0
    this._selection = new HdSelection()
  }

  /** selectionSceneIndexObserver.cpp:58-86. Set which scene index to
   *  query for selection. */
  setSceneIndex(sceneIndex: HdSceneIndexBase | undefined): void {
    if (sceneIndex === this._sceneIndex) {
      return
    }

    if (this._sceneIndex) {
      this._sceneIndex.removeObserver(this)
    }

    this._sceneIndex = sceneIndex
    this._selection = new HdSelection()
    this._dirtiedPrims.clear()

    if (this._sceneIndex) {
      sceneIndex!.addObserver(this)
      _PopulateFromSceneIndex(sceneIndex!, '/', this._selection)
    }

    this._version++
  }

  /** selectionSceneIndexObserver.cpp:88-92. Increased every time the
   *  selection in the scene index changes. */
  getVersion(): number {
    return this._version
  }

  /** selectionSceneIndexObserver.cpp:94-102. Reset and compute new
   *  selection. */
  getSelection(): HdSelection {
    if (this._dirtiedPrims.size > 0) {
      this._selection = this._computeSelection()
    }

    return this._selection
  }

  /** selectionSceneIndexObserver.cpp:418-453 */
  private _computeSelection(): HdSelection {
    const result = new HdSelection()

    if (!this._sceneIndex) {
      return result
    }

    const prims = this._selection.getAllSelectedPrimPaths()

    for (const p of prims) this._dirtiedPrims.add(p)

    if (this._dirtiedPrims.size > 0) {
      for (const path of [...this._dirtiedPrims].sort()) {
        _AddToSelection(this._sceneIndex, path, result)
      }

      this._dirtiedPrims.clear()
    }

    return result
  }

  /** selectionSceneIndexObserver.cpp:455-471 */
  primsAdded(_sender: HdSceneIndexBase, entries: readonly AddedPrimEntry[]): void {
    if (entries.length === 0) {
      return
    }

    ++this._version

    for (const entry of entries) {
      this._dirtiedPrims.add(entry.primPath)
    }
  }

  /** selectionSceneIndexObserver.cpp:473-487 */
  primsDirtied(_sender: HdSceneIndexBase, entries: readonly DirtiedPrimEntry[]): void {
    for (const entry of entries) {
      if (entry.dirtyLocators.contains(HdSelectionsSchema.getDefaultLocator())) {
        ++this._version
        this._dirtiedPrims.add(entry.primPath)
      }
    }
  }

  /** selectionSceneIndexObserver.cpp:489-499 */
  primsRemoved(_sender: HdSceneIndexBase, entries: readonly RemovedPrimEntry[]): void {
    if (entries.length === 0) {
      return
    }

    ++this._version
  }

  /** selectionSceneIndexObserver.cpp:501-507, with
   *  HdSceneIndexObserver::ConvertPrimsRenamedToRemovedAndAdded
   *  (hd/sceneIndexObserver.cpp:15-77). */
  primsRenamed(sender: HdSceneIndexBase, entries: readonly RenamedPrimEntry[]): void {
    const removed: RemovedPrimEntry[] = []
    const added: AddedPrimEntry[] = []
    for (const renamedEntry of entries) {
      if (renamedEntry.oldPrimPath !== renamedEntry.newPrimPath) {
        // remove existing
        removed.push({ primPath: renamedEntry.oldPrimPath })

        // add back based on traversal on input from new path
        const workQueue: string[] = [renamedEntry.newPrimPath]
        while (workQueue.length > 0) {
          const path = workQueue.pop()!
          const p = sender.getPrim(path)
          added.push({ primPath: path, primType: p.primType })
          const childPaths = sender.getChildPrimPaths(path)
          // insert backwards as we are pulling off the end.
          for (let i = childPaths.length - 1; i >= 0; i--) {
            workQueue.push(childPaths[i]!)
          }
        }
      }
    }
    if (removed.length > 0) {
      this.primsRemoved(sender, removed)
    }
    if (added.length > 0) {
      this.primsAdded(sender, added)
    }
  }
}
