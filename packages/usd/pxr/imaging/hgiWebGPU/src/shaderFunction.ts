// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderFunction.mm,
//  pxr/imaging/hgiVulkan/shaderFunction.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUShaderFunction. Modelled on pxr/imaging/hgiMetal/shaderFunction.mm
// (generate, compile, keep the entry point) and
// pxr/imaging/hgiVulkan/shaderFunction.cpp (keep the generator's binding
// layout info for the pipeline layout, shaderFunction.cpp:78-80).

import { HgiShaderFunction, HgiShaderStageBits, type HgiShaderFunctionDesc } from 'typescript-usd/hgi'
import type { HgiWebGPUBindGroupLayoutInfoVector } from './bindGroupLayouts.ts'
import type { HgiWebGPUPulledAttribute, HgiWebGPUPulledPrimitive } from './shaderSection.ts'
import {
  HgiWebGPUShaderGenerator,
  type HgiWebGPUInterstageInterpolation,
  type HgiWebGPUShaderGeneratorHgi,
  type HgiWebGPUShaderGeneratorOptions,
} from './shaderGenerator.ts'

/** What HgiWebGPUGraphicsCmds needs to draw with an emulated
 *  post-tessellation vertex function (HgiWebGPUPostTessVertexShaderSection). */
export interface HgiWebGPUPostTessVertexInfo {
  /** What one "patch" is: a triangle or quad patch, or one vertex or
   *  point of a vertex function drawn with vertex pulling, or the patch
   *  of a post-tessellation control function. */
  primitive: HgiWebGPUPulledPrimitive
  /** Vertices drawn per patch (3 per triangle, 6 per quad, 1 per vertex,
   *  6 per point). */
  verticesPerPatch: number
  /** Length of HgiWebGPUPatchDraw's attributes array. */
  attributeSlots: number
  /** The vertex attributes the function pulls. */
  attributes: readonly HgiWebGPUPulledAttribute[]
  /** 'control': the bind index of the buffer it writes half-float
   *  tessellation factors to. */
  tessFactorsBindIndex: number | null
}

export class HgiWebGPUShaderFunction extends HgiShaderFunction {
  private _shaderId: GPUShaderModule | null = null
  private _errors = ''
  private _generatedCode = ''
  private _entryPoint = ''
  private _bindGroupLayoutInfo: HgiWebGPUBindGroupLayoutInfoVector = []
  private _compilation: Promise<string> | null = null
  private _postTessVertex: HgiWebGPUPostTessVertexInfo | null = null
  private _colorOutputLocations: readonly number[] = []
  private readonly _device: GPUDevice
  /** Vertex-side stages: the generator, kept to write the entry point again
   *  with the fragment input's interpolation (MatchInterstageOutputs). */
  private _generator: HgiWebGPUShaderGenerator | null = null
  private _interstageInputs: HgiWebGPUInterstageInterpolation = new Map()
  /** What a variant is generated from (see getVariant). */
  private _variantSource: {
    device: GPUDevice, hgi: HgiWebGPUShaderGeneratorHgi, desc: HgiShaderFunctionDesc
  } | null = null
  /** The variants generated so far, by their options (getVariant). */
  private readonly _variants = new Map<string, HgiWebGPUShaderFunction>()

  /** hgiMetal/shaderFunction.mm:20-95 */
  constructor(device: GPUDevice, hgi: HgiWebGPUShaderGeneratorHgi, desc: HgiShaderFunctionDesc,
    options: HgiWebGPUShaderGeneratorOptions = {}) {
    super(desc)
    this._device = device

    if (desc.shaderCode !== null) {
      // Only the stages a variant changes keep their source for it: the
      // fragment stage (HgiPolygonModeLine, alpha to one) and the stages
      // with vertex pulling (HgiPolygonModeLine, per-patch factors, packed
      // attributes; a vertex function without pulling drops it below).
      const variantStages = HgiShaderStageBits.HgiShaderStageFragment |
        HgiShaderStageBits.HgiShaderStagePostTessellationVertex |
        HgiShaderStageBits.HgiShaderStagePostTessellationControl | HgiShaderStageBits.HgiShaderStageVertex
      if (Object.values(options).every(v => !v) && (desc.shaderStage & variantStages)) {
        const source = desc.clone()
        source.generatedShaderCodeOut = null
        this._variantSource = { device, hgi, desc: source }
      }
      // The generator reads this function's copy of the descriptor, whose
      // code is released below, so a kept generator does not hold it.
      const shaderGenerator = new HgiWebGPUShaderGenerator(hgi, this._descriptor, options)
      shaderGenerator.Execute()
      const shaderCode = shaderGenerator.getGeneratedShaderCode()
      this._generatedCode = shaderCode
      this._entryPoint = shaderGenerator.getEntryPointFunctionName()
      this._errors = shaderGenerator.getGeneratorErrors()

      if (!this._errors) {
        this._createModule(shaderCode)
      }

      switch (desc.shaderStage) {
        case HgiShaderStageBits.HgiShaderStageVertex:
        case HgiShaderStageBits.HgiShaderStagePostTessellationVertex:
          this._generator = shaderGenerator
          break
        case HgiShaderStageBits.HgiShaderStageFragment:
          this._interstageInputs = shaderGenerator.getInterstageInputs()
          this._colorOutputLocations = shaderGenerator.getColorOutputLocations()
          break
      }

      // Get bind group layout info (hgiVulkan/shaderFunction.cpp:78-80).
      this._bindGroupLayoutInfo = shaderGenerator.getBindGroupLayoutInfo()
      const postTess = shaderGenerator.getPostTessVertexSection()
      if (!postTess && desc.shaderStage !== HgiShaderStageBits.HgiShaderStageFragment) this._variantSource = null
      if (postTess) {
        this._postTessVertex = {
          primitive: postTess.getPrimitive(),
          verticesPerPatch: postTess.getVerticesPerPatch(),
          attributeSlots: postTess.getAttributeSlots(),
          attributes: postTess.getPulledAttributes(),
          tessFactorsBindIndex: shaderGenerator.getTessFactorsBindIndex(),
        }
      }
    }

    // Clear these pointers in our copy of the descriptor since we
    // have to assume they could become invalid after we return.
    this._descriptor.shaderCodeDeclarations = null
    this._descriptor.shaderCode = null
    this._descriptor.generatedShaderCodeOut = null
  }

  private _createModule(code: string): void {
    const debugName = this._descriptor.debugName
    const errors = this._errors
    this._shaderId = this._device.createShaderModule({ label: debugName, code })
    // WebGPU reports compile errors asynchronously; IsValid() reflects
    // them once WaitForCompilation() has settled.
    this._compilation = this._shaderId.getCompilationInfo().then(info => {
      const messages = info.messages
        .filter(m => m.type === 'error')
        .map(m => `${debugName}:${m.lineNum}:${m.linePos}: ${m.message}`)
      this._errors = [errors, ...messages].filter(Boolean).join('\n')
      return this._errors
    }, () => this._errors)
  }

  /** The fragment stage's inputs per interstage location. */
  getInterstageInputs(): HgiWebGPUInterstageInterpolation {
    return this._interstageInputs
  }

  /** WebGPU adaptation (HgiWebGPUShaderGenerator.MatchInterstageOutputs):
   *  gives this vertex-side function's outputs the interpolation of the
   *  fragment inputs they feed, compiling the module again if that changes
   *  the code. HgiWebGPUShaderProgram calls it with its fragment function. */
  matchInterstageOutputs(fragment: HgiWebGPUShaderFunction): void {
    if (!this._generator || !this._shaderId) return
    const code = this._generator.matchInterstageOutputs(fragment.getInterstageInputs())
    if (code === null) return
    this._generatedCode = code
    this._createModule(code)
  }

  /** The function as a pipeline with HgiPolygonModeLine draws it
   *  (HgiWebGPUGraphicsPipeline), generated on first use: Metal's
   *  triangle fill mode is pipeline state, which WebGPU lacks, and the
   *  emulation changes the vertex and fragment functions
   *  (HgiWebGPUPostTessVertexShaderSection). */
  getPolygonModeLineVariant(): HgiWebGPUShaderFunction | null {
    return this.getVariant({ polygonModeLine: true })
  }

  /** The function generated with `options` (HgiWebGPUShaderGeneratorOptions),
   *  on first use; this function when no option is set; null for a
   *  function that keeps no source for variants. */
  getVariant(options: HgiWebGPUShaderGeneratorOptions): HgiWebGPUShaderFunction | null {
    const set = Object.entries(options).filter(([, v]) => v).map(([k]) => k).sort()
    if (set.length === 0) return this
    if (!this._variantSource) return null
    const key = set.join(',')
    let variant = this._variants.get(key)
    if (!variant) {
      const { device, hgi, desc } = this._variantSource
      variant = new HgiWebGPUShaderFunction(device, hgi, desc, Object.fromEntries(set.map(k => [k, true])))
      this._variants.set(key, variant)
    }
    return variant
  }

  /** The fragment function as a pipeline with alphaToCoverageEnable and
   *  alphaToOneEnable draws it (HgiWebGPUGraphicsPipeline), generated on
   *  first use: WebGPU has no alpha to one (alphaToOne.ts). `polygonModeLine`
   *  gives the variant of the HgiPolygonModeLine variant. */
  getAlphaToOneVariant(polygonModeLine: boolean): HgiWebGPUShaderFunction | null {
    if (this._descriptor.shaderStage !== HgiShaderStageBits.HgiShaderStageFragment) return null
    return this.getVariant({ polygonModeLine, alphaToOne: true })
  }

  /** hgiMetal/shaderFunction.mm:97-102 */
  _destroy(): void {
    this._shaderId = null
    this._generator = null
    for (const variant of this._variants.values()) variant._destroy()
    this._variants.clear()
  }

  /** hgiMetal/shaderFunction.mm:104-107 */
  isValid(): boolean {
    return this._errors.length === 0 && this._shaderId !== null
  }

  /** hgiMetal/shaderFunction.mm:109-113 */
  getCompileErrors(): string {
    return this._errors
  }

  /** WebGPU adaptation: settles with the compile errors (empty when valid)
   *  once the browser has compiled the module. */
  waitForCompilation(): Promise<string> {
    return this._compilation ?? Promise.resolve(this._errors)
  }

  /** hgiMetal/shaderFunction.mm:115-119 */
  getByteSizeOfResource(): number {
    return 0
  }

  /** The emulated post-tessellation vertex stage's draw parameters, or
   *  null for other stages. */
  getPostTessVertexInfo(): HgiWebGPUPostTessVertexInfo | null {
    return this._postTessVertex
  }

  /** hgiMetal/shaderFunction.mm:121-125 */
  getRawResource(): GPUShaderModule | null {
    return this._shaderId
  }

  /** hgiMetal/shaderFunction.mm:127-131 */
  getShaderId(): GPUShaderModule | null {
    return this._shaderId
  }

  /** The WGSL entry point (hgiMetal/shaderFunction.mm:45-67). */
  getEntryPoint(): string {
    return this._entryPoint
  }

  /** The locations of the color outputs of a fragment function. */
  getColorOutputLocations(): readonly number[] {
    return this._colorOutputLocations
  }

  /** The generated WGSL, for diagnostics. */
  getGeneratedCode(): string {
    return this._generatedCode
  }

  /** hgiVulkan/shaderFunction.cpp:143-147 */
  getBindGroupLayoutInfo(): HgiWebGPUBindGroupLayoutInfoVector {
    return this._bindGroupLayoutInfo
  }
}
