// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extComputation.cpp,
//  pxr/imaging/hdSt/extComputation.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extComputation.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - _ComputeSharedComputationInputId hashes the source hashes with
//   TfHashCombine (ArchHash64 over each size_t upstream); the id is only a
//   registry key.
// - TF_DEBUG(HD_EXT_COMPUTATION_UPDATED / HD_SHARED_EXT_COMPUTATION_DATA)
//   messages are not emitted.

import { HashCombine as TfHashCombine } from 'typescript-usd/tf'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec, ExtComputation as HdExtComputation,
  PrimTypeTokens as HdPrimTypeTokens, VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange, type BufferSource as HdBufferSource,
  type DirtyBits as HdDirtyBits, type RenderParam as HdRenderParam,
  type SceneDelegate as HdSceneDelegate, type SceneIndexPrim as HdSceneIndexPrim,
  type DirtyBitsRef as HdDirtyBitsRef,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { HdStMarkGarbageCollectionNeeded } from './primUtils.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** extComputation.cpp:44-55. De-duplicating and sharing of ExtComputation
 *  data: data is identified by a hash of the sources of the data. For now,
 *  buffer data allocated here is read-only and is never mutated. */
function _ComputeSharedComputationInputId(
  baseId: bigint, sources: readonly HdBufferSource[],
): bigint {
  let inputId = baseId
  for (const bufferSource of sources) {
    const sourceId = bufferSource.computeHash()
    inputId = TfHashCombine(sourceId, inputId)
  }
  return inputId
}

/** extComputation.cpp:57-73 */
function _AllocateComputationDataRange(
  inputs: HdBufferSource[],
  resourceRegistry: HdStResourceRegistry,
): HdBufferArrayRange | null {
  const bufferSpecs = HdBufferSpec.getBufferSpecs(inputs)

  const inputRange =
    resourceRegistry.allocateShaderStorageBufferArrayRange(
      HdPrimTypeTokens.extComputation,
      bufferSpecs,
      HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
  resourceRegistry.addSources(inputRange, inputs)

  return inputRange
}

/** extComputation.h:23-57. Specialization of HdExtComputation which manages
 *  inputs as GPU resources. */
export class HdStExtComputation extends HdExtComputation {
  private _inputRange: HdBufferArrayRange | null = null

  /** extComputation.cpp:26-30 */
  constructor(id: string) {
    super(id)
  }

  /** extComputation.cpp:75-213 */
  override sync(
    sceneDelegateOrPrim: HdSceneDelegate | HdSceneIndexPrim,
    renderParamOrDirtyBits: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBitsRef?: HdDirtyBitsRef,
  ): void {
    const sceneDelegate = sceneDelegateOrPrim as HdSceneDelegate
    const renderParam = renderParamOrDirtyBits as HdRenderParam | null | undefined
    const dirtyBits = dirtyBitsRef!

    this._sync(sceneDelegate, renderParam, dirtyBits)

    // During Sprim sync, we only commit GPU resources when directly executing
    // a GPU computation or when aggregating inputs for a downstream
    // computation.
    // Note: For CPU computations, we pull the inputs when we create the
    // HdStExtCompCpuComputation, which happens during Rprim sync.
    if (this.getGpuKernelSource() === '' && !this.isInputAggregation()) {
      return
    }

    if (!(dirtyBits.value & HdExtComputation.DirtySceneInput)) {
      // No scene inputs to sync. All other computation dirty bits (barring
      // DirtyCompInput) are sync'd in HdExtComputation::_Sync.
      return
    }

    const renderIndex = sceneDelegate.getRenderIndex()
    const resourceRegistry =
      renderIndex.getResourceRegistry() as unknown as HdStResourceRegistry

    const capabilities = resourceRegistry.getHgi().getCapabilities()
    const doublesSupported = capabilities?.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision) ?? false

    const inputs: HdBufferSource[] = []
    for (const inputName of this.getSceneInputNames()) {
      const inputValue = sceneDelegate.getExtComputationInput(
        this.getId(), inputName)
      const arraySize =
        inputValue.isArrayValued() ? inputValue.getArraySize() : 1
      const inputSource = new HdVtBufferSource(inputName, inputValue,
        arraySize, doublesSupported)
      if (inputSource.isValid()) {
        inputs.push(inputSource)
      } else {
        TF_WARN(`Unsupported type ${inputValue.getType().getTypeName()} for ` +
          `source ${inputName} in extComputation ${this.getId()}.`)
      }
    }

    // Store the current range to know if garbage collection  is necessary.
    const prevRange = this._inputRange

    if (inputs.length !== 0) {
      if (HdStExtComputation._isEnabledSharedExtComputationData() &&
          this.isInputAggregation()) {
        const inputId = _ComputeSharedComputationInputId(0n, inputs)

        const barInstance =
          resourceRegistry.registerExtComputationDataRange(inputId)

        if (barInstance.isFirstInstance()) {
          // Allocate the first buffer range for this input key
          this._inputRange = _AllocateComputationDataRange(inputs,
            resourceRegistry)
          barInstance.setValue(this._inputRange!)
        } else {
          // Share the existing buffer range for this input key
          this._inputRange = barInstance.GetValue()
        }
      } else {
        // We're not sharing.

        // We don't yet have the ability to track dirtiness per scene input.
        // Each time DirtySceneInput is set, we pull and upload _all_ the
        // scene inputs.
        // This means that BAR migration isn't necessary, and so we avoid
        // using the Update*BufferArrayRange flavor of methods in
        // HdStResourceRegistry and handle allocation/upload manually.

        if (!this._inputRange || !this._inputRange.isValid()) {
          // Allocate a new BAR if we haven't already.
          this._inputRange = _AllocateComputationDataRange(
            inputs, resourceRegistry)
        } else {
          const inputSpecs = HdBufferSpec.getBufferSpecs(inputs)
          const barSpecs = this._inputRange.getBufferSpecs()

          const useExistingRange =
            HdBufferSpec.isSubset(/*subset*/inputSpecs,
              /*superset*/barSpecs)
          if (useExistingRange) {
            resourceRegistry.addSources(this._inputRange, inputs)
          } else {
            this._inputRange = _AllocateComputationDataRange(
              inputs, resourceRegistry)
          }
        }
      }

      if (prevRange !== this._inputRange) {
        // The member's shared_ptr assignment (FAITHFULNESS-DEBT(
        // hd-bar-shared-ptr), hd/src/bufferArrayRange.ts).
        this._inputRange?._retain()
        prevRange?.release()
      }

      if (prevRange && (prevRange !== this._inputRange)) {
        // Make sure that we also release any stale input range data
        HdStMarkGarbageCollectionNeeded(renderParam)
      }
    }

    dirtyBits.value &= ~HdExtComputation.DirtySceneInput
  }

  /** extComputation.cpp:215-220 */
  finalize(renderParam: HdRenderParam | null | undefined): void {
    // Release input range data.
    HdStMarkGarbageCollectionNeeded(renderParam)
  }

  /** The destructor (~HdStExtComputation): drops _inputRange. */
  destroy(): void {
    const range = this._inputRange
    this._inputRange = null
    range?.release()
  }

  /** extComputation.h:46-48 */
  getInputRange(): HdBufferArrayRange | null {
    return this._inputRange
  }
}
