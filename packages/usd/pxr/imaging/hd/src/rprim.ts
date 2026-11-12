// Ported from OpenUSD 26.11.1: pxr/imaging/hd/rprim.cpp,
//  pxr/imaging/hd/rprim.h, pxr/imaging/hd/renderIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/rprim.{h,cpp} (OpenUSD 26.11.1) — HdRprim, the
// render engine state for a given rprim.
//
// Deliberate divergences:
// - Two Sync calling conventions coexist. Upstream's is
//   Sync(sceneDelegate, renderParam, dirtyBits*, reprToken) (rprim.h:117-120),
//   used by HdSceneDelegate-driven rprims (HdStMesh); HdDirtyBits* is an
//   HdDirtyBitsRef box.
// - FAITHFULNESS-DEBT(hd-render-index-legacy-sync): upstream prims have the
//   one Sync(sceneDelegate, ...) signature; natively the delegate is the
//   emulation's HdSceneIndexAdapterSceneDelegate (renderIndex.cpp:148-252).
//   This port's render index also syncs the prims it owns straight from the
//   scene index prim (renderIndex.ts SyncAll). End-state: the single
//   scene-delegate Sync through the adapter delegate, for rprims, sprims and
//   bprims.
//   The scene-index-only render index in renderIndex.ts calls
//   Sync(sceneIndexPrim, dirtyBits, reprToken) on the rprims it owns. The
//   abstract signature accepts both; a subclass implements the one its render
//   index path uses.
// - The constructor keeps its optional instancerId argument for existing
//   subclasses (upstream HdRprim(SdfPath const&), rprim.cpp:15-21).
// - GetBuiltinPrimvarNames, _PropagateDirtyBits and _InitRepr are pure
//   virtual upstream (rprim.h:191, 232, 249); here they have neutral defaults
//   so scene-index-driven subclasses that never take the legacy path need not
//   implement them. Legacy-path subclasses (HdMesh) override them.
// - GetDrawItems returns an empty list without a coding error when the rprim
//   has no reprs at all (the scene-index path, whose subclasses override
//   GetDrawItems); with reprs, an unknown repr is the upstream coding error
//   (rprim.cpp:117-128).
// - GetInstancerTransforms walks the instancer chain through
//   HdRenderIndex.GetInstancer when the render index provides it.

import type { Token as TfToken } from 'typescript-usd/tf'
import type { Matrix4d as GfMatrix4d, Range3d as GfRange3d } from 'typescript-usd/gf'
import type { Value as VtValue } from 'typescript-usd/vt'
import { HdChangeTracker, type HdDirtyBits, type HdRprimChangeTracker } from './changeTracker.ts'
import type { HdDirtyBitsRef } from './dirtyBitsTranslator.ts'
import type { HdDrawItem } from './drawItem.ts'
import { HdDrawingCoord } from './drawingCoord.ts'
import { HdRprimSharedData } from './rprimSharedData.ts'
import { HdReprSelector } from './displayStyle.ts'
import type { HdRepr } from './repr.ts'
import type { HdInterpolation } from './enums.ts'
import type { HdRenderParam } from './renderDelegate.ts'
import type { HdSceneIndexPrim } from './sceneIndex.ts'
import type { HdSceneDelegate, HdPrimvarDescriptorVector } from './sceneDelegate.ts'
import { HdPerfLog } from './perfLog.ts'
import { HdPerfTokens } from './tokens.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** rprim.h:28 HdReprSharedPtr */
export type HdReprSharedPtr = HdRepr

/** rprim.h:322-346 _ReprDescConfigs<DESC_TYPE, N>. */
export class HdRprim_ReprDescConfigs<DESC_TYPE> {
  readonly MAX_DESCS: number
  _configs: Array<[string, DESC_TYPE[]]> = []

  constructor(private readonly _n: number, private readonly _makeDesc: () => DESC_TYPE) {
    this.MAX_DESCS = _n
  }

  /** rprim.h:327-334 */
  find(reprToken: string): DESC_TYPE[] {
    // linear search, we expect only a handful reprs configured.
    for (const [token, descs] of this._configs) {
      if (token === reprToken) return descs
    }
    TF_CODING_ERROR(`Repr ${reprToken} not found`)
    return Array.from({ length: this._n }, this._makeDesc)
  }

  /** rprim.h:335-344 */
  addOrUpdate(reprToken: string, descs: DESC_TYPE[]): void {
    for (const config of this._configs) {
      if (config[0] === reprToken) {
        // Overwrite the existing entry.
        config[1] = descs
        return
      }
    }
    this._configs.push([reprToken, descs])
  }
}

/** rprim.h:35-350 */
export abstract class HdRprim {
  private _instancerId: string
  private _materialId: string
  // Used for id renders.
  private _primId = -1

  // shared data across reprs: bufferArrayRanges, bounds, visibility.
  // Upstream's protected `_sharedData` (rprim.h:296), under another name
  // (the hdSt rprims use this name).
  protected _rprimSharedData: HdRprimSharedData
  // authored repr selector
  protected _authoredReprSelector = new HdReprSelector()
  // authored render tag
  protected _renderTag = '' as TfToken
  // total number of reprs is relatively small (less than 5 or so in most
  // cases), we use linear container for efficiency (rprim.h:305-307).
  protected _reprs: Array<[string, HdReprSharedPtr]> = []

  /** rprim.cpp:15-21 */
  constructor(id: string, instancerId = '') {
    this._rprimSharedData = new HdRprimSharedData(HdDrawingCoord.DefaultNumSlots, /*visible=*/true)
    this._rprimSharedData.rprimID = id
    this._instancerId = instancerId
    this._materialId = ''
  }

  // ---------------------------------------------------------------------- //
  // Rprim Hydra Engine API : Pre-Sync & Sync-Phase
  // ---------------------------------------------------------------------- //

  /** rprim.h:50 */
  abstract getInitialDirtyBitsMask(): HdDirtyBits

  /** rprim.cpp:27-63 */
  canSkipDirtyBitPropagationAndSync(bits: HdDirtyBits): boolean {
    // For invisible prims, we'd like to avoid syncing data. The current
    // design adds a draw item for a repr during repr initialization even if
    // a prim may be invisible, so the first repr initialization (+ sync) is
    // taken and time-varying updates to the invisible prim are avoided.
    let skip = false
    const mask = HdChangeTracker.DirtyVisibility | HdChangeTracker.NewRepr
    if (!this.isVisible() && !(bits & mask)) {
      skip = true
      HdPerfLog.GetInstance().incrementCounter(HdPerfTokens.skipInvisibleRprimSync)
    }
    return skip
  }

  /** rprim.cpp:65-91 */
  propagateRprimDirtyBits(bits: HdDirtyBits): HdDirtyBits {
    // If the dependent computations changed - assume all primvars are dirty
    if (bits & HdChangeTracker.DirtyComputationPrimvarDesc) {
      bits |= (HdChangeTracker.DirtyPoints | HdChangeTracker.DirtyNormals
        | HdChangeTracker.DirtyWidths | HdChangeTracker.DirtyPrimvar)
    }
    // when refine level changes, topology becomes dirty.
    if (bits & HdChangeTracker.DirtyDisplayStyle) {
      bits |= HdChangeTracker.DirtyTopology
    }
    // if topology changes, all dependent bits become dirty.
    if (bits & HdChangeTracker.DirtyTopology) {
      bits |= (HdChangeTracker.DirtyPoints | HdChangeTracker.DirtyNormals
        | HdChangeTracker.DirtyPrimvar)
    }
    // Let subclasses propagate bits
    return this._propagateDirtyBits(bits)
  }

  /** rprim.cpp:93-99 */
  initRepr(_delegate: HdSceneDelegate | null, reprToken: string, dirtyBits: HdDirtyBitsRef): void {
    this._initRepr(reprToken, dirtyBits)
  }

  /**
   * rprim.h:117-120 Sync(sceneDelegate, renderParam, dirtyBits*, reprToken),
   * or the scene-index-only render index's Sync(sceneIndexPrim, dirtyBits,
   * reprToken) (see the header).
   */
  abstract sync(
    sceneDelegateOrPrim: HdSceneDelegate | HdSceneIndexPrim,
    renderParamOrDirtyBits: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBitsOrReprToken: HdDirtyBitsRef | string,
    reprToken?: string,
  ): void

  // ---------------------------------------------------------------------- //
  // Rprim Hydra Engine API : Execute Phase
  // ---------------------------------------------------------------------- //

  /** rprim.cpp:117-128 */
  getDrawItems(reprToken: string): readonly HdDrawItem[] {
    if (this._reprs.length === 0) return []
    const repr = this._getRepr(reprToken)
    if (repr) return repr.getDrawItems()
    TF_CODING_ERROR(`Rprim has no draw items for repr ${reprToken}`)
    return []
  }

  // ---------------------------------------------------------------------- //
  // Rprim Hydra Engine API : Cleanup
  // ---------------------------------------------------------------------- //

  /** rprim.cpp:134-137 */
  finalize(_renderParam: HdRenderParam | null | undefined): void {}

  /** The destructor (~HdRprim, run by the render delegate's DestroyRprim,
   *  e.g. hdSt/renderDelegate.cpp:456-460 `delete rPrim`): the reprs delete
   *  their draw items and the shared data's barContainer drops its ranges
   *  (PLATFORM-DIVERGENCE(hd-bar-shared-ptr), bufferArrayRange.ts). Subclasses
   *  drop their own shared_ptr members first. */
  destroy(): void {
    const reprs = this._reprs
    this._reprs = []
    for (const [, repr] of reprs) repr.destroy()
    this._rprimSharedData.barContainer.destroy()
  }

  // ---------------------------------------------------------------------- //
  // Rprim Data API
  // ---------------------------------------------------------------------- //

  /** rprim.h:147 */
  getId(): string { return this._rprimSharedData.rprimID }

  /** rprim.h:150 */
  getPrimId(): number { return this._primId }

  /** rprim.cpp:143-148 */
  setPrimId(primId: number): void {
    this._primId = primId
    // Don't set DirtyPrimID here, to avoid undesired variability tracking.
  }

  /** rprim.h:158 */
  getInstancerId(): string { return this._instancerId }

  /** rprim.h:163 */
  getMaterialId(): string { return this._materialId }

  /** rprim.cpp:150-154 */
  setMaterialId(materialId: string): void { this._materialId = materialId }

  /** rprim.h:169-171 */
  getReprSelector(): HdReprSelector { return this._authoredReprSelector }

  /** rprim.h:173-175, and the delegate wrapper rprim.h:356-360 */
  getRenderTag(delegate?: HdSceneDelegate): TfToken {
    if (delegate) return delegate.getRenderTag(this.getId())
    return this._renderTag
  }

  /** rprim.h:362-366 */
  getExtent(delegate: HdSceneDelegate): GfRange3d {
    return delegate.getExtent(this.getId())
  }

  /** rprim.h:368-373 */
  getPrimvarDescriptors(delegate: HdSceneDelegate,
    interpolation: HdInterpolation): HdPrimvarDescriptorVector {
    return delegate.getPrimvarDescriptors(this.getId(), interpolation)
  }

  /** rprim.h:191: built-in primvars of the core geometric schema. */
  getBuiltinPrimvarNames(): readonly TfToken[] { return [] }

  /** rprim.h:375-379 */
  getPrimvar(delegate: HdSceneDelegate, name: TfToken | string): VtValue {
    return delegate.Get(this.getId(), name)
  }

  /** rprim.h:381-386 */
  getIndexedPrimvar(delegate: HdSceneDelegate, name: TfToken | string,
    indices: { value: number[] } | null): VtValue {
    return delegate.getIndexedPrimvar(this.getId(), name, indices)
  }

  /** rprim.cpp:221-239 */
  getInstancerTransforms(delegate: HdSceneDelegate): GfMatrix4d[] {
    let instancerId = this._instancerId
    const transforms: GfMatrix4d[] = []
    const renderIndex = delegate.getRenderIndex() as unknown as {
      getInstancer?: (id: string) => { getParentId(): string } | null | undefined
    }
    while (instancerId !== '') {
      transforms.push(delegate.getInstancerTransform(instancerId))
      const instancer = renderIndex.getInstancer?.(instancerId)
      instancerId = instancer ? instancer.getParentId() : ''
    }
    return transforms
  }

  /** rprim.cpp:156-160 */
  isDirty(changeTracker: HdRprimChangeTracker): boolean {
    return changeTracker.isRprimDirty(this.getId())
  }

  /** rprim.h:203 */
  isVisible(): boolean { return this._rprimSharedData.visible }

  /** rprim.cpp:162-170 */
  updateReprSelector(delegate: HdSceneDelegate, dirtyBits: HdDirtyBitsRef): void {
    if (HdChangeTracker.isReprDirty(dirtyBits.value, this.getId())) {
      this._authoredReprSelector = delegate.getReprSelector(this.getId())
      dirtyBits.value &= ~HdChangeTracker.DirtyRepr
    }
  }

  /** rprim.cpp:172-177 */
  updateRenderTag(delegate: HdSceneDelegate, _renderParam: HdRenderParam | null | undefined): void {
    this._renderTag = delegate.getRenderTag(this.getId())
  }

  /** Upstream subclasses reach the shared data as `_sharedData`
   *  (rprim.h:296); see the header for the rename. */
  getSharedData(): HdRprimSharedData { return this._rprimSharedData }

  // ---------------------------------------------------------------------- //
  // Rprim Hydra Engine API : Pre-Sync & Sync-Phase (protected)
  // ---------------------------------------------------------------------- //

  /** rprim.h:232 (pure virtual upstream; see the header). */
  protected _propagateDirtyBits(bits: HdDirtyBits): HdDirtyBits { return bits }

  /** rprim.h:249-250 (pure virtual upstream; see the header). */
  protected _initRepr(_reprToken: string, _dirtyBits: HdDirtyBitsRef): void {}

  // ---------------------------------------------------------------------- //
  // Rprim Shared API
  // ---------------------------------------------------------------------- //

  /** rprim.cpp:183-196 */
  protected _getRepr(reprToken: string): HdReprSharedPtr | null {
    const entry = this._reprs.find(([token]) => token === reprToken)
    if (!entry) {
      TF_CODING_ERROR(`_InitRepr() should be called for repr ${reprToken} on prim ${this.getId()}.`)
      return null
    }
    return entry[1]
  }

  /** rprim.cpp:198-205 */
  protected _updateVisibility(delegate: HdSceneDelegate, dirtyBits: HdDirtyBitsRef): void {
    if (HdChangeTracker.isVisibilityDirty(dirtyBits.value, this.getId())) {
      this._rprimSharedData.visible = delegate.getVisible(this.getId())
    }
  }

  /** rprim.cpp:207-219 */
  protected _updateInstancer(delegate: HdSceneDelegate, dirtyBits: HdDirtyBitsRef): void {
    if (HdChangeTracker.isInstancerDirty(dirtyBits.value, this.getId())) {
      const instancerId = delegate.getInstancerId(this.getId())
      if (instancerId === this._instancerId) {
        return
      }
      // If we have a new instancer ID, we need to update the dependency map
      // and also update the stored instancer ID.
      const tracker = delegate.getRenderIndex().getChangeTracker()
      if (this._instancerId !== '') {
        tracker.removeInstancerRprimDependency(this._instancerId, this.getId())
      }
      if (instancerId !== '') {
        tracker.addInstancerRprimDependency(instancerId, this.getId())
      }
      this._instancerId = instancerId
    }
  }
}
