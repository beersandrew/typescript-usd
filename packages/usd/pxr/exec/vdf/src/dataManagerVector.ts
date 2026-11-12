// Ported from OpenUSD 26.11.1: pxr/exec/vdf/dataManagerVector.cpp,
//  pxr/exec/vdf/dataManagerVector.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/dataManagerVector.h and
// pxr/exec/vdf/dataManagerVector.cpp.
//
// VdfDataManagerVector<DeallocationMode> is a class whose constructor takes
// the deallocation mode. Executors take data manager *types* (zero-argument
// constructors, see dataManagerBasedExecutor.ts); VdfDataManagerVector.Of(mode)
// returns the type for a mode, the TS counterpart of the template
// instantiation VdfDataManagerVector<mode>.
//
// The C++ destructor deallocates the data vector through the shared
// allocator; it is kept as Destroy(), called by the executor's Destroy().

import { VdfExecutorDataManager } from './executorDataManager.ts'
import type { VdfExecutorBufferData } from './executorBufferData.ts'
import type { VdfExecutorInvalidationData } from './executorInvalidationData.ts'
import { Vdf_DataManagerAllocator } from './dataManagerAllocator.ts'
import { Vdf_ExecutorDataVector } from './executorDataVector.ts'
import type { VdfNetwork } from './network.ts'
import { VdfOutput } from './output.ts'
import type { VdfSMBLData } from './smblData.ts'

/**
 * VdfDataManagerDeallocationMode (dataManagerVector.h:25-34): the
 * deallocation strategy for the data manager.
 */
export enum VdfDataManagerDeallocationMode {
  /** Deallocate in the background. */
  Background = 0,
  /** Deallocate immediately. */
  Immediate,
}

// dataManagerVector.cpp:15-18: the vector data allocator shared between all
// VdfDataManagerVector instances.
let _allocator: Vdf_DataManagerAllocator<Vdf_ExecutorDataVector> | null = null
function _GetAllocator(): Vdf_DataManagerAllocator<Vdf_ExecutorDataVector> {
  return _allocator ??= new Vdf_DataManagerAllocator(() => new Vdf_ExecutorDataVector())
}

/** Vdf_DataManagerVectorAllocate (dataManagerVector.cpp:20-24). */
export function Vdf_DataManagerVectorAllocate(network: VdfNetwork): Vdf_ExecutorDataVector {
  return _GetAllocator().allocate(network)
}

/** Vdf_DataManagerVectorDeallocateNow (dataManagerVector.cpp:26-30). */
export function Vdf_DataManagerVectorDeallocateNow(data: Vdf_ExecutorDataVector | null): void {
  _GetAllocator().deallocateNow(data)
}

/**
 * Vdf_DataManagerVectorDeallocateLater (dataManagerVector.cpp:32-36).
 * Without concurrency the allocator releases synchronously.
 */
export function Vdf_DataManagerVectorDeallocateLater(data: Vdf_ExecutorDataVector | null): void {
  _GetAllocator().deallocateLater(data)
}

// The memoized VdfDataManagerVector<Mode> types returned by Of().
const _typesByMode = new Map<VdfDataManagerDeallocationMode, new () => VdfDataManagerVector>()

/**
 * VdfDataManagerVector (dataManagerVector.h:93-270): a data manager for
 * executors that stores data in a vector indexed by output ids. Its data
 * handle is an index (Vdf_ExecutorDataVector::DataHandle).
 */
export class VdfDataManagerVector extends VdfExecutorDataManager<number> {
  /**
   * The type VdfDataManagerVector<mode>: a zero-argument constructor of data
   * managers with the given deallocation mode.
   */
  static of(mode: VdfDataManagerDeallocationMode): new () => VdfDataManagerVector {
    let type = _typesByMode.get(mode)
    if (!type) {
      type = class extends VdfDataManagerVector {
        constructor() {
          super(mode)
        }
      }
      _typesByMode.set(mode, type)
    }
    return type
  }

  // dataManagerVector.h:268: the Vdf_ExecutorDataVector holding the data.
  private _data: Vdf_ExecutorDataVector | null = null

  private readonly _deallocationMode: VdfDataManagerDeallocationMode

  /** Constructor (dataManagerVector.h:114). */
  constructor(deallocationMode: VdfDataManagerDeallocationMode) {
    super()
    this._deallocationMode = deallocationMode
  }

  /** The deallocation mode (the DeallocationMode template argument). */
  getDeallocationMode(): VdfDataManagerDeallocationMode {
    return this._deallocationMode
  }

  /**
   * The destructor (dataManagerVector.h:274-282). Background deallocation
   * is synchronous without concurrency.
   * PLATFORM-DIVERGENCE(openexec-background-dealloc):
   * VdfDataManagerDeallocationMode::Background deallocates on a background
   * thread (dataManagerAllocator.h:214-232) -> frees immediately here; a
   * worker-based deallocator would restore the background release.
   */
  destroy(): void {
    if (this._deallocationMode === VdfDataManagerDeallocationMode.Immediate) {
      Vdf_DataManagerVectorDeallocateNow(this._data)
    } else {
      Vdf_DataManagerVectorDeallocateLater(this._data)
    }
    this._data = null
  }

  /** Resize (dataManagerVector.h:284-297). */
  resize(network: VdfNetwork): void {
    // Allocate a new Vdf_ExecutorDataVector if necessary.
    if (!this._data) {
      this._data = Vdf_DataManagerVectorAllocate(network)
    }

    // Otherwise, make sure to resize our current instance.
    else {
      this._data.resize(network)
    }
  }

  /** IsValidDataHandle (dataManagerVector.h:130-132). */
  isValidDataHandle(handle: number): boolean {
    return handle !== Vdf_ExecutorDataVector.InvalidHandle
  }

  /** GetOrCreateDataHandle (dataManagerVector.h:139-141). */
  getOrCreateDataHandle(outputId: number): number {
    return this._data!.getOrCreateDataHandle(outputId)
  }

  /** GetDataHandle (dataManagerVector.h:147-151). */
  getDataHandle(outputId: number): number {
    return this._data
      ? this._data.getDataHandle(outputId)
      : Vdf_ExecutorDataVector.InvalidHandle
  }

  /** GetBufferData (dataManagerVector.h:158-160). */
  getBufferData(handle: number): VdfExecutorBufferData {
    return this._data!.getBufferData(handle)
  }

  /** GetInvalidationData (dataManagerVector.h:168-171). */
  getInvalidationData(handle: number): VdfExecutorInvalidationData {
    return this._data!.getInvalidationData(handle)
  }

  /**
   * GetInvalidationTimestamp (dataManagerVector.h:175-186). Without a handle,
   * the base class's current timestamp (`using Base::GetInvalidationTimestamp`).
   */
  override getInvalidationTimestamp(handle?: number): number {
    if (handle === undefined) {
      return super.getInvalidationTimestamp()
    }
    return this._data!.getInvalidationTimestamp(handle)
  }

  /** SetInvalidationTimestamp (dataManagerVector.h:193-197). */
  setInvalidationTimestamp(handle: number, timestamp: number): void {
    this._data!.setInvalidationTimestamp(handle, timestamp)
  }

  /** GetSMBLData (dataManagerVector.h:206-208). */
  getSMBLData(handle: number): VdfSMBLData | null {
    return this._data!.getSMBLData(handle)
  }

  /** GetOrCreateSMBLData (dataManagerVector.h:216-218). */
  getOrCreateSMBLData(handle: number): VdfSMBLData {
    return this._data!.getOrCreateSMBLData(handle)
  }

  /** IsTouched (dataManagerVector.h:226-228). */
  isTouched(handle: number): boolean {
    return this._data!.isTouched(handle)
  }

  /**
   * Touch (dataManagerVector.h:236-238). With a VdfOutput, the base class's
   * Touch(const VdfOutput &) (executorDataManager.h:549-554).
   */
  override touch(handleOrOutput: number | VdfOutput): void {
    if (handleOrOutput instanceof VdfOutput) {
      super.touch(handleOrOutput)
      return
    }
    this._data!.touch(handleOrOutput)
  }

  /** Untouch (dataManagerVector.h:246-248). */
  untouch(handle: number): boolean {
    return this._data!.untouch(handle)
  }

  /** ClearDataForOutput (dataManagerVector.h:299-311). */
  clearDataForOutput(outputId: number): void {
    // Clear the data associated with the given output (if it exists).
    if (this._data) {
      const dataHandle = this._data.getDataHandle(outputId)
      if (this.isValidDataHandle(dataHandle)) {
        this._data.Reset(dataHandle, outputId)
      }
    }
  }

  /** Clear (dataManagerVector.h:313-321). */
  clear(): void {
    if (this._data) {
      this._data.clear()
    }
  }

  /** IsEmpty (dataManagerVector.h:260-262). */
  IsEmpty(): boolean {
    return !this._data || this._data.getNumData() === 0
  }
}
