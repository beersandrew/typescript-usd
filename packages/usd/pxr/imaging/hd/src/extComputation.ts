// Ported from OpenUSD 26.11.1: pxr/imaging/hd/extComputation.cpp,
//  pxr/imaging/hd/extComputation.h, pxr/imaging/hd/sceneDelegate.h,
//  pxr/imaging/hd/testenv/testHdExtCompDependencySort.cpp
// Copyright 2016, 2017, 2021 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/extComputation.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - Ids are path strings, as elsewhere in typescript-usd/hd.
// - HdExtComputation{Input,Output}Descriptor (sceneDelegate.h) are declared
//   here, where the earlier slice of this port declared them.
// - _SetDescriptors is not upstream: it sets the members Sync sets, for the
//   HdExtComputationUtils tests that build computations without a scene
//   delegate (testHdExtCompDependencySort.cpp sets them through a delegate).
// - TF_DEBUG(HD_EXT_COMPUTATION_UPDATED) messages are not emitted.

import { TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import type { HdDirtyBits } from './changeTracker.ts'
import type { HdDirtyBitsRef } from './dirtyBitsTranslator.ts'
import type { HdRenderParam } from './renderDelegate.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import type { HdSceneIndexPrim } from './sceneIndex.ts'
import { HdSprim } from './sprim.ts'
import { TF_VERIFY } from './tfDiagnostic.ts'
import { HdTokens } from './tokens.ts'

/** sceneDelegate.h:226-249 HdExtComputationInputDescriptor. Describes a
 *  computation input that is sourced from the output of another
 *  computation. */
export interface HdExtComputationInputDescriptor {
  name: string
  sourceComputationId: string
  sourceComputationOutputName: string
}

/** sceneDelegate.h:251-271 HdExtComputationOutputDescriptor. */
export interface HdExtComputationOutputDescriptor {
  name: string
  valueType?: unknown
}

/** extComputation.cpp:17-18 */
const HD_ENABLE_SHARED_EXT_COMPUTATION_DATA = new TfEnvSetting(
  'HD_ENABLE_SHARED_EXT_COMPUTATION_DATA', 1,
  'Enable sharing of ext computation data buffers')

/** size_t of a VtValue holding an integral value (VtValue::Get<size_t>). */
function _SizeT(value: VtValue | unknown): number {
  const v = value instanceof VtValue ? value.UncheckedGet<unknown>() : value
  return Number(v ?? 0)
}

/** extComputation.h:27-176. Hydra Representation of a Client defined
 *  computation.
 *
 *  A computation provides a way to procedurally generate a primvar.
 *
 *  It represents a basic Input -> Processing -> Output model.
 *
 *  Primarily inputs are provided by the scene delegate via the Get() API.
 *  However, an input can also be another computation.
 *
 *  Outputs are explicitly named and are referenced by primvars (see
 *  HdExtComputationPrimvarDescriptor).
 *
 *  Computations with no outputs act as input aggregators. */
export class HdExtComputation extends HdSprim {
  /** extComputation.h:44-63 */
  static readonly Clean = 0
  static readonly DirtyInputDesc = 1 << 0
  static readonly DirtyOutputDesc = 1 << 1
  static readonly DirtyElementCount = 1 << 2
  static readonly DirtySceneInput = 1 << 3
  static readonly DirtyCompInput = 1 << 4
  static readonly DirtyKernel = 1 << 5
  static readonly DirtyDispatchCount = 1 << 6
  static readonly AllDirty = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) |
    (1 << 4) | (1 << 5) | (1 << 6)

  private _dispatchCount = 0
  private _elementCount = 0
  private _sceneInputNames: string[] = []
  private _computationInputs: HdExtComputationInputDescriptor[] = []
  private _computationOutputs: HdExtComputationOutputDescriptor[] = []
  private _gpuKernelSource = ''

  /** extComputation.cpp:28-37 */
  constructor(id: string) {
    super(id)
  }

  /** extComputation.cpp:41-46 */
  override sync(
    sceneDelegateOrPrim: HdSceneDelegate | HdSceneIndexPrim,
    renderParamOrDirtyBits: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBits?: HdDirtyBitsRef,
  ): void {
    this._sync(sceneDelegateOrPrim as HdSceneDelegate,
      renderParamOrDirtyBits as HdRenderParam | null | undefined, dirtyBits!)
  }

  /** extComputation.cpp:48-121 */
  protected _sync(
    sceneDelegate: HdSceneDelegate,
    _renderParam: HdRenderParam | null | undefined,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    if (!TF_VERIFY(sceneDelegate !== null && sceneDelegate !== undefined)) {
      return
    }

    const bits = dirtyBits.value
    const id = this.getId()

    if (bits & HdExtComputation.DirtyInputDesc) {
      this._sceneInputNames =
        sceneDelegate.getExtComputationSceneInputNames(id)
      this._computationInputs =
        sceneDelegate.getExtComputationInputDescriptors(id)
    }

    if (bits & HdExtComputation.DirtyOutputDesc) {
      this._computationOutputs =
        sceneDelegate.getExtComputationOutputDescriptors(id)
    }

    if (bits & HdExtComputation.DirtyDispatchCount) {
      const vtDispatchCount =
        sceneDelegate.getExtComputationInput(id, HdTokens.dispatchCount)
      // For backward compatibility, allow the dispatch count to be empty.
      this._dispatchCount = vtDispatchCount && !vtDispatchCount.IsEmpty()
        ? _SizeT(vtDispatchCount) : 0
    }

    if (bits & HdExtComputation.DirtyElementCount) {
      const vtElementCount =
        sceneDelegate.getExtComputationInput(id, HdTokens.elementCount)
      // For backward compatibility, allow the element count to be empty.
      this._elementCount = vtElementCount && !vtElementCount.IsEmpty()
        ? _SizeT(vtElementCount) : 0
    }

    if (bits & HdExtComputation.DirtyKernel) {
      this._gpuKernelSource = sceneDelegate.getExtComputationKernel(id)
      // XXX we should update any created GPU computations as well
      // with the new kernel if we want to provide a good editing flow.
    }

    // Clear processed bits
    dirtyBits.value &= ~(HdExtComputation.DirtyInputDesc |
      HdExtComputation.DirtyOutputDesc | HdExtComputation.DirtyDispatchCount |
      HdExtComputation.DirtyElementCount | HdExtComputation.DirtyKernel)
    // XXX: DirtyCompInput isn't used yet.
    dirtyBits.value &= ~HdExtComputation.DirtyCompInput
  }

  /** extComputation.cpp:123-127 */
  override getInitialDirtyBitsMask(): HdDirtyBits {
    return HdExtComputation.AllDirty
  }

  /** extComputation.cpp:129-133 */
  getDispatchCount(): number {
    return this._dispatchCount > 0 ? this._dispatchCount : this._elementCount
  }

  /** extComputation.h:95-96 */
  getElementCount(): number { return this._elementCount }

  /** extComputation.h:98-101 */
  getSceneInputNames(): string[] {
    return this._sceneInputNames
  }

  /** extComputation.cpp:135-145 */
  getOutputNames(): string[] {
    return this._computationOutputs.map((o) => o.name)
  }

  /** extComputation.h:107-111 */
  getComputationInputs(): HdExtComputationInputDescriptor[] {
    return this._computationInputs
  }

  /** extComputation.h:113-117 */
  getComputationOutputs(): HdExtComputationOutputDescriptor[] {
    return this._computationOutputs
  }

  /** extComputation.h:119-123 */
  getGpuKernelSource(): string {
    return this._gpuKernelSource
  }

  /** extComputation.cpp:147-154. Computations with no outputs act as input
   *  aggregators, i.e. schedule inputs for resolution, but don't directly
   *  schedule execution of a computation. */
  isInputAggregation(): boolean {
    return this._computationOutputs.length === 0
  }

  /** extComputation.cpp:20-26 */
  protected static _isEnabledSharedExtComputationData(): boolean {
    return TfGetEnvSetting(HD_ENABLE_SHARED_EXT_COMPUTATION_DATA) === 1
  }

  /** Not upstream (see the header). */
  _setDescriptors(
    sceneInputNames: string[],
    computationInputs: HdExtComputationInputDescriptor[],
    computationOutputs: HdExtComputationOutputDescriptor[],
  ): void {
    this._sceneInputNames = sceneInputNames
    this._computationInputs = computationInputs
    this._computationOutputs = computationOutputs
  }
}
