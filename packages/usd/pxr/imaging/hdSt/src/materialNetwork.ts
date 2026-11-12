// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/materialNetwork.cpp,
//  pxr/imaging/hdSt/materialNetwork.h, pxr/usd/sdr/shaderProperty.cpp
// Copyright 2018, 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/materialNetwork.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences (each also noted at its site):
// - PXR_MATERIALX_SUPPORT_ENABLED is decided at runtime: the
//   HdSt_ApplyMaterialXFilter call (materialNetwork.cpp:1182-1187) runs when
//   the `typescript-usd/hdSt/materialx` entry has installed MaterialX support
//   (materialXSupport.ts). _materialXGfx (materialNetwork.h:105-107) holds
//   the generated MaterialX::ShaderPtr as an opaque object.
// - Sdr is reached through this repository's SdrRegistry
//   (typescript-usd/sdr, lowercase method names). Parameter values are the
//   VtValues the scene delegate authored; the HdStTextureIdentifier case of
//   _MakeMaterialParamsForTexture recognises a VtValue holding one.
// - SdrShaderProperty::GetTypeAsSdfType().GetSdfType().GetDefaultValue()
//   (the type's default when Sdr has no default value) is not used here.
//   FAITHFULNESS-DEBT(sdr-sdf-type-indicator): Sdr now has GetTypeAsSdfType
//   (sdr/src/shaderNode.ts, shaderProperty.cpp:190-319), but this function
//   does not call it, so such inputs fall through to the warning and vec3
//   fallback below; the end-state takes the Sdf type's default value.
// - HD_TRACE_FUNCTION is not ported.

import { Token as TfToken, Hash as TfHash } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes, Dictionary as VtDictionary } from 'typescript-usd/vt'
import { Vec3f as GfVec3f, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import {
  ConvertToHdMaterialNetwork2 as HdConvertToHdMaterialNetwork2,
  GetSamplerParameters as HdGetSamplerParameters,
  MaterialTerminalTokens as HdMaterialTerminalTokens,
  ShaderTokens as HdShaderTokens,
  type MaterialNetwork2 as HdMaterialNetwork2,
  type MaterialNetworkMap as HdMaterialNetworkMap,
  type MaterialNode2 as HdMaterialNode2,
  type SamplerParameters as HdSamplerParameters,
} from 'typescript-usd/hd'
import { HioGlslfx, HioGlslfxInputStream, HioGlslfxTokens } from 'typescript-usd/hio'
import {
  Registry as SdrRegistry,
  ShaderPropertyGetDefaultValue as SdrShaderPropertyGetDefaultValue,
  type ShaderNode as SdrShaderNode,
  type ShaderProperty as SdrShaderProperty,
} from 'typescript-usd/sdr'
import { HdStTextureType } from './enums.ts'
import { HdSt_MaterialParam } from './materialParam.ts'
import { HdSt_GetMaterialXSupport } from './materialXSupport.ts'
import type { HdStResourceRegistry } from './resourceRegistry.ts'
import {
  HdStAssetUvSubtextureIdentifier,
  HdStPtexSubtextureIdentifier,
  HdStUdimSubtextureIdentifier,
  type HdStSubtextureIdentifier,
} from './subtextureIdentifier.ts'
import { HdStTextureIdentifier } from './textureIdentifier.ts'
import { HdStMaterialTagTokens, HdStSdrMetadataTokens, HdStTokens } from './tokens.ts'
import { HdStIsSupportedUdimTexture } from './udimTextureObject.ts'
import { TF_WARN } from './tfDiagnostic.ts'

/** materialNetwork.cpp:40-62 */
const _tokens = {
  UsdPreviewSurface: 'UsdPreviewSurface',
  opacity: 'opacity',
  opacityMode: 'opacityMode',
  transparent: 'transparent',
  opacityThreshold: 'opacityThreshold',
  isPtex: 'isPtex',
  st: 'st',
  uv: 'uv',
  fieldname: 'fieldname',
  diffuseColor: 'diffuseColor',
  a: 'a',

  HwUvTexture_1: 'HwUvTexture_1',
  textureMemory: 'textureMemory',
  sourceColorSpace: 'sourceColorSpace',
  in: 'in',

  mtlx: 'mtlx',

  defaultInput: 'default',
  fallback: 'fallback',
} as const

/** SdrNodeRole (pxr/usd/sdr/declare.h) values this file compares against. */
const SdrNodeRole = {
  Primvar: 'primvar',
  Texture: 'texture',
  Field: 'field',
  Math: 'math',
} as const

/** SdfFieldKeys->ColorSpace (pxr/usd/sdf/schema.h). */
const SdfFieldKeysColorSpace = 'colorSpace'

/** The value a parameter VtValue holds (or the parameter itself when it is
 *  not a VtValue). */
function _Held(value: unknown): unknown {
  return value instanceof VtValue ? (value.IsEmpty() ? undefined : value.Get<unknown>()) : value
}

/** The VtValue of a parameter. */
function _AsVtValue(value: unknown): VtValue {
  return value instanceof VtValue ? value : VtValue.getEmpty()
}

/** VtValue::IsHolding<TfToken>() / IsHolding<std::string>() on a
 *  parameter. */
function _TypeNameOf(value: unknown): string {
  return value instanceof VtValue ? value.getTypeName() : typeof value
}

function _IsToken(value: unknown): boolean {
  const t = _TypeNameOf(value)
  return t === 'token' || t === 'TfToken'
}

function _IsString(value: unknown): boolean {
  const t = _TypeNameOf(value)
  return t === 'string'
}

/** A VtValue's float (VtValue::Get<float>). */
function _GetFloat(value: unknown): number {
  const held = _Held(value)
  return typeof held === 'number' ? held : 0
}

/** materialNetwork.cpp:64-117 */
function _GetMaterialTag(metadata: VtDictionary, terminal: HdMaterialNode2): TfToken {
  // Strongest materialTag opinion is a hardcoded tag in glslfx meta data.
  // This can be used for masked, additive, translucent or volume materials.
  // See HdMaterialTagTokens.
  const vtMetaTag = metadata.get(HdShaderTokens.materialTag)

  if (vtMetaTag && vtMetaTag.getTypeName() === 'string') {
    return TfToken(vtMetaTag.Get<string>())
  }

  // Next check for authored terminal.opacityThreshold value > 0
  for (const [name, value] of terminal.parameters) {
    if (name !== _tokens.opacityThreshold) continue

    if (_GetFloat(value) > 0.0) {
      return HdStMaterialTagTokens.masked
    }
  }

  let isTranslucent = false

  // Next strongest opinion is a connection to 'terminal.opacity'
  isTranslucent = terminal.inputConnections.has(_tokens.opacity)

  // Weakest opinion is an authored terminal.opacity value.
  if (!isTranslucent) {
    for (const [name, value] of terminal.parameters) {
      if (name !== _tokens.opacity) continue

      isTranslucent = _GetFloat(value) < 1.0
      break
    }
  }

  if (isTranslucent) {
    return HdStMaterialTagTokens.translucent
  }

  // An empty materialTag on the HdRprimCollection level means: 'ignore all
  // materialTags and add everything to the collection'. Instead we return a
  // default token because we want materialTags to drive HdSt collections.
  return HdStMaterialTagTokens.defaultMaterialTag
}

function _Sdr(): SdrRegistry {
  return SdrRegistry.getInstance()
}

function _GetGlslfxNode(nodeTypeId: string): SdrShaderNode | undefined {
  return _Sdr().getShaderNodeByIdentifierAndType(nodeTypeId, HioGlslfxTokens.glslfx)
}

/** materialNetwork.cpp:119-168 */
function _GetGlslfxForTerminal(
  state: { glslfx: HioGlslfx | null, hash: bigint },
  nodeTypeId: string,
  resourceRegistry: HdStResourceRegistry,
): void {
  // If there is a URI, we will use that, otherwise we will try to use
  // the source code.
  const sdrNode = _GetGlslfxNode(nodeTypeId)

  if (sdrNode) {
    const glslfxFilePath = sdrNode.getResolvedImplementationURI()
    if (glslfxFilePath !== '') {
      // Hash the filepath if it has changed.
      if (!state.hash ||
        (state.glslfx && state.glslfx.getFilePath() !== glslfxFilePath)) {
        state.hash = TfHash(glslfxFilePath)
      }

      // Find the glslfx file from the registry
      const glslfxInstance = resourceRegistry.registerGLSLFXFile(state.hash)

      if (glslfxInstance.isFirstInstance()) {
        state.glslfx = new HioGlslfx(glslfxFilePath)
        glslfxInstance.setValue(state.glslfx)
      }
      state.glslfx = glslfxInstance.GetValue()
    } else {
      const sourceCode = sdrNode.getSourceCode()
      if (sourceCode !== '') {
        // Do not use the registry for the source code to avoid
        // the cost of hashing the entire source code.
        state.glslfx = new HioGlslfx(new HioGlslfxInputStream(sourceCode))
      }
    }
  }
}

/** materialNetwork.cpp:170-185 */
function _GetTerminalNode(
  network: HdMaterialNetwork2,
  terminalName: string,
  terminalNodePath: { value: string },
): HdMaterialNode2 | null {
  // Get the Surface or Volume Terminal
  const connection = network.terminals.get(terminalName)
  if (!connection) {
    return null
  }
  const terminalPath = connection.upstreamNode
  terminalNodePath.value = terminalPath
  return network.nodes.get(terminalPath) ?? null
}

/** SdrShaderProperty::GetDefaultValue as a VtValue
 *  (ShaderPropertyGetDefaultValue, typescript-usd/sdr). */
function _DefaultValue(property: SdrShaderProperty | undefined): VtValue {
  if (!property) return VtValue.getEmpty()
  return SdrShaderPropertyGetDefaultValue(property)
}

/** materialNetwork.cpp:187-235. Get the fallback value for material node,
 *  first consulting Sdr to find whether the node has an input for the
 *  fallback value and then checking whether the output named outputName is
 *  known to Sdr and using either the default value specified by the
 *  SdrShaderProperty or using a default constructed value of the type
 *  specified by SdrShaderProperty. */
function _GetNodeFallbackValue(node: HdMaterialNode2, outputName: string): VtValue {
  // Find the corresponding Sdr node.
  const sdrNode = _GetGlslfxNode(node.nodeTypeId)
  if (!sdrNode) {
    return VtValue.getEmpty()
  }

  // XXX Storm hack: Incorrect usage of GetDefaultInput to
  // determine what the fallback value is.
  // GetDefaultInput is meant to be used for 'disabled'
  // node where the 'default input' becomes the value
  // pass-through in the network. But Storm has no other
  // mechanism currently to deal with fallback values.
  const defaultInput = sdrNode.getDefaultInput()
  if (defaultInput) {
    const def = defaultInput.getName()
    const defParam = node.parameters.get(def)
    if (defParam !== undefined) {
      return _AsVtValue(defParam)
    }
  }

  // Sdr supports specifying default values for outputs so if we
  // did not use the GetDefaultInput hack above, we fallback to
  // using this DefaultOutput value.
  const output = sdrNode.getShaderOutput(outputName)
  if (output) {
    const out = _DefaultValue(output)
    if (!out.IsEmpty()) {
      return out
    }

    // If no default value was registered with Sdr for
    // the output, fallback to the type's default (see the header).
    return VtValue.getEmpty()
  }

  return VtValue.getEmpty()
}

/** materialNetwork.cpp:237-302 */
function _GetParamFallbackValue(
  network: HdMaterialNetwork2,
  node: HdMaterialNode2,
  paramName: string,
): VtValue {
  // The 'fallback value' will be the value of the material param if nothing
  // is connected or what is connected is mis-configured. For example a
  // missing texture file.

  // Check if there are any connections to the terminal input.
  const conns = node.inputConnections.get(paramName)

  if (conns !== undefined) {
    if (conns.length !== 0) {
      const con = conns[0]!
      const upstreamNode = network.nodes.get(con.upstreamNode)!

      const fallbackValue = _GetNodeFallbackValue(upstreamNode, con.upstreamOutputName)
      if (!fallbackValue.IsEmpty()) {
        return fallbackValue
      }
    }
  }

  // If there are no connections there may be an authored value.

  const it = node.parameters.get(paramName)
  if (it !== undefined) {
    return _AsVtValue(it)
  }

  // If we had nothing connected, but we do have an Sdr node we can use the
  // DefaultValue for the input as specified in the Sdr schema.
  // E.g. PreviewSurface is a terminal with an Sdr schema.

  const terminalSdr = _GetGlslfxNode(node.nodeTypeId)

  if (terminalSdr) {
    const input = terminalSdr.getShaderInput(paramName)
    if (input) {
      // If not default value was registered with Sdr for
      // the output, fallback to the type's default (see the header).
      const out = _DefaultValue(input)

      if (!out.IsEmpty()) return out
    }
  }

  // Returning an empty value will likely result in a shader compile error,
  // because the buffer source will not be able to determine the HdTupleType.
  // Hope for the best and return a vec3.

  TF_WARN(`Couldn't determine default value for: ${paramName} on nodeType: ` +
    `${node.nodeTypeId}`)

  return VtValue.create(new GfVec3f(0, 0, 0), VtValueTypes.GfVec3f)
}

/** materialNetwork.cpp:304-341 */
function _GetPrimvarNameAttributeValue(
  sdrNode: SdrShaderNode | undefined,
  node: HdMaterialNode2,
  propName: string,
): TfToken {
  let vtName: unknown = undefined

  // If the name of the primvar was authored, the material adapter would have
  // put that that authored value in the node's parameter list.
  // The authored value is the strongest opinion/

  const param = node.parameters.get(propName)
  if (param !== undefined) {
    vtName = param
  }

  // If we didn't find an authored value consult Sdr for the default value.
  if ((vtName === undefined || (vtName instanceof VtValue && vtName.IsEmpty())) && sdrNode) {
    const sdrPrimvarInput = sdrNode.getShaderInput(propName)
    if (sdrPrimvarInput) {
      vtName = _DefaultValue(sdrPrimvarInput)
    }
  }

  if (_IsToken(vtName) || _IsString(vtName)) {
    return TfToken(String(_Held(vtName)))
  }

  return TfToken()
}

/** materialNetwork.cpp:343-353 */
function _MakeMaterialParamsForUnconnectedParam(
  paramName: string,
  params: HdSt_MaterialParam[],
): void {
  const param = new HdSt_MaterialParam()
  param.paramType = HdSt_MaterialParam.ParamTypeFallback
  param.name = TfToken(paramName)

  params.push(param)
}

/** materialNetwork.cpp:355-365 */
function _MakeMaterialParamsForAdditionalPrimvar(
  primvarName: string,
  params: HdSt_MaterialParam[],
): void {
  const param = new HdSt_MaterialParam()
  param.paramType = HdSt_MaterialParam.ParamTypeAdditionalPrimvar
  param.name = TfToken(primvarName)

  params.push(param)
}

/** materialNetwork.cpp:367-395 */
function _MakeMaterialParamsForPrimvarReader(
  _network: HdMaterialNetwork2,
  node: HdMaterialNode2,
  nodePath: string,
  paramName: string,
  visitedNodes: Set<string>,
  params: HdSt_MaterialParam[],
): void {
  if (visitedNodes.has(nodePath)) return

  const sdrNode = _GetGlslfxNode(node.nodeTypeId)

  const param = new HdSt_MaterialParam()
  param.paramType = HdSt_MaterialParam.ParamTypePrimvarRedirect
  param.name = TfToken(paramName)

  // A node may require 'additional primvars' to function correctly.
  for (const propName of sdrNode!.getAdditionalPrimvarProperties()) {
    const primvarName = _GetPrimvarNameAttributeValue(sdrNode, node, propName)

    if (primvarName !== '') {
      param.samplerCoords.push(primvarName)
    }
  }

  params.push(param)
}

/** materialNetwork.cpp:397-501 */
function _MakeMaterialParamsForTransform2d(
  network: HdMaterialNetwork2,
  node: HdMaterialNode2,
  nodePath: string,
  paramName: string,
  visitedNodes: Set<string>,
  params: HdSt_MaterialParam[],
): void {
  if (visitedNodes.has(nodePath)) return

  const transform2dParam = new HdSt_MaterialParam()
  transform2dParam.paramType = HdSt_MaterialParam.ParamTypeTransform2d
  transform2dParam.name = TfToken(paramName)
  transform2dParam.fallbackValue = _GetParamFallbackValue(network, node, _tokens.in)

  const additionalParams: HdSt_MaterialParam[] = []

  // Find the input connection to the transform2d node
  const inConns = node.inputConnections.get(_tokens.in)
  if (inConns !== undefined) {
    if (inConns.length !== 0) {
      const con = inConns[0]!
      const upstreamNodePath = con.upstreamNode

      const primvarNode = network.nodes.get(upstreamNodePath)!
      const primvarSdr = _GetGlslfxNode(primvarNode.nodeTypeId)

      if (primvarSdr) {
        const primvarParams: HdSt_MaterialParam[] = []

        _MakeMaterialParamsForPrimvarReader(
          network,
          primvarNode,
          upstreamNodePath,
          _tokens.in,
          visitedNodes,
          primvarParams)

        if (primvarParams.length !== 0) {
          const primvarParam = primvarParams[0]!
          // Extract the referenced primvar(s) to go into the
          // transform2d's sampler coords.
          transform2dParam.samplerCoords = [...primvarParam.samplerCoords]
        }

        // Make sure we add any referenced primvars as "additional
        // primvars" so they make it through primvar filtering.
        for (const primvarName of transform2dParam.samplerCoords) {
          _MakeMaterialParamsForAdditionalPrimvar(primvarName, additionalParams)
        }
      }
    }
  } else {
    // See if input value was directly authored as value.
    const iter = node.parameters.get(_tokens.in)

    if (iter !== undefined) {
      if (_IsToken(iter)) {
        const samplerCoord = TfToken(String(_Held(iter)))
        transform2dParam.samplerCoords.push(samplerCoord)
      }
    }
  }

  params.push(transform2dParam)

  // Make materials params for each component of transform2d
  // (rotation, scale, translation)
  const rotParam = new HdSt_MaterialParam()
  rotParam.paramType = HdSt_MaterialParam.ParamTypeFallback
  rotParam.name = TfToken(paramName + '_' + HdStTokens.rotation)
  rotParam.fallbackValue = _GetParamFallbackValue(network, node, HdStTokens.rotation)
  params.push(rotParam)

  const scaleParam = new HdSt_MaterialParam()
  scaleParam.paramType = HdSt_MaterialParam.ParamTypeFallback
  scaleParam.name = TfToken(paramName + '_' + HdStTokens.scale)
  scaleParam.fallbackValue = _GetParamFallbackValue(network, node, HdStTokens.scale)
  params.push(scaleParam)

  const transParam = new HdSt_MaterialParam()
  transParam.paramType = HdSt_MaterialParam.ParamTypeFallback
  transParam.name = TfToken(paramName + '_' + HdStTokens.translation)
  transParam.fallbackValue = _GetParamFallbackValue(network, node, HdStTokens.translation)
  params.push(transParam)

  // Need to add these at the end because the caller expects the
  // "transform" param to be first.
  params.push(...additionalParams)
}

/** materialNetwork.cpp:503-524 */
function _ResolveAssetPath(value: unknown): string {
  // Note that the SdfAssetPath should really be resolved into an ArAsset via
  // ArGetResolver (Eg. USDZ). Using GetResolvePath directly isn't sufficient.
  // Texture loading in Storm goes via Glf, which will handle the ArAsset
  // resolution already, so we skip doing it here and simply use the string.
  const held = _Held(value)
  if (held instanceof SdfAssetPath) {
    let v = held.getResolvedPath()
    if (v === '') {
      v = held.getAssetPath()
    }
    return v
  } else if (_IsString(value)) {
    return String(held)
  }

  return ''
}

/** materialNetwork.cpp:526-560 _ResolveParameter<T>: `accept` tells
 *  whether a held value is a T. */
function _ResolveParameter<T>(
  node: HdMaterialNode2,
  sdrNode: SdrShaderNode | undefined,
  name: string,
  defaultValue: T,
  accept: (value: unknown) => boolean,
): T {
  // First consult node parameters...
  const it = node.parameters.get(name)
  if (it !== undefined) {
    if (accept(it)) {
      return _Held(it) as T
    }
  }

  // Then fallback to SdrNode.
  if (sdrNode) {
    const input = sdrNode.getShaderInput(name)
    if (input) {
      const value = _DefaultValue(input)
      if (accept(value)) {
        return _Held(value) as T
      }
    }
  }

  return defaultValue
}

const _isFloat = (v: unknown) => _TypeNameOf(v) === 'float'
const _isVec4f = (v: unknown) => _TypeNameOf(v) === 'GfVec4f'

/** materialNetwork.cpp:562-589. We need to flip the image for the legacy
 *  HwUvTexture_1 shader node, pre-multiply textures by their alpha if
 *  applicable, and provide a hint for in what color space the texture is
 *  encoded. */
function _GetSubtextureIdentifier(
  textureType: HdStTextureType,
  nodeType: string,
  premultiplyAlpha: boolean,
  sourceColorSpace: TfToken,
): HdStSubtextureIdentifier | null {
  if (textureType === HdStTextureType.Uv) {
    const flipVertically = nodeType === _tokens.HwUvTexture_1
    return new HdStAssetUvSubtextureIdentifier(flipVertically,
      premultiplyAlpha, sourceColorSpace)
  }
  if (textureType === HdStTextureType.Udim) {
    return new HdStUdimSubtextureIdentifier(premultiplyAlpha, sourceColorSpace)
  }
  if (textureType === HdStTextureType.Ptex) {
    return new HdStPtexSubtextureIdentifier(premultiplyAlpha)
  }
  return null
}

/** materialNetwork.cpp:591-617 */
function _GetFallbackForNode(
  node: HdMaterialNode2,
  sdrNode: SdrShaderNode,
  outputName: string,
): VtValue {
  let it = node.parameters.get(_tokens.defaultInput)
  if (it !== undefined) {
    return _AsVtValue(it)
  } else {
    it = node.parameters.get(_tokens.fallback)
    if (it !== undefined) {
      return _AsVtValue(it)
    }
  }

  const sdrProperty = sdrNode.getShaderOutput(outputName)
  if (sdrProperty) {
    return _DefaultValue(sdrProperty)
  } else {
    for (const name of sdrNode.getShaderOutputNames()) {
      const property = sdrNode.getShaderOutput(name)
      if (property) {
        return _DefaultValue(property)
      }
    }
  }
  return VtValue.getEmpty()
}

/** materialNetwork.cpp:619-646 */
function _GetFilePropName(
  sdrNode: SdrShaderNode,
  nodePath: string,
  outputName: string,
): TfToken {
  const assetIdentifierPropertyNames = sdrNode.getAssetIdentifierInputNames()

  if (assetIdentifierPropertyNames.length === 0) {
    TF_WARN(`Invalid number of asset identifier input names: ${nodePath}`)
    return TfToken()
  }

  let fileProp = assetIdentifierPropertyNames[0]!
  // Some MaterialX nodes can have multiple file inputs. Take the first
  // one that matches the param name. If we lookup a <trilinear> texture
  // against an output named "N42_fileY", we will find the right one.
  if (assetIdentifierPropertyNames.length > 1) {
    for (const propName of assetIdentifierPropertyNames) {
      if (outputName.endsWith(propName)) {
        fileProp = propName
        break
      }
    }
  }
  return TfToken(fileProp)
}

/** materialNetwork.cpp:648-918 */
function _MakeMaterialParamsForTexture(
  network: HdMaterialNetwork2,
  node: HdMaterialNode2,
  downstreamNode: HdMaterialNode2, // needed to determine def value
  nodePath: string,
  outputName: string,
  paramName: string,
  visitedNodes: Set<string>,
  params: HdSt_MaterialParam[],
  textureDescriptors: HdStMaterialNetworkTextureDescriptor[],
  materialTag: TfToken,
): void {
  if (visitedNodes.has(nodePath)) return

  const sdrNode = _Sdr().getShaderNodeByIdentifier(
    node.nodeTypeId, [HioGlslfxTokens.glslfx, _tokens.mtlx])!

  const texParam = new HdSt_MaterialParam()
  texParam.paramType = HdSt_MaterialParam.ParamTypeTexture
  texParam.name = TfToken(paramName)

  // Get swizzle metadata if possible
  const outputProperty = sdrNode.getShaderOutput(outputName)
  if (outputProperty) {
    const propMetadata = outputProperty.getMetadata()
    const swizzle = propMetadata[HdStSdrMetadataTokens.swizzle]
    if (swizzle !== undefined) {
      texParam.swizzle = swizzle
    }
  }

  // Determine the texture type
  texParam.textureType = HdStTextureType.Uv
  if (sdrNode && _tokens.isPtex in sdrNode.getMetadata()) {
    texParam.textureType = HdStTextureType.Ptex
  }

  // Determine if texture should be pre-multiplied on CPU
  // Currently, this will only happen if the texture param is called
  // "diffuseColor" and if there is another param "opacity" connected to the
  // same texture node via output "a", as long as the material tag is not
  // "masked"
  let premultiplyTexture = false
  if (paramName === _tokens.diffuseColor &&
    materialTag !== HdStMaterialTagTokens.masked) {
    const opacityCons = downstreamNode.inputConnections.get(_tokens.opacity)
    if (opacityCons !== undefined) {
      const con = opacityCons[0]!
      premultiplyTexture = (nodePath === con.upstreamNode) &&
        (con.upstreamOutputName === _tokens.a)
    }
  }
  texParam.isPremultiplied = premultiplyTexture

  // Extract texture file path
  let useTexturePrimToFindTexture = true

  let texturePrimPathForSceneDelegate = ''

  let textureId = new HdStTextureIdentifier()

  const fileProp = _GetFilePropName(sdrNode, nodePath, outputName)
  if (fileProp !== '') {
    // SdfPath::JoinIdentifier(SdfFieldKeys->ColorSpace, fileProp)
    const colorSpaceParamName = SdfFieldKeysColorSpace + ':' + fileProp
    const sourceColorSpace = TfToken(_ResolveParameter<string>(
      node, sdrNode, colorSpaceParamName, HdStTokens.colorSpaceAuto, _IsToken))

    const v = node.parameters.get(fileProp)
    if (v !== undefined) {
      const held = _Held(v)
      // We use the nodePath, not the filePath, for the 'connection'.
      // Based on the connection path we will do a texture lookup via
      // the scene delegate. The scene delegate will lookup this texture
      // prim (by path) to query the file attribute value for filepath.
      // The reason for this re-direct is to support other texture uses
      // such as render-targets.
      texturePrimPathForSceneDelegate = nodePath

      // Use the type of the filePath attribute to determine
      // whether to use the Storm texture system (for
      // SdfAssetPath/std::string/ HdStTextureIdentifier) or use
      // the render buffer associated to a draw target.
      if (held instanceof HdStTextureIdentifier) {
        // Clients can explicitly give an HdStTextureIdentifier for
        // more direct control since they can give an instance of
        // HdStSubtextureIdentifier.
        //
        // Examples are, e.g., HdStUvAssetSubtextureIdentifier
        // allowing clients to flip the texture. Clients can even
        // subclass from HdStDynamicUvSubtextureIdentifier and
        // HdStDynamicUvTextureImplementation to implement their own
        // texture loading and commit.
        useTexturePrimToFindTexture = false
        textureId = held.copy()
      } else if (_IsString(v) || held instanceof SdfAssetPath) {
        const filePath = _ResolveAssetPath(v)

        if (HdStIsSupportedUdimTexture(filePath)) {
          texParam.textureType = HdStTextureType.Udim
        }

        useTexturePrimToFindTexture = false
        textureId = new HdStTextureIdentifier(
          TfToken(filePath),
          _GetSubtextureIdentifier(
            texParam.textureType,
            node.nodeTypeId,
            premultiplyTexture,
            sourceColorSpace),
          _GetFallbackForNode(node, sdrNode, outputName))
        // If the file attribute is an SdfPath, interpret it as path
        // to a prim holding the texture resource (e.g., a render buffer).
      } else if (_TypeNameOf(v) === 'SdfPath') {
        texturePrimPathForSceneDelegate = String(held)
      } else {
        TF_WARN(`Value type unsupported! ${_TypeNameOf(v)}, for texture ` +
          `${outputName} on node ${nodePath}`)
        useTexturePrimToFindTexture = false
        textureId = new HdStTextureIdentifier(
          TfToken(nodePath),
          VtValue.create(new GfVec4f(0.0, 0.0, 0.0, 0.0), VtValueTypes.GfVec4f),
          /*defaultToFallback=*/ true)
      }
    } else {
      TF_WARN(`Could not find texture ${outputName} for node ${nodePath}`)
      const fallback = _GetFallbackForNode(node, sdrNode, outputName)
      useTexturePrimToFindTexture = false
      textureId = new HdStTextureIdentifier(
        TfToken(nodePath),
        fallback,
        /*defaultToFallback=*/ true)
    }
  }

  // Check to see if a primvar or transform2d node is connected to 'st' or
  // 'uv'.
  // Instead of looking for a st inputs by name we could traverse all
  // connections to inputs and pick one that has a 'primvar' or 'transform2d'
  // node attached. That could also be problematic if you connect a primvar or
  // transform2d to one of the other inputs of the texture node.
  let stName: string = _tokens.st
  let stCons = node.inputConnections.get(_tokens.st)
  if (stCons === undefined) {
    stName = _tokens.uv
    stCons = node.inputConnections.get(_tokens.uv)
  }

  if (stCons !== undefined) {
    if (stCons.length !== 0) {
      const con = stCons[0]!
      const upstreamNodePath = con.upstreamNode

      const upstreamNode = network.nodes.get(upstreamNodePath)!

      const upstreamSdr = _GetGlslfxNode(upstreamNode.nodeTypeId)

      if (upstreamSdr) {
        const sdrRole = upstreamSdr.getRole()
        if (sdrRole === SdrNodeRole.Primvar) {
          const primvarParams: HdSt_MaterialParam[] = []

          _MakeMaterialParamsForPrimvarReader(
            network,
            upstreamNode,
            upstreamNodePath,
            stName,
            visitedNodes,
            primvarParams)

          if (primvarParams.length !== 0) {
            const primvarParam = primvarParams[0]!
            // Extract the referenced primvar(s) for use in the texture
            // sampler coords.
            texParam.samplerCoords = [...primvarParam.samplerCoords]
          }

          // For any referenced primvars, add them as "additional primvars"
          // to make sure they pass primvar filtering.
          for (const primvarName of texParam.samplerCoords) {
            _MakeMaterialParamsForAdditionalPrimvar(primvarName, params)
          }
        } else if (sdrRole === SdrNodeRole.Math) {
          const transform2dParams: HdSt_MaterialParam[] = []

          _MakeMaterialParamsForTransform2d(
            network,
            upstreamNode,
            upstreamNodePath,
            paramName + '_' + stName + '_transform2d',
            visitedNodes,
            transform2dParams)

          if (transform2dParams.length !== 0) {
            const transform2dParam = transform2dParams[0]!
            // The texure's sampler coords should come from the
            // output of the transform2d
            texParam.samplerCoords.push(transform2dParam.name)
          }

          // Copy params created for tranform2d node to param list
          params.push(...transform2dParams)
        }
      }
    }
  } else {
    // See if a st value was directly authored as value.

    let iter = node.parameters.get(_tokens.st)
    if (iter === undefined) {
      iter = node.parameters.get(_tokens.uv)
    }

    if (iter !== undefined) {
      if (_IsToken(iter)) {
        const samplerCoord = TfToken(String(_Held(iter)))
        texParam.samplerCoords.push(samplerCoord)
      }
    }
  }

  // Handle texture scale and bias
  const texScaleParam = new HdSt_MaterialParam()
  texScaleParam.paramType = HdSt_MaterialParam.ParamTypeFallback
  texScaleParam.name = TfToken(paramName + '_' + HdStTokens.storm + '_' + HdStTokens.scale)
  texScaleParam.fallbackValue = VtValue.create(_ResolveParameter<GfVec4f>(
    node, sdrNode, HdStTokens.scale, new GfVec4f(1, 1, 1, 1), _isVec4f), VtValueTypes.GfVec4f)
  params.push(texScaleParam)

  const texBiasParam = new HdSt_MaterialParam()
  texBiasParam.paramType = HdSt_MaterialParam.ParamTypeFallback
  texBiasParam.name = TfToken(paramName + '_' + HdStTokens.storm + '_' + HdStTokens.bias)
  texBiasParam.fallbackValue = VtValue.create(_ResolveParameter<GfVec4f>(
    node, sdrNode, HdStTokens.bias, new GfVec4f(0, 0, 0, 0), _isVec4f), VtValueTypes.GfVec4f)
  params.push(texBiasParam)

  // Attribute is in Mebibytes, but Storm texture system expects
  // bytes.
  const memoryRequest = Math.trunc(1048576 *
    _ResolveParameter<number>(node, sdrNode, _tokens.textureMemory, 0.0, _isFloat))

  textureDescriptors.push({
    name: TfToken(paramName),
    textureId,
    type: texParam.textureType,
    samplerParameters: HdGetSamplerParameters(node, sdrNode, nodePath),
    memoryRequest,
    useTexturePrimToFindTexture,
    texturePrim: texturePrimPathForSceneDelegate,
  })

  params.push(texParam)
}

/** materialNetwork.cpp:920-967 */
function _MakeMaterialParamsForFieldReader(
  _network: HdMaterialNetwork2,
  node: HdMaterialNode2,
  nodePath: string,
  paramName: string,
  visitedNodes: Set<string>,
  params: HdSt_MaterialParam[],
): void {
  if (visitedNodes.has(nodePath)) return

  // Volume Fields act more like a primvar then a texture.
  // There is a `Volume` prim with 'fields' that may point to a
  // OpenVDB file. We have to find the 'inputs:fieldname' on the
  // HWFieldReader in the material network to know what 'field' to use.
  // See also HdStVolume and HdStField for how volume textures are
  // inserted into Storm.

  const param = new HdSt_MaterialParam()
  param.paramType = HdSt_MaterialParam.ParamTypeFieldRedirect
  param.name = TfToken(paramName)

  // XXX Why _tokens->fieldname:
  // Hard-coding the name of the attribute of HwFieldReader identifying
  // the field name for now.
  const varName = _tokens.fieldname

  const fieldName = node.parameters.get(varName)
  if (fieldName !== undefined) {
    if (_IsToken(fieldName) || _IsString(fieldName)) {
      // Stashing name of field in _samplerCoords.
      param.samplerCoords.push(TfToken(String(_Held(fieldName))))
    }
  }

  params.push(param)
}

/** materialNetwork.cpp:969-1047 */
function _MakeParamsForInputParameter(
  network: HdMaterialNetwork2,
  node: HdMaterialNode2,
  paramName: string,
  visitedNodes: Set<string>,
  params: HdSt_MaterialParam[],
  textureDescriptors: HdStMaterialNetworkTextureDescriptor[],
  materialTag: TfToken,
): void {
  // Resolve what is connected to this param (eg. primvar, texture, nothing)
  // and then make the correct HdSt_MaterialParam for it.
  const cons = node.inputConnections.get(paramName)

  if (cons !== undefined) {
    if (cons.length !== 0) {
      // Find the node that is connected to this input
      const con = cons[0]!
      const upstreamNode = network.nodes.get(con.upstreamNode)

      if (upstreamNode) {
        const upstreamPath = con.upstreamNode
        const upstreamOutputName = con.upstreamOutputName

        const upstreamSdr = _Sdr().getShaderNodeByIdentifier(
          upstreamNode.nodeTypeId, [HioGlslfxTokens.glslfx, _tokens.mtlx])

        if (upstreamSdr) {
          const sdrRole = upstreamSdr.getRole()
          if (sdrRole === SdrNodeRole.Texture) {
            _MakeMaterialParamsForTexture(
              network,
              upstreamNode,
              node,
              upstreamPath,
              upstreamOutputName,
              paramName,
              visitedNodes,
              params,
              textureDescriptors,
              materialTag)
            return
          } else if (sdrRole === SdrNodeRole.Primvar) {
            _MakeMaterialParamsForPrimvarReader(
              network,
              upstreamNode,
              upstreamPath,
              paramName,
              visitedNodes,
              params)
            return
          } else if (sdrRole === SdrNodeRole.Field) {
            _MakeMaterialParamsForFieldReader(
              network,
              upstreamNode,
              upstreamPath,
              paramName,
              visitedNodes,
              params)
            return
          } else if (sdrRole === SdrNodeRole.Math) {
            _MakeMaterialParamsForTransform2d(
              network,
              upstreamNode,
              upstreamPath,
              paramName,
              visitedNodes,
              params)
            return
          }
        } else {
          TF_WARN(`Unrecognized connected node: ${upstreamNode.nodeTypeId}`)
        }
      }
    }
  }

  // Nothing (supported) was connected, output a fallback material param
  _MakeMaterialParamsForUnconnectedParam(paramName, params)
}

/** materialNetwork.cpp:1049-1131 */
function _GatherMaterialParams(
  network: HdMaterialNetwork2,
  node: HdMaterialNode2,
  params: HdSt_MaterialParam[],
  textureDescriptors: HdStMaterialNetworkTextureDescriptor[],
  materialTag: TfToken,
): void {
  // Hydra Storm currently supports two material configurations.
  // A custom glslfx file or a PreviewSurface material network.
  // Either configuration consists of a terminal (Shader or PreviewSurface)
  // with its input values authored or connected to a primvar, texture or
  // volume node. The texture may have a primvar connected to provide UVs.
  //
  // The following code is made to process one of these two material configs
  // exclusively. It cannot convert arbitrary material networks to Storm by
  // generating the appropriate glsl code.

  const sdrNode = _GetGlslfxNode(node.nodeTypeId)

  if (sdrNode) {
    const visitedNodes = new Set<string>()
    for (const inputName of sdrNode.getShaderInputNames()) {
      _MakeParamsForInputParameter(
        network, node, inputName, visitedNodes,
        params, textureDescriptors, materialTag)
    }
  } else {
    TF_WARN(`Unrecognized node: ${node.nodeTypeId}`)
  }

  // Set fallback values for the inputs on the terminal (excepting
  // referenced sampler coords).
  for (const p of params) {
    if (p.paramType !== HdSt_MaterialParam.ParamTypeAdditionalPrimvar &&
      p.fallbackValue.IsEmpty()) {
      p.fallbackValue = _GetParamFallbackValue(network, node, p.name)
      // The opacityMode input on a PreviewSurface material is a token
      // input, this needs to be updated to an int VtValue for codegen.
      // The values are updated such that transparent = 1 and presence = 0.
      if (node.nodeTypeId === _tokens.UsdPreviewSurface &&
        p.name === _tokens.opacityMode) {
        let paramInt = 1
        if (_IsString(p.fallbackValue) || _IsToken(p.fallbackValue)) {
          const param = String(p.fallbackValue.Get<unknown>())
          paramInt = param === _tokens.transparent ? 1 : 0
        }
        p.fallbackValue = VtValue.create(paramInt, VtValueTypes.int)
      }
    }
  }

  if (sdrNode) {
    // Create HdSt_MaterialParams for each primvar the terminal says it
    // needs.
    // Primvars come from 'attributes' in the glslfx and are seperate from
    // the input 'parameters'. We need to create a material param for them
    // so that these primvars survive 'primvar filtering' that discards any
    // unused primvars on the mesh.
    // If the network lists additional primvars, we add those too.
    const pv = [...sdrNode.getPrimvars(), ...network.primvars]
    // std::sort + std::unique (byte order).
    const sorted = [...new Set(pv)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))

    for (const primvarName of sorted) {
      _MakeMaterialParamsForAdditionalPrimvar(primvarName, params)
    }
  }
}

/** materialNetwork.h:61-82. Information necessary to allocate a texture. */
export interface HdStMaterialNetworkTextureDescriptor {
  // Name by which the texture will be accessed, i.e., the name
  // of the accesor for thexture will be HdGet_name(...).
  // It is generated from the input name the corresponding texture
  // node is connected to.
  name: TfToken
  textureId: HdStTextureIdentifier
  type: HdStTextureType
  samplerParameters: HdSamplerParameters
  // Memory request in bytes.
  memoryRequest: number

  // The texture is not just identified by a file path attribute
  // on the texture prim but there is special API to texture prim
  // to obtain the texture.
  //
  // This is used for draw targets.
  useTexturePrimToFindTexture: boolean
  // This is used for draw targets and hashing.
  texturePrim: string
}

/** materialNetwork.h:26-106. Helps HdStMaterial process a Hydra material
 *  network into shader source code and parameters values. */
export class HdStMaterialNetwork {
  private _materialTag: TfToken = HdStMaterialTagTokens.defaultMaterialTag
  private _fragmentSource = ''
  private _volumeSource = ''
  private _displacementSource = ''
  private _materialMetadata = new VtDictionary()
  private _materialParams: HdSt_MaterialParam[] = []
  private _textureDescriptors: HdStMaterialNetworkTextureDescriptor[] = []
  /** materialNetwork.h:105-107 (PXR_MATERIALX_SUPPORT_ENABLED) */
  private _materialXGfx: object | null = null
  private readonly _surfaceGfx = { glslfx: null as HioGlslfx | null, hash: 0n }

  /** materialNetwork.cpp:1133-1144. Process a material network topology
   *  and extract all the information we need from it. */
  processMaterialNetwork(
    materialId: string,
    hdNetworkMap: HdMaterialNetworkMap,
    resourceRegistry: HdStResourceRegistry,
  ): void {
    this._fragmentSource = ''
    this._displacementSource = ''
    this._materialMetadata = new VtDictionary()
    this._materialParams = []
    this._textureDescriptors = []
    this._materialTag = HdStMaterialTagTokens.defaultMaterialTag

    // The fragment source comes from the 'surface' network or the
    // 'volume' network.
    const isVolume = { value: false }
    const surfaceNetwork = HdConvertToHdMaterialNetwork2(hdNetworkMap, isVolume)
    const terminalName = isVolume.value ? HdMaterialTerminalTokens.volume
      : HdMaterialTerminalTokens.surface

    const surfTerminalPath = { value: '' }
    let surfTerminal = _GetTerminalNode(surfaceNetwork, terminalName, surfTerminalPath)
    if (surfTerminal) {
      // materialNetwork.cpp:1182-1187 (PXR_MATERIALX_SUPPORT_ENABLED)
      const materialX = HdSt_GetMaterialXSupport()
      if (materialX && !isVolume.value) {
        this._materialXGfx = materialX.applyMaterialXFilter(surfaceNetwork, materialId,
          surfTerminal, surfTerminalPath.value,
          this._materialParams, resourceRegistry)
        // The filter replaces the terminal node in the network
        // (materialXFilter.cpp:1688-1689); upstream's surfTerminal pointer
        // then sees the new node, a JavaScript reference does not.
        surfTerminal = surfaceNetwork.nodes.get(surfTerminalPath.value) ?? surfTerminal
      }

      // Extract the glslfx and metadata for surface/volume.
      _GetGlslfxForTerminal(this._surfaceGfx, surfTerminal.nodeTypeId, resourceRegistry)
      const surfaceGfx = this._surfaceGfx.glslfx
      if (surfaceGfx) {
        // If the glslfx file is not valid we skip parsing the network.
        // This produces no fragmentSource which means Storm's material
        // will use the fallback shader.
        if (surfaceGfx.isValid()) {
          this._fragmentSource = surfaceGfx.getSurfaceSource()
          this._volumeSource = surfaceGfx.getVolumeSource()

          this._materialMetadata = surfaceGfx.getMetadata()
          this._materialTag = _GetMaterialTag(this._materialMetadata, surfTerminal)
          _GatherMaterialParams(surfaceNetwork, surfTerminal,
            this._materialParams, this._textureDescriptors,
            this._materialTag)

          // OSL networks have a displacement network in hdNetworkMap
          // under terminal: HdMaterialTerminalTokens->displacement.
          // For Storm however we expect the displacement shader to be
          // provided via the surface glslfx / terminal.
          this._displacementSource = surfaceGfx.getDisplacementSource()
        }
      }
    }
  }

  /** materialNetwork.cpp:1222-1226 */
  getMaterialTag(): TfToken {
    return this._materialTag
  }

  /** materialNetwork.cpp:1228-1232 */
  getFragmentCode(): string {
    return this._fragmentSource
  }

  /** materialNetwork.cpp:1234-1238 */
  getVolumeCode(): string {
    return this._volumeSource
  }

  /** materialNetwork.cpp:1240-1244 */
  getDisplacementCode(): string {
    return this._displacementSource
  }

  /** materialNetwork.cpp:1246-1250 */
  getMetadata(): VtDictionary {
    return this._materialMetadata
  }

  /** materialNetwork.cpp:1252-1256 */
  getMaterialParams(): readonly HdSt_MaterialParam[] {
    return this._materialParams
  }

  /** materialNetwork.cpp:1258-1262 */
  getTextureDescriptors(): readonly HdStMaterialNetworkTextureDescriptor[] {
    return this._textureDescriptors
  }
}
