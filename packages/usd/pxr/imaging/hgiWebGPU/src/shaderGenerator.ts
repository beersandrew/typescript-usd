// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderGenerator.mm,
//  pxr/imaging/hgiVulkan/shaderGenerator.cpp,
//  pxr/imaging/hgiVulkan/shaderGenerator.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUShaderGenerator: turns an HgiShaderFunctionDesc into a WGSL
// module. Structured as pxr/imaging/hgiVulkan/shaderGenerator.{h,cpp}: the
// constructor converts the descriptor into shader sections in the same order
// (constant params, buffers, textures, stage inputs and input blocks, stage
// outputs and output blocks; shaderGenerator.cpp:163-173), records the
// bindings it declares for the pipeline layout (_AddDescriptorSetLayoutBinding,
// :649-674), and _Execute visits the sections in the fixed global order
// (:561-619). The entry point follows pxr/imaging/hgiMetal/shaderGenerator.mm,
// because WGSL, like MSL, passes stage I/O through entry point parameters and
// results: entry point names, I/O struct names and the copy-in / main() /
// copy-out sequence follow _BuildShaderStageEntryPoints (:1333-1417) and
// _Execute (:1558-1656).
//
// The shader body is not compiled as GLSL. It goes through the
// HgiWebGPUShaderBodyTranslator seam (shaderBodyTranslator.ts), which
// receives the descriptor's declarations and code and every module-scope name
// generated here, and returns WGSL that defines fn main().

import {
  HgiBindingType,
  HgiFormat,
  HgiGetComponentBaseFormat,
  HgiInterpolationType,
  HgiSamplingType,
  HgiShaderGenerator,
  HgiShaderFunctionTessellationDesc,
  HgiShaderKeywordTokens,
  HgiShaderStageBits,
  HgiShaderTextureType,
  HgiTextureUsageBits,
  type HgiShaderFunctionBufferDesc,
  type HgiShaderFunctionDesc,
  type HgiShaderFunctionParamBlockDesc,
  type HgiShaderFunctionParamDesc,
  HgiShaderFunctionTextureDesc,
  HgiStringStream,
} from 'typescript-usd/hgi'
import {
  HgiWebGPUBufferBindGroup,
  HgiWebGPUConstantsBindGroup,
  HgiWebGPUControlPointIndexBinding,
  HgiWebGPUPatchDrawBinding,
  HgiWebGPUPulledAttributeBindingBase,
  HgiWebGPUSamplerBindGroup,
  HgiWebGPUTessPointsBinding,
  HgiWebGPUTextureBindGroup,
  type HgiWebGPUBindGroupLayoutInfoVector,
} from './bindGroupLayouts.ts'
import { GPUShaderStageFlags, HgiWebGPUConversions } from './conversions.ts'
import {
  HgiWebGPUBorderFootprintBinding,
  HgiWebGPUBorderFootprintFunction,
  HgiWebGPUBorderFunction,
  HgiWebGPUImplicitLodExpression,
  HgiWebGPUSamplerStateBinding,
  HgiWebGPUSamplerStateDeclaration,
  HgiWebGPUSamplerStateStruct,
} from './samplerState.ts'
import { HgiWebGPUResourceVariables, HgiWebGPUStaticallyUsedNames } from './staticUse.ts'
import { TF_CODING_ERROR, TF_WARN } from './diagnostic.ts'
import { HgiWebGPUAlphaToOneShaderSection } from './alphaToOne.ts'
import type {
  HgiWebGPUShaderBodyTranslator,
  HgiWebGPUShaderGlobal,
} from './shaderBodyTranslator.ts'
import {
  HgiWebGPUBlockShaderSection,
  HgiWebGPUBufferShaderSection,
  HgiWebGPUInterstageBlockShaderSection,
  HgiWebGPUKeywordShaderSection,
  HgiWebGPUMacroShaderSection,
  HgiWebGPUMemberShaderSection,
  HgiWebGPUPostTessVertexShaderSection,
  HgiWebGPUPointCoordLocation,
  HgiWebGPUFrontFacingLocation,
  HgiWebGPUShaderSection,
  type HgiWebGPUPulledAttribute,
  HgiWebGPUTextureShaderSection,
} from './shaderSection.ts'

/** What the generator needs from the Hgi (hgiVulkan passes `Hgi const*`,
 *  shaderGenerator.h:31-33). */
/** Interpolation and sampling per interstage location. */
export type HgiWebGPUInterstageInterpolation =
  Map<number, { interpolation: HgiInterpolationType, sampling: HgiSamplingType }>

export interface HgiWebGPUShaderGeneratorHgi {
  getShaderBodyTranslator(): HgiWebGPUShaderBodyTranslator
  /** Whether float32 textures may be filtered (WebGPU float32-filterable). */
  isFloat32Filterable(): boolean
  /** Whether the device has WebGPU's primitive-index feature (the
   *  fragment builtin primitive_index, GL's gl_PrimitiveID). Optional:
   *  without it gl_PrimitiveID reads 0. */
  hasPrimitiveIndex?(): boolean
  /** Whether the device has WebGPU's clip-distances feature (the vertex
   *  builtin clip_distances, GL's gl_ClipDistance). Optional: without it
   *  gl_ClipDistance is not written. */
  hasClipDistances?(): boolean
}

/** Variants of a shader function a pipeline state asks for. */
export interface HgiWebGPUShaderGeneratorOptions {
  /** HgiPolygonModeLine: a 'triangle' or 'quad' post-tessellation vertex
   *  function draws its triangles' edges and writes their facing
   *  (HgiWebGPUPostTessVertexShaderSection); a fragment function reads
   *  gl_FrontFacing from it. */
  polygonModeLine?: boolean
  /** HgiMultiSampleState alphaToCoverageEnable with alphaToOneEnable: a
   *  fragment function takes its sample coverage from its first color
   *  output's alpha and writes an alpha of 1 (alphaToOne.ts). */
  alphaToOne?: boolean
  /** A 'triangle' or 'quad' post-tessellation vertex function drawn with
   *  per-patch factors (HgiTessellationState::TessVertex): it reads the
   *  tessellator's points (HgiWebGPUPostTessVertexShaderSection). */
  tessellatedPatches?: boolean
  /** PLATFORM-DIVERGENCE(webgpu-storage-buffer-limit): a function with
   *  vertex pulling reads the control point indices and its attributes from
   *  one packed buffer (HgiWebGPUPostTessVertexShaderSection `packed`). */
  packedAttributes?: boolean
}

/** hgiVulkan/shaderGenerator.cpp:18-32. The packed vector and matrix types
 *  hdSt codegen declares buffers with. */
const _packedTypeDefinitions =
  'struct hgi_ivec3 { x: i32, y: i32, z: i32, };\n' +
  'struct hgi_vec3 { x: f32, y: f32, z: f32, };\n' +
  'struct hgi_mat3 { m00: f32, m01: f32, m02: f32,\n' +
  '                  m10: f32, m11: f32, m12: f32,\n' +
  '                  m20: f32, m21: f32, m22: f32, };\n'

const _scalarTypes: Record<string, string> = {
  float: 'f32', int: 'i32', uint: 'u32', bool: 'bool',
  atomic_int: 'atomic<i32>', atomic_uint: 'atomic<u32>',
}
const _vectorPrefixes: Record<string, string> = { vec: 'f32', ivec: 'i32', uvec: 'u32', bvec: 'bool' }

/** Builtin stage inputs WebGPU provides: role -> [builtin, WGSL type, stages].
 *  From the role maps of hgiVulkan (_WriteInOuts takenInParams,
 *  shaderGenerator.cpp:402-421) and hgiMetal (_GetBuiltinInputKeyword,
 *  shaderGenerator.mm:152-187). */
const _builtinInputs: Record<string, [string, string]> = {
  [HgiShaderKeywordTokens.hdVertexID]: ['vertex_index', 'u32'],
  [HgiShaderKeywordTokens.hdInstanceID]: ['instance_index', 'u32'],
  [HgiShaderKeywordTokens.hdPosition]: ['position', 'vec4<f32>'],
  [HgiShaderKeywordTokens.hdFragCoord]: ['position', 'vec4<f32>'],
  [HgiShaderKeywordTokens.hdFrontFacing]: ['front_facing', 'bool'],
  [HgiShaderKeywordTokens.hdSampleID]: ['sample_index', 'u32'],
  [HgiShaderKeywordTokens.hdSampleMaskIn]: ['sample_mask', 'u32'],
  [HgiShaderKeywordTokens.hdGlobalInvocationID]: ['global_invocation_id', 'vec3<u32>'],
}

/** Builtin stage inputs of the upstream role maps with no WebGPU builtin.
 *  The post-tessellation vertex stage derives hdPatchID, hdPositionInPatch
 *  and hdBaseInstance itself (HgiWebGPUPostTessVertexShaderSection), and
 *  hdPrimitiveID is declared unread under primitive-ID emulation (see
 *  _WriteInOuts). */
const _unsupportedInputs = new Set<string>([
  HgiShaderKeywordTokens.hdPointCoord,
  HgiShaderKeywordTokens.hdClipDistance,
  HgiShaderKeywordTokens.hdCullDistance,
  HgiShaderKeywordTokens.hdPrimitiveID,
  HgiShaderKeywordTokens.hdSamplePosition,
  HgiShaderKeywordTokens.hdLayer,
  HgiShaderKeywordTokens.hdViewportIndex,
  HgiShaderKeywordTokens.hdBaseVertex,
  HgiShaderKeywordTokens.hdBaseInstance,
  HgiShaderKeywordTokens.hdPositionInPatch,
  HgiShaderKeywordTokens.hdPatchID,
  HgiShaderKeywordTokens.hdBaryCoordNoPersp,
])

/** Builtin stage outputs: role -> [builtin, WGSL type]
 *  (hgiMetal/shaderGenerator.mm:189-214, plus "position" which hgiMetal
 *  writes as the [[position]] attribute, :750-755). */
const _builtinOutputs: Record<string, [string, string]> = {
  position: ['position', 'vec4<f32>'],
  [HgiShaderKeywordTokens.hdSampleMask]: ['sample_mask', 'u32'],
  [HgiShaderKeywordTokens.hdDepthAny]: ['frag_depth', 'f32'],
  [HgiShaderKeywordTokens.hdDepthGreater]: ['frag_depth', 'f32'],
  [HgiShaderKeywordTokens.hdDepthLess]: ['frag_depth', 'f32'],
}

/** Outputs GLSL backends treat as builtins (hgiVulkan/shaderGenerator.cpp:
 *  387-400) that have no WebGPU output; they stay module-scope variables the
 *  body may write. */
const _unsupportedOutputs = new Set(['gl_PointSize', 'gl_ClipDistance', 'gl_CullDistance'])

/** The name in WGSL of element `index` of an array of textures
 *  (HgiWebGPUShaderGenerator._WriteArrayOfTextures): its bindings are
 *  textureBind_<element> and samplerBind_<element>. */
export function HgiWebGPUArrayOfTexturesElementName(name: string, index: number): string {
  return `${name}_hgiElement${index}`
}

export class HgiWebGPUShaderGenerator extends HgiShaderGenerator {
  private readonly _shaderSections: HgiWebGPUShaderSection[] = []
  private readonly _bindGroupLayoutInfo: HgiWebGPUBindGroupLayoutInfoVector = []
  /** Writable storage buffers declared read_write, with their declaration
   *  and layout entry (_declareUnwrittenBuffersReadOnly). */
  private readonly _writableBuffers: { name: string, section: HgiWebGPUBufferShaderSection, entry: GPUBindGroupLayoutEntry }[] = []
  private readonly _globals: HgiWebGPUShaderGlobal[] = []
  private readonly _errors: string[] = []
  private _inLocationIndex = 0
  /** The fragment stage reads @builtin(primitive_index). */
  private _usesPrimitiveIndex = false
  /** The vertex stage writes @builtin(clip_distances). */
  private _usesClipDistances = false
  private _outLocationIndex = 0
  private _colorIndex = 0
  /** The locations of the fragment stage's color outputs. */
  private readonly _colorOutputLocations: number[] = []
  /** The generated code before the entry point, kept so the entry point
   *  can be written again with matched interstage interpolation. */
  private _codeBeforeEntryPoint = ''
  /** The emulated post-tessellation vertex stage's inputs, gathered by
   *  _WriteInOuts (HgiShaderStagePostTessellationVertex only). */
  private readonly _postTess: {
    controlPoints: number
    attributes: HgiWebGPUPulledAttribute[]
    patchId: { name: string, type: string } | null
    positionInPatch: { name: string, type: string } | null
    baseInstance: { name: string, type: string } | null
    instanceId: string | null
    /** Vertex functions drawn with vertex pulling only. */
    pulled: 'vertex' | 'point' | null
    /** The post-tessellation control stage, run as a compute dispatch. */
    control: boolean
    vertexId: { name: string, type: string } | null
    baseVertex: { name: string, type: string } | null
    pointSize: string | null
    position: string
  } | null
  private _postTessSection: HgiWebGPUPostTessVertexShaderSection | null = null
  /** Post-tessellation control stage: the buffers the body writes Metal
   *  half-float tessellation factors to (see _RewriteTessFactorWrites), and
   *  the bind index of the first. */
  private readonly _tessFactorBuffers = new Set<string>()
  private _tessFactorsBindIndex: number | null = null
  private readonly _entryPoint: {
    functionName: string
    stageAttribute: string
    inputsTypeName: string
    inputsInstanceName: string
    outputsTypeName: string
    outputsInstanceName: string
    constantsTypeName: string
    constantsInstanceName: string
  } | null

  /** hgiVulkan/shaderGenerator.cpp:45-174 */
  constructor(private readonly _hgi: HgiWebGPUShaderGeneratorHgi, descriptor: HgiShaderFunctionDesc,
    private readonly _options: HgiWebGPUShaderGeneratorOptions = {}) {
    super(descriptor)

    this._entryPoint = this._buildShaderStageEntryPoint(descriptor)
    const pulled = HgiWebGPUShaderGenerator._getPulledVertexKind(descriptor)
    const control = descriptor.shaderStage === HgiShaderStageBits.HgiShaderStagePostTessellationControl
    this._postTess = descriptor.shaderStage === HgiShaderStageBits.HgiShaderStagePostTessellationVertex || pulled || control
      ? {
          controlPoints: pulled ? 1 : this._getControlPointsPerPatch(descriptor),
          attributes: [], patchId: null, positionInPatch: null, baseInstance: null, instanceId: null,
          pulled, control, vertexId: null, baseVertex: null, pointSize: null, position: '',
        }
      : null
    if (control) {
      // Curves.TessFactorsMSL and Mesh.PostTessControl.* write the factors
      // through `(device half *)<buffer>` (hdSt/shaders/basisCurves.glslfx:
      // 137-151, mesh.glslfx:641-649, 826-832).
      for (const m of (descriptor.shaderCode ?? '').matchAll(/\(\s*device\s+half\s*\*\s*\)\s*(\w+)/g)) {
        this._tessFactorBuffers.add(m[1]!)
      }
    }

    this.createShaderSection(new HgiWebGPUMacroShaderSection(
      this._getHeader(descriptor), 'Headers'))

    // Currently we don't add qualifiers for global uniforms.
    // (hgiMetal/shaderGenerator.mm:1426-1437)
    for (const member of descriptor.stageGlobalMembers) {
      const type = HgiWebGPUShaderGenerator.getWGSLType(member.type)
      this.createShaderSection(new HgiWebGPUMemberShaderSection(
        member.nameInShader, type,
        HgiInterpolationType.HgiInterpolationDefault, HgiSamplingType.HgiSamplingDefault,
        null, member.arraySize))
      // The declared type, array size included, as for the stage inputs and
      // outputs (the section writes the same `array<T, N>`).
      this._globals.push({
        name: member.nameInShader,
        wgslType: member.arraySize ? `array<${type}, ${member.arraySize}>` : type,
        kind: 'globalMember',
      })
    }

    // The ordering follows hgiVulkan (buffers before textures); with
    // separate bind groups it no longer shifts bind indices.
    this._writeConstantParams(descriptor.constantParams)
    this._writeBuffers(descriptor.buffers)
    this._writeTextures(descriptor.textures)
    this._writeInOuts(descriptor.stageInputs, 'in')
    this._writeInOutBlocks(descriptor.stageInputBlocks, 'in')
    this._writeInOuts(descriptor.stageOutputs, 'out')
    this._writeInOutBlocks(descriptor.stageOutputBlocks, 'out')
    this._writePostTessVertexEmulation(descriptor)
    if (this._options.alphaToOne && descriptor.shaderStage === HgiShaderStageBits.HgiShaderStageFragment) {
      this._writeAlphaToOne()
    }
    if (this._options.polygonModeLine &&
        Math.max(this._inLocationIndex, this._outLocationIndex) > HgiWebGPUFrontFacingLocation) {
      this._errors.push(`HgiWebGPU: interstage location ${HgiWebGPUFrontFacingLocation} is needed for ` +
        'the emulated HgiPolygonModeLine and is in use')
    }
  }

  /** The alpha-to-one variant's section (alphaToOne.ts), from the stage
   *  I/O written above; last, so that it runs after the outputs are copied
   *  out. */
  private _writeAlphaToOne(): void {
    let fragCoord: string | null = null, sampleMask: string | null = null, firstColor: string | null = null
    const colors: string[] = []
    for (const section of this._shaderSections) {
      if (!(section instanceof HgiWebGPUMemberShaderSection)) continue
      const io = section.getStageIO()
      if (!io) continue
      if (io.direction === 'input' && io.attribute === '@builtin(position)') fragCoord = section.getIOName()
      if (io.direction !== 'output') continue
      if (io.attribute === '@builtin(sample_mask)') sampleMask = section.getIOName()
      if (io.attribute.startsWith('@location(') && io.ioType === 'vec4<f32>') {
        colors.push(section.getIOName())
        if (io.attribute === '@location(0)') firstColor = section.getIOName()
      }
    }
    if (firstColor === null) {
      this._errors.push('HgiWebGPU: alpha to coverage needs a vec4 color output at location 0')
      return
    }
    this.createShaderSection(new HgiWebGPUAlphaToOneShaderSection({
      inputs: this._entryPoint!.inputsInstanceName, fragCoord, sampleMask, firstColor, colors }))
  }

  /** hgiVulkan/shaderGenerator.cpp:621-625 */
  getShaderSections(): HgiWebGPUShaderSection[] {
    return this._shaderSections
  }

  /** hgiVulkan/shaderGenerator.cpp:34-43 */
  createShaderSection<T extends HgiWebGPUShaderSection>(section: T): T {
    this._shaderSections.push(section)
    return section
  }

  /** hgiVulkan/shaderGenerator.cpp:627-647: the bindings this function
   *  declares, per bind group. */
  /** The locations of the color outputs a fragment function declares. */
  getColorOutputLocations(): readonly number[] {
    return this._colorOutputLocations
  }

  getBindGroupLayoutInfo(): HgiWebGPUBindGroupLayoutInfoVector {
    return this._bindGroupLayoutInfo
  }

  /** The module-scope names generated for the shader body. */
  getShaderBodyGlobals(): readonly HgiWebGPUShaderGlobal[] {
    return this._globals
  }

  /** Errors found while generating (unsupported stages, features and
   *  translation errors), reported as compile errors by
   *  HgiWebGPUShaderFunction. */
  getGeneratorErrors(): string {
    return this._errors.join('\n')
  }

  /** The WGSL entry point name: vertexEntryPoint, fragmentEntryPoint or
   *  computeEntryPoint (hgiMetal/shaderGenerator.mm:1007, 1382). */
  getEntryPointFunctionName(): string {
    return this._entryPoint?.functionName ?? ''
  }

  /** The emulated post-tessellation vertex stage, or null for other
   *  stages. HgiWebGPUGraphicsPipeline reads the pulled attributes and the
   *  vertices drawn per patch from it. */
  getPostTessVertexSection(): HgiWebGPUPostTessVertexShaderSection | null {
    return this._postTessSection
  }

  /** The WGSL type for an Hgi (GLSL-spelled) type name, the role
   *  hgiMetal's _ComputeHeader #defines play for MSL
   *  (hgiMetal/shaderGenerator.mm:415-635). Unknown names (struct types the
   *  body declares) pass through. WGSL has no double precision: double types
   *  map to their float counterparts, and HgiWebGPUCapabilities reports
   *  HgiDeviceCapabilitiesBitsShaderDoublePrecision unset, as hgiMetal does
   *  (capabilities.mm:73). */
  static getWGSLType(type: string): string {
    const t = type.trim()
    if (_scalarTypes[t]) return _scalarTypes[t]!
    if (t === 'double') return 'f32'
    let m = /^(vec|ivec|uvec|bvec|dvec)([234])$/.exec(t)
    if (m) return `vec${m[2]}<${m[1] === 'dvec' ? 'f32' : _vectorPrefixes[m[1]!]}>`
    m = /^d?mat([234])(?:x([234]))?$/.exec(t)
    if (m) return `mat${m[1]}x${m[2] ?? m[1]}<f32>`
    if (t === 'hgi_dvec3') return 'hgi_vec3'
    if (t === 'hgi_dmat3') return 'hgi_mat3'
    return t
  }

  /** hgiMetal/shaderGenerator.mm:1333-1417 */
  private _buildShaderStageEntryPoint(descriptor: HgiShaderFunctionDesc) {
    const make = (prefix: string, stage: string, attribute: string, fn: string) => ({
      functionName: fn,
      stageAttribute: attribute,
      inputsTypeName: `WGSL${prefix[0]!.toUpperCase()}${prefix[1]}Inputs`,
      inputsInstanceName: `${prefix}Input`,
      outputsTypeName: `WGSL${prefix[0]!.toUpperCase()}${prefix[1]}Outputs`,
      outputsInstanceName: `${prefix}Output`,
      constantsTypeName: 'ParamBuffer',
      constantsInstanceName: `${prefix}Uniforms`,
      stage,
    })
    switch (descriptor.shaderStage) {
      case HgiShaderStageBits.HgiShaderStageVertex:
        return make('vs', 'vertex', '@vertex', 'vertexEntryPoint')
      case HgiShaderStageBits.HgiShaderStageFragment:
        // _BuildFragmentAttribute (:1308-1316): WGSL fragment shaders run
        // early depth tests whenever they do not write frag_depth, so
        // earlyFragmentTests needs no attribute.
        return make('fs', 'fragment', '@fragment', 'fragmentEntryPoint')
      case HgiShaderStageBits.HgiShaderStageCompute: {
        // _BuildComputeAttribute (:1318-1331) and the local size default of
        // hgiVulkan/shaderGenerator.cpp:57-73.
        let [x, y, z] = descriptor.computeDescriptor.localSize.data
        if (!x || !y || !z) { x = 1; y = 1; z = 1 }
        return make('cs', 'compute', `@compute @workgroup_size(${x}, ${y}, ${z})`,
          'computeEntryPoint')
      }
      case HgiShaderStageBits.HgiShaderStagePostTessellationVertex: {
        // hgiMetal/shaderGenerator.mm:1385-1397 ("tv", entry point
        // vertexEntryPoint, hgiMetal/shaderFunction.mm:65) with the
        // [[patch(...)]] attribute of _BuildTessAttribute (:1287-1306).
        // WebGPU has no patch functions: the stage is a vertex function that
        // emulates the tessellated draw (HgiWebGPUPostTessVertexShaderSection,
        // HgiWebGPUTessellation).
        const patchType = descriptor.tessellationDescriptor.patchType
        if (patchType === HgiShaderFunctionTessellationDesc.PatchType.Isolines) {
          TF_CODING_ERROR('HgiWebGPU: isoline patches are not supported')
          this._errors.push('HgiWebGPU: post-tessellation vertex stage: isoline patches are not supported')
          return null
        }
        return make('tv', 'vertex', '@vertex', 'vertexEntryPoint')
      }
      case HgiShaderStageBits.HgiShaderStagePostTessellationControl:
        // hgiMetal draws the post-tessellation control function as the
        // vertex function of a rasterizer-disabled patch draw
        // (graphicsPipeline.mm:187-193, shaderFunction.mm:65). WebGPU
        // vertex functions cannot write storage buffers, so the stage is a
        // compute entry point, one invocation per patch (x) and instance
        // (y) (HgiWebGPUPostTessVertexShaderSection, 'control').
        return make('tc', 'compute', '@compute @workgroup_size(64)', 'computeEntryPoint')
      default:
        // Tessellation and geometry stages have no WebGPU counterpart.
        TF_CODING_ERROR('Unknown shader stage')
        this._errors.push(`HgiWebGPU: shader stage ${descriptor.shaderStage} is not supported by WebGPU`)
        return null
    }
  }

  /** Whether a vertex function is drawn with vertex pulling
   *  (HgiWebGPUPostTessVertexShaderSection, 'vertex' and 'point'): a
   *  point-list function (its gl_PointSize output has the point_size role,
   *  which Storm gives it only for points, hdSt/codeGen.cpp:3147-3154), or
   *  one that reads gl_BaseVertex or hd_BaseInstance, which hgiMetal binds
   *  as [[base_vertex]] / [[base_instance]] (shaderGenerator.mm:152-187)
   *  and WGSL has no builtin for. */
  private static _getPulledVertexKind(descriptor: HgiShaderFunctionDesc): 'vertex' | 'point' | null {
    if (descriptor.shaderStage !== HgiShaderStageBits.HgiShaderStageVertex) return null
    if (descriptor.stageOutputs.some(p => p.role === 'point_size')) return 'point'
    if (descriptor.stageInputs.some(p => p.role === HgiShaderKeywordTokens.hdBaseVertex ||
        p.role === HgiShaderKeywordTokens.hdBaseInstance)) return 'vertex'
    return null
  }

  /** numVertsPerPatchIn, the VERTEX_CONTROL_POINTS_PER_PATCH hgiMetal
   *  defines for patch functions (hgiMetal/shaderGenerator.mm:1442-1446). */
  private _getControlPointsPerPatch(descriptor: HgiShaderFunctionDesc): number {
    const n = Number(descriptor.tessellationDescriptor.numVertsPerPatchIn)
    if (!Number.isInteger(n) || n <= 0) {
      TF_CODING_ERROR(`HgiWebGPU: invalid numVertsPerPatchIn '${descriptor.tessellationDescriptor.numVertsPerPatchIn}'`)
      this._errors.push('HgiWebGPU: post-tessellation vertex stage has no control point count')
      return 1
    }
    return n
  }

  /** The emulated post-tessellation vertex stage
   *  (HgiWebGPUPostTessVertexShaderSection) and its bindings, in the
   *  constants bind group. */
  private _writePostTessVertexEmulation(descriptor: HgiShaderFunctionDesc): void {
    const pt = this._postTess
    if (!pt || !this._entryPoint) return
    const patchType = pt.pulled ?? (pt.control ? 'control' : descriptor.tessellationDescriptor.patchType ===
      HgiShaderFunctionTessellationDesc.PatchType.Triangles ? 'triangle' : 'quad')
    this._postTessSection = this.createShaderSection(new HgiWebGPUPostTessVertexShaderSection({
      group: HgiWebGPUConstantsBindGroup,
      patchDrawBinding: HgiWebGPUPatchDrawBinding,
      controlPointIndexBinding: HgiWebGPUControlPointIndexBinding,
      attributeBindingBase: HgiWebGPUPulledAttributeBindingBase,
      tessPointsBinding: HgiWebGPUTessPointsBinding,
      controlPoints: pt.controlPoints,
      patchType,
      attributes: pt.attributes,
      patchId: pt.patchId,
      positionInPatch: pt.positionInPatch,
      baseInstance: pt.baseInstance,
      instanceId: pt.instanceId,
      vertexId: pt.vertexId,
      baseVertex: pt.baseVertex,
      tessellated: !!this._options.tessellatedPatches,
      packed: !!this._options.packedAttributes,
      ...(this._options.polygonModeLine && (patchType === 'triangle' || patchType === 'quad') ? { lines: {
        position: pt.position, frontFacingLocation: HgiWebGPUFrontFacingLocation,
      } } : {}),
      ...(pt.pulled === 'point' ? { point: {
        pointSize: pt.pointSize, position: pt.position,
        pointCoordLocation: HgiWebGPUPointCoordLocation,
      } } : {}),
    }))
    const visibility = this._stageVisibility()
    this._addBindGroupLayoutEntry(HgiWebGPUConstantsBindGroup, {
      binding: HgiWebGPUPatchDrawBinding, visibility,
      buffer: { type: 'uniform', hasDynamicOffset: true },
    })
    this._addBindGroupLayoutEntry(HgiWebGPUConstantsBindGroup, {
      binding: HgiWebGPUControlPointIndexBinding, visibility,
      buffer: { type: 'read-only-storage' },
    })
    // Packed: the control point index binding holds the attributes too.
    for (const a of this._options.packedAttributes ? [] : pt.attributes) {
      this._addBindGroupLayoutEntry(HgiWebGPUConstantsBindGroup, {
        binding: HgiWebGPUPulledAttributeBindingBase + a.location, visibility,
        buffer: { type: 'read-only-storage' },
      })
    }
    if ((patchType === 'triangle' || patchType === 'quad') && this._options.tessellatedPatches) {
      this._addBindGroupLayoutEntry(HgiWebGPUConstantsBindGroup, {
        binding: HgiWebGPUTessPointsBinding, visibility,
        buffer: { type: 'read-only-storage' },
      })
    }
  }

  /** The post-tessellation control stage's buffer of half-float factors
   *  (the bind index the draw binds it at), or null. */
  getTessFactorsBindIndex(): number | null {
    return this._tessFactorsBindIndex
  }

  /** WebGPU adaptation of the Metal-only factor writes of Storm's
   *  post-tessellation control stages (hdSt/shaders/basisCurves.glslfx:
   *  137-151 Curves.TessFactorsMSL, mesh.glslfx:641-649, 826-832):
   *      device half *X = (device half *)B + patch_id * N;
   *      X[k] = half(v);
   *  become writes of the same half-float bits (Metal's half() rounds to
   *  nearest even) into B, declared array<u32>, two halves per word.
   *  patch_id counts from the factor buffer's first patch, as on the
   *  reference GPU, so each draw of a batch writes its own patches' factors.
   *  Any other Metal-only construct is reported. */
  private _rewriteTessFactorWrites(code: string): string {
    const pointers = new Map<string, string>()
    let out = code.replace(
      /device\s+half\s*\*\s*(\w+)\s*=\s*\(\s*device\s+half\s*\*\s*\)\s*(\w+)\s*\+\s*(\w+)\s*\*\s*(\d+)\s*;/g,
      (_m, x: string, b: string, patchId: string, n: string) => {
        pointers.set(x, b)
        return `uint ${x} = uint(${patchId}) * ${n}u;`
      })
    for (const [x, b] of pointers) {
      out = out.replace(new RegExp(`\\b${x}\\s*\\[([^\\]]+)\\]\\s*=\\s*half\\s*\\(([^;]*)\\)\\s*;`, 'g'),
        (_m, k: string, v: string) => `hgiWebGPU_SetTessFactor_${b}(${x} + uint(${k.trim()}), ${v.trim()});`)
    }
    if (/\bdevice\s+half\b|\bhalf\s*\(/.test(out)) {
      this._errors.push('HgiWebGPU: post-tessellation control stage writes Metal half-float data ' +
        'in a form HgiWebGPU does not translate')
    }
    if (pointers.size === 0) return out
    let helpers =
      '// HgiWebGPU: Metal\'s float to half conversion (round to nearest even), as bits.\n' +
      'uint hgiWebGPU_HalfBits(float value) {\n' +
      '    uint x = floatBitsToUint(value);\n' +
      '    uint sign = (x >> 16u) & 0x8000u;\n' +
      '    uint e = (x >> 23u) & 0xffu;\n' +
      '    uint m = x & 0x7fffffu;\n' +
      '    if (e == 0xffu) { return sign | 0x7c00u | (m != 0u ? 0x200u : 0u); }\n' +
      '    int he = int(e) - 112;\n' +
      '    if (he >= 31) { return sign | 0x7c00u; }\n' +
      '    if (he <= 0) {\n' +
      '        if (he < -10) { return sign; }\n' +
      '        m = m | 0x800000u;\n' +
      '        uint shift = uint(14 - he);\n' +
      '        uint hm = m >> shift;\n' +
      '        uint rem = m & ((1u << shift) - 1u);\n' +
      '        uint halfway = 1u << (shift - 1u);\n' +
      '        if (rem > halfway || (rem == halfway && (hm & 1u) != 0u)) { hm = hm + 1u; }\n' +
      '        return sign | hm;\n' +
      '    }\n' +
      '    uint r = sign | (uint(he) << 10u) | (m >> 13u);\n' +
      '    uint rem = m & 0x1fffu;\n' +
      '    if (rem > 0x1000u || (rem == 0x1000u && (r & 1u) != 0u)) { r = r + 1u; }\n' +
      '    return r;\n' +
      '}\n'
    for (const b of new Set(pointers.values())) {
      helpers +=
        `void hgiWebGPU_SetTessFactor_${b}(uint i, float v) {\n` +
        '    uint w = i >> 1u;\n' +
        '    uint s = (i & 1u) * 16u;\n' +
        `    ${b}[w] = (${b}[w] & ~(0xffffu << s)) | (hgiWebGPU_HalfBits(v) << s);\n` +
        '}\n'
    }
    return helpers + out
  }

  /** The module header: diagnostics and packed types. Stands in for
   *  hgiVulkan's _WriteVersion/_WriteExtensions/_WriteMacros
   *  (shaderGenerator.cpp:176-256) and hgiMetal's _GetHeader. */
  private _getHeader(descriptor: HgiShaderFunctionDesc): string {
    let header = ''
    if (descriptor.shaderStage === HgiShaderStageBits.HgiShaderStageFragment) {
      // GLSL permits implicit-derivative texture sampling in non-uniform
      // control flow (the result is undefined there); WGSL rejects it at
      // compile time unless this diagnostic is off.
      header += 'diagnostic(off, derivative_uniformity);\n'
    }
    header += _packedTypeDefinitions
    return header
  }

  /** hgiVulkan/shaderGenerator.cpp:258-268 */
  private _writeConstantParams(parameters: readonly HgiShaderFunctionParamDesc[]): void {
    if (parameters.length === 0 || !this._entryPoint) {
      return
    }
    const params = parameters.map(p => ({
      name: p.nameInShader,
      type: HgiWebGPUShaderGenerator.getWGSLType(p.type),
    }))
    this.createShaderSection(new HgiWebGPUBlockShaderSection(
      this._entryPoint.constantsTypeName, this._entryPoint.constantsInstanceName,
      params, HgiWebGPUConstantsBindGroup))
    for (const p of params) {
      this._globals.push({ name: p.name, wgslType: p.type, kind: 'constantParam' })
    }
    this._addBindGroupLayoutEntry(HgiWebGPUConstantsBindGroup, {
      binding: 0,
      visibility: this._stageVisibility(),
      buffer: { type: 'uniform', hasDynamicOffset: true },
    })
  }

  /** hgiVulkan/shaderGenerator.cpp:270-312 */
  private _writeTextures(textures: readonly HgiShaderFunctionTextureDesc[]): void {
    let samplerStateCount = 0
    for (const desc of textures) {
      if (desc.arraySize > 0) {
        samplerStateCount = Math.max(samplerStateCount, this._writeArrayOfTextures(desc))
        continue
      }
      const decl = this._textureDeclaration(desc)
      this.createShaderSection(new HgiWebGPUTextureShaderSection(desc.nameInShader, {
        textureGroup: HgiWebGPUTextureBindGroup,
        samplerGroup: HgiWebGPUSamplerBindGroup,
        bindIndex: desc.bindIndex,
        textureType: decl.textureType,
        samplerType: decl.samplerType,
        functions: decl.functions,
      }))
      this._globals.push({ name: desc.nameInShader, wgslType: decl.textureType, kind: 'texture' })

      this._addBindGroupLayoutEntry(HgiWebGPUTextureBindGroup, {
        binding: desc.bindIndex,
        visibility: this._stageVisibility(),
        ...decl.layout,
      })
      if (decl.samplerLayout) {
        this._addBindGroupLayoutEntry(HgiWebGPUSamplerBindGroup, {
          binding: desc.bindIndex,
          visibility: this._stageVisibility(),
          sampler: decl.samplerLayout,
        })
      }
      if ('footprint' in decl && decl.footprint) this._addBorderFootprintEntries(desc.bindIndex, decl.samplerLayout)
      if ('border' in decl && decl.border) {
        if (desc.bindIndex >= HgiWebGPUSamplerStateBinding) {
          TF_CODING_ERROR(`HgiWebGPU: texture bind index ${desc.bindIndex} of '${desc.nameInShader}' ` +
            `reaches the sampler-state binding ${HgiWebGPUSamplerStateBinding}`)
        }
        samplerStateCount = Math.max(samplerStateCount, desc.bindIndex + 1)
      }
    }
    // The sampler state of the clamp-to-border emulation (samplerState.ts).
    if (samplerStateCount > 0) {
      this.createShaderSection(new HgiWebGPUMacroShaderSection(
        HgiWebGPUSamplerStateStruct() +
        HgiWebGPUSamplerStateDeclaration(HgiWebGPUSamplerBindGroup, samplerStateCount),
        'Sampler state'))
      this._addBindGroupLayoutEntry(HgiWebGPUSamplerBindGroup, {
        binding: HgiWebGPUSamplerStateBinding,
        visibility: this._stageVisibility(),
        buffer: { type: 'uniform' },
      })
    }
  }

  /** The footprint texture and sampler of a border-emulated 2D texture
   *  (samplerState.ts). */
  private _addBorderFootprintEntries(bindIndex: number, samplerLayout: GPUSamplerBindingLayout | null): void {
    this._addBindGroupLayoutEntry(HgiWebGPUTextureBindGroup, {
      binding: HgiWebGPUBorderFootprintBinding + bindIndex,
      visibility: this._stageVisibility(),
      texture: { sampleType: 'float', viewDimension: '2d', multisampled: false },
    })
    this._addBindGroupLayoutEntry(HgiWebGPUSamplerBindGroup, {
      binding: HgiWebGPUBorderFootprintBinding + bindIndex,
      visibility: this._stageVisibility(),
      sampler: samplerLayout ?? { type: 'filtering' },
    })
  }

  /** An array of textures (HgiShaderFunctionAddArrayOfTextures; Storm's
   *  shadowCompareTextures, hdSt/simpleLightingShader.cpp:245-258).
   *  hgiVulkan declares one binding holding a descriptor array
   *  (shaderGenerator.cpp:299-310, `sampler2DShadow name[N]`,
   *  shaderSection.cpp:254-301) and hgiMetal an argument-buffer array of
   *  textures (shaderSection.mm:274-286); the accessors take the element
   *  index first (`uint index`, hgiVulkan/shaderSection.cpp:379-433,
   *  hgiMetal/shaderSection.mm:513-560).
   *
   *  WebGPU has no binding arrays (a texture binding holds one texture view),
   *  so each element is its own texture and sampler binding at bindIndex + i,
   *  as hgiGL binds an array of textures to consecutive units
   *  (hgiGL/resourceBindings.cpp:38-80); HgiWebGPUCapabilities therefore does
   *  not set SingleSlotResourceArrays and Storm reserves the N units
   *  (hdSt/resourceBinder.cpp:802-808). The index-taking accessors Storm's
   *  GLSL calls (HgiGet_name(index, uv), ...) switch on the index to the
   *  element's accessors, so the GLSL is unchanged. Returns the number of
   *  sampler-state slots the elements use (the clamp-to-border emulation).
   *  A 2d-array texture (one layer per element) is not used: the elements
   *  are separate textures of possibly different sizes (one shadow map per
   *  light at its own resolution, hdSt/simpleLightingShader.cpp:573-620). */
  private _writeArrayOfTextures(desc: HgiShaderFunctionTextureDesc): number {
    const name = desc.nameInShader
    if (desc.writable) {
      // hgiVulkan writes HgiSet_ without an index (shaderSection.cpp:357-377):
      // writable arrays of textures are not supported upstream either.
      TF_CODING_ERROR(`HgiWebGPU: writable array of textures '${name}' is not supported`)
      this._errors.push(`HgiWebGPU: writable array of textures '${name}' is not supported`)
      return 0
    }
    let samplerStateCount = 0
    let decl: ReturnType<HgiWebGPUShaderGenerator['_textureDeclaration']> | null = null
    const elements: string[] = []
    const sections: HgiWebGPUTextureShaderSection[] = []
    const dispatchFunctions = (d: NonNullable<typeof decl>): string =>
      'accessorTypes' in d && d.accessorTypes ? this._arrayOfTexturesAccessors(name, elements, d.accessorTypes) : ''
    for (let i = 0; i < desc.arraySize; i++) {
      const element = Object.assign(new HgiShaderFunctionTextureDesc(), desc, {
        nameInShader: HgiWebGPUArrayOfTexturesElementName(name, i),
        bindIndex: desc.bindIndex + i,
        arraySize: 0,
      })
      decl = this._textureDeclaration(element)
      elements.push(element.nameInShader)
      sections.push(new HgiWebGPUTextureShaderSection(element.nameInShader, {
        textureGroup: HgiWebGPUTextureBindGroup,
        samplerGroup: HgiWebGPUSamplerBindGroup,
        bindIndex: element.bindIndex,
        textureType: decl.textureType,
        samplerType: decl.samplerType,
        functions: decl.functions + (i === desc.arraySize - 1 ? dispatchFunctions(decl) : ''),
      }))
      this._addBindGroupLayoutEntry(HgiWebGPUTextureBindGroup, {
        binding: element.bindIndex,
        visibility: this._stageVisibility(),
        ...decl.layout,
      })
      if (decl.samplerLayout) {
        this._addBindGroupLayoutEntry(HgiWebGPUSamplerBindGroup, {
          binding: element.bindIndex,
          visibility: this._stageVisibility(),
          sampler: decl.samplerLayout,
        })
      }
      if ('footprint' in decl && decl.footprint) this._addBorderFootprintEntries(element.bindIndex, decl.samplerLayout)
      if ('border' in decl && decl.border) {
        if (element.bindIndex >= HgiWebGPUSamplerStateBinding) {
          TF_CODING_ERROR(`HgiWebGPU: texture bind index ${element.bindIndex} of '${name}' ` +
            `reaches the sampler-state binding ${HgiWebGPUSamplerStateBinding}`)
        }
        samplerStateCount = Math.max(samplerStateCount, element.bindIndex + 1)
      }
    }
    for (const section of sections) this.createShaderSection(section)
    if (decl) this._globals.push({ name, wgslType: decl.textureType, kind: 'texture' })
    return samplerStateCount
  }

  /** The index-taking accessors of an array of textures
   *  (hgiVulkan/shaderSection.cpp:379-433), switching on the index to the
   *  accessors of the elements (_WriteArrayOfTextures). */
  private _arrayOfTexturesAccessors(name: string, elements: readonly string[],
    t: { resultType: string, sizeType: string, floatCoordType: string, intCoordType: string,
      sampledType: string, texelFetch: boolean }): string {
    const dispatch = (fn: string, params: string, args: string, result: string) => {
      let body = `fn ${fn}_${name}(index: u32${params}) -> ${result} {\n` +
        `  var result: ${result};\n  switch index {\n`
      elements.forEach((element, i) => {
        body += `    case ${i}u: { result = ${fn}_${element}(${args}); }\n`
      })
      // An index out of range is undefined upstream (GLSL/MSL array
      // indexing); here it reads zero.
      body += '    default: {}\n  }\n  return result;\n}\n'
      return body
    }
    let functions = dispatch('HgiGet', `, uv: ${t.floatCoordType}`, 'uv', t.resultType)
    functions += dispatch('HgiGetSize', '', '', t.sizeType)
    functions += dispatch('HgiTextureLod', `, uv: ${t.floatCoordType}, lod: f32`, 'uv, lod', t.resultType)
    if (t.texelFetch) {
      functions += dispatch('HgiTexelFetch', `, uv: ${t.intCoordType}`, 'uv', t.sampledType)
    }
    return functions
  }

  /** The WGSL declaration and accessors of one texture: the WGSL rendering
   *  of hgiVulkan's HgiVulkanTextureShaderSection::WriteType and
   *  VisitGlobalFunctionDefinitions (shaderSection.cpp:254-435). */
  private _textureDeclaration(desc: HgiShaderFunctionTextureDesc) {
    const name = desc.nameInShader
    const tex = `textureBind_${name}`
    const smp = `samplerBind_${name}`
    const shadow = desc.textureType === HgiShaderTextureType.HgiShaderTextureTypeShadowTexture
    const array = desc.textureType === HgiShaderTextureType.HgiShaderTextureTypeArrayTexture
    const cube = desc.textureType === HgiShaderTextureType.HgiShaderTextureTypeCubemapTexture
    const dims = Math.min(Math.max(desc.dimensions, 1), 3)
    if (desc.dimensions < 1 || desc.dimensions > 3) {
      TF_CODING_ERROR('Invalid texture dimension')
    }

    // _GetTextureTypePrefix (hgiVulkan/shaderSection.cpp:254-264)
    const base = desc.format === HgiFormat.HgiFormatInvalid
      ? HgiFormat.HgiFormatFloat32 : HgiGetComponentBaseFormat(desc.format)
    const scalar = base === HgiFormat.HgiFormatUInt16 ? 'u32'
      : (base === HgiFormat.HgiFormatInt16 || base === HgiFormat.HgiFormatInt32) ? 'i32' : 'f32'
    const isFloat = scalar === 'f32'
    const filterable = isFloat && (base !== HgiFormat.HgiFormatFloat32 || this._hgi.isFloat32Filterable())
    const sampled = `vec4<${scalar}>`

    // Size and coordinate dimensions (hgiVulkan/shaderSection.cpp:324-341).
    const sizeDim = array ? dims + 1 : dims
    const coordDim = (shadow || array || cube) ? dims + 1 : dims
    const vecOf = (n: number, s: string) => (n === 1 ? s : `vec${n}<${s}>`)
    const sizeType = vecOf(sizeDim, 'i32')
    const intCoordType = vecOf(coordDim, 'i32')
    const floatCoordType = vecOf(coordDim, 'f32')
    const viewDimension: GPUTextureViewDimension = cube ? 'cube'
      : array ? '2d-array' : dims === 1 ? '1d' : dims === 3 ? '3d' : '2d'

    // Implicit-derivative sampling is fragment-only in WGSL; other stages
    // sample level 0, which is what GLSL's texture() does outside fragment
    // shaders.
    const fragment = this._getShaderStage() === HgiShaderStageBits.HgiShaderStageFragment
    const xy = dims === 1 ? 'uv.x' : dims === 2 ? 'uv.xy' : 'uv.xyz'
    const coords = array ? `${xy}, i32(uv.${'xyzw'[dims]})` : shadow ? xy : 'uv'
    const sizeExpr = array
      ? `vec${sizeDim}<i32>(vec${dims}<i32>(textureDimensions(${tex}, 0)), i32(textureNumLayers(${tex})))`
      : sizeDim === 1 ? `i32(textureDimensions(${tex}, 0))`
        : `vec${sizeDim}<i32>(textureDimensions(${tex}, 0))`

    let fn = ''
    if (desc.writable) {
      const format = HgiWebGPUConversions.getPixelFormat(desc.format,
        HgiTextureUsageBits.HgiTextureUsageBitsShaderWrite)
      if (!format) {
        this._errors.push(`HgiWebGPU: writable texture '${name}' has no WebGPU storage format`)
      }
      // A writable cubemap (HdSt_DomeLightComputationGPU's outTexture,
      // hdSt/domeLightComputations.cpp:214-218) is a 2d-array storage
      // texture of the six faces, the face (the third coordinate of
      // HgiSet_'s ivec3, as Vulkan's imageCube store) being the layer: WGSL
      // has no cube storage textures (storage textures are 1d, 2d, 2d_array
      // and 3d). HgiWebGPUTexture.GetStorageTextureView binds such a view.
      const layered = array || cube
      const storageDimension: GPUTextureViewDimension = cube ? '2d-array' : viewDimension
      const textureType = `texture_storage_${storageDimension.replace('-', '_')}<${format ?? 'rgba32float'}, write>`
      // Storage textures have one level; textureDimensions takes none.
      const storageSize = sizeExpr.replace(/textureDimensions\(([^,()]+), 0\)/g, 'textureDimensions($1)')
      // HgiSet_texName(uv, data) and HgiGetSize_texName()
      // (hgiVulkan/shaderSection.cpp:357-377).
      fn += `fn HgiSet_${name}(uv: ${intCoordType}, data: vec4<f32>) {\n` +
        `  textureStore(${tex}, ${layered ? `uv.${dims === 1 ? 'x' : 'xy'}, uv.${'xyzw'[dims]}` : 'uv'}, data);\n}\n`
      fn += `fn HgiGetSize_${name}() -> ${sizeType} {\n  return ${storageSize};\n}\n`
      return {
        textureType,
        samplerType: '',
        functions: fn,
        layout: {
          storageTexture: { access: 'write-only' as const, format: format ?? 'rgba32float', viewDimension: storageDimension },
        },
        samplerLayout: null,
      }
    }

    const textureType = shadow
      ? `texture_depth_${viewDimension.replace('-', '_')}`
      : `texture_${viewDimension.replace('-', '_')}<${scalar}>`
    const samplerType = shadow ? 'sampler_comparison' : 'sampler'
    const resultType = shadow ? 'f32' : sampled

    // HgiGet_texName(uv) (hgiVulkan/shaderSection.cpp:382-394).
    let get: string
    let lod: string
    let border = false
    let footprint = false
    if (shadow) {
      const depthRef = `uv.${'xyzw'[array ? dims + 1 : dims]}`
      get = `textureSampleCompareLevel(${tex}, ${smp}, ${coords}, ${depthRef})`
      // A comparison sampler samples level 0 only in WGSL's *Level form.
      lod = get
    } else if (!isFloat) {
      // Integer textures cannot be filtered or sampled in WGSL; read the
      // nearest texel (the sampler's wrap mode is not applied).
      const texel = `vec${dims}<i32>(${xy} * vec${dims}<f32>(textureDimensions(${tex}, 0)))`
      get = array
        ? `textureLoad(${tex}, ${texel.replace(/^vec1<i32>/, 'i32')}, i32(uv.${'xyzw'[dims]}), 0)`
        : `textureLoad(${tex}, ${dims === 1 ? `i32(uv * f32(textureDimensions(${tex}, 0)))` : texel}, 0)`
      lod = get.replace(/, 0\)$/, ', i32(lod))')
    } else {
      get = fragment
        ? `textureSample(${tex}, ${smp}, ${coords})`
        : `textureSampleLevel(${tex}, ${smp}, ${coords}, 0.0)`
      lod = `textureSampleLevel(${tex}, ${smp}, ${coords}, lod)`
      if (!cube) {
        // Clamp-to-border addressing, which WebGPU samplers lack
        // (samplerState.ts).
        border = true
        const c = array ? xy : 'uv'
        if (dims === 2 && !array) {
          footprint = true
          const fp = `hgiWebGPUFootprint_${name}`, fps = `hgiWebGPUFootprintSampler_${name}`
          fn += HgiWebGPUBorderFunction(name, tex, desc.bindIndex, dims)
          fn += HgiWebGPUBorderFootprintFunction(name, tex, desc.bindIndex)
          get = `hgiWebGPUBorderMix_${name}(${get}, uv, ` +
            (fragment ? `textureSample(${fp}, ${fps}, uv), ${HgiWebGPUImplicitLodExpression(tex, 'uv', dims)})`
              : `textureSampleLevel(${fp}, ${fps}, uv, 0.0), 0.0)`)
          lod = `hgiWebGPUBorderMix_${name}(${lod}, uv, textureSampleLevel(${fp}, ${fps}, uv, lod), lod)`
        } else {
          fn += HgiWebGPUBorderFunction(name, tex, desc.bindIndex, dims)
          get = `hgiWebGPUBorder_${name}(${get}, ${c}, ${fragment ? HgiWebGPUImplicitLodExpression(tex, c, dims) : '0.0'})`
          lod = `hgiWebGPUBorder_${name}(${lod}, ${c}, lod)`
        }
      }
    }
    fn += `fn HgiGet_${name}(uv: ${floatCoordType}) -> ${resultType} {\n  return ${get};\n}\n`
    // HgiGetSize_texName() (:396-404)
    fn += `fn HgiGetSize_${name}() -> ${sizeType} {\n  return ${sizeExpr};\n}\n`
    // HgiTextureLod_texName() (:406-415)
    fn += `fn HgiTextureLod_${name}(uv: ${floatCoordType}, lod: f32) -> ${resultType} {\n` +
      `  return ${lod};\n}\n`
    // HgiTexelFetch_texName() (:417-431): not for shadow or cubemap textures.
    // hgiMetal, the reference build's backend, reads
    // `textureBind_<name>.read(ushort(coord...))` (hgiMetal/shaderSection.mm:
    // 536-569): every coordinate, the layer included, is cast to ushort, and
    // a read outside the texture returns zero on the reference build. WGSL
    // leaves an out-of-bounds textureLoad to the implementation (an in-bounds
    // texel or zero; WebKit clamps), so the cast and the zero are written out.
    // Storm relies on it: the UDIM accessor fetches the layout texture at the
    // tile index of the coordinate (hdSt/codeGen.cpp:454-458, 4400-4406), and
    // a coordinate below v = 0 or past the last tile row indexes outside the
    // layout, which must read 0 ("no tile").
    if (!shadow && !cube) {
      const n = coordDim
      const u = (e: string) => (n === 1 ? `(u32(${e}) & 0xffffu)` : `(vec${n}<u32>(${e}) & vec${n}<u32>(0xffffu))`)
      const size = array
        ? `vec${n}<u32>(textureDimensions(${tex}, 0).${'xyz'.slice(0, dims)}, textureNumLayers(${tex}))`
        : `textureDimensions(${tex}, 0)`
      const outside = n === 1 ? 'c >= size' : 'any(c >= size)'
      const at = array
        ? `c.${dims === 1 ? 'x' : 'xy'}, c.${'xyzw'[dims]}, 0` : 'c, 0'
      fn += `fn HgiTexelFetch_${name}(uv: ${intCoordType}) -> ${sampled} {\n` +
        `  let c = ${u('uv')};\n  let size = ${size};\n` +
        `  if (${outside}) { return ${sampled}(); }\n` +
        `  return textureLoad(${tex}, ${at});\n}\n`
    }

    return {
      textureType,
      samplerType,
      functions: fn,
      border,
      footprint,
      accessorTypes: {
        resultType, sizeType, floatCoordType, intCoordType, sampledType: sampled,
        texelFetch: !shadow && !cube,
      },
      layout: {
        texture: {
          sampleType: (shadow ? 'depth' : !isFloat ? (scalar === 'u32' ? 'uint' : 'sint')
            : filterable ? 'float' : 'unfilterable-float') as GPUTextureSampleType,
          viewDimension,
          multisampled: false,
        },
      },
      samplerLayout: {
        type: (shadow ? 'comparison' : filterable ? 'filtering' : 'non-filtering') as GPUSamplerBindingType,
      },
    }
  }

  /** hgiVulkan/shaderGenerator.cpp:314-378 */
  private _writeBuffers(buffers: readonly HgiShaderFunctionBufferDesc[]): void {
    for (const bufferDescription of buffers) {
      // A uniform array is read through a pointer in hgiMetal (`constant
      // T*`, shaderSection.mm:688-699, 716-728): its declared size does not
      // bound the reads, which reach the whole bound buffer. Storm relies on
      // that: a lighting shader's lightSource[numLights] and shadow[numShadows]
      // (hdx/simpleLightTask.cpp:524-565) keep the program compiled for the
      // first light count when lights are added (the lighting shader's hash
      // does not include it, hdSt/simpleLightingShader.cpp:69-100) and index
      // past the declared size. A WGSL uniform array is fixed-size and its
      // out-of-range indices are clamped, so a uniform array is declared as a
      // runtime-sized read-only storage array instead, which reads the
      // bound buffer from its offset to its end (resourceBindings.ts) as
      // Metal does. The layout is the same: Storm's uniform structs already
      // meet the stricter uniform layout rules.
      const isUniformArray = bufferDescription.binding === HgiBindingType.HgiBindingTypeUniformArray
      const isUniformBufferBinding =
        bufferDescription.binding === HgiBindingType.HgiBindingTypeUniformValue

      // A buffer the post-tessellation control stage writes half-float
      // factors to holds them as packed pairs (_RewriteTessFactorWrites).
      const tessFactors = this._tessFactorBuffers.has(bufferDescription.nameInShader)
      if (tessFactors && this._tessFactorsBindIndex === null) {
        this._tessFactorsBindIndex = bufferDescription.bindIndex
      }
      const elementType = tessFactors ? 'u32' : HgiWebGPUShaderGenerator.getWGSLType(bufferDescription.type)
      const isValue = bufferDescription.binding === HgiBindingType.HgiBindingTypeValue ||
        bufferDescription.binding === HgiBindingType.HgiBindingTypeUniformValue
      // A Value binding is a single T; arrays carry their size when given and
      // are runtime-sized otherwise (storage buffers only).
      const type = isValue ? elementType
        : bufferDescription.arraySize > 0 && !isUniformArray
          ? `array<${elementType}, ${bufferDescription.arraySize}>`
          : `array<${elementType}>`

      // WebGPU forbids read_write storage in the vertex stage (WGSL
      // "Address Spaces": a vertex shader statically uses storage buffers
      // with read access only). Storm declares buffers that another pass
      // writes as writable in every stage that reads them (the instance
      // culling pass's culledInstanceIndices, resourceBinder.cpp:624-639,
      // declared for the vertex stages by codeGen.cpp:5151-5157); there
      // the vertex function only reads, so the binding is read-only. A
      // vertex function that writes fails translation.
      const writable = bufferDescription.writable &&
        !(this._stageVisibility() & GPUShaderStageFlags.VERTEX)
      const addressSpace = isUniformBufferBinding ? 'uniform'
        : writable ? 'storage, read_write' : 'storage, read'

      const bindIndex = bufferDescription.bindIndex
      const section = new HgiWebGPUBufferShaderSection(
        bufferDescription.nameInShader, HgiWebGPUBufferBindGroup, bindIndex, addressSpace, type)
      this.createShaderSection(section)
      this._globals.push({ name: bufferDescription.nameInShader, wgslType: type, kind: 'buffer', readOnly: !writable })

      const entry: GPUBindGroupLayoutEntry = {
        binding: bindIndex,
        visibility: this._stageVisibility(),
        buffer: {
          type: isUniformBufferBinding ? 'uniform'
            : writable ? 'storage' : 'read-only-storage',
        },
      }
      this._addBindGroupLayoutEntry(HgiWebGPUBufferBindGroup, entry)
      if (writable && !isUniformBufferBinding && !type.includes('atomic<')) {
        this._writableBuffers.push({ name: bufferDescription.nameInShader, section, entry })
      }
    }
  }

  /** WebGPU adaptation. A WebGPU pipeline layout has one access mode per
   *  binding for all the stages that use it, and a binding visible to the
   *  vertex stage must be read-only (see _writeBuffers); GLSL and MSL
   *  qualify each stage's declaration separately. Storm declares some
   *  buffers writable in every stage although no stage writes them: the
   *  topology visibility block (hdSt/codeGen.cpp:7200-7201 passes
   *  its arraySize, 1, in _EmitDeclaration's isWritable position) is in the
   *  common resources of the vertex and fragment functions, so the vertex
   *  function declared it read and the fragment function read_write and the
   *  merged layout matched only one of them, which made the pipeline and
   *  the whole render pass invalid. A writable buffer the function's code
   *  never writes (translation's writtenGlobals) is declared with read
   *  access, which is the access the function makes. Atomic buffers keep
   *  read_write, which WGSL requires of them. */
  private _declareUnwrittenBuffersReadOnly(writtenGlobals: readonly string[] | undefined): void {
    if (!writtenGlobals) return
    const written = new Set(writtenGlobals)
    for (const { name, section, entry } of this._writableBuffers) {
      if (written.has(name)) continue
      section.setReadOnly()
      entry.buffer = { ...entry.buffer, type: 'read-only-storage' }
    }
  }

  /** hgiVulkan/shaderGenerator.cpp:380-503, with the builtin keywords of
   *  WebGPU (see _builtinInputs) and the location assignment of hgiVulkan
   *  (explicit location, else interstage slot, else a running counter). */
  private _writeInOuts(parameters: readonly HgiShaderFunctionParamDesc[], qualifier: 'in' | 'out'): void {
    const inQualifier = qualifier === 'in'
    const stage = this._getShaderStage()
    const pt = this._postTess
    for (const param of parameters) {
      const paramName = param.nameInShader
      const type = HgiWebGPUShaderGenerator.getWGSLType(param.type)
      const kind = inQualifier ? 'stageInput' as const : 'stageOutput' as const
      // Per-control-point inputs of patch functions are sized
      // VERTEX_CONTROL_POINTS_PER_PATCH (hdSt/codeGen.cpp:860-864), which
      // hgiMetal #defines (shaderGenerator.mm:1442-1446).
      const arraySize = pt && param.arraySize === 'VERTEX_CONTROL_POINTS_PER_PATCH'
        ? String(pt.controlPoints) : param.arraySize
      this._globals.push({ name: paramName, wgslType: arraySize ? `array<${type}, ${arraySize}>` : type, kind })

      if (pt?.control && (!inQualifier || param.role === HgiShaderKeywordTokens.hdInstanceID)) {
        // The control stage runs as a compute dispatch: its outputs (the
        // vertex-like outputs Storm declares for every stage) are written
        // and not read, and its instance id comes from the dispatch
        // (HgiWebGPUPostTessVertexShaderSection, 'control').
        if (inQualifier) pt.instanceId = paramName
        this.createShaderSection(new HgiWebGPUMemberShaderSection(
          paramName, type, param.interpolation, param.sampling, null, arraySize))
        continue
      }
      if (inQualifier && pt) {
        // The emulated post-tessellation vertex stage: Metal's patch inputs
        // (hgiMetal/shaderGenerator.mm:152-187) are derived by
        // HgiWebGPUPostTessVertexShaderSection.
        const derived = (slot: 'patchId' | 'positionInPatch' | 'baseInstance' | 'vertexId' | 'baseVertex') => {
          pt[slot] = { name: paramName, type }
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling, null, arraySize))
        }
        if (param.role === HgiShaderKeywordTokens.hdPatchID) { derived('patchId'); continue }
        if (param.role === HgiShaderKeywordTokens.hdPositionInPatch) { derived('positionInPatch'); continue }
        if (param.role === HgiShaderKeywordTokens.hdBaseInstance) { derived('baseInstance'); continue }
        if (pt.pulled && param.role === HgiShaderKeywordTokens.hdBaseVertex) { derived('baseVertex'); continue }
        if (pt.pulled && param.role === HgiShaderKeywordTokens.hdVertexID) { derived('vertexId'); continue }
        if (param.role === HgiShaderKeywordTokens.hdInstanceID) pt.instanceId = paramName
        if (!param.role && param.location !== -1) {
          // A vertex attribute: one value per control point, pulled from
          // its vertex buffer (the patch_control_point<...> [[stage_in]] of
          // hgiMetal/shaderGenerator.mm:657-669, 1210-1219).
          if (!/^(?:vec[234]<(?:f32|i32|u32)>|f32|i32|u32)$/.test(type)) {
            TF_CODING_ERROR(`HgiWebGPU: control point input '${paramName}' of type ${param.type} cannot be pulled`)
            this._errors.push(`HgiWebGPU: control point input '${paramName}' of type ${param.type} is not supported`)
          }
          pt.attributes.push({ name: paramName, location: param.location, wgslType: type })
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling, null,
            pt.pulled ? arraySize : arraySize || String(pt.controlPoints)))
          continue
        }
      }

      if (inQualifier) {
        if (param.role === HgiShaderKeywordTokens.hdFrontFacing &&
            stage === HgiShaderStageBits.HgiShaderStageFragment && this._options.polygonModeLine) {
          // The emulated HgiPolygonModeLine draws lines, whose
          // front_facing is always true: the facing of the triangle the
          // edge belongs to comes from the vertex stage
          // (HgiWebGPUPostTessVertexShaderSection).
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling,
            { direction: 'input', attribute: `@location(${HgiWebGPUFrontFacingLocation})`, ioType: 'u32' },
            param.arraySize))
          continue
        }
        const builtin = _builtinInputs[param.role]
        if (builtin) {
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling,
            { direction: 'input', attribute: `@builtin(${builtin[0]})`, ioType: builtin[1] },
            param.arraySize))
          continue
        }
        if (param.role === HgiShaderKeywordTokens.hdPrimitiveID &&
            stage === HgiShaderStageBits.HgiShaderStageFragment &&
            this._hgi.hasPrimitiveIndex?.()) {
          // Metal's [[primitive_id]] (hgiMetal/shaderGenerator.mm:152-187):
          // WebGPU's primitive_index builtin (feature primitive-index),
          // which, as Metal's, counts the primitives of the draw from 0.
          // Storm reads it for draws without a post-tessellation vertex
          // stage (basis curve lines, points); patch draws read hd_patchID
          // under PrimitiveIdEmulation (hdSt/codeGen.cpp:4962-4966).
          this._usesPrimitiveIndex = true
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling,
            { direction: 'input', attribute: '@builtin(primitive_index)', ioType: 'u32' },
            param.arraySize))
          continue
        }
        if (param.role === HgiShaderKeywordTokens.hdPrimitiveID &&
            stage === HgiShaderStageBits.HgiShaderStageFragment) {
          // Storm adds gl_PrimitiveID to every fragment stage
          // (hdSt/codeGen.cpp:3479-3482). HgiWebGPUCapabilities reports
          // PrimitiveIdEmulation, under which the code generator reads the
          // post-tessellation stage's patch id through hd_patchID instead
          // (codeGen.cpp:2491-2503, 5008-5015), so the declaration is kept
          // for the body to compile and has no value.
          // PLATFORM-DIVERGENCE(hgiWebGPU-primitive-id): without the
          // device feature 'primitive-index' (see above), a non-patch draw
          // that reads gl_PrimitiveID reads 0.
          this.createShaderSection(new HgiWebGPUKeywordShaderSection(paramName, type, param.role))
          continue
        }
        if (param.role === HgiShaderKeywordTokens.hdPointCoord &&
            stage === HgiShaderStageBits.HgiShaderStageFragment) {
          // Written by the emulated point's vertex stage
          // (HgiWebGPUPostTessVertexShaderSection, 'point').
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling,
            { direction: 'input', attribute: `@location(${HgiWebGPUPointCoordLocation})`, ioType: 'vec2<f32>' },
            param.arraySize))
          continue
        }
        if (_unsupportedInputs.has(param.role)) {
          TF_CODING_ERROR(`HgiWebGPU: shader keyword ${param.role} ('${paramName}') ` +
            'is not available in WebGPU')
          this.createShaderSection(new HgiWebGPUKeywordShaderSection(paramName, type, param.role))
          continue
        }
      } else {
        const builtin = _builtinOutputs[param.role]
        if (builtin && (builtin[0] !== 'position' ||
            stage === HgiShaderStageBits.HgiShaderStageVertex ||
            stage === HgiShaderStageBits.HgiShaderStagePostTessellationVertex)) {
          // WebGPU adaptation of the inverted viewport of
          // hgiMetal/graphicsCmds.mm:404-422 (and the upside-down rendering of
          // hgiVulkan/graphicsCmds.cpp:124-147): WebGPU viewports cannot have
          // a negative height, so the clip-space position is flipped in y
          // here. With the inverted winding of HgiWebGPUConversions::GetWinding
          // this stores rows bottom-up, as OpenGL, Vulkan and Metal do.
          if (pt && builtin[0] === 'position') pt.position = paramName
          const flip = builtin[0] === 'position'
            ? (v: string) => `vec4<f32>(${v}.x, -${v}.y, ${v}.z, ${v}.w)` : undefined
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling,
            { direction: 'output', attribute: `@builtin(${builtin[0]})`, ioType: builtin[1],
              ...(flip ? { outputExpression: flip } : {}) },
            param.arraySize))
          continue
        }
        if (pt?.pulled === 'point' && param.role === 'point_size') {
          // Applied by the emulated point (HgiWebGPUPostTessVertexShaderSection).
          pt.pointSize = paramName
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling, null, param.arraySize))
          continue
        }
        if (param.role === 'clip_distance' && this._hgi.hasClipDistances?.() &&
            (stage === HgiShaderStageBits.HgiShaderStageVertex ||
             stage === HgiShaderStageBits.HgiShaderStagePostTessellationVertex)) {
          // hgiMetal writes the role as the output's attribute
          // (shaderGenerator.mm:737-754): `[[clip_distance]]`, the array of
          // HD_NUM_clipPlanes distances Storm declares (hdSt/codeGen.cpp:
          // 3157-3160, 3401-3404). WebGPU's clip_distances builtin (feature
          // clip-distances) clips the same way: a primitive is clipped where
          // an interpolated distance is negative. Its array is at most 8
          // long, as HgiWebGPUCapabilities' GetMaxClipDistances reports.
          const ioType = `array<f32, ${param.arraySize || '1'}>`
          this._usesClipDistances = true
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling,
            { direction: 'output', attribute: '@builtin(clip_distances)', ioType, elementwise: true },
            param.arraySize))
          continue
        }
        if (_unsupportedOutputs.has(paramName)) {
          // Storm gives gl_PointSize the point_size role only for point
          // lists (hdSt/codeGen.cpp:3147-3154), which are drawn as emulated
          // points above. Without the role hgiMetal declares it as an
          // ordinary stage output, not [[point_size]]
          // (hgiMetal/shaderGenerator.mm:749-758), so Metal's rasterizer
          // ignores it too: nothing is lost, so no warning.
          if (!(paramName === 'gl_PointSize' && param.role !== 'point_size')) {
            TF_WARN(`HgiWebGPU: ${paramName} is not supported by WebGPU and is not written`)
          }
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling, null, param.arraySize))
          continue
        }
        if (param.role === 'color') {
          // hgiMetal/shaderGenerator.mm:731-748: color outputs take
          // increasing indices.
          const location = param.location !== -1 ? param.location : this._colorIndex++
          this._colorOutputLocations.push(location)
          this.createShaderSection(new HgiWebGPUMemberShaderSection(
            paramName, type, param.interpolation, param.sampling,
            { direction: 'output', attribute: `@location(${location})`, ioType: type },
            param.arraySize))
          continue
        }
      }

      if (stage === HgiShaderStageBits.HgiShaderStageCompute) {
        TF_CODING_ERROR(`HgiWebGPU: compute stage ${qualifier}put '${paramName}' has no WebGPU role`)
        this.createShaderSection(new HgiWebGPUMemberShaderSection(
          paramName, type, param.interpolation, param.sampling, null, param.arraySize))
        continue
      }

      // If a location or interstage slot has been specified then add it to
      // the attributes (hgiVulkan/shaderGenerator.cpp:476-490).
      let location: number
      if (param.location !== -1) {
        location = param.location
      } else if (param.interstageSlot !== -1) {
        location = param.interstageSlot
      } else {
        location = inQualifier ? this._inLocationIndex++ : this._outLocationIndex++
      }
      if (!inQualifier && stage === HgiShaderStageBits.HgiShaderStageFragment) {
        this._colorOutputLocations.push(location)
      }
      if (param.arraySize) {
        TF_CODING_ERROR(`HgiWebGPU: arrayed stage ${qualifier}put '${paramName}' is not supported`)
      }
      this.createShaderSection(new HgiWebGPUMemberShaderSection(
        paramName, type, param.interpolation, param.sampling,
        { direction: inQualifier ? 'input' : 'output', attribute: `@location(${location})`, ioType: type },
        param.arraySize))
    }
  }

  /** hgiVulkan/shaderGenerator.cpp:505-559 */
  private _writeInOutBlocks(parameterBlocks: readonly HgiShaderFunctionParamBlockDesc[], qualifier: 'in' | 'out'): void {
    const inQualifier = qualifier === 'in'

    for (const p of parameterBlocks) {
      let locationIndex = p.interstageSlot !== -1 ? p.interstageSlot
        : inQualifier ? this._inLocationIndex : this._outLocationIndex

      if (p.arraySize) {
        TF_CODING_ERROR(`HgiWebGPU: arrayed interstage block '${p.blockName}' is not supported`)
        this._errors.push(`HgiWebGPU: arrayed interstage block '${p.blockName}' is not supported`)
      }

      const members: Array<{ name: string, type: string }> = []
      for (const member of p.members) {
        const type = HgiWebGPUShaderGenerator.getWGSLType(member.type)
        members.push({ name: member.name, type })
        this.createShaderSection(new HgiWebGPUMemberShaderSection(
          member.name, type, member.interpolation, member.sampling,
          { direction: inQualifier ? 'input' : 'output', attribute: `@location(${locationIndex++})`, ioType: type },
          '', p.instanceName))

        if (inQualifier) {
          this._inLocationIndex++
        } else {
          this._outLocationIndex++
        }
      }

      this.createShaderSection(new HgiWebGPUInterstageBlockShaderSection(
        p.blockName, p.instanceName, members))
      this._globals.push({ name: p.instanceName, wgslType: p.blockName, kind: 'interstageBlock' })
    }
  }

  private _stageVisibility(): GPUShaderStageFlags {
    return HgiWebGPUConversions.getShaderStages(this._getShaderStage())
  }

  /** hgiVulkan/shaderGenerator.cpp:649-674 */
  private _addBindGroupLayoutEntry(group: number, entry: GPUBindGroupLayoutEntry): void {
    let info = this._bindGroupLayoutInfo.find(i => i.group === group)
    if (!info) {
      info = { group, entries: [] }
      this._bindGroupLayoutInfo.push(info)
    }
    info.entries.push(entry)
  }

  /** hgiVulkan/shaderGenerator.cpp:561-619 for the global sections, then the
   *  entry point of hgiMetal/shaderGenerator.mm:1558-1656. */
  protected override _execute(ss: HgiStringStream): void {
    const shaderSections = this.getShaderSections()

    // hgiMetal/shaderGenerator.mm:1442-1446 defines the control point count
    // for patch functions; the code generator sizes and indexes
    // per-control-point data with it (hdSt/codeGen.cpp:860-864, 6187-6195).
    const macros = this._postTess && !this._postTess.pulled
      ? `#define VERTEX_CONTROL_POINTS_PER_PATCH ${this._postTess.controlPoints}\n` : ''
    const translation = this._hgi.getShaderBodyTranslator().Translate({
      stage: this._getShaderStage(),
      declarations: macros + this._getShaderCodeDeclarations(),
      code: this._postTess?.control ? this._rewriteTessFactorWrites(this._getShaderCode()) : this._getShaderCode(),
      descriptor: this._descriptor,
      globals: this._globals,
    })
    if (translation.errors) {
      this._errors.push(translation.errors)
    }
    this._declareUnwrittenBuffersReadOnly(translation.writtenGlobals)

    if (this._usesPrimitiveIndex) {
      // WGSL enable directives precede every declaration.
      ss.write('enable primitive_index;\n')
    }
    if (this._usesClipDistances) {
      ss.write('enable clip_distances;\n')
    }
    ss.write('\n// //////// Global Includes ////////\n')
    for (const section of shaderSections) section.visitGlobalIncludes(ss)

    ss.write(translation.declarations)

    ss.write('\n// //////// Global Structs ////////\n')
    for (const section of shaderSections) section.visitGlobalStructs(ss)

    ss.write('\n// //////// Global Member Declarations ////////\n')
    for (const section of shaderSections) section.visitGlobalMemberDeclarations(ss)

    ss.write('\n// //////// Global Function Definitions ////////\n')
    for (const section of shaderSections) section.visitGlobalFunctionDefinitions(ss)

    ss.write('\n')

    // write all the original shader
    ss.write(translation.code)

    if (this._entryPoint) {
      this._codeBeforeEntryPoint = ss.str()
      this._writeEntryPoint(ss)
      this._restrictVisibilityToStaticUse(ss.str(), this._entryPoint.functionName)
    }
  }

  /** PLATFORM-DIVERGENCE(webgpu-binding-visibility): a bind group layout
   *  entry here is visible only to the stages whose entry point statically
   *  uses the binding. hgiVulkan makes every buffer visible to all graphics
   *  stages and every texture to the geometry and fragment stages
   *  (descriptorSetLayouts.cpp:100-118), whatever the stage that declared it,
   *  and Storm declares its common resources (hdSt/codeGen.cpp:2902-3536,
   *  _resCommon) in every stage; Vulkan's per-stage descriptor limits are
   *  large, and hgiMetal's argument tables hold only what a function uses.
   *  WebGPU counts every visible entry against its per-stage limits
   *  (maxStorageBuffersPerShaderStage is 10 in Chrome on macOS), which
   *  Storm's declarations exceed in the vertex stage. A binding the stage
   *  declares but never reads keeps its entry, with no visibility for that
   *  stage, so the bind groups are the same for every stage. */
  private _restrictVisibilityToStaticUse(code: string, entryPoint: string): void {
    const used = HgiWebGPUStaticallyUsedNames(code, entryPoint)
    if (!used) return
    const vars = HgiWebGPUResourceVariables(code)
    for (const info of this._bindGroupLayoutInfo) {
      for (const entry of info.entries) {
        const name = vars.get(`${info.group}:${entry.binding}`)
        // An entry with no declaration found keeps its visibility.
        if (name !== undefined && !used.has(name)) entry.visibility = 0
      }
    }
  }

  /** The interpolation of each stage input at an interstage location. */
  getInterstageInputs(): HgiWebGPUInterstageInterpolation {
    const inputs: HgiWebGPUInterstageInterpolation = new Map()
    for (const section of this._shaderSections) {
      if (!(section instanceof HgiWebGPUMemberShaderSection)) continue
      const location = section.getInterstageLocation()
      if (location === null || section.getStageIO()?.direction !== 'input') continue
      inputs.set(location, { interpolation: section.getInterpolation(), sampling: section.getSampling() })
    }
    return inputs
  }

  /** WebGPU adaptation. GLSL and MSL take a varying's interpolation and
   *  sampling from the fragment input (Storm qualifies only that side:
   *  basisCurves.glslfx:1267-1268 `centroid`, written by hdSt/codeGen.cpp:
   *  1182-1183 / 1212-1213 and hgiMetal/shaderGenerator.mm:46-61, 762,
   *  826-827, hgiVulkan/shaderSection.cpp:177-188 on whichever side
   *  declares it), while WebGPU requires the vertex output to declare the
   *  same. Gives each stage output the interpolation of the fragment input
   *  at its location and returns the code with the entry point written
   *  again, or null when nothing changed. */
  matchInterstageOutputs(fragmentInputs: HgiWebGPUInterstageInterpolation): string | null {
    if (!this._entryPoint) return null
    let changed = false
    for (const section of this._shaderSections) {
      if (!(section instanceof HgiWebGPUMemberShaderSection)) continue
      const location = section.getInterstageLocation()
      if (location === null || section.getStageIO()?.direction !== 'output') continue
      const input = fragmentInputs.get(location)
      if (input && section.setInterpolation(input.interpolation, input.sampling)) changed = true
    }
    if (!changed) return null
    const ss = new HgiStringStream()
    ss.write(this._codeBeforeEntryPoint)
    this._writeEntryPoint(ss)
    return ss.str()
  }

  /** hgiMetal/shaderGenerator.mm:1558-1656 */
  private _writeEntryPoint(ss: HgiStringStream): void {
    const ep = this._entryPoint!
    const shaderSections = this.getShaderSections()

    const inputs = new HgiStringStream()
    const outputs = new HgiStringStream()
    for (const section of shaderSections) section.visitEntryPointInputs(inputs)
    for (const section of shaderSections) section.visitEntryPointOutputs(outputs)
    const hasInputs = inputs.str().length > 0
    const hasOutputs = outputs.str().length > 0 &&
      this._getShaderStage() !== HgiShaderStageBits.HgiShaderStageCompute

    ss.write('\n// //////// Entry Point ////////\n')
    if (hasInputs) {
      ss.write('struct ', ep.inputsTypeName, ' {\n', inputs.str(), '};\n')
    }
    if (hasOutputs) {
      ss.write('struct ', ep.outputsTypeName, ' {\n', outputs.str(), '};\n')
    }

    ss.write(ep.stageAttribute, '\nfn ', ep.functionName, '(')
    if (hasInputs) ss.write(ep.inputsInstanceName, ': ', ep.inputsTypeName)
    ss.write(')')
    if (hasOutputs) ss.write(' -> ', ep.outputsTypeName)
    ss.write(' {\n')

    ss.write('\n// //////// Entry Point Function Executions ////////\n')
    for (const section of shaderSections) {
      section.visitEntryPointFunctionExecutions(ss, ep.inputsInstanceName)
    }

    if (!this._postTessSection?.callsMain()) {
      ss.write('  main();\n')
    }

    // return the instance of the shader entrypoint output type
    if (hasOutputs) {
      ss.write('  var ', ep.outputsInstanceName, ': ', ep.outputsTypeName, ';\n')
      for (const section of shaderSections) {
        section.visitEntryPointOutputExecutions(ss, ep.outputsInstanceName)
      }
      ss.write('  return ', ep.outputsInstanceName, ';\n')
    }
    ss.write('}\n')
  }
}
