// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdsi/nodeIdentifierResolvingSceneIndex.cpp,
//  pxr/imaging/hdsi/nodeIdentifierResolvingSceneIndex.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hdsi/nodeIdentifierResolvingSceneIndex.{h,cpp}.
//
// Value convention: HdMaterialNetworkInterface.GetNodeTypeInfoValue returns
// either a VtValue or the typed value held by the data source (see
// pxr/imaging/hd/src/materialNetworkInterface.ts). _GetNodeTypeInfo below is
// the VtValue::GetWithDefault<T> of the upstream helper: it unwraps a VtValue
// and yields the default when the value does not hold a T.

import { TfStringify } from 'typescript-usd/tf'
import type { Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes, Dictionary as VtDictionary } from 'typescript-usd/vt'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { Registry as SdrRegistry } from 'typescript-usd/sdr'
import type { ShaderNode as SdrShaderNode } from 'typescript-usd/sdr'
import { MaterialFilteringSceneIndexBase as HdMaterialFilteringSceneIndexBase } from 'typescript-usd/hd'
import type {
  MaterialFilteringSceneIndexBaseFilteringFnc as FilteringFnc,
  MaterialNetworkInterface as HdMaterialNetworkInterface,
  SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'

// nodeIdentifierResolvingSceneIndex.cpp:18-25
const _tokens = {
  implementationSource: 'implementationSource',
  sourceCode: 'sourceCode',
  sourceAsset: 'sourceAsset',
  sourceAssetSubIdentifier: 'sourceAsset:subIdentifier',
  sdrMetadata: 'sdrMetadata',
} as const

/** The C++ template argument T of _GetNodeTypeInfo<T>. */
type _ValueKind = 'token' | 'string' | 'asset' | 'dictionary'

interface _ValueKindTypes {
  token: string
  string: string
  asset: SdfAssetPath
  dictionary: VtDictionary
}

const _defaults: { [K in _ValueKind]: () => _ValueKindTypes[K] } = {
  token: () => '',
  string: () => '',
  asset: () => new SdfAssetPath(''),
  dictionary: () => new VtDictionary(),
}

// VtValue::GetWithDefault<T>() over this port's value convention.
function _GetWithDefault<K extends _ValueKind>(value: unknown, kind: K): _ValueKindTypes[K] {
  let held = value
  if (value instanceof VtValue) {
    if (value.IsEmpty()) {
      return _defaults[kind]()
    }
    // TfToken and std::string are distinct held types upstream.
    if (kind === 'token' && !value.IsHolding(VtValueTypes.token)) {
      return _defaults[kind]()
    }
    if (kind === 'string' && !value.IsHolding(VtValueTypes.string)) {
      return _defaults[kind]()
    }
    held = value.Get<unknown>()
  }
  switch (kind) {
    case 'token':
    case 'string':
      return (typeof held === 'string' ? held : _defaults[kind]()) as _ValueKindTypes[K]
    case 'asset':
      return (held instanceof SdfAssetPath ? held : _defaults[kind]()) as _ValueKindTypes[K]
    case 'dictionary':
      return (held instanceof VtDictionary ? held : _defaults[kind]()) as _ValueKindTypes[K]
  }
  return _defaults[kind]()
}

/** nodeIdentifierResolvingSceneIndex.cpp:28-40 */
function _GetNodeTypeInfo<K extends _ValueKind>(
  interface_: HdMaterialNetworkInterface,
  nodeName: TfToken | string,
  key: TfToken | string,
  kind: K,
): _ValueKindTypes[K] {
  return _GetWithDefault(
    interface_
      .getNodeTypeInfoValue(nodeName, key),
    kind)
}

/** nodeIdentifierResolvingSceneIndex.cpp:42-52 */
function _GetNodeTypeInfoForSourceType<K extends _ValueKind>(
  interface_: HdMaterialNetworkInterface,
  nodeName: TfToken | string,
  sourceType: TfToken | string,
  key: TfToken | string,
  kind: K,
): _ValueKindTypes[K] {
  const fullKey = sourceType + ':' + key
  return _GetNodeTypeInfo(interface_, nodeName, fullKey, kind)
}

/** nodeIdentifierResolvingSceneIndex.cpp:54-62 */
function _ToSdrTokenMap(d: VtDictionary): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of d) {
    // TfStringify(VtValue) streams the held value.
    result[key] = TfStringify(value.IsEmpty() ? '' : value.Get<unknown>())
  }
  return result
}

/** nodeIdentifierResolvingSceneIndex.cpp:64-84 */
function _GetSdrShaderNodeFromSourceAsset(
  interface_: HdMaterialNetworkInterface,
  nodeName: TfToken | string,
  sourceType: TfToken | string,
): SdrShaderNode | undefined {
  const shaderAsset =
    _GetNodeTypeInfoForSourceType(
      interface_, nodeName, sourceType, _tokens.sourceAsset, 'asset')

  const metadata =
    _ToSdrTokenMap(
      _GetNodeTypeInfo(
        interface_, nodeName, _tokens.sdrMetadata, 'dictionary'))
  const subIdentifier =
    _GetNodeTypeInfoForSourceType(
      interface_, nodeName, sourceType, _tokens.sourceAssetSubIdentifier, 'token')
  return SdrRegistry.getInstance().getShaderNodeFromAsset(
    shaderAsset, metadata, subIdentifier, sourceType)
}

/** nodeIdentifierResolvingSceneIndex.cpp:86-107 */
function _GetSdrShaderNodeFromSourceCode(
  interface_: HdMaterialNetworkInterface,
  nodeName: TfToken | string,
  sourceType: TfToken | string,
): SdrShaderNode | undefined {
  const sourceCode =
    _GetNodeTypeInfoForSourceType(
      interface_, nodeName, sourceType, _tokens.sourceCode, 'string')

  if (sourceCode === '') {
    return undefined
  }
  const metadata =
    _ToSdrTokenMap(
      _GetNodeTypeInfo(
        interface_, nodeName, _tokens.sdrMetadata, 'dictionary'))

  return SdrRegistry.getInstance().getShaderNodeFromSourceCode(
    sourceCode, sourceType, metadata)
}

/** nodeIdentifierResolvingSceneIndex.cpp:109-126 */
function _GetSdrShaderNode(
  interface_: HdMaterialNetworkInterface,
  nodeName: TfToken | string,
  sourceType: TfToken | string,
): SdrShaderNode | undefined {
  const implementationSource =
    _GetNodeTypeInfo(
      interface_, nodeName, _tokens.implementationSource, 'token')

  if (implementationSource === _tokens.sourceAsset) {
    return _GetSdrShaderNodeFromSourceAsset(interface_, nodeName, sourceType)
  }
  if (implementationSource === _tokens.sourceCode) {
    return _GetSdrShaderNodeFromSourceCode(interface_, nodeName, sourceType)
  }
  return undefined
}

/** nodeIdentifierResolvingSceneIndex.cpp:128-142 */
function _SetNodeTypeFromSourceAssetInfo(
  interface_: HdMaterialNetworkInterface,
  nodeName: TfToken | string,
  sourceType: TfToken | string,
): void {
  if (interface_.getNodeType(nodeName) !== '') {
    return
  }

  const sdrNode = _GetSdrShaderNode(interface_, nodeName, sourceType)
  if (sdrNode) {
    interface_.setNodeType(nodeName, sdrNode.getIdentifier())
  }
}

/** nodeIdentifierResolvingSceneIndex.cpp:144-150 */
function _SetNodeTypesFromSourceAssetInfo(
  sourceType: TfToken | string,
  interface_: HdMaterialNetworkInterface,
): void {
  for (const nodeName of interface_.getNodeNames()) {
    _SetNodeTypeFromSourceAssetInfo(interface_, nodeName, sourceType)
  }
}

/**
 * Scene index that converts the <sourceType>:sourceAsset info into a
 * nodeType (nodeIdentifier).
 *
 * (nodeIdentifierResolvingSceneIndex.h:18-48)
 */
export class HdSiNodeIdentifierResolvingSceneIndex extends HdMaterialFilteringSceneIndexBase {
  private readonly _sourceType: TfToken | string

  /**
   * Construct a new instance of HdSiNodeIdentifierResolvingSceneIndex.
   * `sourceType` indicates the type of the shader's source or its
   * implementation, e.g. OSL, glslfx, riCpp etc. . .
   * See also: UsdShadeNodeDefAPI for more details about sourceType.
   * (nodeIdentifierResolvingSceneIndex.cpp:155-163)
   */
  static new(
    inputSceneIndex: HdSceneIndexBase,
    sourceType: TfToken | string,
  ): HdSiNodeIdentifierResolvingSceneIndex {
    return new HdSiNodeIdentifierResolvingSceneIndex(inputSceneIndex, sourceType)
  }

  /** nodeIdentifierResolvingSceneIndex.cpp:165-171 */
  private constructor(
    inputSceneIndex: HdSceneIndexBase,
    sourceType: TfToken | string,
  ) {
    super(inputSceneIndex)
    this._sourceType = sourceType
    this.setDisplayName(`HdSiNodeIdentifierResolvingSceneIndex (${sourceType})`)
  }

  /** nodeIdentifierResolvingSceneIndex.cpp:177-183 */
  protected _getFilteringFunction(): FilteringFnc {
    const sourceType = this._sourceType
    return (interface_: HdMaterialNetworkInterface) =>
      _SetNodeTypesFromSourceAssetInfo(sourceType, interface_)
  }
}
