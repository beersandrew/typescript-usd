// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/instancer.cpp,
//  pxr/imaging/hdSt/instancer.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/instancer.{h,cpp} (OpenUSD 26.11.1).
//
// Deliberate divergences (each also noted at its site):
// - SdfPath ids are path strings; the empty path is ''.
// - std::vector<VtIntArray>* out-parameter is a caller-provided array; the
//   instance index arrays are number[].
// - The HD_INSTANCER_UPDATED messages print the arrays with
//   Array.prototype.join instead of VtArray's operator<<.
// - HD_TRACE_FUNCTION / HF_MALLOC_TAG_FUNCTION are not ported.

import { Debug as TfDebug, type Token as TfToken } from 'typescript-usd/tf'
import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import type { Array as VtArray } from 'typescript-usd/vt'
import {
  BufferArrayUsageHintBits as HdBufferArrayUsageHintBits,
  BufferSpec as HdBufferSpec,
  ChangeTracker as HdChangeTracker,
  DebugCodes as HdDebugCodes,
  Instancer as HdInstancer,
  InstancerTokens as HdInstancerTokens,
  Tokens as HdTokens,
  VtBufferSource as HdVtBufferSource,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSource as HdBufferSource,
  type DirtyBitsRef as HdDirtyBitsRef,
  type RenderParam as HdRenderParam,
  type SceneDelegate as HdSceneDelegate,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import {
  HdStCanSkipBARAllocationOrUpdate,
  HdStGetInstancerPrimvarDescriptors,
  HdStGetRemovedOrReplacedPrimvarBufferSpecs,
} from './primUtils.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** instancer.h:30-109 */
export class HdStInstancer extends HdInstancer {
  // # of entries in an instance primvar.  This should be consistent between
  // all primvars, and also consistent with the instance indices (meaning
  // no instance index is out-of-range).
  private _instancePrimvarNumElements = 0

  // The BAR of the instance primvars for this instancer.
  // (Note: instance indices are computed per prototype and the rprim owns
  // the bar).
  private _instancePrimvarRange: HdBufferArrayRange | null = null

  private _transform = new GfMatrix4d(1.0)
  private _transformInverse = new GfMatrix4d(1.0)

  // Visibility
  private _visible = true
  private _hasDisplayOpacity = false
  private _hasNormals = false

  /** instancer.cpp:21-31 */
  constructor(delegate: HdSceneDelegate, id: string) {
    super(delegate, id)
  }

  /** instancer.cpp:33-55. Updates the instance primvar buffers.
   *  XXX: Note, this is currently called from rprimUtils instead of the
   *  render index sync phase, so it needs to take a mutex. */
  override sync(
    sceneDelegate: HdSceneDelegate,
    _renderParam: HdRenderParam | null | undefined,
    dirtyBits: HdDirtyBitsRef,
  ): void {
    const instancerId = this.getId()

    if (dirtyBits.value & HdChangeTracker.DirtyVisibility) {
      this._visible = sceneDelegate.getVisible(instancerId)
    }

    if (dirtyBits.value & HdChangeTracker.DirtyTransform) {
      this._transform = sceneDelegate.getInstancerTransform(instancerId)
      this._transformInverse = this._transform.getInverse()
    }

    this._updateInstancer(sceneDelegate, dirtyBits)
    if (HdChangeTracker.isAnyPrimvarDirty(dirtyBits.value, instancerId)) {
      this._syncPrimvars(sceneDelegate, dirtyBits)
    }
  }

  /** instancer.h:38-40 */
  /** The destructor (~HdStInstancer): drops _instancePrimvarRange. */
  destroy(): void {
    const range = this._instancePrimvarRange
    this._instancePrimvarRange = null
    range?.release()
  }

  getInstancePrimvarRange(): HdBufferArrayRange | null {
    return this._instancePrimvarRange
  }

  /** instancer.cpp:57-61. Returns whether "displayOpacity" is defined as an
   *  instance primvar. */
  hasDisplayOpacity(): boolean {
    return this._hasDisplayOpacity
  }

  /** instancer.cpp:63-67. Returns whether "normals" is defined as an
   *  instance primvar. */
  hasNormals(): boolean {
    return this._hasNormals
  }

  /** instancer.cpp:69-73. Returns the instancer (prim) transform. */
  getTransform(): GfMatrix4d {
    return this._transform
  }

  /** instancer.cpp:75-79. Returns the instancer (prim) transform inverse. */
  getTransformInverse(): GfMatrix4d {
    return this._transformInverse
  }

  /** instancer.cpp:81-201 */
  protected _syncPrimvars(sceneDelegate: HdSceneDelegate, dirtyBits: HdDirtyBitsRef): void {
    const instancerId = this.getId()

    const primvars = HdStGetInstancerPrimvarDescriptors(this, sceneDelegate)

    const sources: HdBufferSource[] = []

    const resourceRegistry =
      sceneDelegate.getRenderIndex().getResourceRegistry() as HdStResourceRegistry

    // Reset _instancePrimvarNumElements, in case the number of instances
    // is varying.
    this._instancePrimvarNumElements = 0

    this._hasDisplayOpacity = false
    this._hasNormals = false

    for (const primvar of primvars) {
      const value = sceneDelegate.Get(instancerId, primvar.name)
      if (!value.IsEmpty()) {
        let source: HdBufferSource | null = null
        if (primvar.name === HdInstancerTokens.instanceTransforms) {
          if (value.getTypeName() === 'GfMatrix4d[]') {
            // Explicitly invoke the c'tor taking a
            // VtArray<GfMatrix4d> to ensure we properly convert to
            // the appropriate floating-point matrix type.
            const capabilities = resourceRegistry.getHgi().getCapabilities()!
            const doublesSupported = capabilities.isSet(
              HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsShaderDoublePrecision)
            source = new HdVtBufferSource(
              primvar.name,
              value.UncheckedGet<VtArray<GfMatrix4d>>(),
              1,
              doublesSupported)
          } else if (value.getTypeName() === 'GfMatrix4f[]') {
            source = new HdVtBufferSource(
              primvar.name,
              value,
              1,
              false)
          }
        } else {
          source = new HdVtBufferSource(primvar.name, value)
        }

        // instancer.cpp:135-140 dereferences source unconditionally; an
        // instanceTransforms value of another type leaves it null upstream
        // too (undefined behaviour), so it is skipped here.
        if (!source) {
          continue
        }

        // This is a defensive check, but ideally we would not be sent
        // empty arrays from the client. Once UsdImaging can fulfill
        // this contract efficiently, this check should emit a coding
        // error.
        if (source.getNumElements() === 0) {
          continue
        }

        // Latch onto the first numElements we see.
        const numElements = source.getNumElements()
        if (this._instancePrimvarNumElements === 0) {
          this._instancePrimvarNumElements = numElements
        }

        if (numElements !== this._instancePrimvarNumElements) {
          // This primvar buffer is in a bad state; we can't have
          // different numbers of instances per primvar.  Trim to the
          // lower value.  Note: later on, we also trim the instance
          // indices to be in this smaller range.
          //
          // This is recovery code; the scene delegate shouldn't let
          // us get here...
          TF_WARN(`Inconsistent number of '${primvar.name}' values ` +
            `(${source.getNumElements()} vs ${this._instancePrimvarNumElements}) ` +
            `for <${instancerId}>.`)
          this._instancePrimvarNumElements =
            Math.min(numElements, this._instancePrimvarNumElements)
        }

        sources.push(source)

        this._hasDisplayOpacity = this._hasDisplayOpacity ||
          (primvar.name === HdTokens.displayOpacity)
        this._hasNormals = this._hasNormals ||
          (primvar.name === HdTokens.normals)
      }
    }

    if (!HdStCanSkipBARAllocationOrUpdate(
      sources, this._instancePrimvarRange, dirtyBits.value)) {
      // XXX: This should be based off the DirtyPrimvarDesc bit.
      const hasDirtyPrimvarDesc = (dirtyBits.value & HdChangeTracker.DirtyPrimvar) !== 0
      const bufferSpecs: HdBufferSpec[] = []
      HdBufferSpec.getBufferSpecs(sources, bufferSpecs)

      let removedSpecs: HdBufferSpec[] = []
      if (hasDirtyPrimvarDesc) {
        const internallyGeneratedPrimvars: TfToken[] = [] // none
        removedSpecs = HdStGetRemovedOrReplacedPrimvarBufferSpecs(
          this._instancePrimvarRange, primvars,
          internallyGeneratedPrimvars, bufferSpecs, instancerId)
      }

      // Update local primvar range.
      const prevRange = this._instancePrimvarRange
      this._instancePrimvarRange =
        resourceRegistry.updateNonUniformBufferArrayRange(
          HdTokens.primvar, this._instancePrimvarRange, bufferSpecs,
          removedSpecs, HdBufferArrayUsageHintBits.HdBufferArrayUsageHintBitsStorage)
      if (prevRange !== this._instancePrimvarRange) {
        // The member's shared_ptr assignment (FAITHFULNESS-DEBT(
        // hd-bar-shared-ptr), hd/src/bufferArrayRange.ts).
        this._instancePrimvarRange?._retain()
        prevRange?.release()
      }

      TF_VERIFY(this._instancePrimvarRange!.isValid())

      // schedule to sync gpu
      if (sources.length !== 0) {
        resourceRegistry.addSources(
          this._instancePrimvarRange, sources)
      }
    }
  }

  /** instancer.cpp:203-258 */
  protected _getInstanceIndices(
    prototypeId: string,
    instanceIndicesArray: number[][],
  ): void {
    const instancerId = this.getId()

    let instanceIndices: number[] = []

    if (this._visible) {
      instanceIndices =
        [...this.getDelegate().getInstanceIndices(instancerId, prototypeId)]

      // quick sanity check
      // instance indices should not exceed the size of instance primvars.
      for (const index of instanceIndices) {
        if (index >= this._instancePrimvarNumElements) {
          TF_WARN('Instance index exceeds the element count of instance ' +
            `primvars (${index} >= ${this._instancePrimvarNumElements}) ` +
            `for <${instancerId}>`)
          instanceIndices = []
          if (this._instancePrimvarNumElements > 0) {
            // insert 0-th index as placeholder (0th should always
            // exist, since we don't populate instance primvars with
            // numElements == 0).
            instanceIndices.push(0)
          }
          break
        }
      }
    }

    instanceIndicesArray.push(instanceIndices)

    if (TfDebug.isEnabled(HdDebugCodes.HD_INSTANCER_UPDATED)) {
      TfDebug.msg(HdDebugCodes.HD_INSTANCER_UPDATED,
        `GetInstanceIndices for proto <${prototypeId}> ` +
        `instancer <${instancerId}> (parent: <${this.getParentId()}>): ` +
        `[${instanceIndices.join(', ')}]\n`)
    }

    // backtrace the instancer hierarchy to gather all instance indices.
    if (this.getParentId() !== '') {
      const parentInstancer =
        this.getDelegate().getRenderIndex().getInstancer(this.getParentId()) as
          unknown as HdStInstancer | null
      if (TF_VERIFY(parentInstancer)) {
        parentInstancer!._getInstanceIndices(instancerId, instanceIndicesArray)
      }
    }
  }

  /** instancer.cpp:260-323. Populates the instance index indirection buffer
   *  for prototypeId and returns a flat array of instance index tuples. */
  getInstanceIndices(prototypeId: string): number[] {
    // delegate provides sparse index array for prototypeId.
    const instanceIndicesArray: number[][] = []
    this._getInstanceIndices(prototypeId, instanceIndicesArray)
    const instancerNumLevels = instanceIndicesArray.length

    if (!TF_VERIFY(instancerNumLevels > 0)) {
      return []
    }

    // create the cartesian product of instanceIndices array. Each tuple is
    // preceded by a global instance index <n>.
    // e.g.
    //   input   : [0,1] [3,4,5] [7,8]
    //   output  : [<0>,0,3,7,  <1>,1,3,7,  <2>,0,4,7,  <3>,1,4,7,
    //              <4>,0,5,7,  <5>,1,5,7,  <6>,0,3,8, ...]

    let nTotal = 1
    for (let i = 0; i < instancerNumLevels; ++i) {
      nTotal *= instanceIndicesArray[i]!.length
    }
    const instanceIndexWidth = 1 + instancerNumLevels

    const instanceIndices = new Array<number>(nTotal * instanceIndexWidth).fill(0)
    const currents = new Array<number>(instancerNumLevels).fill(0)
    for (let j = 0; j < nTotal; ++j) {
      instanceIndices[j * instanceIndexWidth] = j // global idx
      for (let i = 0; i < instancerNumLevels; ++i) {
        instanceIndices[j * instanceIndexWidth + i + 1] =
          instanceIndicesArray[i]![currents[i]!]!
      }
      ++currents[0]!
      for (let i = 0; i < instancerNumLevels - 1; ++i) {
        if (currents[i]! >= instanceIndicesArray[i]!.length) {
          ++currents[i + 1]!
          currents[i] = 0
        }
      }
    }

    if (TfDebug.isEnabled(HdDebugCodes.HD_INSTANCER_UPDATED)) {
      TfDebug.msg(HdDebugCodes.HD_INSTANCER_UPDATED,
        `Flattened indices <${prototypeId}>: [${instanceIndices.join(', ')}]\n`)
    }

    return instanceIndices
  }
}
