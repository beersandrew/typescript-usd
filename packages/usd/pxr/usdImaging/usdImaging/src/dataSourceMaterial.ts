// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceMaterial.cpp,
//  pxr/usdImaging/usdImaging/dataSourceMaterial.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceMaterial.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - The TypeScript usdShade library has no UsdShadeConnectionSourceInfo /
//   UsdShadeConnectableAPI::GetConnectedSources, no UsdShadeNodeDefAPI
//   (GetShaderId, GetSourceAsset, GetSourceCode,
//   GetShaderNodeForSourceType) and no UsdShadeUtils::GetBaseNameAndType;
//   the helpers below port those upstream functions (cited at each) over the
//   attribute reads the TypeScript USD API offers. Upstream holds the
//   UsdShadeShader / UsdShadeConnectableAPI schema objects; this port holds
//   their UsdPrim.
// - TfDenseHashMap iteration order (the node container's name order) is
//   insertion order here; container names are unordered upstream.
// - Values upstream reads with UsdAttribute::Get(VtValue*) (the config
//   values) become VtValues through _UsdImagingVtValueFromUsdValue
//   (dataSourceAttribute.ts).

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  LazyContainerDataSource as HdLazyContainerDataSource,
  MaterialConnectionSchema as HdMaterialConnectionSchema,
  MaterialInterfaceMappingSchema as HdMaterialInterfaceMappingSchema,
  MaterialInterfaceParameterSchema as HdMaterialInterfaceParameterSchema,
  MaterialInterfaceSchema as HdMaterialInterfaceSchema,
  MaterialNetworkSchema as HdMaterialNetworkSchema,
  MaterialNetworkSchemaTokens as HdMaterialNetworkSchemaTokens,
  MaterialNodeParameterSchema as HdMaterialNodeParameterSchema,
  MaterialNodeParameterSchemaTokens as HdMaterialNodeParameterSchemaTokens,
  MaterialNodeSchemaTokens as HdMaterialNodeSchemaTokens,
  MaterialSchema as HdMaterialSchema,
  MaterialSchemaTokens as HdMaterialSchemaTokens,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
  type TokenArrayDataSource as HdTokenArrayDataSource,
  type VectorDataSource as HdVectorDataSource,
} from 'typescript-usd/hd'
import { AssetPath as SdfAssetPath, sdfGetDictionaryValueTypes } from 'typescript-usd/sdf'
import { Registry as SdrRegistry, type ShaderNode as SdrShaderNode } from 'typescript-usd/sdr'
import type { Attribute as UsdAttribute, Prim as UsdPrim } from 'typescript-usd/usd'
import { LightAPI as UsdLuxLightAPI, LightFilter as UsdLuxLightFilter } from 'typescript-usd/usdLux'
import { Material as UsdShadeMaterial, NodeGraph as UsdShadeNodeGraph, ShadeInput as UsdShadeInput, ShadeOutput as UsdShadeOutput, type InterfaceInputConsumersMap } from 'typescript-usd/usdShade'
import { Array as VtArray, Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { _UsdImagingVtValueFromUsdValue, UsdImagingDataSourceAttributeNew } from './dataSourceAttribute.ts'
import { UsdImagingDataSourceAttributeColorSpace } from './dataSourceAttributeColorSpace.ts'
import { UsdImagingDataSourceAttributeTypeName } from './dataSourceAttributeTypeName.ts'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingTokens } from './tokens.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

/** HdRetainedTypedSampledDataSource<TfToken>::New */
function _TokenDs(value: string): HdRetainedTypedSampledDataSource<string> {
  return new HdRetainedTypedSampledDataSource(value, VtValueTypes.token)
}

// ---------------------------------------------------------------------------
// UsdShade helpers (see the header)

/** usdShade/utils.h UsdShadeAttributeType */
enum _UsdShadeAttributeType { Invalid, Input, Output }

/** usdShade/utils.cpp UsdShadeUtils::GetBaseNameAndType: the base name and
 *  type of a shading attribute name ("inputs:" / "outputs:" prefix). */
function _GetBaseNameAndType(fullName: string): [string, _UsdShadeAttributeType] {
  if (fullName.startsWith('inputs:')) {
    return [fullName.slice('inputs:'.length), _UsdShadeAttributeType.Input]
  }
  if (fullName.startsWith('outputs:')) {
    return [fullName.slice('outputs:'.length), _UsdShadeAttributeType.Output]
  }
  return [fullName, _UsdShadeAttributeType.Invalid]
}

/** usdShade/utils.cpp UsdShadeUtils::GetType */
function _GetType(fullName: string): _UsdShadeAttributeType {
  return _GetBaseNameAndType(fullName)[1]
}

/** connectableAPI.h:744-807 UsdShadeConnectionSourceInfo (the source
 *  connectable is held as its prim). */
interface _ConnectionSourceInfo {
  source: UsdPrim | undefined
  sourceName: string
  sourceType: _UsdShadeAttributeType
}

/** connectableAPI.h:787-796 UsdShadeConnectionSourceInfo::IsValid */
function _IsValidSourceInfo(info: _ConnectionSourceInfo): boolean {
  return info.sourceType !== _UsdShadeAttributeType.Invalid &&
    info.sourceName !== '' &&
    info.source !== undefined && info.source.isValid()
}

/** connectableAPI.cpp:304-354 UsdShadeConnectableAPI::GetConnectedSources */
function _GetConnectedSources(shadingAttr: UsdAttribute): _ConnectionSourceInfo[] {
  const sourcePaths = shadingAttr.getConnections()
  const sourceInfos: _ConnectionSourceInfo[] = []
  if (sourcePaths.length === 0) {
    return sourceInfos
  }
  const stage = shadingAttr.getStage()
  for (const sourcePath of sourcePaths) {
    // Make sure the source attribute exists
    const sourceAttr = stage.getPrim(sourcePath.slice(0, sourcePath.lastIndexOf('.')))
      ?.getAttr(sourcePath.slice(sourcePath.lastIndexOf('.') + 1))
    if (!sourceAttr || !sourceAttr.isValid() || sourceAttr.isRelationship) {
      continue
    }
    // Check that the attribute has a legal prefix
    const [sourceName, sourceType] = _GetBaseNameAndType(sourceAttr.name)
    if (sourceType === _UsdShadeAttributeType.Invalid) {
      continue
    }
    // We do not check whether the UsdShadeConnectableAPI is valid. We
    // implicitly know the prim is valid, since we got a valid attribute.
    // That is the only requirement.
    sourceInfos.push({ source: stage.getPrim(sourceAttr.primPath), sourceName, sourceType })
  }
  return sourceInfos
}

/** The prim of a UsdAttribute (UsdObject::GetPrim). */
function _GetPrim(attr: UsdAttribute): UsdPrim | undefined {
  return attr.getStage().getPrim(attr.primPath)
}

/** UsdPrim::GetAttribute(name), valid only for an existing attribute. */
function _GetAttribute(prim: UsdPrim, name: string): UsdAttribute | undefined {
  const attr = prim.getAttr(name)
  return attr && attr.isValid() && !attr.isRelationship ? attr : undefined
}

/** nodeDefAPI.cpp:383-395 _GetSdrMetadata */
function _GetSdrMetadata(prim: UsdPrim): Record<string, string> {
  const result: Record<string, string> = {}
  const sdrMetadata = prim.getMetadata('sdrMetadata')
  if (sdrMetadata && typeof sdrMetadata === 'object') {
    for (const [key, value] of Object.entries(sdrMetadata as Record<string, unknown>)) {
      result[key] = String(value)
    }
  }
  return result
}

/** nodeDefAPI.cpp GetImplementationSource: info:implementationSource, 'id'
 *  when unauthored or not one of the allowed values. */
function _GetImplementationSource(prim: UsdPrim): string {
  const implSource = _GetAttribute(prim, 'info:implementationSource')?.get()
  if (implSource === 'sourceAsset' || implSource === 'sourceCode') {
    return implSource
  }
  return 'id'
}

/** nodeDefAPI.cpp:202-210 UsdShadeNodeDefAPI::GetShaderId */
function _GetShaderId(prim: UsdPrim): string | undefined {
  if (_GetImplementationSource(prim) === 'id') {
    const id = _GetAttribute(prim, 'info:id')?.get()
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}

/** nodeDefAPI.cpp:239-261 GetSourceAsset, :290-313
 *  GetSourceAssetSubIdentifier and :341-363 GetSourceCode: the
 *  info:<sourceType>:<name> attribute, falling back to info:<name>. */
function _GetSourceProperty(
  prim: UsdPrim, implSource: string, name: string, sourceType: string,
): unknown {
  if (_GetImplementationSource(prim) !== implSource) {
    return undefined
  }
  const attr = _GetAttribute(prim, sourceType === '' ? `info:${name}` : `info:${sourceType}:${name}`)
  if (attr) {
    return attr.get()
  }
  if (sourceType !== '') {
    const univAttr = _GetAttribute(prim, `info:${name}`)
    if (univAttr) {
      return univAttr.get()
    }
  }
  return undefined
}

/** nodeDefAPI.cpp:429-465 UsdShadeNodeDefAPI::GetShaderNodeForShadingSystem
 *  (GetShaderNodeForSourceType). */
function _GetShaderNodeForSourceType(prim: UsdPrim, shadingSystem: string): SdrShaderNode | undefined {
  const registry = SdrRegistry.getInstance()
  const implSource = _GetImplementationSource(prim)
  if (implSource === 'id') {
    const shaderId = _GetShaderId(prim)
    if (shaderId !== undefined) {
      return registry.getShaderNodeByIdentifierAndSystem(shaderId, shadingSystem)
    }
  } else if (implSource === 'sourceAsset') {
    const sourceAsset = _GetSourceProperty(prim, 'sourceAsset', 'sourceAsset', shadingSystem)
    if (sourceAsset instanceof SdfAssetPath) {
      const subIdentifier = _GetSourceProperty(prim, 'sourceAsset', 'sourceAsset:subIdentifier', shadingSystem)
      return registry.getShaderNodeFromAsset(
        sourceAsset, _GetSdrMetadata(prim),
        typeof subIdentifier === 'string' ? subIdentifier : '', shadingSystem)
    }
  } else if (implSource === 'sourceCode') {
    const sourceCode = _GetSourceProperty(prim, 'sourceCode', 'sourceCode', shadingSystem)
    if (typeof sourceCode === 'string') {
      return registry.getShaderNodeFromSourceCode(sourceCode, shadingSystem, _GetSdrMetadata(prim))
    }
  }
  return undefined
}

/** The VtDictionary UsdPrim::GetMetadata(key, VtDictionary*) gives for a
 *  dictionary-valued metadata field. */
function _VtDictionaryFromUsdDictionary(dict: unknown): VtDictionary {
  const result = new VtDictionary()
  if (!dict || typeof dict !== 'object') {
    return result
  }
  const valueTypes = sdfGetDictionaryValueTypes(dict)
  for (const [key, value] of Object.entries(dict as Record<string, unknown>)) {
    const typeName = valueTypes?.get(key)
    if (typeName === 'dictionary' || (typeName === undefined && value !== null &&
        typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)) {
      result.set(key, VtValue.createDictionary(_VtDictionaryFromUsdDictionary(value)))
    } else {
      result.set(key, _UsdImagingVtValueFromUsdValue(value,
        typeName ?? (typeof value === 'string' ? 'string' : typeof value === 'boolean' ? 'bool' : 'double')))
    }
  }
  return result
}

// ---------------------------------------------------------------------------

/** dataSourceMaterial.cpp:46-52. Strip </prefix> from </prefix/path> to
 *  yield <path> (SdfPath::ReplacePrefix with the reflexive relative path). */
function _RelativePath(prefix: string, path: string): string {
  if (prefix === '') {
    return path
  }
  if (path === prefix) {
    return '.'
  }
  if (path.startsWith(prefix === '/' ? '/' : `${prefix}/`)) {
    return path.slice(prefix === '/' ? 1 : prefix.length + 1)
  }
  return path
}

/** dataSourceMaterial.cpp:54-66. Extract the renderContext from an output
 *  name, ex: "outputs:surface" -> "", "outputs:ri:surface" -> "ri" */
function _GetRenderContextForShaderOutput(output: UsdShadeOutput): string {
  const ns = output.attr.getNamespace()
  if (ns.startsWith('outputs:')) {
    return ns.slice('outputs:'.length)
  }
  // Empty namespace, e.g. "outputs:foo" -> ""
  return ''
}

/** dataSourceMaterial.cpp:68-107. For the fixed terminal cases (e.g. light,
 *  lightFilter, volumeFilter) there are no output connections to examine for
 *  authored renderContexts. Instead, we must examine the nodes for
 *  renderContextNodeIdentifiers. */
function _CollectRenderContextsFromNodeIdentifiers(
  usdPrim: UsdPrim, fixedTerminalName: string,
): string[] {
  // Always offer the universal render context and the "all nodes"
  // context.
  const result: string[] = [
    HdMaterialSchemaTokens.universalRenderContext,
    HdMaterialSchemaTokens.all,
  ]

  // Determine the appropriate suffix for the shaderId property.
  const shaderIdSuffix = `:${fixedTerminalName}:shaderId`

  // Scan contained prims for renderContexts.
  for (const propName of usdPrim.getPropertyNames()) {
    if (!propName.endsWith(shaderIdSuffix)) {
      continue
    }
    // Extract from "{renderContext}:{shaderId}"
    const renderContext = propName.slice(0, propName.length - shaderIdSuffix.length)
    // Accumulate unique renderContext values.
    // (Note: we expect property names to be unique, but guard against
    // duplicating the universal or all tokens contexts above.)
    if (!result.includes(renderContext)) {
      result.push(renderContext)
    }
  }
  return result
}

/** dataSourceMaterial.cpp:109-113 */
function _Contains(v: readonly string[], t: string): boolean {
  return v.includes(t)
}

/** UsdShadeInput::GetBaseName of a consumer (the bare input name). */
type _Consumer = { primPath: string; name: string }

/** dataSourceMaterial.cpp:115-151 */
function _GetMappings(
  material: UsdShadeMaterial,
  consumerMap: InterfaceInputConsumersMap,
  parameterName: string,
): HdDataSourceBase[] {
  const consumers: _Consumer[] | undefined = consumerMap.get(parameterName)
  if (consumers === undefined) {
    return []
  }
  if (consumers.length === 0) {
    return []
  }

  const consumerContainers: HdDataSourceBase[] = []
  for (const input of consumers) {
    consumerContainers.push(
      new HdMaterialInterfaceMappingSchema.Builder()
        .setNodePath(_TokenDs(_RelativePath(material.path, input.primPath)))
        .setInputName(_TokenDs(input.name))
        .build())
  }
  return consumerContainers
}

/** dataSourceMaterial.cpp:153-164 */
function _GetMappingsDataSource(
  material: UsdShadeMaterial,
  consumerMap: InterfaceInputConsumersMap,
  parameterName: string,
): HdVectorDataSource {
  const consumerContainers = _GetMappings(material, consumerMap, parameterName)
  return HdRetainedSmallVectorDataSource.new(consumerContainers)
}

/** dataSourceMaterial.cpp:166-191 */
function _BuildMaterialInterfaceParameter(
  material: UsdShadeMaterial,
  consumerMap: InterfaceInputConsumersMap,
  parameterName: string,
): HdContainerDataSource {
  // Need usdInput to identify the displayGroup and displayName
  const usdInput = material.getInput(parameterName)

  // Only fetch display name if UsdAttribute isn't expired
  // (UsdObject::GetDisplayName / UsdProperty::GetDisplayGroup read the
  // displayName / displayGroup metadata.)
  let displayName = ''
  let displayGroup = ''
  const usdInputAttr = usdInput.attr
  if (usdInputAttr.isValid()) {
    displayName = String(usdInputAttr.getMetadata('displayName') ?? '')
    displayGroup = String(usdInputAttr.getMetadata('displayGroup') ?? '')
  }

  return new HdMaterialInterfaceParameterSchema.Builder()
    .setDisplayGroup(_TokenDs(displayGroup))
    .setDisplayName(_TokenDs(displayName))
    .setMappings(_GetMappingsDataSource(material, consumerMap, parameterName))
    .build()
}

/** dataSourceMaterial.cpp:193-225 */
class _UsdImagingDataSourceInterfaceParameters extends HdContainerDataSource {
  private readonly _consumerMap: InterfaceInputConsumersMap
  private readonly _consumerMapKeys: string[] = []

  private constructor(private readonly _material: UsdShadeMaterial) {
    super()
    this._consumerMap = this._material.computeInterfaceInputConsumersMap(true)
    for (const name of this._consumerMap.keys()) {
      // The interface parameters are only known by their basenames
      this._consumerMapKeys.push(name)
    }
  }

  static new(material: UsdShadeMaterial): _UsdImagingDataSourceInterfaceParameters {
    return new _UsdImagingDataSourceInterfaceParameters(material)
  }

  getNames(): string[] {
    return this._consumerMapKeys
  }

  Get(name: string): HdDataSourceBase | undefined {
    return _BuildMaterialInterfaceParameter(this._material, this._consumerMap, name)
  }
}

/** dataSourceMaterial.cpp:227-324 */
class _UsdImagingDataSourceShadingNodeParameters extends HdContainerDataSource {
  private constructor(
    private readonly _shaderNode: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
    private readonly _sceneIndexPath: string,
    private readonly _locatorPrefix: HdDataSourceLocator,
  ) { super() }

  static new(
    shaderNode: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
    sceneIndexPath: string, locatorPrefix: HdDataSourceLocator,
  ): _UsdImagingDataSourceShadingNodeParameters {
    return new _UsdImagingDataSourceShadingNodeParameters(shaderNode, stageGlobals, sceneIndexPath, locatorPrefix)
  }

  getNames(): string[] {
    const result: string[] = []
    const shadeNodeInputs = new UsdShadeNodeGraph(this._shaderNode).getInputs()
    for (const input of shadeNodeInputs) {
      for (const attr of input.getValueProducingAttributes()) {
        const attrType = _GetType(attr.name)
        if (attrType === _UsdShadeAttributeType.Input) {
          // Found at least one
          result.push(input.name)
          // Proceed to next input
          break
        }
      }
    }
    return result
  }

  Get(name: string): HdDataSourceBase | undefined {
    const input = new UsdShadeInput(this._shaderNode, name)
    if (!_GetAttribute(this._shaderNode, input.attrName)) {
      return undefined
    }

    for (const attr of input.getValueProducingAttributes()) {
      const attrType = _GetType(attr.name)
      if (attrType === _UsdShadeAttributeType.Input) {
        // Skip UsdUVTextureNode's inputs:sourceColorSpace as this will
        // be consolidated as the color space on the node's input:file
        // parameter
        if (attr.name === 'inputs:sourceColorSpace') {
          continue
        }
        const paramValueLocator = new HdDataSourceLocator(
          name, HdMaterialNodeParameterSchemaTokens.value)
        return new HdMaterialNodeParameterSchema.Builder()
          .setValue(
            UsdImagingDataSourceAttributeNew(attr, this._stageGlobals,
              this._sceneIndexPath,
              this._locatorPrefix.append(paramValueLocator)))
          .setColorSpace(
            (attr.getRoleName() === 'Color' || attr.typeName === 'asset')
              ? UsdImagingDataSourceAttributeColorSpace.new(attr)
              : undefined)
          .setTypeName(UsdImagingDataSourceAttributeTypeName.new(attr))
          .build()
      }
    }

    // fallback case for requested but unauthored inputs on lights or
    // light filters -- which will not return a value for
    // GetValueProducingAttributes() but can still provide an attr
    if (this._shaderNode.hasAPI('LightAPI') || this._shaderNode.isA('LightFilter')) {
      const paramValueLocator = new HdDataSourceLocator(
        name, HdMaterialNodeParameterSchemaTokens.value)
      return new HdMaterialNodeParameterSchema.Builder()
        .setValue(
          UsdImagingDataSourceAttributeNew(input.attr, this._stageGlobals,
            this._sceneIndexPath,
            this._locatorPrefix.append(paramValueLocator)))
        .build()
    }

    return undefined
  }
}

/** dataSourceMaterial.cpp:326-404 */
class _UsdImagingDataSourceShadingNodeInputs extends HdContainerDataSource {
  private constructor(
    private readonly _shaderNode: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
    private readonly _materialPrefix: string,
  ) { super() }

  static new(
    shaderNode: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals, materialPrefix: string,
  ): _UsdImagingDataSourceShadingNodeInputs {
    return new _UsdImagingDataSourceShadingNodeInputs(shaderNode, stageGlobals, materialPrefix)
  }

  getNames(): string[] {
    const result: string[] = []
    const shadeNodeInputs = new UsdShadeNodeGraph(this._shaderNode).getInputs()
    for (const input of shadeNodeInputs) {
      for (const attr of input.getValueProducingAttributes()) {
        const attrType = _GetType(attr.name)
        if (attrType === _UsdShadeAttributeType.Output) {
          // Found at least one connection on this input
          result.push(input.name)
          // Proceed to next input
          break
        }
      }
    }
    return result
  }

  Get(name: string): HdDataSourceBase | undefined {
    const input = new UsdShadeInput(this._shaderNode, name)
    if (!_GetAttribute(this._shaderNode, input.attrName)) {
      return undefined
    }

    const attrs = input.getValueProducingAttributes(/*shaderOutputsOnly =*/ true)

    if (attrs.length === 0) {
      return undefined
    }

    const elements: HdDataSourceBase[] = []
    for (const attr of attrs) {
      const outputPath = _RelativePath(this._materialPrefix, attr.primPath)
      const outputName = _GetBaseNameAndType(attr.name)[0]

      elements.push(
        new HdMaterialConnectionSchema.Builder()
          .setUpstreamNodePath(_TokenDs(outputPath))
          .setUpstreamNodeOutputName(_TokenDs(outputName))
          .build())
    }

    return HdRetainedSmallVectorDataSource.new(elements)
  }
}

/** dataSourceMaterial.cpp:406-466. T is UsdLuxLightAPI or UsdLuxLightFilter;
 *  shaderIdToken is _GetTypedShaderId() (UsdLuxTokens->lightShaderId or
 *  lightFilterShaderId). */
class _UsdImagingDataSourceRenderContextIdentifiers extends HdContainerDataSource {
  private constructor(
    private readonly _t: UsdLuxLightAPI | UsdLuxLightFilter,
    private readonly _prim: UsdPrim,
    private readonly _shaderIdToken: string,
  ) { super() }

  static new(
    t: UsdLuxLightAPI | UsdLuxLightFilter, prim: UsdPrim, shaderIdToken: string,
  ): _UsdImagingDataSourceRenderContextIdentifiers {
    return new _UsdImagingDataSourceRenderContextIdentifiers(t, prim, shaderIdToken)
  }

  getNames(): string[] {
    const result: string[] = []
    const suffix = `:${this._shaderIdToken}`
    for (const propName of this._prim.getPropertyNames()) {
      if (propName.endsWith(suffix)) {
        result.push(propName.slice(0, propName.length - suffix.length))
      }
    }
    return result
  }

  Get(name: string): HdDataSourceBase | undefined {
    const attr = this._t.getShaderIdAttrForRenderContext(name)
    if (attr && attr.isValid()) {
      const shaderId = attr.get()
      if (typeof shaderId === 'string') {
        return _TokenDs(shaderId)
      }
    }
    return undefined
  }
}

/** dataSourceMaterial.cpp:469-527. Populate the "nodeTypeInfo" of a node
 *  using the "info:" attributes and the meta data (skipping info:id). */
class _UsdImagingNodeTypeInfoSource extends HdContainerDataSource {
  private static readonly _prefix = 'info:'

  private constructor(
    private readonly _shaderNode: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    shaderNode: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): _UsdImagingNodeTypeInfoSource {
    return new _UsdImagingNodeTypeInfoSource(shaderNode, stageGlobals)
  }

  getNames(): string[] {
    const names: string[] = []
    names.push('sdrMetadata')
    // Missing metadata:
    // subIdentifier
    for (const propName of this._shaderNode.getPropertyNames()) {
      if (propName !== 'info:id' &&
          propName.startsWith(_UsdImagingNodeTypeInfoSource._prefix)) {
        names.push(propName.slice(_UsdImagingNodeTypeInfoSource._prefix.length))
      }
    }
    return names
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === 'sdrMetadata') {
      const metadata = _VtDictionaryFromUsdDictionary(this._shaderNode.getMetadata(name))
      return new HdRetainedTypedSampledDataSource(metadata, VtValueTypes.dictionary)
    }

    const attrName = _UsdImagingNodeTypeInfoSource._prefix + name

    const attr = _GetAttribute(this._shaderNode, attrName)
    if (attr) {
      return UsdImagingDataSourceAttributeNew(attr, this._stageGlobals)
    }

    return undefined
  }
}

/** dataSourceMaterial.cpp:529-641 */
class _UsdImagingDataSourceShadingNode extends HdContainerDataSource {
  private constructor(
    private readonly _shaderNode: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
    private readonly _renderContext: string,
    private readonly _sceneIndexPath: string,
    private readonly _locatorPrefix: HdDataSourceLocator,
    private readonly _materialPrefix: string,
  ) { super() }

  static new(
    shaderNode: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
    renderContext: string, sceneIndexPath: string,
    locatorPrefix: HdDataSourceLocator, materialPrefix: string,
  ): _UsdImagingDataSourceShadingNode {
    return new _UsdImagingDataSourceShadingNode(
      shaderNode, stageGlobals, renderContext, sceneIndexPath, locatorPrefix, materialPrefix)
  }

  getNames(): string[] {
    // HdMaterialNodeSchemaTokens->allTokens
    return [
      HdMaterialNodeSchemaTokens.parameters,
      HdMaterialNodeSchemaTokens.inputConnections,
      HdMaterialNodeSchemaTokens.nodeIdentifier,
      HdMaterialNodeSchemaTokens.renderContextNodeIdentifiers,
      HdMaterialNodeSchemaTokens.nodeTypeInfo,
    ]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdMaterialNodeSchemaTokens.nodeIdentifier) {
      let nodeId = ''

      // Type dispatch for GetShaderId()
      // (UsdShadeNodeDefAPI(prim) is valid when the prim has NodeDefAPI,
      // which the Shader schema applies as a built-in API schema.)
      if (this._shaderNode.hasAPI('NodeDefAPI')) {
        // Run this case after the more specialized API's above
        // to avoid the warning in GetImplementationSource()
        // for cases where info:implementationSource does not exist.
        const shaderId = _GetShaderId(this._shaderNode)
        if (shaderId !== undefined) {
          nodeId = shaderId
        } else {
          const sdrNode = _GetShaderNodeForSourceType(this._shaderNode, this._renderContext)
          if (sdrNode) {
            nodeId = sdrNode.getIdentifier()
          }
        }
      } else if (this._shaderNode.isA('LightFilter')) {
        // Light filter
        nodeId = new UsdLuxLightFilter(this._shaderNode).getShaderId([this._renderContext])
      } else if (this._shaderNode.hasAPI('LightAPI')) {
        // Light
        nodeId = new UsdLuxLightAPI(this._shaderNode).getShaderId([this._renderContext])
      } else if (this._shaderNode.isA('NodeGraph')) {
        // Shader graph
        nodeId = ''
      }

      return _TokenDs(nodeId)
    }

    if (name === HdMaterialNodeSchemaTokens.renderContextNodeIdentifiers) {
      if (this._shaderNode.hasAPI('LightAPI')) {
        return _UsdImagingDataSourceRenderContextIdentifiers.new(
          new UsdLuxLightAPI(this._shaderNode), this._shaderNode, 'light:shaderId')
      }
      if (this._shaderNode.isA('LightFilter')) {
        return _UsdImagingDataSourceRenderContextIdentifiers.new(
          new UsdLuxLightFilter(this._shaderNode), this._shaderNode, 'lightFilter:shaderId')
      }
      return undefined
    }

    if (name === HdMaterialNodeSchemaTokens.nodeTypeInfo) {
      // UsdShadeShader::GetImplementationSource
      if (_GetImplementationSource(this._shaderNode) !== 'id') {
        return _UsdImagingNodeTypeInfoSource.new(this._shaderNode, this._stageGlobals)
      }
      return undefined
    }

    if (name === HdMaterialNodeSchemaTokens.parameters) {
      const nodeName = _RelativePath(this._materialPrefix, this._shaderNode.path)
      return _UsdImagingDataSourceShadingNodeParameters.new(
        this._shaderNode, this._stageGlobals, this._sceneIndexPath,
        this._locatorPrefix.IsEmpty()
          ? this._locatorPrefix
          : this._locatorPrefix
            .append(nodeName)
            .append(HdMaterialNodeSchemaTokens.parameters))
    }

    if (name === HdMaterialNodeSchemaTokens.inputConnections) {
      return _UsdImagingDataSourceShadingNodeInputs.new(
        this._shaderNode, this._stageGlobals, this._materialPrefix)
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourceMaterial.h:22-52. A data source mapping for data source
 *  material. Creates HdMaterialSchema from a UsdShadeMaterial prim. */
export class UsdImagingDataSourceMaterial extends HdContainerDataSource {
  /** dataSourceMaterial.cpp:648-656. If fixedTerminalName is specified, the
   *  provided usdPrim will be treated as the terminal shader node in the
   *  graph rather than as a material (with relationships to the prims
   *  serving as terminal shader nodes). This is relevant for light and light
   *  filter cases. */
  private constructor(
    private readonly _usdPrim: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
    private readonly _fixedTerminalName: string = '',
  ) { super() }

  static new(
    usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals, fixedTerminalName = '',
  ): UsdImagingDataSourceMaterial {
    return new UsdImagingDataSourceMaterial(usdPrim, stageGlobals, fixedTerminalName)
  }

  /** dataSourceMaterial.cpp:662-688 */
  getNames(): string[] {
    if (this._fixedTerminalName !== '') {
      // Fixed terminal materials require scanning the nodes for
      // shaderId attributes providing a renderContext.
      return _CollectRenderContextsFromNodeIdentifiers(this._usdPrim, this._fixedTerminalName)
    }

    const renderContexts: string[] = []
    for (const output of new UsdShadeNodeGraph(this._usdPrim).getOutputs()) {
      const renderContext = _GetRenderContextForShaderOutput(output)
      // Only add a renderContext if it has not been added before so
      // we do not have duplicates (there may be multiple outputs for
      // the same renderContext).
      if (!_Contains(renderContexts, renderContext)) {
        renderContexts.push(renderContext)
      }
    }

    // Always add the 'all' render context
    // This context is provided to support tools that want to
    // show every node, including disconnected ones.
    renderContexts.push(HdMaterialSchemaTokens.all)

    return renderContexts
  }

  /** dataSourceMaterial.cpp:1041-1067 */
  Get(name: string): HdDataSourceBase | undefined {
    // sceneIndexPath and dataSourceLocator are sent along so that discovery
    // of time-varying shader parameters are managed for the hydra material
    // prim and not individual USD shader prims.
    if (this._fixedTerminalName === '') {
      return _BuildMaterial(
        this._usdPrim, this._stageGlobals, name,
        this._usdPrim.path,
        HdMaterialSchema.getDefaultLocator().append(name))
    } else {
      // For fixed terminals, only build a network
      // for render contexts that the prim explicitly supports.
      if (!_Contains(
        _CollectRenderContextsFromNodeIdentifiers(this._usdPrim, this._fixedTerminalName), name)) {
        return undefined
      }
      return _BuildNetwork(
        this._usdPrim,
        this._fixedTerminalName, this._stageGlobals, name,
        this._usdPrim.path,
        HdMaterialSchema.getDefaultLocator().append(name))
    }
  }
}

type _TokenDataSourceMap = Map<string, HdDataSourceBase>

/** dataSourceMaterial.cpp:693-739 */
function _WalkGraph(
  shadeNode: UsdPrim | undefined,
  outputNodes: _TokenDataSourceMap,
  stageGlobals: UsdImagingDataSourceStageGlobals,
  renderContext: string,
  sceneIndexPath: string,
  locatorPrefix: HdDataSourceLocator,
  materialPrefix = '',
): void {
  if (!shadeNode || !shadeNode.isValid()) {
    return
  }

  // Check if path is incorrect
  const nodePath = shadeNode.path
  if (nodePath === '') {
    return
  }

  const nodeName = _RelativePath(materialPrefix, nodePath)
  if (outputNodes.has(nodeName)) {
    return
  }

  const nodeValue = _UsdImagingDataSourceShadingNode.new(
    shadeNode, stageGlobals, renderContext, sceneIndexPath,
    locatorPrefix, materialPrefix)

  outputNodes.set(nodeName, nodeValue)

  // Visit inputs of this node to ensure they are emitted first.
  for (const input of new UsdShadeNodeGraph(shadeNode).getInputs()) {
    for (const attr of input.getValueProducingAttributes(/*shaderOutputsOnly =*/ true)) {
      _WalkGraph(
        _GetPrim(attr),
        outputNodes,
        stageGlobals,
        renderContext,
        sceneIndexPath,
        locatorPrefix,
        materialPrefix)
    }
  }
}

/** dataSourceMaterial.cpp:741-763 */
function _GetParameterOrder(material: UsdShadeMaterial): string[] {
  const parameterOrder: string[] = []

  // UsdPrim::GetPropertyOrder: the propertyOrder metadata.
  const propertyOrder = material.prim.getMetadata('propertyOrder')
  for (const propertyName of Array.isArray(propertyOrder) ? propertyOrder as string[] : []) {
    // We only need to transmit inputs (and only their basename too)
    const [baseName, attrType] = _GetBaseNameAndType(propertyName)

    if (attrType !== _UsdShadeAttributeType.Input) {
      continue
    }

    parameterOrder.push(baseName)
  }

  return parameterOrder
}

/** dataSourceMaterial.cpp:765-772 */
function _GetParameterOrderDataSource(material: UsdShadeMaterial): HdTokenArrayDataSource {
  // HdRetainedTypedSampledDataSource<VtTokenArray>: the VtArray keeps the
  // TfToken element type.
  return HdRetainedTypedSampledDataSource.new(
    new VtArray(_GetParameterOrder(material), VtValueTypes.token)) as unknown as HdTokenArrayDataSource
}

/** dataSourceMaterial.cpp:774-785 */
function _BuildMaterialInterface(material: UsdShadeMaterial): HdContainerDataSource {
  return new HdMaterialInterfaceSchema.Builder()
    .setParameters(_UsdImagingDataSourceInterfaceParameters.new(material))
    .setParameterOrder(_GetParameterOrderDataSource(material))
    .build()
}

/** dataSourceMaterial.cpp:787-851 */
function _BuildNetwork(
  terminalNode: UsdPrim,
  terminalName: string,
  stageGlobals: UsdImagingDataSourceStageGlobals,
  renderContext: string,
  sceneIndexPath: string,
  locatorPrefix: HdDataSourceLocator,
): HdDataSourceBase | undefined {
  const nodeDataSources: _TokenDataSourceMap = new Map()
  _WalkGraph(terminalNode,
    nodeDataSources,
    stageGlobals,
    renderContext,
    sceneIndexPath,
    locatorPrefix.IsEmpty()
      ? locatorPrefix
      : locatorPrefix.append(HdMaterialNetworkSchemaTokens.nodes))

  // No nodes found for this renderContext.
  if (nodeDataSources.size === 0) {
    return undefined
  }

  const nodeNames: string[] = []
  const nodeValues: HdDataSourceBase[] = []
  for (const [name, ds] of nodeDataSources) {
    nodeNames.push(name)
    nodeValues.push(ds)
  }

  const terminalsDs = HdRetainedContainerDataSource.new(
    [terminalName],
    [new HdMaterialConnectionSchema.Builder()
      .setUpstreamNodePath(_TokenDs(terminalNode.path))
      .setUpstreamNodeOutputName(_TokenDs(terminalName))
      .build()])

  const nodesDs = HdRetainedContainerDataSource.new(nodeNames, nodeValues)

  // for capture in the HdLazyContainerDataSource
  const material = new UsdShadeMaterial(terminalNode)

  return new HdMaterialNetworkSchema.Builder()
    .setNodes(nodesDs)
    .setTerminals(terminalsDs)
    .setInterface(
      HdLazyContainerDataSource.new(() => _BuildMaterialInterface(material)))
    .build()
}

/** dataSourceMaterial.cpp:853-874. Returns the prim of the computed source
 *  (UsdShadeMaterial::Compute*Source returns a UsdShadeShader, invalid when
 *  there is none). */
function _ComputeOutputSource(
  usdMat: UsdPrim,
  outputName: string,
  renderContext: readonly string[],
  sourceInfo: _ConnectionSourceInfo,
): UsdPrim | undefined {
  const stage = usdMat.getStage()
  let source = null
  if (outputName === HdMaterialSchemaTokens.surface) {
    source = UsdShadeMaterial.computeSurfaceSource(stage, usdMat.path, renderContext)
  } else if (outputName === HdMaterialSchemaTokens.displacement) {
    source = UsdShadeMaterial.computeDisplacementSource(stage, usdMat.path, renderContext)
  } else if (outputName === HdMaterialSchemaTokens.volume) {
    source = UsdShadeMaterial.computeVolumeSource(stage, usdMat.path, renderContext)
  } else {
    return sourceInfo.source
  }
  return source ? stage.getPrim(source.primPath) : undefined
}

/** dataSourceMaterial.cpp:876-1039 */
function _BuildMaterial(
  usdMat: UsdPrim,
  stageGlobals: UsdImagingDataSourceStageGlobals,
  renderContext: string,
  sceneIndexPath: string,
  locatorPrefix: HdDataSourceLocator,
): HdDataSourceBase | undefined {
  const terminalsNames: string[] = []
  const terminalsValues: HdDataSourceBase[] = []
  const nodeNames: string[] = []
  const nodeValues: HdDataSourceBase[] = []

  // Strip the material path prefix from all node names.
  // This makes the network more concise to read, as well
  // as enables the potential to detect duplication as
  // the same network appears under different scene models.
  const materialPrefix = usdMat.path

  const nodeDataSources: _TokenDataSourceMap = new Map()
  for (const output of new UsdShadeNodeGraph(usdMat).getOutputs()) {
    // When building a material for a render context other than 'all' skip
    // terminals from other contexts.
    if (renderContext !== HdMaterialSchemaTokens.all) {
      if (_GetRenderContextForShaderOutput(output) !== renderContext) {
        continue
      }
    }

    // E.g. "ri:surface"
    let outputName = output.name

    // When building a material for the 'all' render context do not strip
    // the render context string from the output name, so that outputs for
    // different render contexts can coexist.
    if (renderContext !== HdMaterialSchemaTokens.all && renderContext !== '') {
      // Skip the renderContext and subsequent ':'
      outputName = outputName.slice(renderContext.length + 1)
    }

    for (const sourceInfo of _GetConnectedSources(output.attr)) {
      if (!_IsValidSourceInfo(sourceInfo)) {
        continue
      }

      const upstreamShader = _ComputeOutputSource(
        usdMat, outputName, [renderContext], sourceInfo)

      const nodesLocatorPrefix = locatorPrefix.IsEmpty()
        ? locatorPrefix
        : locatorPrefix.append(HdMaterialNetworkSchemaTokens.nodes)

      if (renderContext === HdMaterialSchemaTokens.all) {
        // When building a material for the 'all' render context
        // create data sources for every shader prim underneath it,
        // even if they are not connected to a terminal.
        for (const child of usdMat.getDescendants()) {
          // UsdShadeShader(child) is valid for prims that are Shaders.
          if (!child.isA('Shader')) {
            continue
          }

          const nodePath = child.path
          const nodeName = _RelativePath(materialPrefix, nodePath)
          const nodeValue = _UsdImagingDataSourceShadingNode.new(
            child, stageGlobals, renderContext,
            sceneIndexPath, nodesLocatorPrefix, materialPrefix)
          // std::unordered_map::insert keeps the existing entry.
          if (!nodeDataSources.has(nodeName)) {
            nodeDataSources.set(nodeName, nodeValue)
          }
        }
      } else {
        // Walk the graph starting from an output and only include
        // nodes that are connected to it.
        _WalkGraph(upstreamShader,
          nodeDataSources,
          stageGlobals,
          renderContext,
          sceneIndexPath,
          nodesLocatorPrefix,
          materialPrefix)
      }

      terminalsNames.push(outputName)

      // Strip materialPrefix.
      const upstreamPath = _RelativePath(materialPrefix, upstreamShader?.path ?? '')

      terminalsValues.push(
        new HdMaterialConnectionSchema.Builder()
          .setUpstreamNodePath(_TokenDs(upstreamPath))
          .setUpstreamNodeOutputName(_TokenDs(sourceInfo.sourceName))
          .build())
    }
  }

  if (terminalsNames.length === 0) {
    return undefined
  }

  const terminalsDs = HdRetainedContainerDataSource.new(terminalsNames, terminalsValues)

  for (const [name, ds] of nodeDataSources) {
    nodeNames.push(name)
    nodeValues.push(ds)
  }

  // Collect any 'config' on the Material prim
  const names: string[] = []
  const values: HdDataSourceBase[] = []
  for (const prop of usdMat.getPropertiesInNamespace(UsdImagingTokens.configPrefix)) {
    // prop.As<UsdAttribute>()
    if (!prop.isValid() || prop.isRelationship) {
      continue
    }

    // SdfPath::StripPrefixNamespace(name, "config:")
    const name = prop.name
    names.push(name.startsWith(UsdImagingTokens.configPrefix)
      ? name.slice(UsdImagingTokens.configPrefix.length) : name)

    // VtValue value; attr.Get(&value);
    // HdCreateTypedRetainedDataSource(value)
    const value = _UsdImagingVtValueFromUsdValue(prop.get(), prop.typeName)
    values.push(new HdRetainedTypedSampledDataSource(
      value.IsEmpty() ? undefined : value.UncheckedGet<unknown>(), value.getType()))
  }

  const nodesDs = HdRetainedContainerDataSource.new(nodeNames, nodeValues)

  const configDefaultContext = HdRetainedContainerDataSource.new(names, values)

  return new HdMaterialNetworkSchema.Builder()
    .setNodes(nodesDs)
    .setTerminals(terminalsDs)
    .setConfig(configDefaultContext)
    .setInterface(_BuildMaterialInterface(new UsdShadeMaterial(usdMat)))
    .build()
}

/** dataSourceMaterial.h:55-87. A prim data source mapping for a
 *  UsdShadeMaterial prim. */
export class UsdImagingDataSourceMaterialPrim extends UsdImagingDataSourcePrim {
  /** dataSourceMaterial.cpp:1069-1075 */
  protected constructor(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super(sceneIndexPath, usdPrim, stageGlobals) }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceMaterialPrim {
    return new UsdImagingDataSourceMaterialPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourceMaterial.cpp:1079-1085 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdMaterialSchema.getSchemaToken())
    return result
  }

  /** dataSourceMaterial.cpp:1087-1096 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdMaterialSchema.getSchemaToken()) {
      return UsdImagingDataSourceMaterial.new(
        this._getUsdPrim(),
        this._getStageGlobals())
    }
    return super.Get(name)
  }

  /** dataSourceMaterial.cpp:1098-1126 */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const result = UsdImagingDataSourcePrim.invalidate(
      prim, subprim, properties, invalidationType)

    if (subprim === '') {
      // UsdShadeMaterial(prim)
      if (prim.isA('Material')) {
        // Public interface values changes
        for (const propertyName of properties) {
          // UsdShadeInput::IsInterfaceInputName
          if (propertyName.startsWith('inputs:')) {
            // TODO, invalidate specifically connected node parameters.
            // FOR NOW: just dirty the whole material.

            result.insert(HdMaterialSchema.getDefaultLocator())
            break
          }
        }
      }
    }
    return result
  }
}

