// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderGenerator.mm,
//  pxr/imaging/hgiMetal/shaderSection.h,
//  pxr/imaging/hgiVulkan/shaderSection.cpp,
//  pxr/imaging/hgiVulkan/shaderSection.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUShaderSection and its subclasses: the pieces of WGSL the
// HgiWebGPUShaderGenerator writes. Modelled on
// pxr/imaging/hgiVulkan/shaderSection.{h,cpp} (sections declared at global
// scope, visited in a fixed order) and pxr/imaging/hgiMetal/shaderSection.h
// (entry point parameters and the copies into and out of the program scope).
//
// WGSL has a module scope, so the program scope Metal emulates with a struct
// (hgiMetal/shaderGenerator.mm:1481-1556) is module-scope `var<private>`
// declarations here: stage inputs, stage outputs, constant parameters and
// global members keep the names the shader body uses, and the entry point
// copies the stage's I/O structs into and out of them.

import {
  HgiInterpolationType,
  HgiSamplingType,
  HgiShaderSection,
  HgiStringStream,
  type HgiShaderSectionAttributeVector,
} from 'typescript-usd/hgi'

/** hgiVulkan/shaderSection.h:24-63, plus the entry point visitors of
 *  hgiMetal/shaderSection.h. */
export class HgiWebGPUShaderSection extends HgiShaderSection {
  constructor(
    identifier: string,
    attributes: HgiShaderSectionAttributeVector = [],
    defaultValue = '',
    arraySize = '',
    blockInstanceIdentifier = '',
  ) {
    super(identifier, attributes, defaultValue, arraySize, blockInstanceIdentifier)
  }

  /** Writes the WGSL attributes (`@group(0) @binding(1)`), the counterpart
   *  of the `layout(...)` prefix of hgiVulkan/shaderSection.cpp:28-58. */
  writeAttributes(ss: HgiStringStream): void {
    for (const a of this.getAttributes()) {
      ss.write('@', a.identifier)
      if (a.index) ss.write('(', a.index, ')')
      ss.write(' ')
    }
  }

  /** `name: type` (hgiVulkan/shaderSection.cpp:60-67, WGSL order). */
  override writeParameter(ss: HgiStringStream): void {
    this.writeIdentifier(ss)
    ss.write(': ')
    this.writeType(ss)
  }

  /** hgiVulkan/shaderSection.h:45 */
  visitGlobalIncludes(_ss: HgiStringStream): boolean { return false }
  /** hgiVulkan/shaderSection.h:49 */
  visitGlobalStructs(_ss: HgiStringStream): boolean { return false }
  /** hgiVulkan/shaderSection.h:51 */
  visitGlobalMemberDeclarations(_ss: HgiStringStream): boolean { return false }
  /** hgiVulkan/shaderSection.h:53 */
  visitGlobalFunctionDefinitions(_ss: HgiStringStream): boolean { return false }
  /** Members of the entry point's input struct
   *  (hgiMetal/shaderSection.h VisitEntryPointParameterDeclarations). */
  visitEntryPointInputs(_ss: HgiStringStream): boolean { return false }
  /** Members of the entry point's output struct
   *  (hgiMetal/shaderSection.h HgiMetalStageOutputShaderSection). */
  visitEntryPointOutputs(_ss: HgiStringStream): boolean { return false }
  /** Statements before the body's main() runs
   *  (hgiMetal/shaderSection.h VisitScopeConstructorInstantiation). */
  visitEntryPointFunctionExecutions(_ss: HgiStringStream, _inputs: string): boolean { return false }
  /** Statements after main() that fill the output struct
   *  (hgiMetal/shaderSection.h VisitEntryPointFunctionExecutions). */
  visitEntryPointOutputExecutions(_ss: HgiStringStream, _outputs: string): boolean { return false }
}

/** WGSL directives and module-scope helpers emitted before everything
 *  else. Takes the place of hgiVulkan's HgiVulkanMacroShaderSection
 *  (shaderSection.h:73-94); WGSL has no preprocessor. */
export class HgiWebGPUMacroShaderSection extends HgiWebGPUShaderSection {
  constructor(macroDeclaration: string, private readonly _macroComment: string) {
    super(macroDeclaration)
  }

  /** hgiVulkan/shaderSection.cpp:108-113 */
  override visitGlobalIncludes(ss: HgiStringStream): boolean {
    ss.write('// ', this._macroComment, '\n')
    this.writeIdentifier(ss)
    return true
  }
}

/** Where a member section's value comes from or goes to at the entry
 *  point. */
export interface HgiWebGPUStageIO {
  /** 'input' members are copied from the entry point's input struct before
   *  main(); 'output' members are copied to its output struct after. */
  direction: 'input' | 'output'
  /** The WGSL I/O attribute: `@location(0)`, `@builtin(position)`. */
  attribute: string
  /** The WGSL type in the I/O struct (fixed for builtins). */
  ioType: string
  /** Post-processing of the copied-out value (`vec4<f32>(v.x, -v.y, ...)`). */
  outputExpression?: (value: string) => string
  /** An array copied out element by element (Safari's WGSL compiler
   *  emits the clip_distances member as an MSL C array, which cannot be
   *  assigned whole). */
  elementwise?: boolean
}

/** hgiVulkan/shaderSection.h:101-145: a module-scope member. Stage inputs and
 *  outputs also carry their entry point I/O. */
export class HgiWebGPUMemberShaderSection extends HgiWebGPUShaderSection {
  constructor(
    identifier: string,
    private readonly _typeName: string,
    private _interpolation: HgiInterpolationType,
    private _sampling: HgiSamplingType,
    private readonly _io: HgiWebGPUStageIO | null,
    arraySize = '',
    blockInstanceIdentifier = '',
  ) {
    super(identifier, [], '', arraySize, blockInstanceIdentifier)
  }

  getStageIO(): HgiWebGPUStageIO | null { return this._io }

  /** hgiVulkan/shaderSection.cpp:155-159 */
  override writeType(ss: HgiStringStream): void {
    const arraySize = this.getArraySize()
    if (arraySize) ss.write('array<', this._typeName, ', ', arraySize, '>')
    else ss.write(this._typeName)
  }

  /** WGSL arrays are part of the type. */
  override writeArraySize(_ss: HgiStringStream): void {}

  /** hgiVulkan/shaderSection.cpp:141-153 */
  override visitGlobalMemberDeclarations(ss: HgiStringStream): boolean {
    if (this.hasBlockInstanceIdentifier()) {
      return true
    }
    ss.write('var<private> ')
    this.writeParameter(ss)
    ss.write(';\n')
    return true
  }

  /** The interpolation attribute (hgiVulkan/shaderSection.cpp:161-201,
   *  hgiMetal/shaderGenerator.mm:40-64). Integer interstage values must be
   *  flat in WGSL. */
  writeInterpolation(ss: HgiStringStream, ioType: string): void {
    const isInteger = /(^|<)(i32|u32)>?$/.test(ioType) || ioType === 'i32' || ioType === 'u32'
    if (this._interpolation === HgiInterpolationType.HgiInterpolationFlat || isInteger) {
      ss.write('@interpolate(flat) ')
      return
    }
    const type = this._interpolation === HgiInterpolationType.HgiInterpolationNoPerspective
      ? 'linear' : 'perspective'
    // hgiMetal/shaderGenerator.mm:46-61 (centroid_ / sample_ /
    // center_ perspective and no_perspective).
    if (this._sampling === HgiSamplingType.HgiSamplingCentroid) {
      ss.write('@interpolate(', type, ', centroid) ')
    } else if (this._sampling === HgiSamplingType.HgiSamplingSample) {
      ss.write('@interpolate(', type, ', sample) ')
    } else if (type === 'linear') {
      ss.write('@interpolate(linear) ')
    }
  }

  /** The interstage location of a stage input or output (`@location(n)`),
   *  or null for builtins and module-scope members. */
  getInterstageLocation(): number | null {
    const m = this._io ? /^@location\((\d+)\)$/.exec(this._io.attribute) : null
    return m ? Number(m[1]) : null
  }

  getInterpolation(): HgiInterpolationType { return this._interpolation }
  getSampling(): HgiSamplingType { return this._sampling }

  /** WebGPU adaptation: a stage output takes the interpolation of the
   *  fragment input it feeds (HgiWebGPUShaderProgram). Returns whether it
   *  changed. */
  setInterpolation(interpolation: HgiInterpolationType, sampling: HgiSamplingType): boolean {
    if (this._interpolation === interpolation && this._sampling === sampling) return false
    this._interpolation = interpolation
    this._sampling = sampling
    return true
  }

  /** The member's name in the entry point's I/O struct. */
  getIOName(): string { return this._ioName() }

  private _writeIOMember(ss: HgiStringStream): void {
    const io = this._io!
    ss.write('  ', io.attribute, ' ')
    if (io.attribute.startsWith('@location')) this.writeInterpolation(ss, io.ioType)
    ss.write(this._ioName(), ': ', io.ioType, ',\n')
  }

  /** The member's name in the I/O struct; block members are prefixed with
   *  their instance, as hgiMetal's interstage blocks
   *  (shaderGenerator.mm:834-838). */
  private _ioName(): string {
    const ss = new HgiStringStream()
    if (this.hasBlockInstanceIdentifier()) {
      this.writeBlockInstanceIdentifier(ss)
      ss.write('_')
    }
    this.writeIdentifier(ss)
    return ss.str()
  }

  private _scopeName(): string {
    const ss = new HgiStringStream()
    if (this.hasBlockInstanceIdentifier()) {
      this.writeBlockInstanceIdentifier(ss)
      ss.write('.')
    }
    this.writeIdentifier(ss)
    return ss.str()
  }

  override visitEntryPointInputs(ss: HgiStringStream): boolean {
    if (this._io?.direction !== 'input') return false
    this._writeIOMember(ss)
    return true
  }

  override visitEntryPointOutputs(ss: HgiStringStream): boolean {
    if (this._io?.direction !== 'output') return false
    this._writeIOMember(ss)
    return true
  }

  override visitEntryPointFunctionExecutions(ss: HgiStringStream, inputs: string): boolean {
    if (this._io?.direction !== 'input') return false
    ss.write('  ', this._scopeName(), ' = ', this._typeName, '(', inputs, '.', this._ioName(), ');\n')
    return true
  }

  override visitEntryPointOutputExecutions(ss: HgiStringStream, outputs: string): boolean {
    const io = this._io
    if (io?.direction !== 'output') return false
    if (io.elementwise) {
      ss.write('  for (var hgi_i = 0u; hgi_i < u32(', this.getArraySize(), '); hgi_i++) {\n')
      ss.write('    ', outputs, '.', this._ioName(), '[hgi_i] = ', this._scopeName(), '[hgi_i];\n')
      ss.write('  }\n')
      return true
    }
    const value = `${io.ioType}(${this._scopeName()})`
    ss.write('  ', outputs, '.', this._ioName(), ' = ',
      io.outputExpression ? io.outputExpression(value) : value, ';\n')
    return true
  }
}

/** A builtin keyword WebGPU does not provide (hdBaseVertex, hdPrimitiveID,
 *  ...). Declared as a zero-initialized module-scope variable so the body
 *  compiles; the generator reports the gap. Counterpart of
 *  HgiVulkanKeywordShaderSection (hgiVulkan/shaderSection.h:261-287). */
export class HgiWebGPUKeywordShaderSection extends HgiWebGPUShaderSection {
  constructor(identifier: string, private readonly _type: string, private readonly _keyword: string) {
    super(identifier)
  }

  /** hgiVulkan/shaderSection.cpp:525-529 */
  override writeType(ss: HgiStringStream): void {
    ss.write(this._type)
  }

  /** hgiVulkan/shaderSection.cpp:531-542 */
  override visitGlobalMemberDeclarations(ss: HgiStringStream): boolean {
    ss.write('// ', this._keyword, ' is not available in WebGPU\n')
    ss.write('var<private> ')
    this.writeParameter(ss)
    ss.write(';\n')
    return true
  }
}

/** The constant parameters ("push constants"). hgiVulkan writes a
 *  `layout(push_constant) uniform ParamBuffer` block
 *  (shaderSection.cpp:203-225); WebGPU has no push constants, so the members
 *  live in a uniform buffer at @group(3) @binding(0) that SetConstantValues
 *  fills (HgiWebGPUGraphicsCmds), and are copied into module-scope variables
 *  of the same names before main() so the body reads them unqualified as it
 *  does in GLSL. */
export class HgiWebGPUBlockShaderSection extends HgiWebGPUShaderSection {
  constructor(
    identifier: string,
    private readonly _instanceName: string,
    private readonly _parameters: ReadonlyArray<{ name: string, type: string }>,
    private readonly _group: number,
  ) {
    super(identifier)
  }

  override visitGlobalStructs(ss: HgiStringStream): boolean {
    ss.write('struct ')
    this.writeIdentifier(ss)
    ss.write(' {\n')
    for (const p of this._parameters) {
      ss.write('  ', p.name, ': ', p.type, ',\n')
    }
    ss.write('};\n')
    return true
  }

  override visitGlobalMemberDeclarations(ss: HgiStringStream): boolean {
    ss.write('@group(', this._group, ') @binding(0) var<uniform> ', this._instanceName, ': ')
    this.writeIdentifier(ss)
    ss.write(';\n')
    for (const p of this._parameters) {
      ss.write('var<private> ', p.name, ': ', p.type, ';\n')
    }
    return true
  }

  override visitEntryPointFunctionExecutions(ss: HgiStringStream): boolean {
    for (const p of this._parameters) {
      ss.write('  ', p.name, ' = ', this._instanceName, '.', p.name, ';\n')
    }
    return true
  }
}

/** A texture and its sampler, plus the HgiGet_/HgiGetSize_/HgiTextureLod_/
 *  HgiTexelFetch_/HgiSet_ accessors bodies call. hgiVulkan's
 *  HgiVulkanTextureShaderSection (shaderSection.h:176-217,
 *  shaderSection.cpp:227-435) writes one combined sampler; WebGPU, like
 *  Metal, binds the texture and the sampler separately
 *  (textureBind_<name> / samplerBind_<name>, hgiMetal/shaderSection.mm:138,
 *  221). */
export class HgiWebGPUTextureShaderSection extends HgiWebGPUShaderSection {
  constructor(
    identifier: string,
    private readonly _decl: {
      textureGroup: number
      samplerGroup: number
      bindIndex: number
      /** WGSL texture type: texture_2d<f32>, texture_depth_2d, ... */
      textureType: string
      /** WGSL sampler type, or '' for storage textures. */
      samplerType: string
      /** Accessor function definitions. */
      functions: string
    },
  ) {
    super(identifier)
  }

  override visitGlobalMemberDeclarations(ss: HgiStringStream): boolean {
    ss.write('@group(', this._decl.textureGroup, ') @binding(', this._decl.bindIndex,
      ') var textureBind_')
    this.writeIdentifier(ss)
    ss.write(': ', this._decl.textureType, ';\n')
    if (this._decl.samplerType) {
      ss.write('@group(', this._decl.samplerGroup, ') @binding(', this._decl.bindIndex,
        ') var samplerBind_')
      this.writeIdentifier(ss)
      ss.write(': ', this._decl.samplerType, ';\n')
    }
    return true
  }

  /** hgiVulkan/shaderSection.cpp:319-435 */
  override visitGlobalFunctionDefinitions(ss: HgiStringStream): boolean {
    ss.write(this._decl.functions)
    return true
  }
}

/** A storage or uniform buffer. hgiVulkan/shaderSection.h:223-255,
 *  shaderSection.cpp:437-511. */
export class HgiWebGPUBufferShaderSection extends HgiWebGPUShaderSection {
  constructor(
    identifier: string,
    private readonly _group: number,
    private readonly _bindIndex: number,
    /** `uniform`, `storage, read` or `storage, read_write`. */
    private _addressSpace: string,
    /** The WGSL type of the whole binding (T, array<T>, array<T, N>). */
    private readonly _type: string,
  ) {
    super(identifier)
  }

  /** hgiVulkan/shaderSection.cpp:458-462 */
  override writeType(ss: HgiStringStream): void {
    ss.write(this._type)
  }

  /** Declares a writable storage buffer the function does not write with
   *  read access (HgiWebGPUShaderGenerator._execute). */
  setReadOnly(): void {
    this._addressSpace = 'storage, read'
  }

  /** hgiVulkan/shaderSection.cpp:464-511 */
  override visitGlobalMemberDeclarations(ss: HgiStringStream): boolean {
    ss.write('@group(', this._group, ') @binding(', this._bindIndex, ') var<',
      this._addressSpace, '> ')
    this.writeParameter(ss)
    ss.write(';\n')
    return true
  }
}

/** An interstage block: a struct type plus a module-scope instance of it;
 *  the members are member sections carrying the instance identifier.
 *  hgiVulkan/shaderSection.h:293-317 (shaderSection.cpp:544-603) and
 *  hgiMetal's HgiMetalInterstageBlockShaderSection. */
export class HgiWebGPUInterstageBlockShaderSection extends HgiWebGPUShaderSection {
  constructor(
    blockIdentifier: string,
    blockInstanceIdentifier: string,
    private readonly _members: ReadonlyArray<{ name: string, type: string }>,
  ) {
    super(blockIdentifier, [], '', '', blockInstanceIdentifier)
  }

  override visitGlobalStructs(ss: HgiStringStream): boolean {
    ss.write('struct ')
    this.writeIdentifier(ss)
    ss.write(' {\n')
    for (const m of this._members) ss.write('  ', m.name, ': ', m.type, ',\n')
    ss.write('};\n')
    return true
  }

  override visitGlobalMemberDeclarations(ss: HgiStringStream): boolean {
    ss.write('var<private> ')
    this.writeBlockInstanceIdentifier(ss)
    ss.write(': ')
    this.writeIdentifier(ss)
    ss.write(';\n')
    return true
  }
}

/** A vertex attribute the emulated post-tessellation vertex stage reads
 *  from a storage buffer instead of the vertex input assembler. */
export interface HgiWebGPUPulledAttribute {
  /** The stage input's name (an array of one value per control point). */
  name: string
  /** HgiShaderFunctionParamDesc::location, matched against
   *  HgiVertexAttributeDesc::shaderBindLocation by the pipeline. */
  location: number
  /** WGSL type of one element: a 32-bit scalar or vector. */
  wgslType: string
}

/** What a vertex-pulling function draws per "patch" (see below). */
export type HgiWebGPUPulledPrimitive = 'triangle' | 'quad' | 'vertex' | 'point' | 'control'

/** The interstage location of the emulated gl_PointCoord: the last of
 *  WebGPU's 16 guaranteed inter-stage variables, which Storm's programs
 *  leave unused. */
export const HgiWebGPUPointCoordLocation = 15

/** The interstage location of a triangle's facing under the emulation of
 *  HgiPolygonModeLine (see HgiWebGPUPostTessVertexShaderSection): the one
 *  before HgiWebGPUPointCoordLocation. */
export const HgiWebGPUFrontFacingLocation = 14

/** The pieces of the emulated post-tessellation vertex stage (and, as
 *  'control', of the post-tessellation control stage run as a compute
 *  dispatch: one invocation per patch and instance, the same vertex
 *  pulling, no outputs).
 *
 *  hgiMetal draws post-tessellation vertex functions with Metal's fixed
 *  tessellator: the entry point is `[[patch(triangle, 3)]] vertex` and takes
 *  `patch_control_point<...> [[stage_in]]`, `[[patch_id]]` and
 *  `[[position_in_patch]]` (hgiMetal/shaderGenerator.mm:152-187, 657-669,
 *  1287-1306, 1385-1397). WebGPU has no tessellator, so the stage is a
 *  plain vertex function and the entry point derives what Metal supplies:
 *  - with per-patch factors (HgiTessellationState::TessVertex), each vertex
 *    is a point HgiWebGPUTessellation's kernels wrote, (patch, u, v), drawn
 *    as an indexed indirect draw of the tessellator's triangles;
 *  - with constant factors, the patch's vertices are the triangles of its
 *    control points (two per triquad, one per triangle patch, as the
 *    reference device's triangle lists; HgiWebGPUConstantPatchCorners,
 *    `hgiWebGPU_patchDraw.corners`), drawn
 *    non-indexed, vertex_index / vertices per patch being the patch;
 *  - patch_id: the draw's patchStart + its patch, as the reference GPU
 *    counts it (HgiWebGPUCapabilities, BasePrimitiveOffset);
 *  - position_in_patch: (u, v) for quads, (u, v, 1 - u - v) for triangles;
 *  - the per-control-point stage inputs: the control-point indices come
 *    from the index buffer bound as storage (Metal's controlPointIndexBuffer,
 *    read at (patchStart + patch) * controlPoints + i), and each attribute
 *    from its vertex buffer bound as storage (vertex pulling), at the word
 *    offset and strides HgiWebGPUGraphicsCmds writes per draw in
 *    `hgiWebGPU_patchDraw` (the role of hgiMetal's per-draw vertex buffer
 *    offsets, hgiMetal/stepFunctions.mm:76-104).
 *  hd_BaseInstance (hdBaseInstance, Metal's [[base_instance]]) also comes
 *  from the per-draw parameters, which WGSL has no builtin for.
 *
 *  The same section draws two kinds of plain vertex function with vertex
 *  pulling, each "patch" being one vertex of the draw (one control point):
 *  - 'vertex': a vertex function that reads gl_BaseVertex or hd_BaseInstance
 *    (Metal's [[base_vertex]] / [[base_instance]], which WGSL lacks) is
 *    drawn with one vertex per vertex of the draw, in the pipeline's own
 *    topology, its attributes pulled as above;
 *  - 'point': PLATFORM-DIVERGENCE(hgiWebGPU-wide-points): WebGPU has no
 *    point size, so a point-list vertex function (Storm gives gl_PointSize the
 *    point_size role only for points, hdSt/codeGen.cpp) is drawn with 6
 *    vertices per point, the two triangles of a square gl_PointSize
 *    pixels wide around the point: WebGPU only rasterizes 1-pixel points.
 *    The fragment stage reads the corner's coordinate as gl_PointCoord.
 *    hgiMetal writes the size unchanged as [[point_size]]
 *    (hgiMetal/shaderGenerator.mm:727-756), which the Metal Shading
 *    Language specification 4.1 section 5.2.3.3 (Table 5.4) defines only as
 *    the "size of a point primitive", with no clamp or rounding; section
 *    5.2.3.4 (Table 5.5) has [[point_coord]] range from 0 to 1 across the
 *    point, and section 1.7 puts the window origin at the upper left.
 *    The reference captures (testHdStBasicDrawing_*: 1,500 points of 0.45
 *    to 2.8 pixels, single-sampled) show what Apple's rasterizer does with
 *    it: a pixel is covered when its center lies inside the square of
 *    gl_PointSize pixels around the projected point, the size neither
 *    rounded nor raised to one pixel, so a point smaller than a pixel
 *    covers the pixel only when its center is close enough to the pixel's
 *    (or none at all). The emulated square is that square, and the
 *    triangles' pixel-center coverage gives the same pixels. */
export class HgiWebGPUPostTessVertexShaderSection extends HgiWebGPUShaderSection {
  constructor(
    private readonly _params: {
      group: number
      patchDrawBinding: number
      controlPointIndexBinding: number
      attributeBindingBase: number
      /** Binding of the tessellated points ('triangle' and 'quad' with
       *  `tessellated`). */
      tessPointsBinding: number
      /** 'triangle' and 'quad': the variant drawn with per-patch factors,
       *  from the tessellator's points (HgiWebGPUTessellation). The
       *  function drawn at constant factors does not declare the points,
       *  so they take no binding. */
      tessellated?: boolean
      /** PLATFORM-DIVERGENCE(webgpu-storage-buffer-limit): the variant that
       *  reads the control point indices and every pulled attribute from
       *  one buffer, `hgiWebGPU_pulled` at controlPointIndexBinding, which
       *  HgiWebGPUGraphicsCmds packs from the bound index and vertex
       *  buffers (HgiWebGPUPulledAttributePacker); the indices start at
       *  word hgiWebGPU_patchDraw.tess.w. */
      packed?: boolean
      /** Control points per patch (numVertsPerPatchIn). */
      controlPoints: number
      /** 'triangle' or 'quad' for an emulated post-tessellation vertex
       *  function; 'vertex' or 'point' for a vertex function drawn with
       *  vertex pulling (see below). */
      patchType: HgiWebGPUPulledPrimitive
      attributes: readonly HgiWebGPUPulledAttribute[]
      /** Name and WGSL type of the hdPatchID input, if declared. */
      patchId: { name: string, type: string } | null
      /** Name and WGSL type of the hdPositionInPatch input, if declared. */
      positionInPatch: { name: string, type: string } | null
      /** Name and WGSL type of the hdBaseInstance input, if declared. */
      baseInstance: { name: string, type: string } | null
      /** Name of the hdInstanceID input, if declared (it is copied from
       *  @builtin(instance_index) before this section runs). */
      instanceId: string | null
      /** Name and WGSL type of the hdVertexID input, if declared ('vertex'
       *  and 'point' only). */
      vertexId?: { name: string, type: string } | null
      /** Name and WGSL type of the hdBaseVertex input, if declared ('vertex'
       *  and 'point' only). */
      baseVertex?: { name: string, type: string } | null
      /** 'point': the module-scope gl_PointSize the body writes, the
       *  gl_Position output member, and the interstage location of the
       *  point coordinate the fragment stage reads as gl_PointCoord. */
      point?: { pointSize: string | null, position: string, pointCoordLocation: number }
      /** 'triangle' and 'quad' at constant factors: the variant drawn with
       *  HgiPolygonModeLine (see VisitEntryPointFunctionExecutions): the
       *  gl_Position output member and the interstage location of the
       *  triangle's facing. */
      lines?: { position: string, frontFacingLocation: number }
    },
  ) {
    super('hgiWebGPU_patchDraw')
  }

  /** Vertices drawn per patch at constant factors: the vertices of the
   *  minimum tessellation (two line vertices per triangle vertex under
   *  HgiPolygonModeLine);
   *  one per vertex; the two triangles of a point's square. */
  getVerticesPerPatch(): number {
    const lines = this._params.lines ? 2 : 1
    switch (this._params.patchType) {
      case 'triangle': return 3 * lines
      case 'quad': return 6 * lines
      case 'vertex':
      case 'control': return 1
      default: return 6
    }
  }

  /** The HgiPolygonModeLine variant runs the body itself (once per vertex
   *  of the vertex's triangle), so the entry point does not call main(). */
  callsMain(): boolean {
    return !!this._params.lines
  }

  /** The control point index at index `i` of the bound index buffer. */
  private _controlPointIndex(i: string): string {
    return this._params.packed
      ? `hgiWebGPU_pulled[hgiWebGPU_patchDraw.tess.w + ${i}]`
      : `hgiWebGPU_controlPointIndices[${i}]`
  }

  /** The variant reads everything it pulls from one packed buffer. */
  isPacked(): boolean {
    return !!this._params.packed
  }

  getPrimitive(): HgiWebGPUPulledPrimitive {
    return this._params.patchType
  }

  getPulledAttributes(): readonly HgiWebGPUPulledAttribute[] {
    return this._params.attributes
  }

  /** The `attributes` array length of HgiWebGPUPatchDraw. */
  getAttributeSlots(): number {
    return this._params.attributes.reduce((n, a) => Math.max(n, a.location + 1), 0)
  }

  override visitGlobalStructs(ss: HgiStringStream): boolean {
    const slots = this.getAttributeSlots()
    ss.write('struct HgiWebGPUPatchDraw {\n')
    ss.write('  // patchStart, baseInstance, baseVertex, indexed\n')
    ss.write('  header: vec4<u32>,\n')
    ss.write('  // the viewport (x, y, width, height)\n')
    ss.write('  viewport: vec4<f32>,\n')
    ss.write('  // patchCount, tessellated (per-patch factors), HgiPolygonModeLine flags,\n')
    ss.write('  // the first word of the control point indices in hgiWebGPU_pulled (packed)\n')
    ss.write('  tess: vec4<u32>,\n')
    ss.write('  // the (u, v) of the vertices of a patch at constant factors\n')
    ss.write('  corners: array<vec4<f32>, 3>,\n')
    if (slots > 0) {
      ss.write('  // per location: first word, words per control point, per instance, per patch\n')
      ss.write('  attributes: array<vec4<u32>, ', slots, '>,\n')
    }
    ss.write('};\n')
    return true
  }

  override visitGlobalMemberDeclarations(ss: HgiStringStream): boolean {
    const p = this._params
    ss.write('@group(', p.group, ') @binding(', p.patchDrawBinding,
      ') var<uniform> hgiWebGPU_patchDraw: HgiWebGPUPatchDraw;\n')
    if (p.packed) {
      ss.write('@group(', p.group, ') @binding(', p.controlPointIndexBinding,
        ') var<storage, read> hgiWebGPU_pulled: array<u32>;\n')
    } else {
      ss.write('@group(', p.group, ') @binding(', p.controlPointIndexBinding,
        ') var<storage, read> hgiWebGPU_controlPointIndices: array<u32>;\n')
      for (const a of p.attributes) {
        ss.write('@group(', p.group, ') @binding(', p.attributeBindingBase + a.location,
          ') var<storage, read> hgiWebGPU_attribute', a.location, ': array<u32>;\n')
      }
    }
    if ((p.patchType === 'triangle' || p.patchType === 'quad') && p.tessellated) {
      ss.write('@group(', p.group, ') @binding(', p.tessPointsBinding,
        ') var<storage, read> hgiWebGPU_tessPoints: array<u32>;\n')
    }
    return true
  }

  override visitGlobalFunctionDefinitions(ss: HgiStringStream): boolean {
    for (const a of this._params.attributes) {
      const m = /^(?:vec([234])<(f32|i32|u32)>|(f32|i32|u32))$/.exec(a.wgslType)
      const n = m?.[1] ? Number(m[1]) : 1
      const scalar = m?.[2] ?? m?.[3] ?? 'f32'
      const buf = this._params.packed ? 'hgiWebGPU_pulled' : `hgiWebGPU_attribute${a.location}`
      const words = Array.from({ length: n }, (_, i) =>
        `bitcast<${scalar}>(${buf}[w${i ? ` + ${i}u` : ''}])`)
      ss.write('fn hgiWebGPU_Fetch_', a.name, '(controlPoint: u32, instance: u32, patchIndex: u32) -> ', a.wgslType, ' {\n')
      ss.write('  let a = hgiWebGPU_patchDraw.attributes[', a.location, '];\n')
      ss.write('  let w = a.x + (a.y & 0x7fffffffu) * controlPoint + a.z * instance + a.w * patchIndex;\n')
      if (scalar === 'f32' && (n === 3 || n === 4)) {
        // A packed 10-10-10-2 word (bit 31 of a.y, set by
        // HgiWebGPUGraphicsCmds for HgiFormatPackedInt1010102), read as
        // Metal's MTLVertexFormatInt1010102Normalized: signed components,
        // max(c / (2^(b-1) - 1), -1).
        ss.write('  if ((a.y & 0x80000000u) != 0u) {\n')
        ss.write('    let p = bitcast<i32>(', buf, '[w]);\n')
        ss.write('    let c = vec4<f32>(f32((p << 22u) >> 22u), f32((p << 12u) >> 22u), f32((p << 2u) >> 22u), f32(p >> 30u));\n')
        ss.write('    let v = max(c / vec4<f32>(511.0, 511.0, 511.0, 1.0), vec4<f32>(-1.0));\n')
        ss.write('    return ', n === 3 ? 'v.xyz' : 'v', ';\n')
        ss.write('  }\n')
      }
      ss.write('  return ', n === 1 ? words[0]! : `${a.wgslType}(${words.join(', ')})`, ';\n')
      ss.write('}\n')
    }
    return true
  }

  override visitEntryPointInputs(ss: HgiStringStream): boolean {
    if (this._params.patchType === 'control') {
      ss.write('  @builtin(global_invocation_id) hgi_globalId: vec3<u32>,\n')
      return true
    }
    ss.write('  @builtin(vertex_index) hgi_vertexIndex: u32,\n')
    if (!this._params.instanceId) {
      ss.write('  @builtin(instance_index) hgi_instanceIndex: u32,\n')
    }
    return true
  }

  override visitEntryPointOutputs(ss: HgiStringStream): boolean {
    const lines = this._params.lines
    if (lines) {
      ss.write('  @location(', lines.frontFacingLocation, ') @interpolate(flat) hgi_frontFacing: u32,\n')
      return true
    }
    const point = this._params.point
    if (!point) return false
    ss.write('  @location(', point.pointCoordLocation, ') hgi_pointCoord: vec2<f32>,\n')
    return true
  }

  /** 'point': the vertex is moved to its corner of the point's square,
   *  gl_PointSize pixels wide (what the rasterizer does with a point of
   *  that size), and the corner's point coordinate is written. */
  override visitEntryPointOutputExecutions(ss: HgiStringStream, outputs: string): boolean {
    if (this._params.lines) {
      ss.write('  ', outputs, '.hgi_frontFacing = select(0u, 1u, hgi_frontFacing);\n')
      return true
    }
    const point = this._params.point
    if (!point) return false
    const pos = `${outputs}.${point.position}`
    ss.write('  // Emulated point of gl_PointSize pixels: corner hgi_corner of its square.\n')
    ss.write('  let hgi_pointCorner = array<vec2<f32>, 6>(vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), ',
      'vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, 1.0), vec2<f32>(-1.0, 1.0))[hgi_corner];\n')
    // gl_PointSize unchanged, as hgiMetal's [[point_size]] (see the class
    // comment): no one-pixel minimum.
    ss.write('  let hgi_pointSize = ', point.pointSize ?? '1.0', ';\n')
    ss.write('  ', pos, ' = vec4<f32>(', pos, '.xy + hgi_pointCorner * hgi_pointSize / ',
      'hgiWebGPU_patchDraw.viewport.zw * ', pos, '.w, ', pos, '.zw);\n')
    // gl_PointCoord: (0, 0) at the upper left corner of the square.
    ss.write('  ', outputs, '.hgi_pointCoord = vec2<f32>(0.5 + 0.5 * hgi_pointCorner.x, 0.5 - 0.5 * hgi_pointCorner.y);\n')
    return true
  }

  override visitEntryPointFunctionExecutions(ss: HgiStringStream, inputs: string): boolean {
    const p = this._params
    const v = this.getVerticesPerPatch()
    const n = p.controlPoints
    const patchKind = p.patchType === 'triangle' || p.patchType === 'quad'
    if (p.patchType === 'control') {
      // The post-tessellation control stage: one invocation per patch and
      // instance. Metal's [[instance_id]] includes the base instance.
      ss.write('  // Post-tessellation control stage: patch x, instance y of the dispatch.\n')
      ss.write('  let hgi_patch = ', inputs, '.hgi_globalId.x;\n')
      ss.write('  if (hgi_patch >= hgiWebGPU_patchDraw.tess.x) { return; }\n')
      ss.write('  let hgi_instance = ', inputs, '.hgi_globalId.y + hgiWebGPU_patchDraw.header.y;\n')
      if (p.instanceId) ss.write('  ', p.instanceId, ' = hgi_instance;\n')
    } else if (patchKind && p.lines) {
      // HgiPolygonModeLine. hgiMetal draws the patch's triangles with
      // setTriangleFillMode:MTLTriangleFillModeLines
      // (hgiMetal/graphicsPipeline.mm:474-475, conversions.mm:188-191):
      // each triangle is culled and its facing decided as a triangle, then
      // its three edges are rasterized as lines. WebGPU has no fill mode, so
      // this variant is drawn as a line list, two line vertices per edge,
      // the edges of triangle t being (0, 1), (1, 2), (2, 0) of its
      // vertices in the tessellator's order. Each line vertex runs the body
      // for the three vertices of its triangle (its own last, so the
      // outputs are its own) to find the triangle's facing from their
      // clip-space positions: an edge of a culled triangle is moved outside
      // the clip volume, and the facing reaches the fragment stage as a
      // flat value (gl_FrontFacing of a line is always true in WebGPU).
      // PLATFORM-DIVERGENCE(hgiWebGPU-polygon-mode-line): the line's
      // attributes are interpolated along the line, Metal's over the
      // triangle's plane, so fwidth-based edge tests (meshWire.glslfx)
      // differ on near-threshold pixels (docs/imaging-i2.md section 2.2).
      ss.write('  // Emulated HgiPolygonModeLine: line vertex of an edge of a triangle of the patch.\n')
      ss.write('  let hgi_patch = ', inputs, '.hgi_vertexIndex / ', v, 'u;\n')
      ss.write('  let hgi_line = ', inputs, '.hgi_vertexIndex % ', v, 'u;\n')
      ss.write('  let hgi_triangle = hgi_line / 6u;\n')
      ss.write('  let hgi_ownCorner = ((hgi_line % 6u + 1u) / 2u) % 3u;\n')
      ss.write('  var hgi_uv: vec2<f32>;\n')
      ss.write('  let hgi_instance = ',
        p.instanceId ? `u32(${p.instanceId})` : `${inputs}.hgi_instanceIndex`, ';\n')
    } else if (patchKind) {
      // Per-patch factors (HgiWebGPUTessellation): vertex_index is a point
      // the tessellator wrote, (patch, u, v) in 16.16 fixed point, and the
      // indirect draw starts at instance 0 (WebGPU needs
      // indirect-first-instance for more), so the base instance is added.
      // Constant factors: the vertices of the triangles of the patch's
      // control points, v per patch, in order (hgiWebGPU_patchDraw.corners).
      ss.write('  // Emulated post-tessellation vertex.\n')
      ss.write('  var hgi_patch: u32;\n')
      ss.write('  var hgi_uv: vec2<f32>;\n')
      ss.write('  var hgi_firstInstance = 0u;\n')
      if (p.tessellated) {
        ss.write('  if (hgiWebGPU_patchDraw.tess.y != 0u) {\n')
        ss.write('    let hgi_point = ', inputs, '.hgi_vertexIndex * 3u;\n')
        ss.write('    hgi_patch = hgiWebGPU_tessPoints[hgi_point];\n')
        ss.write('    hgi_uv = vec2<f32>(f32(hgiWebGPU_tessPoints[hgi_point + 1u]), ',
          'f32(hgiWebGPU_tessPoints[hgi_point + 2u])) / 65536.0;\n')
        ss.write('    hgi_firstInstance = hgiWebGPU_patchDraw.header.y;\n')
        ss.write('  } else {\n')
      }
      const i = p.tessellated ? '    ' : '  '
      ss.write(i, 'hgi_patch = ', inputs, '.hgi_vertexIndex / ', v, 'u;\n')
      ss.write(i, 'let hgi_c = ', inputs, '.hgi_vertexIndex % ', v, 'u;\n')
      ss.write(i, 'let hgi_cc = hgiWebGPU_patchDraw.corners[hgi_c / 2u];\n')
      ss.write(i, 'hgi_uv = select(hgi_cc.xy, hgi_cc.zw, (hgi_c & 1u) != 0u);\n')
      if (p.tessellated) ss.write('  }\n')
      if (p.instanceId) {
        ss.write('  ', p.instanceId, ' = ', p.instanceId, ' + hgi_firstInstance;\n')
      }
      ss.write('  let hgi_instance = ',
        p.instanceId ? `u32(${p.instanceId})` : `${inputs}.hgi_instanceIndex + hgi_firstInstance`, ';\n')
    } else {
      ss.write('  // Vertex pulling: the vertex (or point) of the draw.\n')
      ss.write('  let hgi_patch = ', inputs, '.hgi_vertexIndex / ', v, 'u;\n')
      ss.write('  let hgi_corner = ', inputs, '.hgi_vertexIndex % ', v, 'u;\n')
      ss.write('  let hgi_instance = ',
        p.instanceId ? `u32(${p.instanceId})` : `${inputs}.hgi_instanceIndex`, ';\n')
    }
    if (p.patchId) {
      // Metal's [[patch_id]] on the reference GPU counts from the factor
      // buffer's first patch: the draw's patchStart is included
      // (HgiWebGPUCapabilities sets BasePrimitiveOffset as hgiMetal does).
      ss.write('  ', p.patchId.name, ' = ', p.patchId.type, '(',
        patchKind || p.patchType === 'control' ? 'hgiWebGPU_patchDraw.header.x + ' : '', 'hgi_patch);\n')
    }
    // Metal's position_in_patch: (u, v) for quads, (u, v, 1 - u - v) for
    // triangles (the tessellator's DOMAIN_POINT, tessellator.hpp:85-89).
    const writePositionInPatch = (indent: string) => {
      if (!p.positionInPatch) return
      const t = p.positionInPatch.type
      const uvw = p.patchType === 'triangle'
        ? 'vec3<f32>(hgi_uv, 1.0 - hgi_uv.x - hgi_uv.y)'
        : patchKind ? 'vec3<f32>(hgi_uv, 0.0)' : 'vec3<f32>(0.0)'
      const value = /^vec4/.test(t) ? `vec4<f32>(${uvw}, 0.0)`
        : /^vec3/.test(t) ? uvw : /^vec2/.test(t) ? `${uvw}.xy` : `${uvw}.x`
      ss.write(indent, p.positionInPatch.name, ' = ', value, ';\n')
    }
    if (!p.lines) writePositionInPatch('  ')
    if (p.baseInstance) {
      ss.write('  ', p.baseInstance.name, ' = ', p.baseInstance.type, '(hgiWebGPU_patchDraw.header.y);\n')
    }
    if (p.baseVertex) {
      ss.write('  ', p.baseVertex.name, ' = ', p.baseVertex.type, '(hgiWebGPU_patchDraw.header.z);\n')
    }
    if (p.vertexId) {
      // GL's gl_VertexID (Metal's [[vertex_id]]): the index read from the
      // index buffer plus the base vertex, or first vertex + i.
      ss.write('  var hgi_vertexId = hgiWebGPU_patchDraw.header.x + hgi_patch;\n')
      ss.write('  if (hgiWebGPU_patchDraw.header.w != 0u) {\n')
      ss.write('    hgi_vertexId = ', this._controlPointIndex('hgi_vertexId'), ';\n')
      ss.write('  }\n')
      ss.write('  ', p.vertexId.name, ' = ', p.vertexId.type, '(hgi_vertexId + hgiWebGPU_patchDraw.header.z);\n')
    }
    if (p.attributes.length > 0) {
      ss.write('  let hgi_firstControlPoint = (hgiWebGPU_patchDraw.header.x + hgi_patch) * ', n, 'u;\n')
      ss.write('  for (var i = 0u; i < ', n, 'u; i++) {\n')
      ss.write('    var controlPoint = hgi_firstControlPoint + i;\n')
      ss.write('    if (hgiWebGPU_patchDraw.header.w != 0u) {\n')
      ss.write('      controlPoint = ', this._controlPointIndex('controlPoint'), ';\n')
      ss.write('    }\n')
      for (const a of p.attributes) {
        // Vertex pulling ('vertex', 'point') reads one value, not an array
        // per control point.
        const target = p.patchType === 'vertex' || p.patchType === 'point' ? a.name : `${a.name}[i]`
        ss.write('    ', target, ' = hgiWebGPU_Fetch_', a.name, '(controlPoint, hgi_instance, hgiWebGPU_patchDraw.header.x + hgi_patch);\n')
      }
      ss.write('  }\n')
    }
    if (patchKind && p.lines) {
      const pos = p.lines.position
      // The body for the triangle's other two vertices, then its own.
      ss.write('  var hgi_trianglePositions: array<vec4<f32>, 3>;\n')
      ss.write('  for (var hgi_k = 1u; hgi_k <= 3u; hgi_k++) {\n')
      ss.write('    let hgi_corner = (hgi_ownCorner + hgi_k) % 3u;\n')
      ss.write('    let hgi_c = hgi_triangle * 3u + hgi_corner;\n')
      ss.write('    let hgi_cc = hgiWebGPU_patchDraw.corners[hgi_c / 2u];\n')
      ss.write('    hgi_uv = select(hgi_cc.xy, hgi_cc.zw, (hgi_c & 1u) != 0u);\n')
      writePositionInPatch('    ')
      ss.write('    main();\n')
      ss.write('    hgi_trianglePositions[hgi_corner] = ', pos, ';\n')
      ss.write('  }\n')
      // The triangle's orientation from its homogeneous clip-space (x, y,
      // w), y flipped as the position output is (HgiWebGPUShaderGenerator);
      // its sign is that of the visible part's area in normalized device
      // coordinates, counter-clockwise positive. tess.z: 1 cull front, 2
      // cull back, 4 front face counter-clockwise (the pipeline's
      // GPUPrimitiveState, HgiWebGPUGraphicsCmds).
      ss.write('  let hgi_p0 = hgi_trianglePositions[0];\n')
      ss.write('  let hgi_p1 = hgi_trianglePositions[1];\n')
      ss.write('  let hgi_p2 = hgi_trianglePositions[2];\n')
      ss.write('  let hgi_orientation = determinant(mat3x3<f32>(vec3<f32>(hgi_p0.x, -hgi_p0.y, hgi_p0.w), ',
        'vec3<f32>(hgi_p1.x, -hgi_p1.y, hgi_p1.w), vec3<f32>(hgi_p2.x, -hgi_p2.y, hgi_p2.w)));\n')
      ss.write('  let hgi_flags = hgiWebGPU_patchDraw.tess.z;\n')
      ss.write('  let hgi_frontFacing = (hgi_orientation > 0.0) == ((hgi_flags & 4u) != 0u);\n')
      ss.write('  if ((hgi_frontFacing && (hgi_flags & 1u) != 0u) || (!hgi_frontFacing && (hgi_flags & 2u) != 0u)) {\n')
      ss.write('    ', pos, ' = vec4<f32>(4.0, 4.0, 0.0, 1.0);\n')
      ss.write('  }\n')
    }
    return true
  }
}
