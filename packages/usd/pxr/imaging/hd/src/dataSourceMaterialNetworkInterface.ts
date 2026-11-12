// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/dataSourceMaterialNetworkInterface.cpp,
//  pxr/imaging/hd/dataSourceMaterialNetworkInterface.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hd/dataSourceMaterialNetworkInterface.{h,cpp}.
//
// Value convention: see materialNetworkInterface.ts (`undefined` stands for
// an empty VtValue). Upstream keys its override map by HdDataSourceLocator;
// this port keys it by the locator's elements joined with NUL and keeps the
// locator beside the data source.

import type { Token as TfToken } from 'typescript-usd/tf'
import { HdContainerDataSourceEditor } from './containerDataSourceEditor.ts'
import {
  HdContainerDataSource,
  HdRetainedContainerDataSource,
  HdRetainedSmallVectorDataSource,
  HdRetainedTypedSampledDataSource,
  HdSampledDataSource,
  HdTypedSampledDataSource,
  HdVectorDataSource,
  type HdDataSourceBase,
} from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdMaterialConnectionSchema } from './materialConnectionSchema.ts'
import type {
  HdMaterialNetworkInterface,
  HdMaterialNetworkInterfaceInputConnection,
  HdMaterialNetworkInterfaceInputConnectionResult,
  HdMaterialNetworkInterfaceInputConnectionVector,
  HdMaterialNetworkInterfaceNodeParamData,
} from './materialNetworkInterface.ts'
import { HdMaterialNetworkSchema, HdMaterialNetworkSchemaTokens } from './materialNetworkSchema.ts'
import { HdMaterialNodeParameterSchema } from './materialNodeParameterSchema.ts'
import { HdMaterialNodeSchema, HdMaterialNodeSchemaTokens } from './materialNodeSchema.ts'
import {
  HdMaterialConnectionVectorContainerSchema,
  HdMaterialConnectionVectorSchema,
  HdMaterialNodeContainerSchema,
  HdMaterialNodeParameterContainerSchema,
} from './schemaTypeDefs.ts'

// dataSourceMaterialNetworkInterface.cpp:16-21
// See note in GetModelAssetName()
const _tokens = {
  model: 'model',
  assetName: 'assetName',
} as const

function _LocatorKey(loc: HdDataSourceLocator): string {
  const elements: string[] = []
  for (let i = 0; i < loc.getElementCount(); ++i) elements.push(loc.getElement(i))
  return elements.join('\0')
}

// HdTypedSampledDataSource<TfToken>::Cast: a typed sampled data source whose
// value is a token (a string in this port).
function _CastToTokenDataSource(
  ds: HdDataSourceBase | undefined,
): HdTypedSampledDataSource<string> | undefined {
  if (ds instanceof HdTypedSampledDataSource && typeof ds.getTypedValue(0) === 'string') {
    return ds as HdTypedSampledDataSource<string>
  }
  return undefined
}

interface _OverrideEntry {
  locator: HdDataSourceLocator
  ds: HdDataSourceBase | undefined
}

/**
 * Implements HdMaterialNetworkInterface for reading from and overriding
 * values within data sources. Overrides are managed internally via an
 * HdContainerDataSourceEditor. Calling Finish returns the resulting
 * container data resource representing an individual material network. If
 * nothing is overriden, the input data source is returned.
 *
 * (dataSourceMaterialNetworkInterface.h:21-216)
 */
export class HdDataSourceMaterialNetworkInterface implements HdMaterialNetworkInterface {
  private readonly _materialPrimPath: string
  private readonly _networkSchema: HdMaterialNetworkSchema
  private readonly _networkEditor: HdContainerDataSourceEditor
  private readonly _nodeTypeInfoOverrides = new Map<string, HdContainerDataSourceEditor>()
  private readonly _primContainer: HdContainerDataSource | undefined
  private readonly _existingOverrides = new Map<string, _OverrideEntry>()
  private readonly _overriddenNodes = new Set<string>()
  private readonly _deletedNodes = new Set<string>()
  private _terminalsOverridden = false

  // cache some common child containers to avoid repeated access
  private _nodesSchema = new HdMaterialNodeContainerSchema(undefined)
  private _lastAccessedNodeName = ''
  private _lastAccessedNodeSchema = new HdMaterialNodeSchema(undefined)
  private _lastAccessedNodeParametersSchema = new HdMaterialNodeParameterContainerSchema(undefined)
  private _lastAccessedNodeConnectionsSchema = new HdMaterialConnectionVectorContainerSchema(undefined)

  /** dataSourceMaterialNetworkInterface.h:33-45 */
  constructor(
    materialPrimPath: string,
    networkContainer: HdContainerDataSource | undefined,
    primContainer: HdContainerDataSource | undefined,
  ) {
    this._materialPrimPath = materialPrimPath
    this._networkSchema = new HdMaterialNetworkSchema(networkContainer)
    this._networkEditor = new HdContainerDataSourceEditor(networkContainer)
    this._primContainer = primContainer
  }

  /** dataSourceMaterialNetworkInterface.h:47-50 */
  getMaterialPrimPath(): string {
    return this._materialPrimPath
  }

  /** dataSourceMaterialNetworkInterface.cpp:23-32 */
  getMaterialConfigKeys(): TfToken[] {
    const configDs = this._networkSchema.getConfig()
    if (!configDs.isDefined()) {
      return []
    }

    return configDs.getNames()
  }

  /** dataSourceMaterialNetworkInterface.cpp:34-49 */
  getMaterialConfigValue(key: TfToken | string): unknown {
    const configDs = this._networkSchema.getConfig()
    if (!configDs.isDefined()) {
      return undefined
    }

    const keyDs = configDs.Get(key)
    if (!(keyDs instanceof HdSampledDataSource)) {
      return undefined
    }
    return keyDs.GetValue(0)
  }

  /** dataSourceMaterialNetworkInterface.cpp:51-66 */
  getModelAssetName(): string {
    // XXX If the model schema moves from UsdImaging back to HdModelSchema
    // in the future, we could use that here.
    if (this._primContainer) {
      const modelDs = this._primContainer.Get(_tokens.model)
      if (modelDs instanceof HdContainerDataSource) {
        const assetNameDs = _CastToTokenDataSource(modelDs.Get(_tokens.assetName))
        if (assetNameDs) {
          return assetNameDs.getTypedValue(0)
        }
      }
    }
    return ''
  }

  /** dataSourceMaterialNetworkInterface.cpp:68-92 */
  private _resetIfNecessaryAndGetNode(nodeName: TfToken | string): HdMaterialNodeSchema {
    if (this._deletedNodes.has(nodeName)) {
      return new HdMaterialNodeSchema(undefined)
    }

    if (nodeName === this._lastAccessedNodeName) {
      return this._lastAccessedNodeSchema
    }

    if (!this._nodesSchema.isDefined()) {
      this._nodesSchema = this._networkSchema.getNodes()
    }

    this._lastAccessedNodeName = nodeName
    this._lastAccessedNodeSchema = this._nodesSchema.Get(nodeName)
    this._lastAccessedNodeParametersSchema =
      new HdMaterialNodeParameterContainerSchema(undefined)
    this._lastAccessedNodeConnectionsSchema =
      new HdMaterialConnectionVectorContainerSchema(undefined)

    return this._lastAccessedNodeSchema
  }

  /** dataSourceMaterialNetworkInterface.cpp:94-106 */
  private _getNodeParameters(nodeName: TfToken | string): HdMaterialNodeParameterContainerSchema {
    const node = this._resetIfNecessaryAndGetNode(nodeName)
    if (this._lastAccessedNodeParametersSchema.isDefined()) {
      return this._lastAccessedNodeParametersSchema
    }

    this._lastAccessedNodeParametersSchema = node.getParameters()

    return this._lastAccessedNodeParametersSchema
  }

  /** dataSourceMaterialNetworkInterface.cpp:108-120 */
  private _getNodeConnections(nodeName: TfToken | string): HdMaterialConnectionVectorContainerSchema {
    const node = this._resetIfNecessaryAndGetNode(nodeName)
    if (this._lastAccessedNodeConnectionsSchema.isDefined()) {
      return this._lastAccessedNodeConnectionsSchema
    }

    this._lastAccessedNodeConnectionsSchema = node.getInputConnections()

    return this._lastAccessedNodeConnectionsSchema
  }

  /** dataSourceMaterialNetworkInterface.cpp:122-142 */
  private _setOverride(loc: HdDataSourceLocator, ds: HdDataSourceBase | undefined): void {
    this._networkEditor.Set(loc, ds)
    this._existingOverrides.set(_LocatorKey(loc), { locator: loc, ds })

    const nodesLocator = new HdDataSourceLocator(HdMaterialNetworkSchemaTokens.nodes)

    const terminalsLocator = new HdDataSourceLocator(HdMaterialNetworkSchemaTokens.terminals)

    if (loc.intersects(nodesLocator) && loc.getElementCount() > 1) {
      this._overriddenNodes.add(loc.getElement(1))
      this._deletedNodes.delete(loc.getElement(1))
    } else if (loc.intersects(terminalsLocator)) {
      this._terminalsOverridden = true
    }
  }

  private _findOverride(loc: HdDataSourceLocator): _OverrideEntry | undefined {
    return this._existingOverrides.get(_LocatorKey(loc))
  }

  /** dataSourceMaterialNetworkInterface.cpp:144-165 */
  getNodeNames(): TfToken[] {
    if (!this._nodesSchema.isDefined()) {
      this._nodesSchema = this._networkSchema.getNodes()
    }

    let result = this._nodesSchema.getNames()

    if (this._deletedNodes.size > 0) {
      const nameSet = new Set<TfToken>(result)
      for (const deletedName of this._deletedNodes) {
        nameSet.delete(deletedName as TfToken)
      }

      result = [...nameSet]
    }

    return result
  }

  /** dataSourceMaterialNetworkInterface.cpp:167-193 */
  getNodeType(nodeName: TfToken | string): TfToken | string {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.nodeIdentifier)

    const it = this._findOverride(locator)
    if (it) {
      const ds = _CastToTokenDataSource(it.ds)
      if (ds) {
        return ds.getTypedValue(0)
      } else {
        // if not a token, it's deleted.
        return ''
      }
    }

    const idDs = this._resetIfNecessaryAndGetNode(nodeName).getNodeIdentifier()
    if (idDs) {
      return idDs.getTypedValue(0)
    }

    return ''
  }

  /** dataSourceMaterialNetworkInterface.cpp:195-200 */
  private _getOriginalNodeTypeInfo(nodeName: TfToken | string): HdContainerDataSource | undefined {
    return this._resetIfNecessaryAndGetNode(nodeName).getNodeTypeInfo()
  }

  /** dataSourceMaterialNetworkInterface.cpp:202-221 */
  private _getNodeTypeInfo(nodeName: TfToken | string): HdContainerDataSource | undefined {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.nodeTypeInfo)

    // Look for overridden NodeTypeInfo first.

    const it = this._findOverride(locator)
    if (it) {
      // Found an override, return it.
      return it.ds instanceof HdContainerDataSource ? it.ds : undefined
    }

    // No override, return the original, if any.
    return this._getOriginalNodeTypeInfo(nodeName)
  }

  /** dataSourceMaterialNetworkInterface.cpp:223-232 */
  getNodeTypeInfoKeys(nodeName: TfToken | string): TfToken[] {
    const nodeTypeInfo = this._getNodeTypeInfo(nodeName)
    if (!nodeTypeInfo) {
      return []
    }
    return nodeTypeInfo.getNames() as TfToken[]
  }

  /** dataSourceMaterialNetworkInterface.cpp:234-248 */
  getNodeTypeInfoValue(nodeName: TfToken | string, key: TfToken | string): unknown {
    const nodeTypeInfo = this._getNodeTypeInfo(nodeName)
    if (!nodeTypeInfo) {
      return undefined
    }
    const ds = nodeTypeInfo.Get(key)
    if (!(ds instanceof HdSampledDataSource)) {
      return undefined
    }
    return ds.GetValue(0)
  }

  /** dataSourceMaterialNetworkInterface.cpp:250-280 */
  getAuthoredNodeParameterNames(nodeName: TfToken | string): TfToken[] {
    let result = this._getNodeParameters(nodeName).getNames()

    if (this._overriddenNodes.has(nodeName)) {
      const paramsLocator = new HdDataSourceLocator(
        HdMaterialNetworkSchemaTokens.nodes,
        nodeName,
        HdMaterialNodeSchemaTokens.parameters)

      const nameSet = new Set<TfToken>(result)
      for (const locDsPair of this._existingOverrides.values()) {
        // anything with this prefix will have at least 4 elements
        if (locDsPair.locator.hasPrefix(paramsLocator)) {
          if (locDsPair.ds) {
            nameSet.add(locDsPair.locator.getElement(3) as TfToken)
          } else {
            nameSet.delete(locDsPair.locator.getElement(3) as TfToken)
          }
        }
      }

      result = [...nameSet]
    }

    return result
  }

  /** dataSourceMaterialNetworkInterface.cpp:282-315 */
  getNodeParameterValue(nodeName: TfToken | string, paramName: TfToken | string): unknown {
    // check overrides for existing value
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.parameters,
      paramName)

    const it = this._findOverride(locator)
    if (it) {
      const param = it.ds instanceof HdContainerDataSource ? it.ds : undefined
      const paramSchema = new HdMaterialNodeParameterSchema(param)
      if (paramSchema.isDefined()) {
        const paramValueDS = paramSchema.GetValue()
        if (paramValueDS) {
          return paramValueDS.GetValue(0)
        }
      }
      // overridden with nullptr data source means deletion
      return undefined
    }

    const paramValueDS = this._getNodeParameters(nodeName).Get(paramName).GetValue()
    if (paramValueDS) {
      return paramValueDS.GetValue(0)
    }

    return undefined
  }

  /** dataSourceMaterialNetworkInterface.cpp:317-371 */
  getNodeParameterData(
    nodeName: TfToken | string, paramName: TfToken | string,
  ): HdMaterialNetworkInterfaceNodeParamData {
    // check overrides for existing value
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.parameters,
      paramName)

    const paramData: HdMaterialNetworkInterfaceNodeParamData = {
      value: undefined, colorSpace: '', typeName: '',
    }
    const it = this._findOverride(locator)
    if (it) {
      const param = it.ds instanceof HdContainerDataSource ? it.ds : undefined
      const pSchema = new HdMaterialNodeParameterSchema(param)
      if (pSchema.isDefined()) {
        const paramValueDS = pSchema.GetValue()
        if (paramValueDS) {
          paramData.value = paramValueDS.GetValue(0)
        }
        const colorSpaceDS = pSchema.getColorSpace()
        if (colorSpaceDS) {
          paramData.colorSpace = colorSpaceDS.getTypedValue(0)
        }
        const typeNameDS = pSchema.getTypeName()
        if (typeNameDS) {
          paramData.typeName = typeNameDS.getTypedValue(0)
        }
        return paramData
      }
      // overridden with nullptr data source means deletion
      return paramData
    }

    const pSchema = this._getNodeParameters(nodeName).Get(paramName)
    if (pSchema.isDefined()) {
      // Value
      const paramValueDS = pSchema.GetValue()
      if (paramValueDS) {
        paramData.value = paramValueDS.GetValue(0)
      }
      // ColorSpace
      const colorSpaceDS = pSchema.getColorSpace()
      if (colorSpaceDS) {
        paramData.colorSpace = colorSpaceDS.getTypedValue(0)
      }
      // TypeName
      const typeNameDS = pSchema.getTypeName()
      if (typeNameDS) {
        paramData.typeName = typeNameDS.getTypedValue(0)
      }
    }

    return paramData
  }

  /** dataSourceMaterialNetworkInterface.cpp:373-403 */
  getNodeInputConnectionNames(nodeName: TfToken | string): TfToken[] {
    let result = this._getNodeConnections(nodeName).getNames()

    if (this._overriddenNodes.has(nodeName)) {
      const inputsLocator = new HdDataSourceLocator(
        HdMaterialNetworkSchemaTokens.nodes,
        nodeName,
        HdMaterialNodeSchemaTokens.inputConnections)

      const nameSet = new Set<TfToken>(result)
      for (const locDsPair of this._existingOverrides.values()) {
        // anything with this prefix will have at least 4 elements
        if (locDsPair.locator.hasPrefix(inputsLocator)) {
          if (locDsPair.ds) {
            nameSet.add(locDsPair.locator.getElement(3) as TfToken)
          } else {
            nameSet.delete(locDsPair.locator.getElement(3) as TfToken)
          }
        }
      }

      result = [...nameSet]
    }

    return result
  }

  /** dataSourceMaterialNetworkInterface.cpp:405-452 */
  getNodeInputConnection(
    nodeName: TfToken | string, inputName: TfToken | string,
  ): HdMaterialNetworkInterfaceInputConnectionVector {
    // check overrides for existing value
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.inputConnections,
      inputName)

    let connectionVectorDs: HdVectorDataSource | undefined
    const it = this._findOverride(locator)
    if (it) {
      if (it.ds instanceof HdVectorDataSource) {
        connectionVectorDs = it.ds
      } else {
        // overridden with nullptr means deletion
        return []
      }
    }

    const vectorSchema = connectionVectorDs
      ? new HdMaterialConnectionVectorSchema(connectionVectorDs)
      : this._getNodeConnections(nodeName).Get(inputName)

    const n = vectorSchema.getNumElements()
    const result: HdMaterialNetworkInterfaceInputConnectionVector = []
    for (let i = 0; i < n; ++i) {
      const schema = vectorSchema.getElement(i)
      if (schema.isDefined()) {
        const nodeNameDs = schema.getUpstreamNodePath()
        const outputNameDs = schema.getUpstreamNodeOutputName()
        if (nodeNameDs && outputNameDs) {
          result.push({
            upstreamNodeName: nodeNameDs.getTypedValue(0),
            upstreamOutputName: outputNameDs.getTypedValue(0),
          })
        }
      }
    }

    return result
  }

  /** dataSourceMaterialNetworkInterface.cpp:454-464 */
  deleteNode(nodeName: TfToken | string): void {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName)

    this._networkEditor.Set(locator, undefined)
    this._deletedNodes.add(nodeName)
    this._nodeTypeInfoOverrides.delete(nodeName)
  }

  /** Set the nodeType for the shader node with the given `nodeName`.
   * If `nodeType` is empty then the nodeType attribute will be removed
   * from the node's dataSource. (dataSourceMaterialNetworkInterface.cpp:466-485) */
  setNodeType(nodeName: TfToken | string, nodeType: TfToken | string): void {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.nodeIdentifier)

    if (nodeType === '') {
      // An empty TfToken removes the nodeType data entirely
      this._setOverride(locator, undefined)
    } else {
      const ds = HdRetainedTypedSampledDataSource.new(nodeType)

      this._setOverride(locator, ds)
    }
  }

  /** dataSourceMaterialNetworkInterface.cpp:487-523 */
  setNodeTypeInfoValue(nodeName: TfToken | string, key: TfToken | string, value: unknown): void {
    // Find an existing editor for this node's nodeTypeInfo data source
    // or construct a new one.
    let ntEditor = this._nodeTypeInfoOverrides.get(nodeName)

    if (!ntEditor) {
      let container = this._getOriginalNodeTypeInfo(nodeName)
      if (!container) {
        // The node never had a nodeTypeInfo data source.
        // Construct a new one to pass to the editor.
        container = HdRetainedContainerDataSource.new([], [])
      }
      // Construct and store a new nodeTypeInfo editor.
      ntEditor = new HdContainerDataSourceEditor(container)
      this._nodeTypeInfoOverrides.set(nodeName, ntEditor)
    }

    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.nodeTypeInfo)

    ntEditor.Set(new HdDataSourceLocator(key),
      HdRetainedTypedSampledDataSource.new(value))
    this._setOverride(locator, ntEditor.finish())
  }

  /** dataSourceMaterialNetworkInterface.cpp:525-542 */
  setNodeParameterValue(nodeName: TfToken | string, paramName: TfToken | string, value: unknown): void {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.parameters,
      paramName)

    const ds = new HdMaterialNodeParameterSchema.Builder()
      .setValue(HdRetainedTypedSampledDataSource.new(value))
      .build()
    this._setOverride(locator, ds)
  }

  /** dataSourceMaterialNetworkInterface.cpp:544-572 */
  setNodeParameterData(
    nodeName: TfToken | string, paramName: TfToken | string,
    paramData: HdMaterialNetworkInterfaceNodeParamData,
  ): void {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.parameters,
      paramName)

    const ds = new HdMaterialNodeParameterSchema.Builder()
      .setValue(
        HdRetainedTypedSampledDataSource.new(paramData.value))
      .setColorSpace(
        paramData.colorSpace === ''
          ? undefined /* colorSpace */
          : HdRetainedTypedSampledDataSource.new<string>(paramData.colorSpace))
      .setTypeName(
        paramData.typeName === ''
          ? undefined /* typeName */
          : HdRetainedTypedSampledDataSource.new<string>(paramData.typeName))
      .build()
    this._setOverride(locator, ds)
  }

  /** dataSourceMaterialNetworkInterface.cpp:574-586 */
  deleteNodeParameter(nodeName: TfToken | string, paramName: TfToken | string): void {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.parameters,
      paramName)

    this._setOverride(locator, undefined)
  }

  /** dataSourceMaterialNetworkInterface.cpp:588-615 */
  setNodeInputConnection(
    nodeName: TfToken | string, inputName: TfToken | string,
    connections: HdMaterialNetworkInterfaceInputConnectionVector,
  ): void {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.inputConnections,
      inputName)

    const groups: HdDataSourceBase[] = []

    for (const c of connections) {
      groups.push(new HdMaterialConnectionSchema.Builder()
        .setUpstreamNodePath(HdRetainedTypedSampledDataSource.new<string>(c.upstreamNodeName))
        .setUpstreamNodeOutputName(HdRetainedTypedSampledDataSource.new<string>(c.upstreamOutputName))
        .build())
    }

    const ds = HdRetainedSmallVectorDataSource.new(groups)
    this._setOverride(locator, ds)
  }

  /** dataSourceMaterialNetworkInterface.cpp:617-629 */
  deleteNodeInputConnection(nodeName: TfToken | string, inputName: TfToken | string): void {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.nodes,
      nodeName,
      HdMaterialNodeSchemaTokens.inputConnections,
      inputName)

    this._setOverride(locator, undefined)
  }

  /** dataSourceMaterialNetworkInterface.cpp:631-658 */
  getTerminalNames(): TfToken[] {
    let result = this._networkSchema.getTerminals().getNames()

    if (this._terminalsOverridden) {
      const terminalsLocator = new HdDataSourceLocator(HdMaterialNetworkSchemaTokens.terminals)

      const nameSet = new Set<TfToken>(result)
      for (const locDsPair of this._existingOverrides.values()) {
        // anything with this prefix will have at least 2 elements
        if (locDsPair.locator.hasPrefix(terminalsLocator)) {
          if (locDsPair.ds) {
            nameSet.add(locDsPair.locator.getElement(1) as TfToken)
          } else {
            nameSet.delete(locDsPair.locator.getElement(1) as TfToken)
          }
        }
      }

      result = [...nameSet]
    }

    return result
  }

  /** dataSourceMaterialNetworkInterface.cpp:660-705 */
  getTerminalConnection(terminalName: TfToken | string): HdMaterialNetworkInterfaceInputConnectionResult {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.terminals,
      terminalName)

    let container: HdContainerDataSource | undefined

    const it = this._findOverride(locator)
    if (it) {
      container = it.ds instanceof HdContainerDataSource ? it.ds : undefined

      // If it's set but still isn't a container then it's been deleted
      if (!container) {
        return [false, { upstreamNodeName: '', upstreamOutputName: '' }]
      }
    }

    const connectionSchema = container
      ? new HdMaterialConnectionSchema(container)
      : this._networkSchema.getTerminals().Get(terminalName)

    if (connectionSchema.isDefined()) {
      const result: HdMaterialNetworkInterfaceInputConnectionResult =
        [true, { upstreamNodeName: '', upstreamOutputName: '' }]

      const nodeDs = connectionSchema.getUpstreamNodePath()
      if (nodeDs) {
        result[1].upstreamNodeName = nodeDs.getTypedValue(0)
      } else {
        result[0] = false
      }

      // output name is optional for a terminal
      const outputDs = connectionSchema.getUpstreamNodeOutputName()
      if (outputDs) {
        result[1].upstreamOutputName = outputDs.getTypedValue(0)
      }

      return result
    }

    return [false, { upstreamNodeName: '', upstreamOutputName: '' }]
  }

  /** dataSourceMaterialNetworkInterface.cpp:707-716 */
  deleteTerminal(terminalName: TfToken | string): void {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.terminals,
      terminalName)

    this._setOverride(locator, undefined)
  }

  /** dataSourceMaterialNetworkInterface.cpp:718-738 */
  setTerminalConnection(
    terminalName: TfToken | string, connection: HdMaterialNetworkInterfaceInputConnection,
  ): void {
    const locator = new HdDataSourceLocator(
      HdMaterialNetworkSchemaTokens.terminals,
      terminalName)

    const ds = new HdMaterialConnectionSchema.Builder()
      .setUpstreamNodePath(
        HdRetainedTypedSampledDataSource.new<string>(connection.upstreamNodeName))
      .setUpstreamNodeOutputName(
        HdRetainedTypedSampledDataSource.new<string>(connection.upstreamOutputName))
      .build()

    this._setOverride(locator, ds)
  }

  /** dataSourceMaterialNetworkInterface.cpp:740-748 */
  finish(): HdContainerDataSource | undefined {
    if (this._existingOverrides.size === 0) {
      return this._networkSchema.getContainer()
    }

    return this._networkEditor.finish()
  }
}
