// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdExecImaging/request.cpp,
//  pxr/usdImaging/usdExecImaging/request.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/request.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - Ownership: upstream data sources share ownership of the request
//   (std::shared_ptr, enable_shared_from_this), and the request's
//   ExecUsdSystem, exec request and ObjectsChanged listener are destroyed
//   with the last owner. JavaScript has no destructors, so the owner that
//   drops the request (UsdExecImaging_StageSceneIndex.SetStage) calls
//   _Destroy(), which runs the destructors of those members. A data source
//   that outlives that call reads through a destroyed request and fails the
//   TF_VERIFYs of GetComputedValue.
// - Replacing the engaged std::optional<ExecUsdRequest> in _Rebuild destroys
//   the previous request (move assignment); here the previous request's
//   Destroy() is called first.
// - pxr_tsl::robin_map<SdfPath, HdDataSourceLocatorSet> is a Map keyed by the
//   path string; its iteration order (insertion order here) is the order of
//   TakeDirtiedPrimEntries' result, which upstream leaves unspecified.
// - TRACE_FUNCTION is dropped; TF_DESCRIBE_SCOPE is a TfScopeDescription
//   disposed on scope exit.

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  type ContainerDataSource as HdContainerDataSource, type DirtiedPrimEntry as HdDirtiedPrimEntry,
} from 'typescript-usd/hd'
import { ExecSystem } from 'typescript-usd/exec'
import { ExecUsdSystem, type ExecUsdCacheView, type ExecUsdRequest } from 'typescript-usd/execUsd'
import {
  Debug as TfDebug, Notice as TfNotice, TfScopeDescription, TF_VERIFY, type NoticeKey as TfNoticeKey,
} from 'typescript-usd/tf'
import {
  Notice as UsdNotice, PrimDefaultPredicate as UsdPrimDefaultPredicate, PrimRange as UsdPrimRange,
  usdTimeCodeToStreamString, type Stage as UsdStage, type TimeCode as UsdTimeCode,
} from 'typescript-usd/usd'
import { Value as VtValue } from 'typescript-usd/vt'
import { UsdExecImaging_AdapterRegistry } from './adapterRegistry.ts'
import { UsdExecImagingDebugCodes } from './debugCodes.ts'
import { UsdExecImagingRequestAccessorInterface } from './requestAccessorInterface.ts'
import { UsdExecImaging_RequestBuilder } from './requestBuilder.ts'
import { UsdExecImaging_ValueKeyMapKey, type UsdExecImagingValueKey } from './valueKey.ts'
import { UsdExecImaging_ValueKeyMap } from './valueKeyMap.ts'

const { USDEXECIMAGING_REQUEST, USDEXECIMAGING_GRAPH_AFTER_REBUILD } = UsdExecImagingDebugCodes

/** TF_DESCRIBE_SCOPE for the duration of f. */
function _DescribeScope<T>(description: string, f: () => T): T {
  const scope = new TfScopeDescription(description)
  try {
    return f()
  } finally {
    scope.dispose()
  }
}

/** Requests are always referred to by a shared pointer
 *  (request.h:34-40). */
export type UsdExecImaging_RequestSharedPtr = UsdExecImaging_Request | null

/**
 * The request owns the listener, and the TfNotice API requires listeners be
 * provided as TfWeakPtr (request.cpp:25-63).
 */
class _ObjectsChangedListener {
  private readonly _noticeKey: TfNoticeKey
  private readonly _request: UsdExecImaging_Request

  // Static factory method constructs a new notice listener.
  static new(request: UsdExecImaging_Request, stage: UsdStage): _ObjectsChangedListener {
    return new _ObjectsChangedListener(request, stage)
  }

  // The constructor registers itself as a notice listener.
  private constructor(request: UsdExecImaging_Request, stage: UsdStage) {
    this._request = request
    this._noticeKey = TfNotice.Register(
      UsdNotice.ObjectsChanged,
      (objectsChanged: UsdNotice.ObjectsChanged) => this._objectsChangedCallback(objectsChanged),
      stage)
  }

  // ~_ObjectsChangedListener (request.cpp:50-52).
  _destroy(): void {
    TfNotice.revoke(this._noticeKey)
  }

  // Upon receiving a notice, forward the notice to the request.
  private _objectsChangedCallback(objectsChanged: UsdNotice.ObjectsChanged): void {
    this._request._objectsChangedCallback(objectsChanged)
  }
}

/**
 * The UsdExecImaging_Request manages an ExecUsdRequest used to compute values
 * for imaging (request.h:42-140).
 *
 * UsdExecImaging_Request is the mediator between the scene index and the
 * exec request. It manages building, rebuilding, and computing the
 * contained ExecUsdRequest, as well as tracking the invalidation state of
 * computed values.
 */
export class UsdExecImaging_Request extends UsdExecImagingRequestAccessorInterface {
  private readonly _stage: UsdStage
  private _system: ExecUsdSystem | null = null
  private _request: ExecUsdRequest | null = null
  private _cacheView: ExecUsdCacheView | null = null
  private _valueKeyMap = new UsdExecImaging_ValueKeyMap()
  private _primToDirtyDataSourcesMap = new Map<string, HdDataSourceLocatorSet>()
  private _objectsChangedListener: _ObjectsChangedListener | null = null
  private _graphFileIndex = 0
  private _requiresRebuild = true
  private _requiresRecompute = true

  /** request.cpp:65-77 */
  static new(stage: UsdStage | undefined): UsdExecImaging_RequestSharedPtr {
    TfDebug.msg(USDEXECIMAGING_REQUEST, '[UsdExecImaging_Request::New]\n')

    if (!TF_VERIFY(stage, 'stage') || !stage) {
      return null
    }

    return new UsdExecImaging_Request(stage)
  }

  /** request.cpp:79-90 */
  private constructor(stage: UsdStage) {
    super()
    this._stage = stage
    this._system = new ExecUsdSystem(this._stage)

    // Construct the change listener after the system, in case it immediately
    // receives an ObjectsChanged notice.
    this._objectsChangedListener = _ObjectsChangedListener.new(this, this._stage)
  }

  /** The destructor (request.h: implicit ~UsdExecImaging_Request): members are
   *  destroyed in reverse declaration order, the listener first, then the
   *  exec request and the system. See the header comment. */
  _destroy(): void {
    this._objectsChangedListener?._destroy()
    this._objectsChangedListener = null
    this._cacheView = null
    this._request?.destroy()
    this._request = null
    this._system?.destroy()
    this._system = null
  }

  /**
   * Ensures the request is up-to-date and ready to extract computed values
   * (request.cpp:92-105).
   *
   * This rebuilds and recomputes the request if necessary.
   */
  refresh(): void {
    _DescribeScope('Refreshing UsdExecImaging request', () => {
      TfDebug.msg(USDEXECIMAGING_REQUEST, '[UsdExecImaging_Request::Refresh]\n')

      if (this._requiresRebuild || !this._request || !this._request.isValid()) {
        this._rebuild()
      }
      if (this._requiresRecompute) {
        this._recompute()
      }
    })
  }

  /**
   * Changes the time on the exec system (request.cpp:107-118).
   *
   * This will invalidate time-dependent computed values, calling into
   * prim adapters as needed to accumulate the set of dirtied data source
   * locators. The resulting dirtied prim entries can be obtained by calling
   * TakeDirtedPrimEntries.
   */
  SetTime(timeCode: UsdTimeCode): void {
    TfDebug.msg(USDEXECIMAGING_REQUEST,
      `[UsdExecImaging_Request::SetTime] ${usdTimeCodeToStreamString(timeCode)}\n`)

    // This may invoke _TimeChangedInvalidationCallback.
    this._system!.changeTime(timeCode)
  }

  /** Implements ExecUsdImagingRequestAccessorInterface (request.cpp:120-145). */
  getComputedValue(valueKey: UsdExecImagingValueKey): VtValue {
    TfDebug.msg(USDEXECIMAGING_REQUEST,
      `[UsdExecImaging_Request::GetComputedValue] ${valueKey.providerPath} ${valueKey.computationName}\n`)

    // The request must be ready for extraction.
    if (!TF_VERIFY(!this._requiresRebuild, '!_requiresRebuild') ||
      !TF_VERIFY(!this._requiresRecompute, '!_requiresRecompute') ||
      !TF_VERIFY(this._request, '_request') ||
      !TF_VERIFY(this._request!.isValid(), '_request->IsValid()')) {
      return VtValue.getEmpty()
    }

    // Extract the value key from the cache view, using the value key map to
    // determine the appropriate index. We expect the value key to be found in
    // the map.
    const index = this._valueKeyMap.valueKeyToIndexMap.get(UsdExecImaging_ValueKeyMapKey(valueKey))
    if (index === undefined) {
      TF_VERIFY(false, 'it != _valueKeyMap.valueKeyToIndexMap.end()')
      return VtValue.getEmpty()
    }
    return this._cacheView!.Get(index)
  }

  /**
   * Returns a container data source for primPath that can access computed
   * values from this request (request.cpp:147-172).
   *
   * This function delegates to the GetPrimData method of the corresponding
   * UsdExecImagingPrimAdapterInterface for primPath. That method uses a
   * shared pointer to a UsdExecImagingRequestAccessorInterface to construct
   * data sources that lazily extract values from this request. Since
   * UsdExecImaging_Request IS_A UsdExecImagingRequestAccessorInterface,
   * data sources returned from this method hold shared pointers to this
   * request.
   *
   * If there is no adapter for the prim at primPath, this returns a
   * null data source handle.
   */
  getPrimData(primPath: string): HdContainerDataSource | undefined {
    TfDebug.msg(USDEXECIMAGING_REQUEST, `[UsdExecImaging_Request::GetPrimData] ${primPath}\n`)

    // Check if there is a prim adapter for the prim at primPath. If not, there
    // is no data source for computed values. This is not an error.
    const primAdapter = this._valueKeyMap.primToAdapterMap.get(primPath)
    if (!primAdapter) {
      return undefined
    }

    // Get data sources by delegating to the prim adapter. The adapter may make
    // copies of the requestAccessor (this request).
    return primAdapter.getPrimData(primPath, this)
  }

  /**
   * Returns a vector of dirtied prim entries that identify data sources
   * dirtied by computed value invalidation, which itself may be caused by
   * authored value changes or time changes (request.cpp:174-199).
   *
   * The dirtied entries are moved out of this request, and subsequent calls
   * will return an empty vector unless additional invalidation has occurred.
   */
  takeDirtiedPrimEntries(): HdDirtiedPrimEntry[] {
    const result: HdDirtiedPrimEntry[] = []

    // Move the set of dirty locators from the map into the result vector.
    for (const [primPath, dirtyLocators] of this._primToDirtyDataSourcesMap) {
      if (!dirtyLocators.IsEmpty()) {
        result.push({ primPath, dirtyLocators })
      }
    }

    // The dirty locators have been moved out of the map.
    this._primToDirtyDataSourcesMap.clear()

    return result
  }

  /** Traverses the stage and builds a new exec request for all adapted prims
   *  (request.cpp:201-273). */
  private _rebuild(): void {
    _DescribeScope('Rebuilding UsdExecImaging request', () => {
      TfDebug.msg(USDEXECIMAGING_REQUEST, '[UsdExecImaging_Request::_Rebuild]\n')

      // This method will rebuild the set of dirty data sources.
      this._primToDirtyDataSourcesMap.clear()

      // Prim adapters use this object to add value keys to the request.
      const requestBuilder = new UsdExecImaging_RequestBuilder()

      for (const path of this._stage.traverse()) {
        const prim = this._stage.getPrim(path)!
        // Get the adpater for this prim. If there is no adapter, then skip
        // this prim.
        const primAdapter = UsdExecImaging_AdapterRegistry.getPrimAdapter(prim)
        if (!primAdapter) {
          continue
        }

        // Add value keys for this prim.
        TfDebug.msg(USDEXECIMAGING_REQUEST,
          `[UsdExecImaging_Request::_Rebuild] Adapting prim ${prim.path}\n`)
        requestBuilder.setAdaptedPrim(prim, primAdapter)
        primAdapter.buildRequest(prim, requestBuilder)

        // TODO: Even though the exec request only provides some data sources
        // for the prim, we conservatively invalidate all data sources of the
        // prim when we rebuild the request. This can be optimized in the
        // future.
        this._primToDirtyDataSourcesMap.set(prim.path,
          new HdDataSourceLocatorSet(HdDataSourceLocatorSet.UniversalSet))
      }

      // Build the exec request. Each callback receives the invalid indices
      // (std::bind with _1; the value callback's time interval is unused).
      this._request?.destroy()
      this._request = this._system!.buildRequest(
        requestBuilder.takeValueKeys(),
        (invalidIndices: ReadonlySet<number>) => this._invalidateRequestIndices(invalidIndices),
        (invalidIndices: ReadonlySet<number>) => this._invalidateRequestIndices(invalidIndices))

      // Save the value key map gathered by the request builder.
      this._valueKeyMap = requestBuilder.takeValueKeyMap()

      // The request no longer requires rebuilding, but must be recomputed.
      this._requiresRebuild = false
      this._requiresRecompute = true

      // If enabled, write the exec network to a file.
      if (TfDebug.isEnabled(USDEXECIMAGING_GRAPH_AFTER_REBUILD)) {
        _DescribeScope('Writing exec network to file', () => {
          const filename = `usdExecImaging_Request_${this._graphFileIndex++}.dot`

          TfDebug.msg(USDEXECIMAGING_GRAPH_AFTER_REBUILD,
            `[UsdExecImaging_Request::_Rebuild] Writing ${filename}\n`)

          // Ensure the request has been compiled or else the graph may be empty.
          this._system!.prepareRequest(this._request!)

          const diagnostics = new ExecSystem.Diagnostics(this._system!)
          diagnostics.graphNetwork(filename)
        })
      }
    })
  }

  /** Recomputes the request. This potentially recompiles the network
   *  (request.cpp:275-288). */
  private _recompute(): void {
    _DescribeScope('Recomputing UsdExecImaging request', () => {
      TfDebug.msg(USDEXECIMAGING_REQUEST, '[UsdExecImaging_Request::_Recompute]\n')

      if (!TF_VERIFY(this._request!.isValid(), '_request->IsValid()')) {
        return
      }

      this._cacheView = this._system!.compute(this._request!)
      this._requiresRecompute = false
    })
  }

  /** Common implementation for exec invalidation callbacks. This notifies
   *  the necessary prim adapters for the invalidated indices
   *  (request.cpp:290-326). */
  private _invalidateRequestIndices(invalidIndices: ReadonlySet<number>): void {
    TfDebug.msg(USDEXECIMAGING_REQUEST,
      `[UsdExecImaging_Request::_InvalidateRequestIndices] ${invalidIndices.size} indices\n`)

    const numValueKeys = this._valueKeyMap.indexToValueKeyInfo.length
    for (const valueKeyIndex of invalidIndices) {
      // Look up information about the value key at this index.
      if (!TF_VERIFY(0 <= valueKeyIndex && valueKeyIndex < numValueKeys,
        '0 <= valueKeyIndex && valueKeyIndex < numValueKeys')) {
        continue
      }
      const valueKeyInfo = this._valueKeyMap.indexToValueKeyInfo[valueKeyIndex]!

      // Get or create the set of invalid data source locators for the adapted
      // prim that added the value key at this index.
      let dirtyDataSourceLocators = this._primToDirtyDataSourcesMap.get(valueKeyInfo.adaptedPrimPath)
      if (!dirtyDataSourceLocators) {
        dirtyDataSourceLocators = new HdDataSourceLocatorSet()
        this._primToDirtyDataSourcesMap.set(valueKeyInfo.adaptedPrimPath, dirtyDataSourceLocators)
      }

      // Notify the prim adapter of the invalidated value key. The prim
      // adapter responds by adding data source locators to
      // dirtyDataSourceLocators.
      valueKeyInfo.primAdapter.invalidatePrimData(
        valueKeyInfo.adaptedPrimPath,
        valueKeyInfo.valueKey,
        dirtyDataSourceLocators)
    }

    // The request needs to be recomputed.
    this._requiresRecompute = true
  }

  /** @internal Invoked when the underlying stage emits an ObjectsChanged
   *  notice (request.cpp:328-389); called by _ObjectsChangedListener. */
  _objectsChangedCallback(objectsChanged: UsdNotice.ObjectsChanged): void {
    TfDebug.msg(USDEXECIMAGING_REQUEST, '[UsdExecImaging_Request::_ObjectsChangedCallback]\n')

    // The purpose of this method is to detect when the request must be rebuilt
    // due to the addition of new prims that require exec for imaging. If the
    // request is already slated to be rebuilt, then we can avoid re-traversing
    // the scene entirely.
    if (this._requiresRebuild || !this._request || !this._request.isValid()) {
      return
    }

    for (const resyncedPath of objectsChanged.getResyncedPaths()) {
      // Get the resynced prim. If the prim is inactive, undefined, not
      // loaded, or abstract, then we do not traverse this prim's hierarchy.
      // If this prim or any of its descendants are providers for value keys
      // in the exec request, then exec already expires the request for us.
      const resyncedPrim = this._stage.getPrim(resyncedPath)
      if (!resyncedPrim || !resyncedPrim.isValid() || !UsdPrimDefaultPredicate.evaluate(resyncedPrim)) {
        continue
      }

      // Otherwise, the prim still exists or it has been added by the resync.
      // Traverse the hierarchy rooted at the resynced prim in search of
      // descendant prims whose adapters have changed.
      for (const prim of UsdPrimRange.fromPrim(resyncedPrim)) {
        // Get the old prim adapter.
        const oldPrimAdapter = this._valueKeyMap.primToAdapterMap.get(prim.path) ?? null

        // Get the new prim adapter.
        const newPrimAdapter = UsdExecImaging_AdapterRegistry.getPrimAdapter(prim)

        // If an adapted prim has been resynced, then the leaf nodes for the
        // prim's value keys have likely been uncompiled. The request should
        // be recompiled.
        if (oldPrimAdapter) {
          this._requiresRecompute = true
        }

        // If the adapter has changed, then the request must be rebuilt, and
        // there is no need to continue traversing the scene.
        if (oldPrimAdapter !== newPrimAdapter) {
          TfDebug.msg(USDEXECIMAGING_REQUEST,
            `[UsdExecImaging_Request::_ObjectsChangedCallback] Adapter changed for prim ${prim.path} \n`)

          this._requiresRebuild = true
          return
        }
      }
    }
  }
}
