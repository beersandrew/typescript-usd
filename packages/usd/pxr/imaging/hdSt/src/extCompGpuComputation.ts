// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/extCompGpuComputation.cpp,
//  pxr/imaging/hdSt/extCompGpuComputation.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extCompGpuComputation.{h,cpp} (OpenUSD
// 26.11.1).
//
// Divergences:
// - Out-parameters are caller-provided arrays.
// - The resource bindings / pipeline hashes are TfHashCombine values (cache
//   keys only).
// - TF_DEBUG(HD_EXT_COMPUTATION_UPDATED) messages are not emitted.

import { HashCombine as TfHashCombine, type Token as TfToken } from 'typescript-usd/tf'
import {
  ChangeTracker as HdChangeTracker,
  DataSizeOfType as HdDataSizeOfType,
  GetComponentCount as HdGetComponentCount,
  GetComponentType as HdGetComponentType,
  PrimTypeTokens as HdPrimTypeTokens,
  type BufferArrayRange as HdBufferArrayRange,
  type BufferSource as HdBufferSource,
  type BufferSpec as HdBufferSpec,
  type DirtyBits as HdDirtyBits,
  type ExtComputation as HdExtComputation,
  type ExtComputationPrimvarDescriptor as HdExtComputationPrimvarDescriptor,
  type ResourceRegistry as HdResourceRegistry,
  type SceneDelegate as HdSceneDelegate,
  type TupleType as HdTupleType,
} from 'typescript-usd/hd'
import {
  HgiBindResourceType,
  HgiBufferBindDesc,
  HgiComputePipelineDesc,
  HgiResourceBindingsDesc,
  HgiShaderStageBits,
  type Hgi,
  type HgiBufferHandle,
  type HgiComputePipelineHandle,
  type HgiShaderProgramHandle,
} from 'typescript-usd/hgi'
import { HdStBinding } from './binding.ts'
import type { HdStBufferArrayRange } from './bufferArrayRange.ts'
import { HdStComputation } from './computation.ts'
import { HdSt_ExtCompComputeShader } from './extCompComputeShader.ts'
import { HdStExtCompCpuComputation } from './extCompCpuComputation.ts'
import { HdStExtCompGpuComputationResource } from './extCompGpuComputationResource.ts'
import { HdStExtCompGpuPrimvarBufferSource } from './extCompGpuPrimvarBufferSource.ts'
import { HdStExtCompPrimvarBufferSource } from './extCompPrimvarBufferSource.ts'
import type { HdStExtComputation } from './extComputation.ts'
import {
  HdStComputeQueue,
  type HdStComputationComputeQueuePairVector,
  type HdStResourceRegistry,
} from './resourceRegistry.ts'
import { TF_RUNTIME_ERROR, TF_VERIFY } from './tfDiagnostic.ts'

/** extCompGpuComputation.cpp:35-50 */
function _AppendResourceBindings(
  resourceDesc: HgiResourceBindingsDesc,
  buffer: HgiBufferHandle,
  location: number,
  writable: boolean,
): void {
  const bufBind = new HgiBufferBindDesc()
  bufBind.bindingIndex = location
  bufBind.resourceType = HgiBindResourceType.HgiBindResourceTypeStorageBuffer
  bufBind.stageUsage = HgiShaderStageBits.HgiShaderStageCompute
  bufBind.writable = writable
  bufBind.offsets.push(0)
  bufBind.buffers.push(buffer)
  resourceDesc.buffers.push(bufBind)
}

/** extCompGpuComputation.cpp:52-64 */
function _CreatePipeline(
  hgi: Hgi,
  constantValuesSize: number,
  program: HgiShaderProgramHandle,
): HgiComputePipelineHandle {
  const desc = new HgiComputePipelineDesc()
  desc.debugName = 'ExtComputation'
  desc.shaderProgram = program
  desc.shaderConstantsDesc.byteSize = constantValuesSize
  return hgi.CreateComputePipeline(desc)
}

/** extCompGpuComputation.h:37-160. A Computation that represents a GPU
 *  implementation of a ExtComputation.
 *
 *  The computation implements the basic: input HdBufferArrayRange ->
 *  processing -> output HdBufferArrayRange model of HdStComputations where
 *  processing happens in Execute during the Execute phase of
 *  HdResourceRegistry::Commit.
 *
 *  The computation is performed in three stages by three companion classes:
 *
 *  1. Input HdBuffersources are committed into the input
 *  HdBufferArrayRange during the Resolve phase of the
 *  HdResourceRegistry::Commit processing.
 *
 *  2. HdStExtCompGpuComputationResource holds the committed GPU input
 *  HdBufferArrayRange and the compiled compute HdStGLSLProgram for reuse.
 *
 *  3. HdStExtCompGpuComputation executes the compute program in the Execute
 *  phase of the commit, writing to the output HdBufferArrayRange. */
export class HdStExtCompGpuComputation extends HdStComputation {
  /** extCompGpuComputation.cpp:66-79. Constructs a new GPU ExtComputation
   *  computation. resource provides the set of input data and kernel to
   *  execute this computation. compPrimvars identifies the primvar data
   *  being computed. dispatchCount specifies the number of kernel
   *  invocations to execute. elementCount specifies the number of elements
   *  to allocate for output. */
  constructor(
    private readonly _id: string,
    private readonly _resource: HdStExtCompGpuComputationResource,
    private readonly _compPrimvars: readonly HdExtComputationPrimvarDescriptor[],
    private readonly _dispatchCount: number,
    private readonly _elementCount: number,
  ) {
    super()
  }

  /** extCompGpuComputation.cpp:302-372. Creates a GPU computation
   *  implementing the given abstract computation. When created this
   *  allocates HdStExtCompGpuComputationResource to be shared with the
   *  HdStExtCompGpuPrimvarBufferSource. Nothing is assigned GPU resources
   *  unless the source is subsequently added to the hdResourceRegistry and
   *  the registry is committed. */
  static createGpuComputation(
    sceneDelegate: HdSceneDelegate,
    sourceComp: HdExtComputation,
    compPrimvars: readonly HdExtComputationPrimvarDescriptor[],
  ): HdStExtCompGpuComputation | null {
    // Downcast the resource registry
    const renderIndex = sceneDelegate.getRenderIndex()
    const resourceRegistry =
      renderIndex.getResourceRegistry() as unknown as HdStResourceRegistry

    const shader = new HdSt_ExtCompComputeShader(sourceComp)

    // Map the computation outputs onto the destination primvar types
    const outputBufferSpecs: HdBufferSpec[] = []
    for (const compPrimvar of compPrimvars) {
      outputBufferSpecs.push({
        name: compPrimvar.sourceComputationOutputName,
        tupleType: compPrimvar.valueType as HdTupleType,
      })
    }

    const deviceSourceComp = sourceComp as HdStExtComputation
    if (!TF_VERIFY(deviceSourceComp)) {
      return null
    }
    const inputs: (HdBufferArrayRange | null)[] = []
    inputs.push(deviceSourceComp.getInputRange())

    for (const desc of sourceComp.getComputationInputs()) {
      const deviceInputComp = renderIndex.getSprim(
        HdPrimTypeTokens.extComputation,
        desc.sourceComputationId) as HdStExtComputation | undefined
      if (deviceInputComp && deviceInputComp.getInputRange()) {
        const input = deviceInputComp.getInputRange()
        // skip duplicate inputs
        if (!inputs.includes(input)) {
          inputs.push(deviceInputComp.getInputRange())
        }
      }
    }

    // There is a companion resource that requires allocation
    // and resolution.
    const resource = new HdStExtCompGpuComputationResource(
      outputBufferSpecs,
      shader,
      inputs,
      resourceRegistry)

    return new HdStExtCompGpuComputation(
      sourceComp.getId(),
      resource,
      compPrimvars,
      sourceComp.getDispatchCount(),
      sourceComp.getElementCount())
  }

  /** extCompGpuComputation.cpp:96-276. Executes the computation on the GPU.
   *  Called by HdResourceRegistry::Commit with the HdBufferArrayRange given
   *  to the HdResourceRegistry when the computation was added to the
   *  registry. */
  Execute(outputRange: HdBufferArrayRange | null,
    resourceRegistry: HdResourceRegistry): void {
    TF_VERIFY(outputRange)
    TF_VERIFY(resourceRegistry)

    const hdStResourceRegistry =
      resourceRegistry as unknown as HdStResourceRegistry
    const computeProgram = this._resource.getProgram()
    const binder = this._resource.getResourceBinder()

    if (!TF_VERIFY(computeProgram)) {
      return
    }

    const outputBar = outputRange as HdStBufferArrayRange
    TF_VERIFY(outputBar)

    // Prepare uniform buffer for GPU computation
    // XXX: We'd really prefer to delegate this to the resource binder.
    const uniforms: number[] = []
    uniforms.push(outputBar.getElementOffset())

    // Generate hash for resource bindings and pipeline.
    // XXX Needs fingerprint hash to avoid collisions
    let rbHash = 0n

    // Bind buffers as SSBOs to the indices matching the layout in the shader
    for (const compPrimvar of this._compPrimvars) {
      const name = compPrimvar.sourceComputationOutputName
      const buffer = outputBar.getResource(compPrimvar.name)

      const binding = binder.getBinding(name as TfToken)
      // These should all be valid as they are required outputs
      if (TF_VERIFY(binding.isValid()) && TF_VERIFY(buffer?.getHandle().isSet())) {
        const componentSize = HdDataSizeOfType(
          HdGetComponentType(buffer!.getTupleType().type))
        uniforms.push(Math.trunc(buffer!.getOffset() / componentSize))
        // Assumes non-SSBO allocator for the stride
        uniforms.push(Math.trunc(buffer!.getStride() / componentSize))

        rbHash = TfHashCombine(rbHash, BigInt(buffer!.getHandle().getId()))
      }
    }

    for (const input of this._resource.getInputs()) {
      const inputBar = input as HdStBufferArrayRange

      for (const [name, buffer] of inputBar.getResources()) {
        const binding = binder.getBinding(name as TfToken)
        // These should all be valid as they are required inputs
        if (TF_VERIFY(binding.isValid())) {
          const tupleType = buffer.getTupleType()
          const componentSize =
            HdDataSizeOfType(HdGetComponentType(tupleType.type))
          uniforms.push(Math.trunc((inputBar.getByteOffset(name) +
            buffer.getOffset()) / componentSize))
          // If allocated with a VBO allocator use the line below instead.
          //uniforms.push(
          //    buffer.GetStride() / buffer.GetComponentSize())
          // This is correct for the SSBO allocator only
          uniforms.push(HdGetComponentCount(tupleType.type))

          if (binding.getType() !== HdStBinding.SSBO) {
            TF_RUNTIME_ERROR(
              `Unsupported binding type ${binding.getType()} for ExtComputation`)
          }

          rbHash = TfHashCombine(rbHash, BigInt(buffer.getHandle().getId()))
        }
      }
    }
    uniforms.push(this.getDispatchCount())

    const hgi = hdStResourceRegistry.getHgi()

    // Prepare uniform buffer for GPU computation
    const uniformData = new Int32Array(uniforms)
    const uboSize = uniformData.byteLength
    const pHash = TfHashCombine(
      BigInt(computeProgram!.getProgram().getId()),
      BigInt(uboSize))

    // Get or add pipeline in registry.
    const computePipelineInstance =
      hdStResourceRegistry.registerComputePipeline(pHash)
    if (computePipelineInstance.isFirstInstance()) {
      const pipe = _CreatePipeline(
        hgi, uboSize, computeProgram!.getProgram())
      computePipelineInstance.setValue(pipe)
    }

    const pipeline = computePipelineInstance.GetValue()!

    // Get or add resource bindings in registry.
    const resourceBindingsInstance =
      hdStResourceRegistry.registerResourceBindings(rbHash)
    if (resourceBindingsInstance.isFirstInstance()) {
      // Begin the resource set
      const resourceDesc = new HgiResourceBindingsDesc()
      resourceDesc.debugName = 'ExtComputation'

      for (const compPvar of this._compPrimvars) {
        const name = compPvar.sourceComputationOutputName
        const buffer = outputBar.getResource(compPvar.name)

        const binding = binder.getBinding(name as TfToken)
        // These should all be valid as they are required outputs
        if (TF_VERIFY(binding.isValid()) &&
            TF_VERIFY(buffer?.getHandle().isSet())) {
          _AppendResourceBindings(resourceDesc,
            buffer!.getHandle(),
            binding.getLocation(),
            /*writable=*/true)
        }
      }

      for (const input of this._resource.getInputs()) {
        const inputBar = input as HdStBufferArrayRange

        for (const [name, buffer] of inputBar.getResources()) {
          const binding = binder.getBinding(name as TfToken)
          // These should all be valid as they are required inputs
          if (TF_VERIFY(binding.isValid())) {
            _AppendResourceBindings(resourceDesc,
              buffer.getHandle(),
              binding.getLocation(),
              /*writable=*/false)
          }
        }
      }

      const rb = hgi.createResourceBindings(resourceDesc)

      resourceBindingsInstance.setValue(rb)
    }

    const resourceBindings = resourceBindingsInstance.GetValue()!

    const computeCmds = hdStResourceRegistry.getGlobalComputeCmds()

    computeCmds.pushDebugGroup('ExtComputation')
    computeCmds.bindResources(resourceBindings)
    computeCmds.bindPipeline(pipeline)

    // Queue transfer uniform buffer
    computeCmds.setConstantValues(pipeline, 0, uboSize, uniformData)

    // Queue compute work
    computeCmds.Dispatch(this.getDispatchCount(), 1)

    computeCmds.popDebugGroup()
  }

  /** extCompGpuComputation.cpp:278-282. Add the buffer spec for this
   *  computation into given bufferspec vector. Caller must not modify the
   *  output range. */
  getBufferSpecs(): HdBufferSpec[] {
    // nothing
    return []
  }

  /** extCompGpuComputation.cpp:284-288. Returns the number of GPU kernel
   *  invocations to execute. */
  getDispatchCount(): number {
    return this._dispatchCount
  }

  /** extCompGpuComputation.cpp:290-294. Returns the number of elements in
   *  the output, as used by the computation to size the output buffer. */
  getNumOutputElements(): number {
    return this._elementCount
  }

  /** extCompGpuComputation.cpp:296-300 */
  getResource(): HdStExtCompGpuComputationResource {
    return this._resource
  }
}

/** extCompGpuComputation.h:33-34 */
export type HdStExtCompGpuComputationSharedPtr = HdStExtCompGpuComputation

/** extCompGpuComputation.cpp:374-484. Helper function for creating the
 *  computations (GPU or CPU) and the primvar buffer sources of the computed
 *  primvars of rprim `id`.
 *
 *  A GPU computation is used when the source computation has a GPU kernel;
 *  its primvar buffer sources only reserve space. Otherwise a CPU
 *  computation (with its input sources in separateComputationSources)
 *  computes the outputs, and its primvar buffer sources carry the data. */
export function HdSt_GetExtComputationPrimvarsComputations(
  id: string,
  sceneDelegate: HdSceneDelegate,
  allCompPrimvars: readonly HdExtComputationPrimvarDescriptor[],
  dirtyBits: HdDirtyBits,
  sources: HdBufferSource[],
  reserveOnlySources: HdBufferSource[],
  separateComputationSources: HdBufferSource[],
  computations: HdStComputationComputeQueuePairVector,
): void {
  TF_VERIFY(sources)
  TF_VERIFY(reserveOnlySources)
  TF_VERIFY(separateComputationSources)
  TF_VERIFY(computations)

  const renderIndex = sceneDelegate.getRenderIndex()

  // Group computation primvars by source computation (a std::map keyed by
  // SdfPath, so the groups are visited in path order).
  const byComputation = new Map<string, HdExtComputationPrimvarDescriptor[]>()
  for (const compPrimvar of allCompPrimvars) {
    let group = byComputation.get(compPrimvar.sourceComputationId)
    if (!group) {
      byComputation.set(compPrimvar.sourceComputationId, group = [])
    }
    group.push(compPrimvar)
  }

  // Create computation primvar buffer sources by source computation
  for (const computationId of [...byComputation.keys()].sort()) {
    const compPrimvars = byComputation.get(computationId)!

    const sourceComp = renderIndex.getSprim(HdPrimTypeTokens.extComputation,
      computationId) as HdExtComputation | undefined

    if (!(sourceComp && sourceComp.getElementCount() > 0)) {
      continue
    }

    if (sourceComp.getGpuKernelSource() !== '') {
      let gpuComputation: HdStExtCompGpuComputation | null = null
      for (const compPrimvar of compPrimvars) {
        if (HdChangeTracker.isPrimvarDirty(dirtyBits, id,
          compPrimvar.name)) {
          if (!gpuComputation) {
            // Create the computation for the first dirty primvar
            gpuComputation =
              HdStExtCompGpuComputation.createGpuComputation(
                sceneDelegate,
                sourceComp,
                compPrimvars)

            // Assume there are no dependencies between ExtComp so
            // put all of them in queue zero.
            computations.push(
              [gpuComputation!, HdStComputeQueue.HdStComputeQueueZero])
          }

          // Create a primvar buffer source for the computation
          const primvarBufferSource =
            new HdStExtCompGpuPrimvarBufferSource(
              compPrimvar.name,
              compPrimvar.valueType as HdTupleType,
              sourceComp.getElementCount(),
              sourceComp.getId())

          // Gpu primvar sources only need to reserve space
          reserveOnlySources.push(primvarBufferSource)
        }
      }
    } else {
      let cpuComputation: HdStExtCompCpuComputation | null = null
      for (const compPrimvar of compPrimvars) {
        if (HdChangeTracker.isPrimvarDirty(dirtyBits, id,
          compPrimvar.name)) {
          if (!cpuComputation) {
            // Create the computation for the first dirty primvar
            cpuComputation =
              HdStExtCompCpuComputation.createComputation(
                sceneDelegate,
                sourceComp,
                separateComputationSources)
          }

          // Create a primvar buffer source for the computation
          const primvarBufferSource =
            new HdStExtCompPrimvarBufferSource(
              compPrimvar.name,
              cpuComputation,
              compPrimvar.sourceComputationOutputName,
              compPrimvar.valueType as HdTupleType)

          // Cpu primvar sources need to allocate and commit data
          sources.push(primvarBufferSource)
        }
      }
    }
  }
}
