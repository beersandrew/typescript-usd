// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/materialXFilter.cpp,
//  pxr/imaging/hdSt/materialXFilter.h, pxr/imaging/hdSt/codeGen.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/materialXFilter.{h,cpp} (OpenUSD 26.11.1),
// against the vendored MaterialX 1.39.5 (packages/materialx/PROVENANCE.md).
//
// Divergences (each also noted at its site):
// - HdSt_MxShaderGenInfo (materialXFilter.h:21-36) is defined in
//   materialXShaderGen.ts and re-exported here, so the two modules do not
//   import each other.
// - _InitHdStMaterialXContext: HgiWebGPU reports the API name "WebGPU",
//   which upstream does not know. Its Hgi follows hgiVulkan (shader
//   generation, codeGen.cpp's non-Metal, non-OpenGL resource path), so it
//   gets the Vulkan GLSL generator that HgiTokens->Vulkan selects
//   (materialXFilter.cpp:188-190). The Metal generator
//   (HdStMaterialXShaderGenMsl, :183-187) emits Metal Shading Language and
//   is not ported.
// - HdMaterialNetwork2's std::maps are insertion-ordered TS Maps here
//   (hd/src/material.ts): every iteration upstream does in key order
//   (nodes, terminals, parameters, inputConnections, std::set<SdfPath>)
//   goes through _SortedKeys / _SortedPaths, SdfPath and TfToken keys
//   comparing as strings as hd/src/material.ts does. mx::StringMap
//   (HdSt_MxShaderGenInfo.primvarMap, an unordered_map upstream) keeps
//   insertion order.
// - The topology and shader cache hashes (_BuildEquivalentMaterialNetwork,
//   HdSt_ApplyMaterialXFilter) append the same sequence to this
//   repository's Tf_HashState; they are cache keys only and do not equal
//   native's values.
// - HDST_MTLX_DUMP_SHADER_SOURCEFILE writes the source to the TfDebug
//   output instead of a file (no file system).
// - Where upstream dereferences a null pointer or a missing map entry
//   (noted at each site), the TS returns early instead of crashing, except
//   std::map::at, which throws.
// - TRACE_FUNCTION_SCOPE is not ported.

import {
  createDocument,
  Exception as MxException,
  NodeGraph,
  SURFACE_SHADER_TYPE_STRING,
  type Document,
  type Element,
  type Input,
  type InterfaceElement,
  type Node,
  type NodeDef,
} from '@mtlx/core'
import { FileSearchPath, readFromXmlString } from '@mtlx/format'
import {
  BaseType,
  DefaultColorManagementSystem,
  GenContext,
  HwSpecularEnvironmentMethod,
  HwTransmissionRenderMethod,
  Semantic,
  ShaderNode,
  Stage,
  Type,
  isTransparentSurface,
  type Shader,
  type TypeDesc,
} from '@mtlx/genshader'
import { HW } from '@mtlx/genhw'
import { LightHandler } from '@mtlx/render'
import {
  Debug as TfDebug,
  Token as TfToken,
  Type as TfType,
  Tf_HashState,
  Hash as TfHash,
  TfStringStartsWith,
} from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  Vec2f as GfVec2f,
  Vec2i as GfVec2i,
  Vec3f as GfVec3f,
  Vec3i as GfVec3i,
  Vec4f as GfVec4f,
  Vec4i as GfVec4i,
} from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  MaterialNode2 as HdMaterialNode2,
  type MaterialConnection2 as HdMaterialConnection2,
  MaterialNetwork2 as HdMaterialNetwork2,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits, HgiTokens } from 'typescript-usd/hgi'
import { HioGlslfxTokens } from 'typescript-usd/hio'
import { Registry as SdrRegistry, type ShaderNode as SdrShaderNode } from 'typescript-usd/sdr'
import {
  ConvertToString as HdMtlxConvertToString,
  CreateMtlxDocumentFromHdNetwork as HdMtlxCreateMtlxDocumentFromHdNetwork,
  CreateNameFromPath as HdMtlxCreateNameFromPath,
  GetNodeDef as HdMtlxGetNodeDef,
  GetNodeDefName as HdMtlxGetNodeDefName,
  GetPrimvarDefaultInputName as HdMtlxGetPrimvarDefaultInputName,
  GetPrimvarNameInputName as HdMtlxGetPrimvarNameInputName,
  IsPrimvarReaderNodeDef as HdMtlxIsPrimvarReaderNodeDef,
  SearchPaths as HdMtlxSearchPaths,
  StdLibraries as HdMtlxStdLibraries,
  TexturePrimvarData as HdMtlxTexturePrimvarData,
  Tokens as HdMtlxTokens,
} from 'typescript-usd/hdMtlx'
import { HdStDebugCodes } from './debugCodes.ts'
import { HdSt_MaterialParam } from './materialParam.ts'
import {
  HdSt_MxShaderGenInfo,
  HdStMaterialXHelpers,
  HdStMaterialXShaderGenGlsl,
  HdStMaterialXShaderGenVkGlsl,
} from './materialXShaderGen.ts'
import { HdStPackageFallbackDomeLightTexture } from './package.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import { TF_CODING_ERROR, TF_WARN } from './tfDiagnostic.ts'
import { HdStMaterialTagTokens, HdStTextureTokens, HdStTokens } from './tokens.ts'

export { HdSt_MxShaderGenInfo }

/** HgiWebGPU's API name (hgiWebGPU/src/tokens). */
const _webGPUApiName = 'WebGPU'

/** materialXFilter.cpp:41-86 */
const _tokens = {
  mtlx: 'mtlx',
  mtlxMaterialTag: 'mtlx:materialTag',

  // Default Texture Coordinate Token
  st: 'st',
  texcoord: 'texcoord',
  index: 'index',
  defaultInput: 'default',
  filename: 'filename',

  // Opacity Parameters - USD Preview Surface
  UsdPreviewSurface: 'UsdPreviewSurface',
  opacity: 'opacity',
  opacityThreshold: 'opacityThreshold',
  // Opacity Parameters - Standard Surface
  standard_surface: 'standard_surface',
  transmission: 'transmission',
  // Opacity Parameters - Open PBR
  open_pbr_surface: 'open_pbr_surface',
  transmission_weight: 'transmission_weight',
  geometry_opacity: 'geometry_opacity',
  // Opacity Parameters - GlTF
  gltf_pbr: 'gltf_pbr',
  alpha_mode: 'alpha_mode',
  alpha_cutoff: 'alpha_cutoff',
  alpha: 'alpha',
  // Opacity Parameters - Other Surface shaders
  convert: 'convert',
  ND_convert_color4_surfaceshader: 'ND_convert_color4_surfaceshader',
  ND_convert_vector4_surfaceshader: 'ND_convert_vector4_surfaceshader',

  // Fallback Dome Light Tokens
  domeLightFallback: 'domeLightFallback',
  ND_image_color3: 'ND_image_color3',
  file: 'file',

  // Anonymization constants
  NG_Anonymized: 'NG_Anonymized',

  // Primvar detection constants
  geompropvalue: 'geompropvalue',

  // Normalmap node Tokens
  ND_normalmap: 'ND_normalmap',
  space: 'space',
} as const

/** materialXFilter.cpp:88-123 */
const _topologicalTokens = {
  // This represents living knowledge of the internals of the MaterialX
  // shader generator for both GLSL and Metal. Such knowledge should reside
  // inside the generator class provided by MaterialX.

  // Dot filename is always topological due to code that prevents creating
  // extra OpenGL samplers this is the only shader node id required. All
  // other tests are done on the shader family.
  ND_dot_filename: 'ND_dot_filename',
  // Topo affecting nodes due to object/model/world space parameter
  position: 'position',
  normal: 'normal',
  tangent: 'tangent',
  bitangent: 'bitangent',
  // Topo affecting nodes due to channel index.
  texcoord: 'texcoord',
  geomcolor: 'geomcolor',
  // Geompropvalue primvar name is topo-affecting.
  geompropvalue: 'geompropvalue',
  // Swizzles are inlined into the codegen and affect topology.
  swizzle: 'swizzle',
  // Some conversion nodes are implemented by codegen.
  convert: 'convert',
  // Constants: they get inlined in the source.
  constant: 'constant',

  // Atan2 Nodes are Not topological but their inputs change between v1.38
  // and v1.39 so we need to include them in the the anonymize network
  // otherwise the generated shader will not have the correct values.
  atan2: 'atan2',
} as const

/** materialXFilter.cpp:125-130. mxTextureTokens <-> HdStTextureTokens */
const _mxTextureParamTokens = {
  filtertype: 'filtertype',
  uaddressmode: 'uaddressmode',
  vaddressmode: 'vaddressmode',
} as const
const _mxTextureParamTokensAll: readonly string[] = Object.values(_mxTextureParamTokens)

/** materialXFilter.cpp:132-137. To store the mapping between the node paths
 *  in the HdMaterialNetwork to the corresponding anonymized node paths -
 *  <hdNodePath, anonNodePath> */
type _AnonNodePathMap = Map<string, string>

/** SdfFieldKeys->ColorSpace (pxr/usd/sdf/schema.h). */
const _SdfFieldKeysColorSpace = 'colorSpace'
/** SdrNodeMetadata->Primvars (pxr/usd/sdr/shaderMetadataHelpers / declare.h). */
const _SdrNodeMetadataPrimvars = 'primvars'

////////////////////////////////////////////////////////////////////////////////
// Containers. HdMaterialNetwork2's nodes, parameters and inputConnections are
// std::maps upstream; the TS Maps keep insertion order, so iteration that
// upstream does in key order goes through _SortedKeys (SdfPath and TfToken
// keys compare as their strings here, as hd/src/material.ts does).

function _SortedKeys<V>(m: ReadonlyMap<string, V>): string[] {
  return [...m.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** std::map::operator[] on hdNetwork->nodes: the node, default-constructed
 *  and inserted when absent. */
function _NodeAt(hdNetwork: HdMaterialNetwork2, path: string): HdMaterialNode2 {
  let node = hdNetwork.nodes.get(path)
  if (!node) {
    node = new HdMaterialNode2()
    hdNetwork.nodes.set(path, node)
  }
  return node
}

/** std::map::at: throws when absent (std::out_of_range upstream). */
function _At<V>(m: ReadonlyMap<string, V>, key: string): V {
  const value = m.get(key)
  if (value === undefined) {
    throw new RangeError(`map::at: key not found: '${key}'`)
  }
  return value
}

/** std::map::insert / emplace: does not overwrite an existing key. */
function _Emplace<V>(m: Map<string, V>, key: string, value: V): void {
  if (!m.has(key)) m.set(key, value)
}

/** The VtValue of a parameter (parameters are VtValues, as in
 *  materialNetwork.ts). */
function _AsVtValue(value: unknown): VtValue {
  return value instanceof VtValue ? value : VtValue.getEmpty()
}

/** VtValue(TfToken) */
function _TokenValue(token: string): VtValue {
  return VtValue.create(TfToken(token), VtValueTypes.token)
}

/** VtValue::IsHolding<T>() for the type registered as `typeName`. */
function _IsHolding(value: unknown, typeName: string): boolean {
  return value instanceof VtValue && !value.IsEmpty() && value.getTypeName() === typeName
}

/** SdfPath::GetName() */
function _PathGetName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** SdfPath::ReplaceName() for a prim path. */
function _PathReplaceName(path: string, name: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1) + name
}

/** SdfPath::AppendChild() */
function _PathAppendChild(path: string, name: string): string {
  if (path === '') return ''
  return path === '/' ? `/${name}` : `${path}/${name}`
}

/** SdfPath::JoinIdentifier(lhs, rhs) */
function _PathJoinIdentifier(lhs: string, rhs: string): string {
  if (lhs === '') return rhs
  if (rhs === '') return lhs
  return `${lhs}:${rhs}`
}

/** SdfPath::StripPrefixNamespace(name, matchNamespace) (path.cpp). */
function _PathStripPrefixNamespace(name: string, matchNamespace: string): [string, boolean] {
  const delim = ':'
  if (matchNamespace === '') {
    return [name, false]
  }
  if (name.startsWith(matchNamespace)) {
    const matchNamespaceLen = matchNamespace.length
    // Now check to make sure the next character is the namespace delimiter
    if (matchNamespace.endsWith(delim)) {
      // The matched namespace already contained the end delimiter,
      // just return the stripped string
      return [name.slice(matchNamespaceLen), true]
    } else if (name.length > matchNamespaceLen &&
               name[matchNamespaceLen] === delim) {
      // The input namespace was missing the end delimiter, but the
      // stripped namespace in the name had it, so this is a match
      return [name.slice(matchNamespaceLen + 1), true]
    }
  }
  return [name, false]
}

////////////////////////////////////////////////////////////////////////////////
// Shader Gen Functions

/** materialXFilter.cpp:140-163. Generate the Glsl Pixel Shader based on the
 *  given mxContext and mxElement. Based on MaterialXViewer
 *  Material::generateShader() */
function _GenMaterialXShader(mxContext: GenContext, mxElem: Element): Shader | null {
  const hasTransparency = mxContext.getOptions().hwTransparency

  const materialContext = mxContext.copy()
  materialContext.getOptions().hwTransparency = hasTransparency
  materialContext.getOptions().hwShadowMap =
    materialContext.getOptions().hwShadowMap && !hasTransparency

  // MaterialX v1.38.5 added Transmission Refraction method as the default
  // method, this maintains the previous Transmission Opacity behavior.
  materialContext.getOptions().hwTransmissionRenderMethod =
    HwTransmissionRenderMethod.TRANSMISSION_OPACITY

  // Use the domeLightPrefilter texture instead of sampling the Environment Map
  materialContext.getOptions().hwSpecularEnvironmentMethod =
    HwSpecularEnvironmentMethod.SPECULAR_ENVIRONMENT_PREFILTER

  // mx::createShader (MaterialXRender/Util.cpp:15-18)
  return materialContext.getShaderGenerator().generate('Shader', mxElem, materialContext)
}

/** materialXFilter.cpp:165-176. Results in lightData.type = 1 for point
 *  lights in the Mx Shader */
const mxDirectLightString = `
<?xml version="1.0"?>
<materialx version="1.38">
  <point_light name="pt_light" type="lightshader">
  </point_light>
  <directional_light name="dir_light" type="lightshader">
  </directional_light>
</materialx>
`

/** materialXFilter.cpp:178-202 */
function _InitHdStMaterialXContext(
  mxHdInfo: HdSt_MxShaderGenInfo,
  apiName: TfToken | string,
): GenContext | null {
  const api = apiName.toString()
  // (PXR_METAL_SUPPORT_ENABLED: HgiTokens->Metal selects
  // HdStMaterialXShaderGenMsl, not ported; see the header.)
  if (api === HgiTokens.Vulkan.toString() || api === _webGPUApiName) {
    return new GenContext(HdStMaterialXShaderGenVkGlsl.create(mxHdInfo))
  }
  if (api === HgiTokens.OpenGL.toString()) {
    return new GenContext(HdStMaterialXShaderGenGlsl.create(mxHdInfo))
  }
  TF_CODING_ERROR(`MaterialX Shader Generator doesn't support ${api} API.`)
  return null
}

/** materialXFilter.cpp:204-268. Use the given mxDocument to generate the
 *  corresponding glsl shader. Based on MaterialXViewer
 *  Viewer::loadDocument() */
export function HdSt_GenMaterialXShader(
  mxDoc: Document,
  stdLibraries: Document,
  searchPaths: FileSearchPath,
  mxHdInfo: HdSt_MxShaderGenInfo = new HdSt_MxShaderGenInfo(),
  apiName: TfToken | string = '',
): Shader | null {
  // Initialize the Context for shaderGen.
  const mxContext = _InitHdStMaterialXContext(mxHdInfo, apiName)
  if (!mxContext) {
    // Upstream constructs a GenContext from the null generator.
    return null
  }

  mxContext.getOptions().hwTransparency =
    mxHdInfo.materialTag !== HdStMaterialTagTokens.defaultMaterialTag.toString()

  // Starting from MaterialX 1.38.4 at PR 877, we must remove the
  // "libraries" part:
  const libSearchPaths = new FileSearchPath()
  for (const path of searchPaths) {
    if (path.getBaseName() === 'libraries') {
      libSearchPaths.append(path.getParentPath())
    } else {
      libSearchPaths.append(path)
    }
  }
  mxContext.registerSourceCodeSearchPath(libSearchPaths)

  // Initialize the color management system
  const cms = DefaultColorManagementSystem.create(
    mxContext.getShaderGenerator().getTarget())
  cms.loadLibrary(stdLibraries)
  mxContext.getShaderGenerator().setColorManagementSystem(cms)

  // Set the target colorspace
  // XXX: This is equivalent to the scene referred color space, and is
  // not yet accessible here
  mxContext.getOptions().targetColorSpaceOverride = 'lin_rec709'

  // Add the Direct Light mtlx file to the mxDoc
  const lightDoc = createDocument()
  readFromXmlString(lightDoc, mxDirectLightString)
  mxDoc.importLibrary(lightDoc)

  // Make sure the Light data properties are added to the mxLightData struct
  const lightHandler = new LightHandler()
  const lights: Node[] = []
  lightHandler.findLights(mxDoc, lights)
  lightHandler.registerLights(mxDoc, lights, mxContext)

  // Get the surface shader node from the mxDoc which HdMtlx has named
  const shaderNode = mxDoc.getNode(HdMtlxTokens.surfaceshaderName.toString())
  if (!shaderNode) {
    TF_CODING_ERROR('Unable to generate a shader from the MaterialX ' +
                    'Document - could not find surface shader node.')
    return null
  }
  return _GenMaterialXShader(mxContext, shaderNode)
}

////////////////////////////////////////////////////////////////////////////////
// Helper Functions to convert MX texture node parameters to Hd parameters

/** materialXFilter.cpp:271-287. Strip any leading underscores from the
 *  parameter name before joinging with the nodeName, as Mx does the same */
function _CreateNodeParamName(nodeName: string, paramName: string): string {
  // if nodeName is empty then we do not need to concatenate anything
  if (nodeName === '') {
    return paramName
  }
  if (TfStringStartsWith(paramName, '_')) {
    return nodeName + paramName
  } else {
    return nodeName + '_' + paramName
  }
}

/** materialXFilter.cpp:289-298. Get the Hydra VtValue for the given
 *  MaterialX input value */
function _GetHdFilterValue(mxInputValue: string): VtValue {
  if (mxInputValue === 'closest') {
    return _TokenValue(HdStTextureTokens.nearestMipmapNearest)
  }
  // linear/cubic
  return _TokenValue(HdStTextureTokens.linearMipmapLinear)
}

/** materialXFilter.cpp:300-315. Get the Hydra VtValue for the given
 *  MaterialX input value */
function _GetHdSamplerValue(mxInputValue: string): VtValue {
  if (mxInputValue === 'constant') {
    return _TokenValue(HdStTextureTokens.black)
  }
  if (mxInputValue === 'clamp') {
    return _TokenValue(HdStTextureTokens.clamp)
  }
  if (mxInputValue === 'mirror') {
    return _TokenValue(HdStTextureTokens.mirror)
  }
  // periodic
  return _TokenValue(HdStTextureTokens.repeat)
}

/** materialXFilter.cpp:317-344. Translate the MaterialX texture node input
 *  into the Hydra equivalents and store in the given hdTextureParams map */
function _GetMxInputAsHdTextureParam(
  mxInputName: string,
  mxInputValue: string,
  hdTextureParams: Map<string, VtValue>,
): void {
  // MaterialX stdlib has two texture2d node types <image> and <tiledimage>

  // Properties common to both <image> and <tiledimage> texture nodes:
  if (mxInputName === _mxTextureParamTokens.filtertype) {
    hdTextureParams.set(HdStTextureTokens.minFilter, _GetHdFilterValue(mxInputValue))
    hdTextureParams.set(HdStTextureTokens.magFilter, _TokenValue(HdStTextureTokens.linear))
  }

  // Properties specific to <image> nodes:
  else if (mxInputName === _mxTextureParamTokens.uaddressmode) {
    hdTextureParams.set(HdStTextureTokens.wrapS, _GetHdSamplerValue(mxInputValue))
  } else if (mxInputName === _mxTextureParamTokens.vaddressmode) {
    hdTextureParams.set(HdStTextureTokens.wrapT, _GetHdSamplerValue(mxInputValue))
  }
}

/** materialXFilter.cpp:346-410 */
function _AddDefaultMtlxTextureValues(
  nodeDef: NodeDef | null,
  fileParamName: string,
  hdTextureParams: Map<string, VtValue>,
): void {
  // Add the stdlib texture node default values
  {
    // MaterialX uses repeat/periodic for the default wrap values, without
    // this the texture will use the Hydra default useMetadata.
    // Note that these will get overwritten by any authored values
    hdTextureParams.set(HdStTextureTokens.wrapS, _TokenValue(HdStTextureTokens.repeat))
    hdTextureParams.set(HdStTextureTokens.wrapT, _TokenValue(HdStTextureTokens.repeat))

    // Set the default colorSpace to be 'raw'. This allows MaterialX to
    // handle colorspace transforms.
    const fileColorSpaceParamName = _PathJoinIdentifier(_SdfFieldKeysColorSpace, fileParamName)
    hdTextureParams.set(fileColorSpaceParamName, _TokenValue(HdStTokens.raw))
  }

  // Add custom texture node default values
  {
    // All custom Texture nodes boil down to an <image> node. Go into the
    // implementation nodegraph to get the default texture values in
    // case they differ from the above stdlib defaults

    // XXX Unsure about triplanar that has 3 image nodes. Does Storm
    // require per-image texture params? How does one specify that using a
    // single token?

    // XXX We should recursively search for the <image> node in case it is
    // nested more than one level deep via custom NodeDefs. For now, we
    // only dig one level down since this is sufficient for the default
    // set of MaterialX texture nodes.

    // Get the underlying image node from the implementation nodegraph
    // (Upstream dereferences nodeDef unchecked; a null nodeDef stops here.)
    const impl = nodeDef?.getImplementation() ?? null
    if (!(impl && impl.isA(NodeGraph))) {
      return
    }
    const imageNodes = impl.asA(NodeGraph)!.getNodes(ShaderNode.IMAGE)
    if (imageNodes.length === 0) {
      return
    }

    // Get the default values for the underlying image node
    for (const inputName of _mxTextureParamTokensAll) {
      let mxInput: Input | null = imageNodes[0]!.getInput(inputName)
      if (!mxInput) {
        continue
      }
      if (mxInput.hasInterfaceName()) {
        mxInput = nodeDef!.getActiveInput(mxInput.getInterfaceName())
      }
      // (Upstream dereferences the interface input unchecked.)
      if (mxInput && mxInput.hasValueString()) {
        _GetMxInputAsHdTextureParam(
          inputName, mxInput.getValueString(), hdTextureParams)
      }
    }
  }
}

/** materialXFilter.cpp:412-433 */
function _AddFallbackDomeLightTextureNode(
  hdNetwork: HdMaterialNetwork2,
  terminalNodePath: string,
): void {
  // Create and add a Fallback Dome Light Texture Node to the hdNetwork
  const hdDomeTextureNode = new HdMaterialNode2()
  hdDomeTextureNode.nodeTypeId = _tokens.ND_image_color3
  hdDomeTextureNode.parameters.set(_tokens.file,
    VtValue.create(new SdfAssetPath(
      HdStPackageFallbackDomeLightTexture(),
      HdStPackageFallbackDomeLightTexture()), TfType.declare('SdfAssetPath')))
  const domeTexturePath = _PathReplaceName(terminalNodePath, _tokens.domeLightFallback)
  _Emplace(hdNetwork.nodes, domeTexturePath, hdDomeTextureNode)

  // Connect the new Texture Node to the Terminal Node
  const domeTextureConn: HdMaterialConnection2 = {
    upstreamNode: domeTexturePath,
    upstreamOutputName: _PathGetName(domeTexturePath),
  }
  _NodeAt(hdNetwork, terminalNodePath)
    .inputConnections.set(domeTextureConn.upstreamOutputName, [domeTextureConn])
}

/** std::set<SdfPath> iteration order. */
function _SortedPaths(paths: Iterable<string>): string[] {
  return [...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

/** materialXFilter.cpp:435-479. Store texture node connections, default dome
 *  light texture path and any filename inputs from the terminal node to the
 *  mxHdTextureNames */
function _UpdateMxHdTextureNames(
  hdTextureNodes: ReadonlySet<string>,
  hdMtlxTextureInfo: ReadonlyMap<string, ReadonlySet<string>>,
  hdTerminalNode: HdMaterialNode2,
  terminalNodePath: string,
  mxHdTextureNames: string[],
): void {
  // Store the added connection to the terminal node for MaterialXShaderGen
  for (const texturePath of _SortedPaths(hdTextureNodes)) {
    const mtlxTexturePath = HdMtlxCreateNameFromPath(texturePath)
    const mtlxTextureInfo = hdMtlxTextureInfo.get(mtlxTexturePath)
    if (mtlxTextureInfo !== undefined) {
      // (std::set<std::string> iteration order.)
      for (const fileInputName of _SortedPaths(mtlxTextureInfo)) {
        // Note these connections were made in _UpdateTextureNode()
        // and use the mtlx paramName which follows the pattern:
        // 'nodeName_paramName'
        mxHdTextureNames.push(_CreateNodeParamName(mtlxTexturePath, fileInputName))
      }
    }
  }

  // Add the Dome Texture name to the TextureMap for MaterialXShaderGen
  const domeTexturePath = _PathReplaceName(terminalNodePath, _tokens.domeLightFallback)
  mxHdTextureNames.push(_PathGetName(domeTexturePath))

  // Check the terminal node for any filename inputs requiring special
  // handling due to node remapping:
  const terminalNodeDef = HdMtlxGetNodeDef(TfToken(hdTerminalNode.nodeTypeId))
  if (terminalNodeDef) {
    for (const mxInput of terminalNodeDef.getActiveInputs()) {
      if (mxInput.getType() === _tokens.filename) {
        mxHdTextureNames.push(mxInput.getName())
      }
    }
  }
}

/** materialXFilter.cpp:481-536. Connect the primvar nodes to the terminal
 *  node */
function _UpdatePrimvarNodes(
  mxDoc: Document,
  hdNetwork: HdMaterialNetwork2,
  hdPrimvarNodes: ReadonlySet<string>,
  mxHdPrimvarMap: Map<string, string>,
  mxHdPrimvarDefaultValueMap: Map<string, string>,
): void {
  for (const primvarPath of _SortedPaths(hdPrimvarNodes)) {
    const hdPrimvarNode = _At(hdNetwork.nodes, primvarPath)

    const mxNodeDef = mxDoc.getNodeDef(hdPrimvarNode.nodeTypeId)

    const primvarNameIt =
      hdPrimvarNode.parameters.get(HdMtlxGetPrimvarNameInputName(mxNodeDef))
    if (primvarNameIt !== undefined) {
      const primvarName = HdMtlxConvertToString(_AsVtValue(primvarNameIt))

      // Figure out the mx typename
      if (mxNodeDef) {
        mxHdPrimvarMap.set(primvarName, mxNodeDef.getType())
      }

      // Get the Default value if authored
      let defaultPrimvarValue = ''
      const defaultPrimvarValueIt =
        hdPrimvarNode.parameters.get(HdMtlxGetPrimvarDefaultInputName(mxNodeDef))
      if (defaultPrimvarValueIt !== undefined) {
        defaultPrimvarValue = HdMtlxConvertToString(_AsVtValue(defaultPrimvarValueIt))
      }
      mxHdPrimvarDefaultValueMap.set(primvarName, defaultPrimvarValue)
    } else {
      // Other primvar nodes will be either a texcoord node or a
      // custom node that uses a texcoord node.
      const sdrRegistry = SdrRegistry.getInstance()
      const sdrTexCoordNode = sdrRegistry.getShaderNodeByIdentifierAndType(
        hdPrimvarNode.nodeTypeId, _tokens.mtlx)

      // Get the default texture coordinate name from the sdr metadata
      let texCoordName = ''
      if (sdrTexCoordNode) {
        const metadata = sdrTexCoordNode.getMetadata()
        texCoordName = metadata[_SdrNodeMetadataPrimvars] ?? ''
      }

      mxHdPrimvarMap.set(texCoordName, HdStMaterialXHelpers.getVector2Name())
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Helper functions to get the Material Tag

/** materialXFilter.cpp:541-559. `paramValue` is the VtValue the parameter
 *  is compared with (VtValue == T: holding a T that compares equal). */
function _ParamDiffersFrom(
  terminal: HdMaterialNode2,
  paramName: string,
  paramValue: VtValue,
): boolean {
  // A connected value is always considered to differ
  if (terminal.inputConnections.has(paramName)) {
    return true
  }
  // Check the value itself
  const paramIt = terminal.parameters.get(paramName)
  if (paramIt !== undefined && !_AsVtValue(paramIt).equals(paramValue)) {
    return true
  }
  // Assume a default value is equal to the paramValue.
  return false
}

/** VtValue(float) */
function _FloatValue(value: number): VtValue {
  return VtValue.create(Math.fround(value), VtValueTypes.float)
}

/** materialXFilter.cpp:561-578 */
function _GetUsdPreviewSurfaceMaterialTag(terminal: HdMaterialNode2): string {
  // See https://openusd.org/release/spec_usdpreviewsurface.html
  // and implementation in MaterialX libraries/bxdf/usd_preview_surface.mtlx

  // Non-zero opacityThreshold (or connected) triggers masked mode:
  if (_ParamDiffersFrom(terminal, _tokens.opacityThreshold, _FloatValue(0.0))) {
    return HdStMaterialTagTokens.masked.toString()
  }

  // Opacity less than 1.0 (or connected) triggers transparent mode:
  if (_ParamDiffersFrom(terminal, _tokens.opacity, _FloatValue(1.0))) {
    return HdStMaterialTagTokens.translucent.toString()
  }

  return HdStMaterialTagTokens.defaultMaterialTag.toString()
}

/** materialXFilter.cpp:580-591 */
function _GetStandardSurfaceMaterialTag(terminal: HdMaterialNode2): string {
  // See https://autodesk.github.io/standard-surface/
  // and implementation in MaterialX libraries/bxdf/standard_surface.mtlx
  if (_ParamDiffersFrom(terminal, _tokens.transmission, _FloatValue(0.0)) ||
      _ParamDiffersFrom(terminal, _tokens.opacity,
        VtValue.create(new GfVec3f(1.0, 1.0, 1.0), VtValueTypes.GfVec3f))) {
    return HdStMaterialTagTokens.translucent.toString()
  }

  return HdStMaterialTagTokens.defaultMaterialTag.toString()
}

/** materialXFilter.cpp:593-604 */
function _GetOpenPBRSurfaceMaterialTag(terminal: HdMaterialNode2): string {
  // See https://academysoftwarefoundation.github.io/OpenPBR/
  // and the provided implementation
  if (_ParamDiffersFrom(terminal, _tokens.transmission_weight, _FloatValue(0.0)) ||
      _ParamDiffersFrom(terminal, _tokens.geometry_opacity, _FloatValue(1.0))) {
    return HdStMaterialTagTokens.translucent.toString()
  }

  return HdStMaterialTagTokens.defaultMaterialTag.toString()
}

/** materialXFilter.cpp:606-648 */
function _GetGlTFSurfaceMaterialTag(terminal: HdMaterialNode2): string {
  // See https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#alpha-coverage
  // And implementation in MaterialX /libraries/bxdf/gltf_pbr.mtlx

  let alphaMode = 0 // Opaque
  if (terminal.inputConnections.has(_tokens.alpha_mode)) {
    // A connected alpha_mode is non-standard, but is considered to
    // imply blend.
    alphaMode = 2 // Blend
  } else {
    const alphaModeIt = terminal.parameters.get(_tokens.alpha_mode)
    if (alphaModeIt !== undefined) {
      if (_IsHolding(alphaModeIt, 'int')) {
        const value = (alphaModeIt as VtValue).UncheckedGet<number>()
        if (value >= 0 && value <= 2) {
          alphaMode = value
        }
      }
    }
  }

  let materialToken: string = HdStMaterialTagTokens.defaultMaterialTag
  if (alphaMode === 1) { // Mask
    if (_ParamDiffersFrom(terminal, _tokens.alpha_cutoff, _FloatValue(1.0)) &&
        _ParamDiffersFrom(terminal, _tokens.alpha, _FloatValue(1.0))) {
      materialToken = HdStMaterialTagTokens.masked
    }
  } else if (alphaMode === 2) { // Blend
    if (_ParamDiffersFrom(terminal, _tokens.alpha, _FloatValue(1.0))) {
      materialToken = HdStMaterialTagTokens.translucent
    }
  }

  if (_ParamDiffersFrom(terminal, _tokens.transmission, _FloatValue(0.0))) {
    return HdStMaterialTagTokens.translucent.toString()
  }

  return materialToken.toString()
}

/** materialXFilter.cpp:650-686 (the MaterialX >= 1.39 branches) */
function _GetMxTypeDescription(typeName: string): TypeDesc {
  // Add whatever is necessary for current codebase:
  const typeLibrary = new Map<string, TypeDesc>([
    ['float', Type.FLOAT],
    ['color3', Type.COLOR3],
    ['color4', Type.COLOR4],
    ['vector2', Type.VECTOR2],
    ['vector3', Type.VECTOR3],
    ['vector4', Type.VECTOR4],
    ['surfaceshader', Type.SURFACESHADER],
  ])

  return typeLibrary.get(typeName) ?? Type.NONE
}

/** materialXFilter.cpp:688-764. This function adds a stripped down version
 *  of the surfaceshader node to the given MaterialX document. Parameters are
 *  added as inputs and any connections are replaced with dummy values
 *  (0.5). */
function _AddStrippedSurfaceNode(
  mxDocument: Document,
  nodeName: string,
  hdNode: HdMaterialNode2,
  hdNetwork: HdMaterialNetwork2,
): Node | null {
  // Add the hdNode to the mxDocument
  const mxNodeDef = HdMtlxGetNodeDef(TfToken(hdNode.nodeTypeId))
  if (!mxNodeDef) {
    TF_WARN(`Unable to find the nodeDef for '${hdNode.nodeTypeId}'.`)
    return null
  }
  const mxNode = mxDocument.addNodeInstance(mxNodeDef, nodeName)

  // Add inputs to the hdNode for each connection
  for (const connName of _SortedKeys(hdNode.inputConnections)) {
    const connections = hdNode.inputConnections.get(connName)!
    const mxInputDef = mxNodeDef.getActiveInput(connName)
    if (!mxInputDef) {
      continue
    }
    const mxTypeDesc = _GetMxTypeDescription(mxInputDef.getType())
    if (HdStMaterialXHelpers.mxTypeIsNone(mxTypeDesc)) {
      continue
    }
    // If hdNode is connected to the surfaceshader node, recursively call
    // this function to make sure that surfaceshader node is added to
    // the mxDocument
    if (HdStMaterialXHelpers.mxTypeIsSurfaceShader(mxTypeDesc)) {
      const hdConnectedPath = connections[0]!.upstreamNode
      const hdConnectedNode = _At(hdNetwork.nodes, hdConnectedPath)
      const mxConnectedNode = _AddStrippedSurfaceNode(
        mxDocument, _PathGetName(hdConnectedPath), hdConnectedNode, hdNetwork)
      const mxInput = mxNode.addInput(mxInputDef.getName(), mxInputDef.getType())
      mxInput.setConnectedNode(mxConnectedNode)
    }
    // Add the connection as an input with each component set to 0.5
    else if (mxTypeDesc.getBaseType() === BaseType.FLOAT &&
             mxTypeDesc.getSemantic() !== Semantic.MATRIX) {
      let valueStr = '0.5'
      for (let i = 1; i < mxTypeDesc.getSize(); ++i) {
        valueStr += ', 0.5'
      }
      const mxInput = mxNode.addInputFromNodeDef(mxInputDef.getName())
      mxInput?.setValueString(valueStr)
    }
  }

  // Add inputs to the hdNode for each parameter
  for (const paramName of _SortedKeys(hdNode.parameters)) {
    const paramValue = hdNode.parameters.get(paramName)
    const mxInputDef = mxNodeDef.getActiveInput(paramName)
    if (!mxInputDef) {
      continue
    }
    const mxTypeDesc = _GetMxTypeDescription(mxInputDef.getType())
    if (HdStMaterialXHelpers.mxTypeIsNone(mxTypeDesc)) {
      continue
    }

    if (mxTypeDesc.getBaseType() === BaseType.FLOAT &&
        mxTypeDesc.getSemantic() !== Semantic.MATRIX) {
      // Add the parameter as an input to the mxNode in the mx Document
      const mxInput = mxNode.addInputFromNodeDef(mxInputDef.getName())
      mxInput?.setValueString(HdMtlxConvertToString(_AsVtValue(paramValue)))
    }
  }
  return mxNode
}

/** materialXFilter.cpp:766-784. Use MaterialX to determine if the given
 *  terminal is a transparent surface */
function _IsTransparentShader(
  hdNetwork: HdMaterialNetwork2,
  terminal: HdMaterialNode2,
): boolean {
  // Create a materialX document with a simplified version of the hdNetwork
  // containing a stripped down version of the surfaceshader node without the
  // full shader graph so we can use the MaterialX utility below to determine
  // if the network contains a transparent surface

  const mxDocument = createDocument()
  mxDocument.importLibrary(HdMtlxStdLibraries())

  const terminalNode = _AddStrippedSurfaceNode(
    mxDocument, 'MxTerminalNode', terminal, hdNetwork)

  // (Upstream hands a null node to mx::isTransparentSurface.)
  return terminalNode ? isTransparentSurface(terminalNode) : false
}

/** materialXFilter.cpp:786-859 */
function _GetMaterialTag(
  hdNetwork: HdMaterialNetwork2,
  terminal: HdMaterialNode2,
): string {
  // Return the custom material tag if specified in the config Dictionary.
  const tagIt = hdNetwork.config.get(_tokens.mtlxMaterialTag)
  if (tagIt !== undefined) {
    if (_IsHolding(tagIt, 'string')) {
      return (tagIt as VtValue).Get<string>()
    }
  }

  const sdrRegistry = SdrRegistry.getInstance()
  const mtlxSdrNode = sdrRegistry.getShaderNodeByIdentifierAndType(
    terminal.nodeTypeId, _tokens.mtlx)!

  // Cover the most frequent and fully specified terminal nodes
  // (SdrShaderNode::GetFamily is GetFunction.)
  const mtlxNodeFamily = mtlxSdrNode.getFunction()
  if (mtlxNodeFamily === _tokens.UsdPreviewSurface) {
    return _GetUsdPreviewSurfaceMaterialTag(terminal)
  }
  if (mtlxNodeFamily === _tokens.standard_surface) {
    return _GetStandardSurfaceMaterialTag(terminal)
  }
  if (mtlxNodeFamily === _tokens.open_pbr_surface) {
    return _GetOpenPBRSurfaceMaterialTag(terminal)
  }
  if (mtlxNodeFamily === _tokens.gltf_pbr) {
    return _GetGlTFSurfaceMaterialTag(terminal)
  }

  // For terminal nodes not fully specified we require more MaterialX info
  const mxNodeDef = HdMtlxGetNodeDef(TfToken(mtlxSdrNode.getIdentifier()))
  if (!mxNodeDef) {
    TF_WARN(`Unable to find the nodeDef for '${mtlxSdrNode.getIdentifier()}'.`)
    return HdStMaterialTagTokens.defaultMaterialTag.toString()
  }

  const activeOutputs = mxNodeDef.getActiveOutputs()
  if (activeOutputs.length !== 1 ||
      activeOutputs[activeOutputs.length - 1]!.getType() !== SURFACE_SHADER_TYPE_STRING) {
    // Outputting anything that is not a surfaceshader will be
    // considered opaque, unless outputting a color4 or vector4.
    // XXX This is not fully per USD specs, but is supported by MaterialX.
    const typeDesc =
      _GetMxTypeDescription(activeOutputs[activeOutputs.length - 1]?.getType() ?? '')
    if (typeDesc.isFloat4()) {
      return HdStMaterialTagTokens.translucent.toString()
    }
    return HdStMaterialTagTokens.defaultMaterialTag.toString()
  }

  if (mtlxNodeFamily === _tokens.convert) {
    if (terminal.nodeTypeId === _tokens.ND_convert_color4_surfaceshader ||
        terminal.nodeTypeId === _tokens.ND_convert_vector4_surfaceshader) {
      return HdStMaterialTagTokens.translucent.toString()
    }
    return HdStMaterialTagTokens.defaultMaterialTag.toString()
  }

  // Out of easy answers, delegate to MaterialX
  if (_IsTransparentShader(hdNetwork, terminal)) {
    return HdStMaterialTagTokens.translucent.toString()
  }
  return HdStMaterialTagTokens.defaultMaterialTag.toString()
}

////////////////////////////////////////////////////////////////////////////////
// Helper functions for to make sure the hdNetwork is organized in a way that
// Storm can find all the textures and primvars.

/** materialXFilter.cpp:865-889. Returns true is the given mtlxSdrNode
 *  requires primvar support for texcoords */
function _NodeUsesTexcoordPrimvar(mtlxSdrNode: SdrShaderNode): boolean {
  if (mtlxSdrNode.getFunction() === _tokens.texcoord) {
    return true
  }

  const mxNodeDef = HdMtlxGetNodeDef(TfToken(mtlxSdrNode.getIdentifier()))
  if (!mxNodeDef) {
    TF_WARN(`Unable to find the nodeDef for '${mtlxSdrNode.getIdentifier()}'.`)
    return false
  }
  const impl: InterfaceElement | null = mxNodeDef.getImplementation()
  if (impl && impl.isA(NodeGraph)) {
    const nodegraph = impl.asA(NodeGraph)!
    if (nodegraph.getNodes(_tokens.texcoord).length !== 0) {
      return true
    }
  }
  return false
}

/** materialXFilter.cpp:891-931. Browse the nodes to find primvar connections
 *  to add to the terminal node */
function _ConnectPrimvarNodesToTerminalNode(
  terminalNodePath: string,
  hdNetwork: HdMaterialNetwork2,
): void {
  const sdrRegistry = SdrRegistry.getInstance()

  for (const nodePath of _SortedKeys(hdNetwork.nodes)) {
    const hdNode = hdNetwork.nodes.get(nodePath)!
    const mxNodeDefName = HdMtlxGetNodeDefName(hdNode.nodeTypeId)
    const mtlxSdrNode = sdrRegistry.getShaderNodeByIdentifierAndType(
      mxNodeDefName, _tokens.mtlx)

    if (!mtlxSdrNode) {
      TfDebug.msg(HdStDebugCodes.HDST_MTLX, `HdSt - Unable to find Sdr node of type ` +
        `'${mxNodeDefName}' for node at <${nodePath}>. May lose primvar connection.\n`)
      continue
    }
    if (!mtlxSdrNode || (mtlxSdrNode.getFunction() !== _tokens.geompropvalue &&
        !_NodeUsesTexcoordPrimvar(mtlxSdrNode))) {
      continue
    }

    // Connect the primvar node to the terminal node for HdStMaterialNetwork
    // And create a unique name for the new connection.
    const newConnName = _PathGetName(nodePath) + '_primvarconn'
    const primvarConn: HdMaterialConnection2 = {
      upstreamNode: nodePath,
      upstreamOutputName: newConnName,
    }

    _NodeAt(hdNetwork, terminalNodePath)
      .inputConnections.set(primvarConn.upstreamOutputName, [primvarConn])

    TfDebug.msg(HdStDebugCodes.HDST_MTLX,
      `HdSt - Connecting primvar node <${nodePath}> to terminal node ` +
      `<${terminalNodePath}> through '${newConnName}'.\n`)
  }
}

/** materialXFilter.cpp:933-947. Returns the default texture cordinate name
 *  from the textureNodes sdr metadata if no name was specified return
 *  'st' */
function _GetDefaultTexcoordName(): string {
  const sdrRegistry = SdrRegistry.getInstance()
  const mtlxSdrNode = sdrRegistry.getShaderNodeByIdentifierAndType(
    _tokens.ND_image_color3, _tokens.mtlx)!
  const metadata = mtlxSdrNode.getMetadata()
  const primvarIt = metadata[_SdrNodeMetadataPrimvars]
  return primvarIt !== undefined ? primvarIt : _tokens.st
}

/** materialXFilter.cpp:949-1017. Add the Hydra texture node parameters to
 *  the texture node and connect the texture node to the terminal node */
function _UpdateTextureNode(
  mtlxFileParamName: string,
  hdNetwork: HdMaterialNetwork2,
  terminalNodePath: string,
  textureNodePath: string,
): void {
  const hdTextureNode = _NodeAt(hdNetwork, textureNodePath)

  // Set the default texture coordinate name as the 'st' parameter.
  hdTextureNode.parameters.set(_tokens.st, _TokenValue(_GetDefaultTexcoordName()))

  // Gather the default Texture Parameters

  // Get the name of the file parameter from the mtlxFileParamName which is
  // of the form nodeName_fileParamName.
  const mtlxFileParamNameStr = mtlxFileParamName
  let underscorePos = mtlxFileParamNameStr.indexOf('_')
  if (TfStringStartsWith(mtlxFileParamNameStr, _tokens.NG_Anonymized)) {
    const anonPrefix = _tokens.NG_Anonymized + '_'
    underscorePos = mtlxFileParamNameStr.indexOf('_', anonPrefix.length)
  }
  const fileParamName =
    underscorePos !== -1
      ? mtlxFileParamNameStr.substring(underscorePos + 1)
      : _tokens.file

  const hdParameters = new Map<string, VtValue>()
  _AddDefaultMtlxTextureValues(
    HdMtlxGetNodeDef(TfToken(hdTextureNode.nodeTypeId)),
    fileParamName,
    hdParameters)

  // Gather the authored Texture Parameters
  for (const paramName of _SortedKeys(hdTextureNode.parameters)) {
    // Get the Hydra equivalents for the Mx Texture node parameters
    const mxInputName = paramName
    const mxInputValue = HdMtlxConvertToString(_AsVtValue(hdTextureNode.parameters.get(paramName)))
    _GetMxInputAsHdTextureParam(mxInputName, mxInputValue, hdParameters)
  }

  // Add the Hydra Texture Parameters to the Texture Node
  for (const paramName of _SortedKeys(hdParameters)) {
    hdTextureNode.parameters.set(paramName, hdParameters.get(paramName)!)
  }

  // Make and add a new connection to the terminal node
  const textureConn: HdMaterialConnection2 = {
    upstreamOutputName: mtlxFileParamName,
    upstreamNode: textureNodePath,
  }
  _NodeAt(hdNetwork, terminalNodePath)
    .inputConnections.set(mtlxFileParamName, [textureConn])

  TfDebug.msg(HdStDebugCodes.HDST_MTLX,
    `HdSt - Connecting texture node <${textureNodePath}> to terminal node ` +
    `<${terminalNodePath}> through '${mtlxFileParamName}'.\n`)

  if (hdTextureNode.inputConnections.has(_tokens.defaultInput)) {
    TF_WARN(`Texture node <${textureNodePath}> has the default value provided through` +
      ' a connection. This is not supported in Storm. Only default values' +
      ' directly authored are supported.')
  }
}

/** materialXFilter.cpp:1019-1146 */
function _ReplaceFilenameInput(
  hdNetwork: HdMaterialNetwork2,
  terminalNodePath: string,
  mxFilenameInputName: string,
): void {
  const hdTerminalNode = _At(hdNetwork.nodes, terminalNodePath)
  const mxNodeDef = HdMtlxGetNodeDef(TfToken(hdTerminalNode.nodeTypeId))
  if (!mxNodeDef) {
    return
  }
  const mxInput = mxNodeDef.getActiveInput(mxFilenameInputName)
  if (!mxInput) {
    return
  }
  const impl = mxNodeDef.getImplementation()
  if (!impl || !impl.isA(NodeGraph)) {
    return
  }

  // Find the mxTextureNode in the nodegraph that interfaces with the
  // filename input
  let mxTextureNode: Node | null = null
  let mxTextureNodefilenameInputName = ''
  for (const node of impl.asA(NodeGraph)!.getNodes()) {
    for (const input of node.getInputs()) {
      if (input.getType() !== _tokens.filename) {
        continue
      }
      // Get the Texture node and input name for the filename input
      mxTextureNodefilenameInputName = input.getName()
      if (input.getInterfaceName() === mxFilenameInputName) {
        mxTextureNode = node
        break
      }
      // We need to handle correctly the situation where there are
      // "dot" nodes in the NodeGraph.
      let dotNode = input.getConnectedNode()
      while (dotNode && dotNode.getCategory() === 'dot') {
        const dotInput = dotNode.getInput('in')
        if (dotInput &&
            dotInput.getInterfaceName() === mxFilenameInputName) {
          mxTextureNode = node
          break
        }
        dotNode = dotNode.getConnectedNode('in')
      }
    }
    if (mxTextureNode) {
      break
    }
  }

  if (!mxTextureNode) {
    return
  }
  const mxTextureNodeDef = mxTextureNode.getNodeDef()
  if (!mxTextureNodeDef) {
    return
  }

  // Gather texture parameters on the found mxTextureNode
  const terminalTextureParams = new Map<string, VtValue>()
  _AddDefaultMtlxTextureValues(
    mxTextureNodeDef, mxTextureNodefilenameInputName,
    terminalTextureParams)
  for (const mxInputName of _mxTextureParamTokensAll) {
    const mxTexInput = mxTextureNode.getInput(mxInputName)
    // Get the Hydra equivalents for the Mx Texture node parameters
    if (mxTexInput && mxTexInput.hasValueString()) {
      _GetMxInputAsHdTextureParam(
        mxInputName, mxTexInput.getValueString(), terminalTextureParams)
    }
  }
  // Gather the Hydra Texture Parameters on the terminal node.
  for (const paramName of _SortedKeys(hdTerminalNode.parameters)) {
    // Get the Hydra equivalents for the Mx Texture node parameters
    const mxInputName = paramName
    const mxInputValue = HdMtlxConvertToString(_AsVtValue(hdTerminalNode.parameters.get(paramName)))
    _GetMxInputAsHdTextureParam(
      mxInputName, mxInputValue, terminalTextureParams)
  }

  // Get the texture node from the Implementation Nodegraph and gather the
  // nodeTypeId and parameter information.

  // Get the filename parameter value from the terminal node
  const filenameToken = mxFilenameInputName
  const filenameParamIt = hdTerminalNode.parameters.get(filenameToken)
  if (filenameParamIt === undefined) {
    return
  }

  // Create a new Texture Node
  const terminalTextureNode = new HdMaterialNode2()
  terminalTextureNode.nodeTypeId = mxTextureNodeDef.getName()
  terminalTextureNode.parameters.set(mxTextureNodefilenameInputName, filenameParamIt)
  terminalTextureNode.parameters.set(_tokens.st, _TokenValue(_tokens.st))
  for (const paramName of _SortedKeys(terminalTextureParams)) {
    terminalTextureNode.parameters.set(paramName, terminalTextureParams.get(paramName)!)
  }

  // Add the Texture Node to the hdNetwork
  const terminalTexturePath = _PathAppendChild(terminalNodePath, filenameToken)
  _Emplace(hdNetwork.nodes, terminalTexturePath, terminalTextureNode)

  // Make a new connection to the terminal node
  const terminalTextureConn: HdMaterialConnection2 = {
    upstreamNode: terminalTexturePath,
    upstreamOutputName: _PathGetName(terminalTexturePath),
  }

  // Replace the filename parameter with the TerminalTextureConnection
  _NodeAt(hdNetwork, terminalNodePath).parameters.delete(filenameToken)
  _NodeAt(hdNetwork, terminalNodePath)
    .inputConnections.set(terminalTextureConn.upstreamOutputName, [terminalTextureConn])

  TfDebug.msg(HdStDebugCodes.HDST_MTLX,
    `HdSt - Creating texture node <${terminalTexturePath}> and connecting it to terminal node ` +
    `<${terminalNodePath}>, for the filename input '${mxFilenameInputName}' on the ` +
    `'${mxNodeDef.getName()}' typed node.\n`)
}

/** The std::istringstream extractions of _AddMaterialXParams
 *  (materialXFilter.cpp:1239-1293): `>>` into a float or int skips
 *  whitespace and reads the longest numeric prefix (0 and failbit when there
 *  is none); `>>` into a std::string reads a whitespace-delimited word. Once
 *  failed, every later extraction fails and leaves its target unchanged
 *  (0 here). */
class _IStringStream {
  private _pos = 0
  private _fail = false
  constructor(private readonly _s: string) {}

  str(): string { return this._s }

  private _skipWs(): void {
    while (this._pos < this._s.length && /\s/.test(this._s[this._pos]!)) ++this._pos
  }

  private _number(re: RegExp): number {
    if (this._fail) return 0
    this._skipWs()
    re.lastIndex = this._pos
    const m = re.exec(this._s)
    if (!m || m[0] === '') {
      this._fail = true
      return 0
    }
    this._pos += m[0].length
    return Number(m[0])
  }

  /** >> float */
  readFloat(): number {
    return Math.fround(this._number(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y))
  }

  /** >> int */
  readInt(): number {
    return this._number(/[+-]?\d+/y) | 0
  }

  /** >> std::string */
  readWord(): string {
    if (this._fail) return ''
    this._skipWs()
    if (this._pos >= this._s.length) {
      this._fail = true
      return ''
    }
    const start = this._pos
    while (this._pos < this._s.length && !/\s/.test(this._s[this._pos]!)) ++this._pos
    return this._s.slice(start, this._pos)
  }
}

/** materialXFilter.cpp:1148-1346. Gather the Material Params from the glslfx
 *  ShaderPtr */
function _AddMaterialXParams(
  glslfxShader: Shader | null,
  hdNetwork: HdMaterialNetwork2,
  terminalNodePath: string,
  hdToAnonNodePathMap: _AnonNodePathMap,
  materialParams: HdSt_MaterialParam[],
): void {
  if (!glslfxShader) {
    return
  }

  // Storm can only find primvar nodes when they are connected to the terminal
  _ConnectPrimvarNodesToTerminalNode(terminalNodePath, hdNetwork)

  // Store all the parameter values, mapped by the anonymized names used
  // for MaterialXShaderGen
  // <anonNodeName_paramName, hdParamVtValue>
  const mxParamNameToValue = new Map<string, VtValue>()
  for (const nodePath of _SortedKeys(hdNetwork.nodes)) {
    const hdNode = hdNetwork.nodes.get(nodePath)!
    // Terminal Node parameters are not prefixed.
    let anonNodeNamePrefix = ''
    if (nodePath !== terminalNodePath) {
      const anonNodePathIt = hdToAnonNodePathMap.get(nodePath)
      if (anonNodePathIt !== undefined) {
        anonNodeNamePrefix = HdMtlxCreateNameFromPath(anonNodePathIt)
      }
    }
    for (const paramName of _SortedKeys(hdNode.parameters)) {
      const paramValue = hdNode.parameters.get(paramName)
      if (_IsHolding(paramValue, 'string') ||
          _IsHolding(paramValue, 'token')) {
        continue
      }
      _Emplace(mxParamNameToValue,
        _CreateNodeParamName(anonNodeNamePrefix, paramName), _AsVtValue(paramValue))
    }
  }

  // Build a mapping from the anonymized node name to the original Hydra
  // SdfPath. This is to help find texture nodes associated with filename
  // inputs found in the uniform block below.
  const anonToHdNodePathMap = new Map<string, string>()
  for (const [hdPath, anonPath] of hdToAnonNodePathMap) {
    if (hdPath !== terminalNodePath) {
      _Emplace(anonToHdNodePathMap, HdMtlxCreateNameFromPath(anonPath), hdPath)
    }
  }

  const pxlStage = glslfxShader.getStage(Stage.PIXEL)
  const paramsBlock = pxlStage.getUniformBlock(HW.PUBLIC_UNIFORMS)
  for (let i = 0; i < paramsBlock.size(); ++i) {

    // MaterialX parameter Information
    const variable = paramsBlock.getItem(i)
    const varType = HdStMaterialXHelpers.getMxTypeDesc(variable)
    const mxParamName = variable.getVariable()

    // Create a corresponding HdSt_MaterialParam
    const param = new HdSt_MaterialParam()
    param.paramType = HdSt_MaterialParam.ParamTypeFallback
    param.name = TfToken(mxParamName)

    // Get the parameter value from the map created above
    let debugSS = ''
    const paramValueIt = mxParamNameToValue.get(mxParamName)
    if (paramValueIt !== undefined) {
      debugSS += ' - authored value: '
      if (varType.getBaseType() === BaseType.BOOLEAN ||
          varType.getBaseType() === BaseType.FLOAT ||
          varType.getBaseType() === BaseType.INTEGER) {
        param.fallbackValue = paramValueIt
      }
    }
    // If it was not found in the mapping use the value from the MaterialX
    // variable to get the value.
    // Note that if the network was upgraded in Hdmtlx, and the node's
    // parameter names changed they will not be found through the above
    // mapping and instead need to be found from the variables in the
    // MaterialX glslfxShader.
    else {
      debugSS += ' - default  value: '
      const varValue = variable.getValue()
      const valueStream = new _IStringStream(varValue
        ? varValue.getValueString() : '')
      if (varType.getBaseType() === BaseType.BOOLEAN) {
        const val = valueStream.str() === 'true'
        param.fallbackValue = VtValue.create(val, VtValueTypes.bool)
      } else if (varType.getBaseType() === BaseType.FLOAT) {
        if (varType.getSize() === 1) {
          const val = valueStream.readFloat()
          param.fallbackValue = VtValue.create(val, VtValueTypes.float)
        } else if (varType.getSize() === 2) {
          const v0 = valueStream.readFloat(); valueStream.readWord()
          const v1 = valueStream.readFloat()
          param.fallbackValue = VtValue.create(new GfVec2f(v0, v1), VtValueTypes.GfVec2f)
        } else if (varType.getSize() === 3) {
          const v0 = valueStream.readFloat(); valueStream.readWord()
          const v1 = valueStream.readFloat(); valueStream.readWord()
          const v2 = valueStream.readFloat()
          param.fallbackValue = VtValue.create(new GfVec3f(v0, v1, v2), VtValueTypes.GfVec3f)
        } else if (varType.getSize() === 4) {
          const v0 = valueStream.readFloat(); valueStream.readWord()
          const v1 = valueStream.readFloat(); valueStream.readWord()
          const v2 = valueStream.readFloat(); valueStream.readWord()
          const v3 = valueStream.readFloat()
          param.fallbackValue = VtValue.create(new GfVec4f(v0, v1, v2, v3), VtValueTypes.GfVec4f)
        }
      } else if (varType.getBaseType() === BaseType.INTEGER) {
        if (varType.getSize() === 1) {
          const val = valueStream.readInt()
          param.fallbackValue = VtValue.create(val, VtValueTypes.int)
        } else if (varType.getSize() === 2) {
          const v0 = valueStream.readInt(); valueStream.readWord()
          const v1 = valueStream.readInt()
          param.fallbackValue = VtValue.create(new GfVec2i(v0, v1), VtValueTypes.GfVec2i)
        } else if (varType.getSize() === 3) {
          const v0 = valueStream.readInt(); valueStream.readWord()
          const v1 = valueStream.readInt(); valueStream.readWord()
          const v2 = valueStream.readInt()
          param.fallbackValue = VtValue.create(new GfVec3i(v0, v1, v2), VtValueTypes.GfVec3i)
        } else if (varType.getSize() === 4) {
          const v0 = valueStream.readInt(); valueStream.readWord()
          const v1 = valueStream.readInt(); valueStream.readWord()
          const v2 = valueStream.readInt(); valueStream.readWord()
          const v3 = valueStream.readInt()
          param.fallbackValue = VtValue.create(new GfVec4i(v0, v1, v2, v3), VtValueTypes.GfVec4i)
        }
      }
    }

    if (!param.fallbackValue.IsEmpty()) {
      debugSS += `${mxParamName} = ${String(param.fallbackValue.Get<unknown>())}`
      TfDebug.msg(HdStDebugCodes.HDST_MTLX_VALUES, `${debugSS}\n`)
      materialParams.push(param)
    }

    // For filename inputs, manage the associated texture node
    if (varType.getSemantic() === Semantic.FILENAME) {
      // Get the anonymized (or sanitized) MaterialX node name from the
      // mxParamName which is of the form anonNodeName_paramName
      let anonNodeName = mxParamName
      let underscorePos = anonNodeName.indexOf('_')
      if (TfStringStartsWith(anonNodeName, _tokens.NG_Anonymized)) {
        const anonPrefix = _tokens.NG_Anonymized + '_'
        underscorePos = anonNodeName.indexOf('_', anonPrefix.length)
      }

      if (underscorePos !== -1) {
        anonNodeName = anonNodeName.substring(0, underscorePos)
      }

      // Get the original hdNodeName from the MaterialX node name
      const hdNodePathIt = anonToHdNodePathMap.get(anonNodeName)
      if (hdNodePathIt !== undefined) {
        _UpdateTextureNode(
          param.name, hdNetwork,
          terminalNodePath, hdNodePathIt)
      } else {
        // Storm does not expect textures/filename to be direct inputs
        // on materials, replace this filename input with a connection
        // to an image node
        _ReplaceFilenameInput(hdNetwork, terminalNodePath, mxParamName)
      }
    }
  }
}

/** materialXFilter.cpp:1348-1388 */
function _GenerateMaterialXShader(
  hdNetwork: HdMaterialNetwork2,
  materialPath: string,
  terminalNode: HdMaterialNode2,
  terminalNodePath: string,
  materialTagToken: string,
  apiName: string,
  bindlessTexturesEnabled: boolean,
): Shader | null {
  TfDebug.msg(HdStDebugCodes.HDST_MTLX, `\nGenerate MaterialX Shader for:\n` +
    ` - <${materialPath}> material\n - bindless textures ${bindlessTexturesEnabled ? '' : 'not'} enabled\n` +
    ` - '${apiName}' api\n - '${materialTagToken}' materialTag.\n\n`)

  // Create the MaterialX Document from the HdMaterialNetwork
  const stdLibraries = HdMtlxStdLibraries()
  const hdMtlxData = new HdMtlxTexturePrimvarData()
  const mtlxDoc = HdMtlxCreateMtlxDocumentFromHdNetwork(
    hdNetwork, terminalNode, terminalNodePath, materialPath,
    stdLibraries, hdMtlxData)

  // Add domelight and other textures to mxHdInfo so the proper entry points
  // get generated in MaterialXShaderGen
  const mxHdInfo = new HdSt_MxShaderGenInfo()
  _UpdateMxHdTextureNames(
    hdMtlxData.hdTextureNodes, hdMtlxData.mxHdTextureMap,
    terminalNode, terminalNodePath, mxHdInfo.textureNames)

  _UpdatePrimvarNodes(
    mtlxDoc, hdNetwork, hdMtlxData.hdPrimvarNodes,
    mxHdInfo.primvarMap, mxHdInfo.primvarDefaultValueMap)

  mxHdInfo.materialTag = materialTagToken
  mxHdInfo.bindlessTexturesEnabled = bindlessTexturesEnabled

  // Generate the glslfx source code from the mtlxDoc
  return HdSt_GenMaterialXShader(
    mtlxDoc, stdLibraries, HdMtlxSearchPaths(), mxHdInfo, apiName)
}

////////////////////////////////////////////////////////////////////////////////
// Helper functions to create an anonymized HdMaterialNetwork2
//

const _topologicalTokenSet: ReadonlySet<string> = new Set(Object.values(_topologicalTokens))

/** materialXFilter.cpp:1394-1423 */
function _IsTopologicalShader(nodeId: string): boolean {
  if (nodeId === _topologicalTokens.ND_dot_filename) {
    return true
  }

  const sdrRegistry = SdrRegistry.getInstance()
  const sdrNode = sdrRegistry.getShaderNodeByIdentifierAndType(nodeId, _tokens.mtlx)

  if (sdrNode && _topologicalTokenSet.has(sdrNode.getFunction())) {
    return true
  }

  // Nodes whose implementation wraps a geompropvalue node (such as
  // UsdPrimvarReader) carry a primvar name that is topology-affecting, so
  // they must be treated as topological to preserve that parameter.
  if (HdMtlxIsPrimvarReaderNodeDef(HdMtlxGetNodeDef(TfToken(nodeId)))) {
    return true
  }

  // Swizzle nodes were topolgical in MaterialX v1.38 but were removed in
  // v1.39, so they won't be caught above if running with v1.39.
  return TfStringStartsWith(nodeId, 'ND_swizzle_')
}

/** materialXFilter.cpp:1425-1438 */
function _SanitizeName(name: string): string {
  if (!SdfPath.isValidIdentifier(name)) {
    return ''
  }
  // Remove underscores from the given name
  return name.replaceAll('_', '')
}

/** std::map::operator[] on the _AnonNodePathMap: an absent key maps to (and
 *  is inserted as) the empty SdfPath. */
function _AnonPathAt(anonNodePathMap: _AnonNodePathMap, path: string): string {
  let anonPath = anonNodePathMap.get(path)
  if (anonPath === undefined) {
    anonPath = ''
    anonNodePathMap.set(path, anonPath)
  }
  return anonPath
}

/** The hash of a parameter value (VtValue::GetHash). */
function _ValueHash(value: unknown): bigint {
  return value instanceof VtValue ? value.getHash() : TfHash(value)
}

/** materialXFilter.cpp:1440-1625. Build the topoNetwork, equivalent to the
 *  given hdNetwork but anonymized and stripped of non-topological parameters
 *  to better re-use the generated shader. */
function _BuildEquivalentMaterialNetwork(
  hdNetwork: HdMaterialNetwork2,
  topoNetwork: HdMaterialNetwork2,
  anonNodePathMap: _AnonNodePathMap,
): bigint {
  // The goal here is to strip all local names in the network paths in order
  // to produce MaterialX data that does not have uniform parameter names
  // that vary based on USD node names.
  // We also want to strip all non-topological parameters in order to get a
  // shader that has default values for all parameters and can be re-used.
  anonNodePathMap.clear()

  // Anonymized paths will be of the form:
  //   /NG_Anonymized/N0, /NG_Anonymized/N1, /NG_Anonymized/N2...
  // (SdfPath(_tokens->NG_Anonymized) is the relative path NG_Anonymized, so
  // the anonymized paths are NG_Anonymized/N0, ...)
  const anonBaseName = _tokens.NG_Anonymized

  // Create anonymized names for each of the nodes in the material network.
  // To do this we process the network in a depth-first traversal starting
  // at the terminals. This provides a stable traversal and consistant
  // anonymized renaming that will not be affected by the ordering of the
  // SdfPaths in the hdNetwork.
  let nodeCounter = 0
  const pathsToTraverse: Array<[string, string]> = []
  for (const terminalName of _SortedKeys(hdNetwork.terminals)) {
    const connection = hdNetwork.terminals.get(terminalName)!
    pathsToTraverse.push([connection.upstreamNode, terminalName])
  }
  while (pathsToTraverse.length !== 0) {
    const [path, input] = pathsToTraverse.pop()!

    // (Upstream dereferences hdNetwork.nodes.find(*path) unchecked; a
    // connection to a missing node is not traversed further here.)
    const node = hdNetwork.nodes.get(path)

    if (TfDebug.isEnabled(HdStDebugCodes.HDST_MTLX_DISABLE_ANONYMIZE)) {
      // If Anonymization is disabled we instead sanitize the node name
      // and remove any underscores this is to help with texture nodes
      // later in _AddMaterialXParams()
      const sanitizedName = _SanitizeName(_PathGetName(path))
      if (!anonNodePathMap.has(sanitizedName)) {
        anonNodePathMap.set(path, sanitizedName)
        TfDebug.msg(HdStDebugCodes.HDST_MTLX,
          ` - Map node named '${_PathGetName(path)}' (sanitized to ${sanitizedName}) to <${path}> ` +
          '(full path)\n')
      }

      if (!node) continue
      for (const inputName of _SortedKeys(node.inputConnections)) {
        for (const connection of node.inputConnections.get(inputName)!) {
          pathsToTraverse.push([connection.upstreamNode, inputName])
        }
      }

    } else {
      // When using anonymized networks we map the full path name to the
      // new anonymized path.
      if (!node) continue
      if (!anonNodePathMap.has(path)) {
        const anonNodeName =
          'N' + String(nodeCounter++) +
          _SanitizeName(node.nodeTypeId) +
          _SanitizeName(input)
        const anonPath = `${anonBaseName}/${anonNodeName}`
        anonNodePathMap.set(path, anonPath)
        TfDebug.msg(HdStDebugCodes.HDST_MTLX,
          ` - Map node <${path}> to <${anonPath}> (anonymized path)\n`)
      }

      for (const inputName of _SortedKeys(node.inputConnections)) {
        for (const connection of node.inputConnections.get(inputName)!) {
          pathsToTraverse.push([connection.upstreamNode, inputName])
        }
      }
    }
  }

  // Copy the incoming hdNetwork to the topoNetwork using only the
  // anonymized names
  topoNetwork.primvars = [...hdNetwork.primvars]
  topoNetwork.config = new Map(hdNetwork.config)
  for (const terminalName of _SortedKeys(hdNetwork.terminals)) {
    const terminalConn = hdNetwork.terminals.get(terminalName)!
    _Emplace(topoNetwork.terminals, terminalName, {
      upstreamNode: _AnonPathAt(anonNodePathMap, terminalConn.upstreamNode),
      upstreamOutputName: terminalConn.upstreamOutputName,
    })
  }
  const topoNodes = new Map<string, HdMaterialNode2>()
  for (const inNodePath of _SortedKeys(hdNetwork.nodes)) {
    const inNode = hdNetwork.nodes.get(inNodePath)!
    const outNode = new HdMaterialNode2()
    outNode.nodeTypeId = inNode.nodeTypeId
    if (_IsTopologicalShader(inNode.nodeTypeId)) {
      // Topological nodes have parameters that affect topology.
      // We can not strip them.
      for (const paramName of _SortedKeys(inNode.parameters)) {
        outNode.parameters.set(paramName, inNode.parameters.get(paramName))
      }
    } else {
      // Parameters that are color managed are also topological as they
      // result in different nodes being added in the MaterialX graph
      for (const paramName of _SortedKeys(inNode.parameters)) {
        // If this parameter is used to indicate a colorspace on a
        // color managed input, find and add that corresponding input
        const colorManagedInput =
          _PathStripPrefixNamespace(paramName, _SdfFieldKeysColorSpace)
        if (colorManagedInput[1]) {
          _Emplace(outNode.parameters, paramName, inNode.parameters.get(paramName))

          // Get the parameter value for the input
          const colorInputParam = colorManagedInput[0]
          if (inNode.parameters.has(colorInputParam)) {
            let colorInputValue = inNode.parameters.get(colorInputParam)

            // Use an empty asset for color managed files
            if (_IsHolding(colorInputValue, 'SdfAssetPath')) {
              colorInputValue = VtValue.create(new SdfAssetPath(), TfType.declare('SdfAssetPath'))
            }
            _Emplace(outNode.parameters, colorInputParam, colorInputValue)
          }
        }
      }

      // Normal map nodes in v1.38 included a 'space' parameter that
      // needs to be in the anonymized network otherwise it may not be
      // correctly translated into v1.39.
      if (TfStringStartsWith(inNode.nodeTypeId, _tokens.ND_normalmap)) {
        if (inNode.parameters.has(_tokens.space)) {
          _Emplace(outNode.parameters, _tokens.space, inNode.parameters.get(_tokens.space))
        }
      }
    }
    // (std::map order for the copied parameters.)
    outNode.parameters = new Map(_SortedKeys(outNode.parameters)
      .map((k) => [k, outNode.parameters.get(k)]))

    for (const connName of _SortedKeys(inNode.inputConnections)) {
      const outConn: HdMaterialConnection2[] = []
      for (const inConn of inNode.inputConnections.get(connName)!) {
        outConn.push({
          upstreamNode: _AnonPathAt(anonNodePathMap, inConn.upstreamNode),
          upstreamOutputName: inConn.upstreamOutputName,
        })
      }
      _Emplace(outNode.inputConnections, connName, outConn)
    }
    _Emplace(topoNodes, _AnonPathAt(anonNodePathMap, inNodePath), outNode)
  }
  // (std::map order for the anonymized nodes.)
  for (const anonPath of _SortedKeys(topoNodes)) {
    _Emplace(topoNetwork.nodes, anonPath, topoNodes.get(anonPath)!)
  }

  // Build the topo hash from the topo network
  // (Tf_HashState over the same sequence; the value is this repository's
  // TfHash of it, a cache key only.)
  const topoHash = new Tf_HashState()
  for (const terminalName of _SortedKeys(topoNetwork.terminals)) {
    topoHash.append(terminalName)
    topoHash.append(_PathGetName(topoNetwork.terminals.get(terminalName)!.upstreamNode))
  }
  for (const nodePath of _SortedKeys(topoNetwork.nodes)) {
    const node = topoNetwork.nodes.get(nodePath)!
    topoHash.append(_PathGetName(nodePath))
    topoHash.append(node.nodeTypeId)
    for (const paramName of _SortedKeys(node.parameters)) {
      topoHash.append(paramName)
      topoHash.append(_ValueHash(node.parameters.get(paramName)))
    }
    for (const connName of _SortedKeys(node.inputConnections)) {
      topoHash.append(connName)
      for (const source of node.inputConnections.get(connName)!) {
        topoHash.append(_PathGetName(source.upstreamNode))
        topoHash.append(source.upstreamOutputName)
      }
    }
  }

  return topoHash.getCode()
}

/** materialXFilter.cpp:1628-1696. MaterialX Filter: Converting a MaterialX
 *  node to one with a generated MaterialX glslfx file.
 *
 *  `terminalNode` is, as at the upstream call site
 *  (materialNetwork.cpp:1179-1186), the node object held in
 *  hdNetwork.nodes at terminalNodePath: the connections this filter adds to
 *  the terminal are made on that object, and the new terminal node is
 *  written into it (so its nodeTypeId is the generated shader's afterwards),
 *  as upstream's reference into the network sees them. */
export function HdSt_ApplyMaterialXFilter(
  hdNetwork: HdMaterialNetwork2,
  materialPath: string,
  terminalNode: HdMaterialNode2,
  terminalNodePath: string,
  materialParams: HdSt_MaterialParam[],
  resourceRegistry: HdStResourceRegistry,
): Shader | null {
  // Check if the Terminal is a MaterialX Node
  const sdrRegistry = SdrRegistry.getInstance()
  const mtlxSdrNode = sdrRegistry.getShaderNodeByIdentifierAndType(
    terminalNode.nodeTypeId, _tokens.mtlx)
  if (!mtlxSdrNode) {
    return null
  }

  // Anonymize the network to make sure shader code does not depend
  // on node names
  TfDebug.msg(HdStDebugCodes.HDST_MTLX,
    `Build Anonymous Material Network for <${terminalNodePath}>.\n`)
  const anonNodePathMap: _AnonNodePathMap = new Map()
  const anonNetwork = new HdMaterialNetwork2()
  const topoHash = _BuildEquivalentMaterialNetwork(
    hdNetwork, anonNetwork, anonNodePathMap)
  const anonTerminalNodePath = _AnonPathAt(anonNodePathMap, terminalNodePath)

  let glslfxShader: Shader | null = null
  const materialTag = TfToken(_GetMaterialTag(hdNetwork, terminalNode))
  const bindlessTexturesEnabled =
    resourceRegistry.getHgi().getCapabilities()!.isSet(
      HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBindlessTextures)
  const apiName = resourceRegistry.getHgi().getAPIName()

  // Use the Resource Registry to cache the generated MaterialX
  // glslfx Shader
  const shaderHash = new Tf_HashState()
  shaderHash.append(topoHash)
  shaderHash.append(materialTag)
  const glslfxInstance =
    resourceRegistry.registerMaterialXShader(shaderHash.getCode())

  if (glslfxInstance.isFirstInstance()) {
    try {
      glslfxShader = _GenerateMaterialXShader(
        anonNetwork, materialPath, terminalNode,
        anonTerminalNodePath, materialTag, apiName,
        bindlessTexturesEnabled)
    } catch (exception) {
      if (!(exception instanceof MxException)) throw exception
      TF_CODING_ERROR('Unable to create the Glslfx Shader.\n' +
        `MxException: ${exception.message}`)
    }

    // Store the mx::ShaderPtr
    glslfxInstance.setValue(glslfxShader as Shader)
  } else {
    // Get the mx::ShaderPtr from the resource registry
    glslfxShader = glslfxInstance.GetValue() as Shader | null
    TfDebug.msg(HdStDebugCodes.HDST_MTLX, 'Use previously generated MaterialX shader for ' +
      `material <${materialPath}>.\n`)
  }

  // Add a Fallback DomeLight texture node to the network
  _AddFallbackDomeLightTextureNode(hdNetwork, terminalNodePath)

  // Add material parameters from the original network
  _AddMaterialXParams(
    glslfxShader, hdNetwork, terminalNodePath,
    anonNodePathMap, materialParams)

  // Create a new terminal node with the glslfxShader
  if (glslfxShader) {
    const glslfxSourceCode = glslfxShader.getSourceCode(Stage.PIXEL)
    // HDST_MTLX_DUMP_SHADER_SOURCEFILE (materialXFilter.cpp:1671-1678)
    // writes <materialName>.glslfx to the working directory; there is no
    // file system here, so the source is written to the TfDebug output.
    if (TfDebug.isEnabled(HdStDebugCodes.HDST_MTLX_DUMP_SHADER_SOURCEFILE)) {
      const filename = _PathGetName(materialPath) + '.glslfx'
      TfDebug.msg(HdStDebugCodes.HDST_MTLX_DUMP_SHADER_SOURCEFILE, glslfxSourceCode)
      TfDebug.msg(HdStDebugCodes.HDST_MTLX_DUMP_SHADER_SOURCEFILE,
        `Write MaterialX glslfx shader: '${filename}'\n`)
    }
    const sdrNode = sdrRegistry.getShaderNodeFromSourceCode(
      glslfxSourceCode,
      HioGlslfxTokens.glslfx,
      mtlxSdrNode.getMetadata())
    // (Upstream dereferences sdrNode unchecked; without a glslfx Sdr parser
    // registered there is none, and the terminal is left unchanged.)
    if (!sdrNode) {
      TF_CODING_ERROR('Unable to parse the generated MaterialX glslfx ' +
        `shader for <${materialPath}> (no glslfx Sdr parser).`)
      return glslfxShader
    }
    const newTerminalNode = new HdMaterialNode2()
    newTerminalNode.nodeTypeId = sdrNode.getIdentifier()
    newTerminalNode.inputConnections = new Map(
      [...terminalNode.inputConnections].map(([k, v]) => [k, v.map((c) => ({ ...c }))]))
    newTerminalNode.parameters = new Map(terminalNode.parameters)

    // Replace the original terminalNode with this newTerminalNode
    // (assigned into the node object the network holds, as
    // std::map::operator[] = does.)
    const target = _NodeAt(hdNetwork, terminalNodePath)
    target.nodeTypeId = newTerminalNode.nodeTypeId
    target.inputConnections = newTerminalNode.inputConnections
    target.parameters = newTerminalNode.parameters
  }

  return glslfxShader
}
