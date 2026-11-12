// Ported from OpenUSD 26.11.1: pxr/imaging/hd/changeTracker.cpp,
//  pxr/imaging/hd/changeTracker.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/changeTracker.{h,cpp} — HdChangeTracker: the rprim
// dirty-bit vocabulary and the stateful per-rprim change tracker.

import { TF_CODING_ERROR, TF_VERIFY } from './tfDiagnostic.ts'
import { HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import { HdDirtyBitsTranslator } from './dirtyBitsTranslator.ts'
import type { HdRetainedSceneIndex } from './retainedSceneIndex.ts'

export type HdDirtyBits = number

// HdChangeTracker::RprimDirtyBits (changeTracker.h:40-77).
export const HdChangeTracker = {
  Clean:            0,
  InitRepr:         1 << 0,
  Varying:          1 << 1,
  AllDirty:         0xfffffffd,
  DirtyPrimID:      1 << 2,
  DirtyExtent:      1 << 3,
  DirtyDisplayStyle: 1 << 4,
  DirtyPoints:      1 << 5,
  DirtyPrimvar:     1 << 6,
  DirtyMaterialId:  1 << 7,
  DirtyTopology:    1 << 8,
  DirtyTransform:   1 << 9,
  DirtyVisibility:  1 << 10,
  DirtyNormals:     1 << 11,
  DirtyDoubleSided: 1 << 12,
  DirtyCullStyle:   1 << 13,
  DirtySubdivTags:  1 << 14,
  DirtyWidths:      1 << 15,
  DirtyInstancer:   1 << 16,
  DirtyInstanceIndex: 1 << 17,
  DirtyRepr:        1 << 18,
  DirtyRenderTag:   1 << 19,
  DirtyComputationPrimvarDesc: 1 << 20,
  DirtyCategories:  1 << 21,
  DirtyVolumeField: 1 << 22,
  AllSceneDirtyBits: (1 << 23) - 1,
  NewRepr:          1 << 23,
  CustomBitsBegin:  1 << 24,
  CustomBitsEnd:    1 << 30,
  CustomBitsMask:   0x7f << 24,
  // Deferred skinning: only the per-frame joint transforms changed —
  // renderers update the joint buffer and skip geometry repacking.
  DirtySkinningXforms: 1 << 31,
  // Task dirty bits occupy their own domain in changeTracker.h:80-84.
  DirtyParams:       1 << 2,
  DirtyCollection:   1 << 3,
  DirtyRenderTags:   1 << 4,

  // Static dirty-bit predicates (changeTracker.h:205-277,
  // changeTracker.cpp:845-987). The `id` argument feeds _LogCacheAccess's
  // HD_PERF_CACHE_HIT/MISS upstream, which perfLog.ts does not model.
  /** changeTracker.h:205-207 */
  isDirty(dirtyBits: HdDirtyBits): boolean { return (dirtyBits & 0xfffffffd) !== 0 },
  /** changeTracker.h:210-212 */
  isClean(dirtyBits: HdDirtyBits): boolean { return (dirtyBits & 0xfffffffd) === 0 },
  /** changeTracker.h:215-217 */
  isVarying(dirtyBits: HdDirtyBits): boolean { return (dirtyBits & (1 << 1)) !== 0 },
  /** changeTracker.cpp:910-915 */
  isExtentDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 3)) !== 0 },
  /** changeTracker.cpp:874-879 */
  isDisplayStyleDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 4)) !== 0 },
  /** changeTracker.cpp:883-888 */
  isSubdivTagsDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 14)) !== 0 },
  /** changeTracker.cpp:958-980 */
  isPrimvarDirty(dirtyBits: HdDirtyBits, _id: string, name: string): boolean {
    if (name === 'points' || name === 'velocities' || name === 'accelerations'
      || name === 'nonlinearSampleCount') {
      return (dirtyBits & (1 << 5)) !== 0
    } else if (name === 'normals') {
      return (dirtyBits & (1 << 11)) !== 0
    } else if (name === 'widths') {
      return (dirtyBits & (1 << 15)) !== 0
    }
    return (dirtyBits & (1 << 6)) !== 0
  },
  /** changeTracker.cpp:946-954 */
  isAnyPrimvarDirty(dirtyBits: HdDirtyBits, _id?: string): boolean {
    return (dirtyBits & ((1 << 5) | (1 << 11) | (1 << 15) | (1 << 6))) !== 0
  },
  /** changeTracker.cpp:847-852 */
  isTopologyDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 8)) !== 0 },
  /** changeTracker.cpp:856-861 */
  isDoubleSidedDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 12)) !== 0 },
  /** changeTracker.cpp:865-870 */
  isCullStyleDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 13)) !== 0 },
  /** changeTracker.cpp:892-897 */
  isTransformDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 9)) !== 0 },
  /** changeTracker.cpp:901-906 */
  isVisibilityDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 10)) !== 0 },
  /** changeTracker.cpp:919-924 */
  isPrimIdDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 2)) !== 0 },
  /** changeTracker.cpp:928-933 */
  isInstancerDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 16)) !== 0 },
  /** changeTracker.cpp:937-942 */
  isInstanceIndexDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 17)) !== 0 },
  /** changeTracker.cpp:983-987 */
  isReprDirty(dirtyBits: HdDirtyBits, _id?: string): boolean { return (dirtyBits & (1 << 18)) !== 0 },
} as const

const { InitRepr, Varying, DirtyRepr, DirtyRenderTag, Clean } = HdChangeTracker

// -----------------------------------------------------------------------------
// HdRprimChangeTracker — the stateful per-rprim change tracker (focused subset
// of changeTracker.{h,cpp}: rprim dirty-bit + varying-state tracking and the
// four version counters the dirty list consults).
// -----------------------------------------------------------------------------

export class HdRprimChangeTracker {
  private _rprimState = new Map<string, HdDirtyBits>()
  private _sceneStateVersion = 1
  private _varyingStateVersion = 1
  private _rprimIndexVersion = 1
  private _rprimRenderTagVersion = 1
  // changeTracker.h:670-673: the emulation scene index the public Mark*Dirty
  // methods forward to (set by HdRenderIndex when it runs emulation).
  private _emulationSceneIndex: HdRetainedSceneIndex | null = null
  private _disableEmulationAPI = false

  /** changeTracker.cpp:1310-1314 */
  _setTargetSceneIndex(emulationSceneIndex: HdRetainedSceneIndex | null): void {
    this._emulationSceneIndex = emulationSceneIndex
  }

  /** changeTracker.cpp:1316-1320 */
  _setDisableEmulationAPI(disable: boolean): void {
    this._disableEmulationAPI = disable
  }

  /** The dispatch shared by the public Mark*Dirty methods
   *  (changeTracker.cpp:103-111, 405-411, 494-502, 625-633, 731-739). */
  private _dirtyEmulatedPrim(id: string, toLocators: (primType: string, set: HdDataSourceLocatorSet) => void): void {
    // We need to dispatch based on prim type.
    const prim = this._emulationSceneIndex!.getPrim(id)
    const locators = new HdDataSourceLocatorSet()
    toLocators(prim.primType, locators)
    if (!locators.IsEmpty()) {
      this._emulationSceneIndex!.dirtyPrims([{ primPath: id, dirtyLocators: locators }])
    }
  }

  private _requireEmulation(): void {
    if (this._disableEmulationAPI) {
      TF_CODING_ERROR('Calling method on HdChangeTracker that requires emulation.')
    }
  }

  rprimInserted(id: string, initialDirtyState: HdDirtyBits): void {
    this._rprimState.set(id, initialDirtyState)
    ++this._sceneStateVersion
    ++this._rprimIndexVersion
  }

  rprimRemoved(id: string): void {
    this._rprimState.delete(id)
    ++this._sceneStateVersion
    ++this._rprimIndexVersion
  }

  getRprimDirtyBits(id: string): HdDirtyBits {
    // Not masking the varying bit; the dirty list filters on it.
    return this._rprimState.get(id) ?? Clean
  }

  /** changeTracker.cpp:95-125. Divergence: bits == Clean returns without
   *  the coding error. */
  markRprimDirty(id: string, bits: HdDirtyBits = HdChangeTracker.AllDirty): void {
    if (bits === Clean) return // upstream raises TF_CODING_ERROR
    if (this._emulationSceneIndex) {
      this._dirtyEmulatedPrim(id, (primType, set) =>
        HdDirtyBitsTranslator.rprimDirtyBitsToLocatorSet(primType, bits, set))
      return
    }
    this._requireEmulation()
    // XXX: During the migration, "DirtyPrimvar" implies DirtyPoints/etc.
    if (bits & HdChangeTracker.DirtyPrimvar) {
      bits |= HdChangeTracker.DirtyPoints | HdChangeTracker.DirtyNormals | HdChangeTracker.DirtyWidths
    }
    this._MarkRprimDirty(id, bits)
  }

  // Mirrors HdChangeTracker::_MarkRprimDirty. Public (with the underscore name)
  // so Hd_DirtyList can flag InitRepr after an all-pass gather, as upstream does.
  _MarkRprimDirty(id: string, bits: HdDirtyBits): void {
    const it = this._rprimState.get(id)
    if (it === undefined) return

    // Early out if no new bits are being set, unless it's a filter change
    // (render tag / repr), which must still bump the version flags.
    if ((bits & ~it) === 0) {
      if ((bits & (DirtyRenderTag | DirtyRepr)) === 0) return
    }

    // Used to ensure the repr has been created. Don't touch scene state version.
    if (bits === InitRepr) {
      this._rprimState.set(id, it | InitRepr)
      return
    }

    // Set the Varying bit if it's not already set.
    const oldBits = it
    if ((oldBits & Varying) === 0) {
      bits |= Varying
      ++this._varyingStateVersion
    }
    this._rprimState.set(id, oldBits | bits)
    ++this._sceneStateVersion

    // changeTracker.cpp:165-171
    if ((bits & HdChangeTracker.DirtyVisibility) !== 0) {
      ++this._visChangeCount
    }
    if ((bits & HdChangeTracker.DirtyInstanceIndex) !== 0) {
      ++this._instanceIndicesChangeCount
    }

    if ((bits & DirtyRenderTag) !== 0) {
      ++this._rprimRenderTagVersion
    }
    if ((bits & (DirtyRenderTag | DirtyRepr)) !== 0) {
      ++this._rprimIndexVersion
    }
  }

  markRprimClean(id: string, newBits: HdDirtyBits = Clean): void {
    const it = this._rprimState.get(id)
    if (it === undefined) return
    // Preserve the variability (Varying) bit.
    this._rprimState.set(id, (it & Varying) | newBits)
  }

  // ---------------------------------------------------------------------
  // Legacy scene-delegate state tracking (changeTracker.cpp:192-766): the
  // instancer, sprim, bprim and task state maps and the instancer -> rprim
  // dependency, used by HdSceneDelegate-driven prims (HdUnitTestDelegate).
  // The emulation-scene-index branches of the Mark*Dirty methods do not
  // apply: this tracker has no emulation scene index.
  // ---------------------------------------------------------------------
  private _instancerState = new Map<string, HdDirtyBits>()
  private _sprimState = new Map<string, HdDirtyBits>()
  private _bprimState = new Map<string, HdDirtyBits>()
  private _taskState = new Map<string, HdDirtyBits>()
  private _instancerRprimDependencies = new Map<string, Set<string>>()
  private _instancerInstancerDependencies = new Map<string, Set<string>>()
  private _instancerIndexVersion = 1
  private _sprimIndexVersion = 1
  private _bprimIndexVersion = 1
  private _instanceIndicesChangeCount = 1
  private _visChangeCount = 1
  private _taskRenderTagsVersion = 1

  /** changeTracker.cpp:192-208 */
  resetVaryingState(): void {
    ++this._varyingStateVersion
    for (const [id, bits] of this._rprimState) {
      if (HdChangeTracker.isClean(bits)) this._rprimState.set(id, bits & ~Varying)
    }
  }

  /** changeTracker.cpp:773-777 */
  isRprimDirty(id: string): boolean {
    return HdChangeTracker.isDirty(this.getRprimDirtyBits(id))
  }

  /** changeTracker.cpp:240-246 */
  instancerInserted(id: string, initialDirtyState: HdDirtyBits): void {
    this._instancerState.set(id, initialDirtyState)
    ++this._sceneStateVersion
    ++this._instancerIndexVersion
  }

  /** changeTracker.cpp:248-255 */
  instancerRemoved(id: string): void {
    this._instancerState.delete(id)
    ++this._sceneStateVersion
    ++this._instancerIndexVersion
  }

  /** changeTracker.cpp:262-274 (_AddDependency / _RemoveDependency) */
  addInstancerRprimDependency(instancerId: string, rprimId: string): void {
    let deps = this._instancerRprimDependencies.get(instancerId)
    if (!deps) this._instancerRprimDependencies.set(instancerId, deps = new Set())
    deps.add(rprimId)
  }
  removeInstancerRprimDependency(instancerId: string, rprimId: string): void {
    const deps = this._instancerRprimDependencies.get(instancerId)
    if (!deps) return
    deps.delete(rprimId)
    if (deps.size === 0) this._instancerRprimDependencies.delete(instancerId)
  }
  /** changeTracker.cpp:276-281 */
  addInstancerInstancerDependency(parentId: string, instancerId: string): void {
    let deps = this._instancerInstancerDependencies.get(parentId)
    if (!deps) this._instancerInstancerDependencies.set(parentId, deps = new Set())
    deps.add(instancerId)
  }
  /** changeTracker.cpp:283-288 */
  removeInstancerInstancerDependency(parentId: string, instancerId: string): void {
    const deps = this._instancerInstancerDependencies.get(parentId)
    if (!deps) return
    deps.delete(instancerId)
    if (deps.size === 0) this._instancerInstancerDependencies.delete(parentId)
  }

  /** changeTracker.cpp:477-484 */
  getInstancerDirtyBits(id: string): HdDirtyBits {
    const bits = this._instancerState.get(id)
    if (!TF_VERIFY(bits !== undefined)) return Clean
    return bits!
  }

  /** changeTracker.cpp:486-574 */
  markInstancerDirty(id: string, bits: HdDirtyBits): void {
    if (bits === Clean) {
      TF_CODING_ERROR('MarkInstancerDirty called with bits == clean!')
      return
    }
    if (this._emulationSceneIndex) {
      this._dirtyEmulatedPrim(id, (primType, set) =>
        HdDirtyBitsTranslator.instancerDirtyBitsToLocatorSet(primType, bits, set))
      return
    }
    this._requireEmulation()
    this._MarkInstancerDirty(id, bits)
  }

  /** changeTracker.cpp:512-573 */
  _MarkInstancerDirty(id: string, bits: HdDirtyBits): void {
    const it = this._instancerState.get(id)
    if (!TF_VERIFY(it !== undefined)) return
    // Early out if no new bits are being set.
    if ((bits & ~it!) === 0) return
    this._instancerState.set(id, it! | bits)
    ++this._sceneStateVersion
    let toPropagate: HdDirtyBits = HdChangeTracker.DirtyInstancer
    if (bits & HdChangeTracker.DirtyTransform) toPropagate |= HdChangeTracker.DirtyTransform
    // If an instancer is invis'd, we drop all instance indices.
    if (bits & (HdChangeTracker.DirtyInstanceIndex | HdChangeTracker.DirtyVisibility)) {
      toPropagate |= HdChangeTracker.DirtyInstanceIndex
      ++this._instanceIndicesChangeCount
    }
    // changeTracker.cpp:550-573. Instancer -> sprim dependencies are not
    // tracked by this tracker.
    for (const dep of this._instancerInstancerDependencies.get(id) ?? []) {
      this._MarkInstancerDirty(dep, toPropagate)
    }
    for (const dep of this._instancerRprimDependencies.get(id) ?? []) {
      this._MarkRprimDirty(dep, toPropagate)
    }
  }

  /** changeTracker.cpp:575-584 */
  markInstancerClean(id: string, newBits: HdDirtyBits = Clean): void {
    const it = this._instancerState.get(id)
    if (!TF_VERIFY(it !== undefined)) return
    this._instancerState.set(id, (it! & Varying) | newBits)
  }

  /** changeTracker.cpp:590-597 */
  sprimInserted(id: string, initialDirtyState: HdDirtyBits): void {
    this._sprimState.set(id, initialDirtyState)
    ++this._sceneStateVersion
    ++this._sprimIndexVersion
  }

  /** changeTracker.cpp:599-606 */
  sprimRemoved(id: string): void {
    this._sprimState.delete(id)
    ++this._sceneStateVersion
    ++this._sprimIndexVersion
  }

  /** changeTracker.cpp:608-615 */
  getSprimDirtyBits(id: string): HdDirtyBits {
    const bits = this._sprimState.get(id)
    if (!TF_VERIFY(bits !== undefined)) return Clean
    return bits!
  }

  /** changeTracker.cpp:617-668. Sprim -> sprim / rprim target dependencies
   *  are not tracked by this tracker. */
  markSprimDirty(id: string, bits: HdDirtyBits): void {
    if (bits === Clean) {
      TF_CODING_ERROR('MarkSprimDirty called with bits == clean!')
      return
    }
    if (this._emulationSceneIndex) {
      this._dirtyEmulatedPrim(id, (primType, set) =>
        HdDirtyBitsTranslator.sprimDirtyBitsToLocatorSet(primType, bits, set))
      return
    }
    this._requireEmulation()
    this._MarkSprimDirty(id, bits)
  }

  /** changeTracker.cpp:643-668 */
  _MarkSprimDirty(id: string, bits: HdDirtyBits): void {
    const it = this._sprimState.get(id)
    if (!TF_VERIFY(it !== undefined)) return
    this._sprimState.set(id, (it! | bits) >>> 0)
    ++this._sceneStateVersion
  }

  /** changeTracker.cpp:669-676 */
  markSprimClean(id: string, newBits: HdDirtyBits = Clean): void {
    if (!TF_VERIFY(this._sprimState.has(id))) return
    this._sprimState.set(id, newBits)
  }

  /** changeTracker.cpp:696-703 */
  bprimInserted(id: string, initialDirtyState: HdDirtyBits): void {
    this._bprimState.set(id, initialDirtyState)
    ++this._sceneStateVersion
    ++this._bprimIndexVersion
  }

  /** changeTracker.cpp:705-712 */
  bprimRemoved(id: string): void {
    this._bprimState.delete(id)
    ++this._sceneStateVersion
    ++this._bprimIndexVersion
  }

  /** changeTracker.cpp:714-721 */
  getBprimDirtyBits(id: string): HdDirtyBits {
    const bits = this._bprimState.get(id)
    if (!TF_VERIFY(bits !== undefined)) return Clean
    return bits!
  }

  /** changeTracker.cpp:723-758 */
  markBprimDirty(id: string, bits: HdDirtyBits): void {
    if (bits === Clean) {
      TF_CODING_ERROR('MarkBprimDirty called with bits == clean!')
      return
    }
    if (this._emulationSceneIndex) {
      this._dirtyEmulatedPrim(id, (primType, set) =>
        HdDirtyBitsTranslator.bprimDirtyBitsToLocatorSet(primType, bits, set))
      return
    }
    this._requireEmulation()
    this._MarkBprimDirty(id, bits)
  }

  /** changeTracker.cpp:749-758 */
  _MarkBprimDirty(id: string, bits: HdDirtyBits): void {
    const it = this._bprimState.get(id)
    if (!TF_VERIFY(it !== undefined)) return
    this._bprimState.set(id, (it! | bits) >>> 0)
    ++this._sceneStateVersion
  }

  /** changeTracker.cpp:759-766 */
  markBprimClean(id: string, newBits: HdDirtyBits = Clean): void {
    if (!TF_VERIFY(this._bprimState.has(id))) return
    this._bprimState.set(id, newBits)
  }

  /** changeTracker.cpp:381-395 */
  taskInserted(id: string, initialDirtyState: HdDirtyBits): void {
    this._taskState.set(id, initialDirtyState)
    ++this._sceneStateVersion
  }
  taskRemoved(id: string): void {
    this._taskState.delete(id)
    ++this._sceneStateVersion
  }

  /** changeTracker.cpp:397-441 */
  markTaskDirty(id: string, bits: HdDirtyBits): void {
    if (bits === Clean) {
      TF_CODING_ERROR('MarkTaskDirty called with bits == clean!')
      return
    }
    if (this._emulationSceneIndex) {
      const locators = new HdDataSourceLocatorSet()
      HdDirtyBitsTranslator.taskDirtyBitsToLocatorSet(bits, locators)
      if (!locators.IsEmpty()) {
        this._emulationSceneIndex.dirtyPrims([{ primPath: id, dirtyLocators: locators }])
      }
      return
    }
    this._requireEmulation()
    this._MarkTaskDirty(id, bits)
  }

  /** changeTracker.cpp:421-441 */
  _MarkTaskDirty(id: string, bits: HdDirtyBits): void {
    const it = this._taskState.get(id)
    if (!TF_VERIFY(it !== undefined, `Task Id = ${id}`)) return
    if ((bits & HdChangeTracker.DirtyRenderTags) && (it! & HdChangeTracker.DirtyRenderTags) === 0) {
      ++this._taskRenderTagsVersion
    }
    this._taskState.set(id, it! | bits)
    ++this._sceneStateVersion
  }

  /** changeTracker.cpp:442-449 */
  getTaskDirtyBits(id: string): HdDirtyBits {
    const bits = this._taskState.get(id)
    if (!TF_VERIFY(bits !== undefined)) return Clean
    return bits!
  }

  /** changeTracker.cpp:451-459 */
  markTaskClean(id: string, newBits: HdDirtyBits = Clean): void {
    const it = this._taskState.get(id)
    if (!TF_VERIFY(it !== undefined)) return
    this._taskState.set(id, (it! & Varying) | newBits)
  }

  getTaskRenderTagsVersion(): number { return this._taskRenderTagsVersion }
  getInstancerIndexVersion(): number { return this._instancerIndexVersion }
  getSprimIndexVersion(): number { return this._sprimIndexVersion }
  getBprimIndexVersion(): number { return this._bprimIndexVersion }
  /** changeTracker.cpp:1161-1164 */
  getVisibilityChangeCount(): number { return this._visChangeCount }
  getInstanceIndicesChangeCount(): number { return this._instanceIndicesChangeCount }

  /** changeTracker.cpp:210-226 */
  resetRprimVaryingState(id: string): void {
    const it = this._rprimState.get(id)
    if (!TF_VERIFY(it !== undefined, id)) return
    // Don't update varying state or change count; the change is picked up on
    // the next iteration.
    this._rprimState.set(id, it! & ~Varying)
  }

  getSceneStateVersion(): number { return this._sceneStateVersion }
  getVaryingStateVersion(): number { return this._varyingStateVersion }
  getRprimIndexVersion(): number { return this._rprimIndexVersion }
  getRenderTagVersion(): number { return this._rprimRenderTagVersion }
  // changeTracker.cpp:1119-1158 collection versions.
  private _collectionState = new Map<string, number>()

  /** changeTracker.cpp:1119-1130 */
  addCollection(collectionName: string): void {
    if (this._collectionState.has(collectionName)) return
    this._collectionState.set(collectionName, 1)
  }

  /** changeTracker.cpp:1132-1146 */
  markCollectionDirty(collectionName: string): void {
    const version = this._collectionState.get(collectionName)
    if (!TF_VERIFY(version !== undefined, `Collection ${collectionName} not found\n`)) return
    // bump the version number
    this._collectionState.set(collectionName, version! + 1)
    ++this._sceneStateVersion
  }

  /** changeTracker.cpp:1148-1158. An unregistered collection returns the
   *  rprim-index version; upstream also posts a coding error there, which is
   *  not posted here because the scene-index-only render index never
   *  registers its geometry collection (renderIndex.cpp:182 does). */
  getCollectionVersion(collectionName: string): number {
    const version = this._collectionState.get(collectionName)
    if (version === undefined) return this._rprimIndexVersion
    return version + this._rprimIndexVersion
  }
}
