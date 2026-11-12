// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/extCompGpuComputationResource.cpp,
//  pxr/imaging/hdSt/extCompGpuComputationResource.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/extCompGpuComputationResource.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: TF_DEBUG(HDST_LOG_COMPUTE_SHADER_PROGRAM_MISSES/HITS,
// HD_EXT_COMPUTATION_UPDATED) messages are not emitted.

import { HashCombine as TfHashCombine } from 'typescript-usd/tf'
import type { BufferArrayRange as HdBufferArrayRange, BufferSpec as HdBufferSpec } from 'typescript-usd/hd'
import { HdSt_CodeGen } from './codeGen.ts'
import type { HdSt_ExtCompComputeShader } from './extCompComputeShader.ts'
import type { HdStGLSLProgram } from './glslProgram.ts'
import { HdSt_ResourceBinder, HdSt_ResourceBinderMetaData } from './resourceBinder.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { HdStShaderCode } from './shaderCode.ts'
import { TF_VERIFY, TF_WARN } from './tfDiagnostic.ts'

/** extCompGpuComputationResource.cpp:33-41 */
function _ComputeProgramHash(
  shaders: readonly HdStShaderCode[],
  metaData: HdSt_ResourceBinderMetaData,
): bigint {
  const hash = 0n
  return TfHashCombine(hash,
    metaData.computeHash(),
    HdStShaderCode.computeHashOfShaders(shaders))
}

/** The hash of a buffer spec vector (TfHash of std::vector<HdBufferSpec>). */
function _SpecsHash(specs: readonly HdBufferSpec[]): unknown[] {
  return specs.map((s) => [s.name, s.tupleType.type, s.tupleType.count])
}

/** extCompGpuComputationResource.h:27-110. A resource that represents the
 *  persistent GPU resources of an ExtComputation.
 *
 *  The persistent resources are shared between the ephemeral
 *  HdStExtCompGpuComputation and the buffer source computations that
 *  provide its inputs. The resource holds the input buffer array ranges and
 *  the compute program, created from the kernel and the input/output
 *  buffer specs. */
export class HdStExtCompGpuComputationResource {
  private _shaderSourceHash: bigint | undefined
  private _computeProgram: HdStGLSLProgram | null = null
  private readonly _resourceBinder = new HdSt_ResourceBinder()

  /** extCompGpuComputationResource.cpp:18-31. Creates a GPU computation
   *  resource that can bind resources matching the layout of the compute
   *  kernel. The registry passed is the registry that the kernel program
   *  will be shared amongst. De-duplication of the compiled and linked
   *  program for runtime execution happens on a per-registry basis.
   *
   *  Memory for the input computation buffers must be provided. This must
   *  be done prior to a HdResourceRegistry::Commit in which the
   *  computation has been added. Note that the Resource allocates no memory
   *  on its own and can be speculatively created and later de-duplicated,
   *  or discarded, without wasting resources. */
  constructor(
    private readonly _outputBufferSpecs: HdBufferSpec[],
    private readonly _kernel: HdSt_ExtCompComputeShader,
    private readonly _inputs: (HdBufferArrayRange | null)[],
    private readonly _registry: HdStResourceRegistry,
  ) {}

  /** extCompGpuComputationResource.h:64-68. Gets the HdBufferArrayRange that
   *  inputs should be loaded into using the resource binder. */
  getInputs(): readonly (HdBufferArrayRange | null)[] {
    return this._inputs
  }

  /** extCompGpuComputationResource.h:70-80. Gets the GPU HdStGLSLProgram to
   *  run to execute the computation. This may have been shared with many
   *  other instances in the same registry. */
  getProgram(): HdStGLSLProgram | null {
    if (!this._computeProgram) {
      this._resolve()
    }
    return this._computeProgram
  }

  /** extCompGpuComputationResource.h:82-91. Gets the resource binder that
   *  matches the layout of the compute program. */
  getResourceBinder(): HdSt_ResourceBinder {
    if (!this._computeProgram) {
      this._resolve()
    }
    return this._resourceBinder
  }

  /** extCompGpuComputationResource.cpp:43-148. Resolve the resource
   *  bindings and program for use by a computation. The compute program is
   *  resolved and linked against the input and output resource bindings and
   *  the kernel source in this step. */
  private _resolve(): boolean {
    // Non-in-place sources should have been registered as resource registry
    // sources already and Resolved. They go to an internal buffer range
    // that was allocated in AllocateInternalRange
    const inputBufferSpecs: HdBufferSpec[] = []
    for (const input of this._inputs) {
      if (TF_VERIFY(input)) {
        inputBufferSpecs.push(...input!.getBufferSpecs())
      }
    }
    // Once we know the names and sizes of all outputs and inputs and the
    // kernel to use we can codeGen the compute shader to use.

    // We can shortcut the codegen by using a heuristic for determining that
    // the output source would be identical given a certain destination
    // buffer range.
    const shaderSourceHash = TfHashCombine(
      this._kernel.computeHash(),
      _SpecsHash(this._outputBufferSpecs),
      _SpecsHash(inputBufferSpecs),
    )

    // If the source hash mismatches the saved program from previous
    // executions we are going to have to recompile it here.
    // We save the kernel for future runs to not have to incur the
    // compilation cost each time.
    if (!this._computeProgram || this._shaderSourceHash !== shaderSourceHash) {
      const shaders: HdStShaderCode[] = [this._kernel]

      const metaData = new HdSt_ResourceBinderMetaData()

      // let resourcebinder resolve bindings and populate metadata
      // which is owned by codegen.
      this._resourceBinder.resolveComputeBindings(this._outputBufferSpecs,
        inputBufferSpecs,
        shaders,
        metaData,
        this._registry.getHgi().getCapabilities())

      const registryID = _ComputeProgramHash(shaders, metaData)
      {
        // ask registry to see if there's already compiled program
        const programInstance = this._registry.registerGLSLProgram(registryID)

        if (programInstance.isFirstInstance()) {
          const codeGen = new HdSt_CodeGen(shaders, metaData)

          const glslProgram = codeGen.CompileComputeProgram(this._registry)
          if (!TF_VERIFY(glslProgram)) {
            return false
          }

          if (!glslProgram!.link()) {
            const logString = glslProgram!.getProgram().Get()?.getCompileErrors() ?? ''
            TF_WARN(`Failed to link compute shader: ${logString}`)
            return false
          }

          // store the program into the program registry.
          programInstance.setValue(glslProgram!)
        }

        this._computeProgram = programInstance.GetValue()
      }

      if (!TF_VERIFY(this._computeProgram)) {
        return false
      }

      this._shaderSourceHash = shaderSourceHash
    }
    return true
  }
}

/** extCompGpuComputationResource.h:21-22 */
export type HdStExtCompGpuComputationResourceSharedPtr = HdStExtCompGpuComputationResource
