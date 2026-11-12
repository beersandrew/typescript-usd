// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialNetwork2Interface.cpp,
//  pxr/imaging/hd/materialNetwork2Interface.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/imaging/hd/materialNetwork2Interface.{h,cpp}.
//
// Divergences (each also noted at its site):
// - Value convention: see materialNetworkInterface.ts (`undefined` stands for
//   an empty VtValue). Parameter and config values are returned as held by
//   the network (a VtValue, or a bare value from callers that store one).
// - HdMaterialNetwork2 (material.ts) holds its nodes, parameters,
//   inputConnections and terminals in JS Maps (insertion order) where
//   upstream holds std::maps; the accessors that enumerate keys sort them
//   as the std::map would iterate them (SdfPath::operator< for node paths,
//   TfToken::operator< -- lexicographic -- for the token-keyed maps).
// - DeleteNode clears the last-accessed node cache; upstream leaves the
//   cached pointer dangling (materialNetwork2Interface.cpp:227-233).

import { Token as TfToken } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Value as VtValue, ValueTypes as VtValueTypes, Dictionary as VtDictionary } from 'typescript-usd/vt'
import { HdMaterialNode2, type HdMaterialConnection2, type HdMaterialNetwork2 } from './material.ts'
import type {
  HdMaterialNetworkInterface,
  HdMaterialNetworkInterfaceInputConnection,
  HdMaterialNetworkInterfaceInputConnectionResult,
  HdMaterialNetworkInterfaceInputConnectionVector,
  HdMaterialNetworkInterfaceNodeParamData,
} from './materialNetworkInterface.ts'

// materialNetwork2Interface.cpp:11-15
const _tokens = {
  colorSpace: 'colorSpace',
  typeName: 'typeName',
} as const

/** std::map<TfToken, ...> iteration order (TfToken::operator<, token.h:300-312:
 *  lexicographic on the token strings). */
function _TokenOrder(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function _SortedTokenKeys(m: ReadonlyMap<string, unknown>): TfToken[] {
  return [...m.keys()].sort(_TokenOrder).map((k) => TfToken(k))
}

/** VtValue::Get<TfToken>() on a parameter value: the held token, or the
 *  empty token when the value holds another type (upstream also posts a
 *  coding error). A bare JS string (no VtValue) is taken as a token. */
function _GetToken(value: unknown): TfToken {
  if (value instanceof VtValue) {
    return value.IsHolding(VtValueTypes.token) ? TfToken(value.Get<string>()) : TfToken.Empty
  }
  return typeof value === 'string' ? TfToken(value) : TfToken.Empty
}

/** The VtDictionary a config value holds, if any. */
function _AsDictionary(value: unknown): VtDictionary | undefined {
  if (value instanceof VtDictionary) return value
  if (value instanceof VtValue && !value.IsEmpty()) {
    const held = value.Get<unknown>()
    if (held instanceof VtDictionary) return held
  }
  return undefined
}

/** materialNetwork2Interface.cpp:60-80 */
function _GetKeysFromVtDictionary(
  dict: Iterable<readonly [string, unknown]>,
  prefix = '',
): TfToken[] {
  const keys: TfToken[] = []
  // VtDictionary iterates in key order (std::map); a config Map is sorted
  // here to match.
  const entries = dict instanceof VtDictionary
    ? [...dict]
    : [...dict].sort(([a], [b]) => _TokenOrder(a, b))
  for (const [first, second] of entries) {
    const key = prefix === '' ? first : prefix + ':' + first
    keys.push(TfToken(key))

    const subDict = _AsDictionary(second)
    if (subDict) {
      const subKeys = _GetKeysFromVtDictionary(subDict, key)
      keys.push(...subKeys)
    }
  }
  return keys
}

/**
 * Implements HdMaterialNetworkInterface interface backed by an
 * HdMaterialNetwork2 -- which is useful for implementing material filtering
 * functions without being tied to the legacy data model.
 *
 * (materialNetwork2Interface.h:17-158)
 */
export class HdMaterialNetwork2Interface implements HdMaterialNetworkInterface {
  private readonly _materialPrimPath: string
  private readonly _materialNetwork: HdMaterialNetwork2 | null
  private _lastAccessedNodeName: string = TfToken.Empty
  private _lastAccessedNode: HdMaterialNode2 | null = null

  /** materialNetwork2Interface.h:25-31 */
  constructor(materialPrimPath: string, materialNetwork: HdMaterialNetwork2 | null) {
    this._materialPrimPath = materialPrimPath
    this._materialNetwork = materialNetwork
  }

  /** materialNetwork2Interface.cpp:17-41 */
  private _getNode(nodeName: TfToken | string): HdMaterialNode2 | null {
    if (!this._materialNetwork) {
      return null
    }

    if (nodeName === this._lastAccessedNodeName) {
      return this._lastAccessedNode
    }

    this._lastAccessedNodeName = nodeName

    const it = this._materialNetwork.nodes.get(nodeName)

    if (it === undefined) {
      this._lastAccessedNode = null
    } else {
      this._lastAccessedNode = it
    }

    return this._lastAccessedNode
  }

  /** materialNetwork2Interface.cpp:43-58 */
  private _getOrCreateNode(nodeName: TfToken | string): HdMaterialNode2 | null {
    const result = this._getNode(nodeName)
    if (result) {
      return result
    }

    if (!this._materialNetwork) {
      return result
    }

    // _materialNetwork->nodes[SdfPath(nodeName)]
    const node = new HdMaterialNode2()
    this._materialNetwork.nodes.set(nodeName, node)
    this._lastAccessedNode = node
    return this._lastAccessedNode
  }

  /** materialNetwork2Interface.h:33-36 */
  getMaterialPrimPath(): string {
    return this._materialPrimPath
  }

  /** materialNetwork2Interface.cpp:82-86 */
  getMaterialConfigKeys(): TfToken[] {
    return _GetKeysFromVtDictionary(this._materialNetwork!.config)
  }

  /** materialNetwork2Interface.cpp:88-96 */
  getMaterialConfigValue(key: TfToken | string): unknown {
    const it = this._materialNetwork!.config.get(key)
    if (it !== undefined) {
      return it
    }
    return undefined
  }

  /** materialNetwork2Interface.h:43-46 */
  getModelAssetName(): string {
    return ''
  }

  /** materialNetwork2Interface.cpp:98-110 */
  getNodeNames(): TfToken[] {
    const result: TfToken[] = []
    if (this._materialNetwork) {
      // std::map<SdfPath, HdMaterialNode2> iterates in SdfPath::operator<
      // order.
      const paths = [...this._materialNetwork.nodes.keys()]
        .map((p) => SdfPath.fromString(p))
        .sort(SdfPath.compare)
      for (const path of paths) {
        result.push(TfToken(path.pathString))
      }
    }

    return result
  }

  /** materialNetwork2Interface.cpp:112-120 */
  getNodeType(nodeName: TfToken | string): TfToken {
    const node = this._getNode(nodeName)
    if (node) {
      return TfToken(node.nodeTypeId)
    }

    return TfToken.Empty
  }

  /** materialNetwork2Interface.cpp:122-126 */
  getNodeTypeInfoKeys(_nodeName: TfToken | string): TfToken[] {
    return []
  }

  /** materialNetwork2Interface.cpp:128-133 */
  getNodeTypeInfoValue(_nodeName: TfToken | string, _key: TfToken | string): unknown {
    return undefined
  }

  /** materialNetwork2Interface.cpp:135-147 */
  getAuthoredNodeParameterNames(nodeName: TfToken | string): TfToken[] {
    const node = this._getNode(nodeName)
    if (node) {
      return _SortedTokenKeys(node.parameters)
    }
    return []
  }

  /** materialNetwork2Interface.cpp:149-162 */
  getNodeParameterValue(nodeName: TfToken | string, paramName: TfToken | string): unknown {
    const node = this._getNode(nodeName)
    if (node) {
      const it = node.parameters.get(paramName)
      if (it !== undefined) {
        return it
      }
    }

    return undefined
  }

  /** materialNetwork2Interface.cpp:164-192 */
  getNodeParameterData(
    nodeName: TfToken | string,
    paramName: TfToken | string,
  ): HdMaterialNetworkInterfaceNodeParamData {
    const paramData: HdMaterialNetworkInterfaceNodeParamData = {
      value: undefined,
      colorSpace: TfToken.Empty,
      typeName: TfToken.Empty,
    }
    const node = this._getNode(nodeName)
    if (node) {
      // Value
      const vIt = node.parameters.get(paramName)
      if (vIt !== undefined) {
        paramData.value = vIt
      }
      // ColorSpace
      const colorSpaceParamName = SdfPath.joinIdentifier(_tokens.colorSpace, paramName)
      const csIt = node.parameters.get(colorSpaceParamName)
      if (csIt !== undefined) {
        paramData.colorSpace = _GetToken(csIt)
      }
      // TypeName
      const typeNameParamName = SdfPath.joinIdentifier(_tokens.typeName, paramName)
      const tnIt = node.parameters.get(typeNameParamName)
      if (tnIt !== undefined) {
        paramData.typeName = _GetToken(tnIt)
      }
    }
    return paramData
  }

  /** materialNetwork2Interface.cpp:194-206 */
  getNodeInputConnectionNames(nodeName: TfToken | string): TfToken[] {
    const node = this._getNode(nodeName)
    if (node) {
      return _SortedTokenKeys(node.inputConnections)
    }
    return []
  }

  /** materialNetwork2Interface.cpp:208-225 */
  getNodeInputConnection(
    nodeName: TfToken | string,
    inputName: TfToken | string,
  ): HdMaterialNetworkInterfaceInputConnectionVector {
    const result: HdMaterialNetworkInterfaceInputConnectionVector = []
    const node = this._getNode(nodeName)
    if (node) {
      const it = node.inputConnections.get(inputName)
      if (it !== undefined) {
        for (const c of it) {
          result.push({
            upstreamNodeName: TfToken(c.upstreamNode),
            upstreamOutputName: TfToken(c.upstreamOutputName),
          })
        }
      }
    }
    return result
  }

  /** materialNetwork2Interface.cpp:227-233 */
  deleteNode(nodeName: TfToken | string): void {
    if (this._materialNetwork) {
      this._materialNetwork.nodes.delete(nodeName)
      // Divergence: upstream keeps the (now dangling) cached node pointer;
      // drop the cache so a later access does not see the deleted node.
      if (nodeName === this._lastAccessedNodeName) {
        this._lastAccessedNodeName = TfToken.Empty
        this._lastAccessedNode = null
      }
    }
  }

  /** materialNetwork2Interface.cpp:235-243 */
  setNodeType(nodeName: TfToken | string, nodeType: TfToken | string): void {
    const node = this._getOrCreateNode(nodeName)
    if (node) {
      node.nodeTypeId = nodeType
    }
  }

  /** materialNetwork2Interface.cpp:245-252 */
  setNodeTypeInfoValue(_nodeName: TfToken | string, _key: TfToken | string, _value: unknown): void {
    // no-op
  }

  /** materialNetwork2Interface.cpp:254-263 */
  setNodeParameterValue(nodeName: TfToken | string, paramName: TfToken | string, value: unknown): void {
    const node = this._getOrCreateNode(nodeName)
    if (node) {
      node.parameters.set(paramName, value)
    }
  }

  /** materialNetwork2Interface.cpp:265-288 */
  setNodeParameterData(
    nodeName: TfToken | string,
    paramName: TfToken | string,
    paramData: HdMaterialNetworkInterfaceNodeParamData,
  ): void {
    const node = this._getOrCreateNode(nodeName)
    if (node) {
      // Value
      node.parameters.set(paramName, paramData.value)

      // ColorSpace
      if (paramData.colorSpace !== '') {
        const csParamName = SdfPath.joinIdentifier(_tokens.colorSpace, paramName)
        node.parameters.set(csParamName, VtValue.create(paramData.colorSpace, VtValueTypes.token))
      }
      // TypeName
      if (paramData.typeName !== '') {
        const tnParamName = SdfPath.joinIdentifier(_tokens.typeName, paramName)
        node.parameters.set(tnParamName, VtValue.create(paramData.typeName, VtValueTypes.token))
      }
    }
  }

  /** materialNetwork2Interface.cpp:290-307 */
  deleteNodeParameter(nodeName: TfToken | string, paramName: TfToken | string): void {
    const node = this._getNode(nodeName)
    if (node) {
      node.parameters.delete(paramName)

      // ColorSpace
      const csParamName = SdfPath.joinIdentifier(_tokens.colorSpace, paramName)
      node.parameters.delete(csParamName)
      // TypeName
      const tnParamName = SdfPath.joinIdentifier(_tokens.typeName, paramName)
      node.parameters.delete(tnParamName)
    }
  }

  /** materialNetwork2Interface.cpp:309-324 */
  setNodeInputConnection(
    nodeName: TfToken | string,
    inputName: TfToken | string,
    connections: HdMaterialNetworkInterfaceInputConnectionVector,
  ): void {
    const node = this._getOrCreateNode(nodeName)
    if (node) {
      const connections2: HdMaterialConnection2[] = []
      for (const c of connections) {
        connections2.push({
          upstreamNode: SdfPath.fromString(c.upstreamNodeName).pathString,
          upstreamOutputName: c.upstreamOutputName,
        })
      }
      node.inputConnections.set(inputName, connections2)
    }
  }

  /** materialNetwork2Interface.cpp:326-334 */
  deleteNodeInputConnection(nodeName: TfToken | string, inputName: TfToken | string): void {
    const node = this._getNode(nodeName)
    if (node) {
      node.inputConnections.delete(inputName)
    }
  }

  /** materialNetwork2Interface.cpp:336-348 */
  getTerminalNames(): TfToken[] {
    if (this._materialNetwork) {
      return _SortedTokenKeys(this._materialNetwork.terminals)
    }
    return []
  }

  /** materialNetwork2Interface.cpp:350-364 */
  getTerminalConnection(terminalName: TfToken | string): HdMaterialNetworkInterfaceInputConnectionResult {
    if (this._materialNetwork) {
      const it = this._materialNetwork.terminals.get(terminalName)
      if (it !== undefined) {
        const c = it
        return [true, {
          upstreamNodeName: TfToken(c.upstreamNode),
          upstreamOutputName: TfToken(c.upstreamOutputName),
        }]
      }
    }
    return [false, { upstreamNodeName: TfToken.Empty, upstreamOutputName: TfToken.Empty }]
  }

  /** materialNetwork2Interface.cpp:366-373 */
  deleteTerminal(terminalName: TfToken | string): void {
    if (this._materialNetwork) {
      this._materialNetwork.terminals.delete(terminalName)
    }
  }

  /** materialNetwork2Interface.cpp:375-385 */
  setTerminalConnection(
    terminalName: TfToken | string,
    connection: HdMaterialNetworkInterfaceInputConnection,
  ): void {
    if (this._materialNetwork) {
      this._materialNetwork.terminals.set(terminalName, {
        upstreamNode: SdfPath.fromString(connection.upstreamNodeName).pathString,
        upstreamOutputName: connection.upstreamOutputName,
      })
    }
  }
}

