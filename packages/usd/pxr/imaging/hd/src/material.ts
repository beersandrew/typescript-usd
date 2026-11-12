// Ported from OpenUSD 26.11.1: pxr/imaging/hd/material.cpp,
//  pxr/imaging/hd/material.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/material.h — the plain HdMaterialNetworkMap data
// structures (HdMaterialRelationship / HdMaterialNode / HdMaterialNetwork /
// HdMaterialNetworkMap). The conversion to the schema-shaped container data
// source lives in utils.ts (HdUtils), as upstream.

import { RaiseWarning, Type as TfType } from 'typescript-usd/tf'
import { HdCompareFunction } from './enums.ts'
import { HdBorderColor, HdMagFilter, HdMinFilter, HdSamplerParameters, HdWrap } from './types.ts'

// A connection between two material nodes: inputId.inputName -> outputId.outputName.
export interface HdMaterialRelationship {
  inputId: string
  inputName: string
  outputId: string
  outputName: string
}

// A single shading node.
export class HdMaterialNode {
  path = ''
  identifier = ''
  parameters: Map<string, unknown> = new Map()
}

// One network: a list of nodes plus the relationships connecting them
// (material.h:100-110).
export class HdMaterialNetwork {
  relationships: HdMaterialRelationship[] = []
  nodes: HdMaterialNode[] = []
  primvars: string[] = []
}

// A set of networks keyed by terminal name, plus a config dictionary
// (material.h:112-120).
export class HdMaterialNetworkMap {
  map: Map<string, HdMaterialNetwork> = new Map()
  terminals: string[] = []
  config: Map<string, unknown> = new Map()

  /** The copy constructor (VtValue holds a copy, vt/src/value.ts
   *  copyHeldValue). Parameter values are shared, as VtValues are
   *  immutable once held. */
  Clone(): HdMaterialNetworkMap {
    const c = new HdMaterialNetworkMap()
    for (const [name, network] of this.map) {
      const n = new HdMaterialNetwork()
      n.relationships = network.relationships.map((r) => ({ ...r }))
      n.nodes = network.nodes.map((node) => {
        const m = new HdMaterialNode()
        m.path = node.path
        m.identifier = node.identifier
        m.parameters = new Map(node.parameters)
        return m
      })
      n.primvars = [...network.primvars]
      c.map.set(name, n)
    }
    c.terminals = [...this.terminals]
    c.config = new Map(this.config)
    return c
  }
}

// ---- HdMaterialNetwork2 (material.h:122-180, material.cpp:51-114) ----
//
// Parameter values are the node's parameter values as given (VtValue in
// the scene delegates that author them; upstream: VtValue). std::map's
// sorted iteration is kept where a consumer iterates: nodes and
// inputConnections are Maps sorted by key on conversion.

/** material.h:131-145 */
export interface HdMaterialConnection2 {
  upstreamNode: string
  upstreamOutputName: string
}

/** material.h:147-158 */
export class HdMaterialNode2 {
  nodeTypeId = ''
  parameters: Map<string, unknown> = new Map()
  inputConnections: Map<string, HdMaterialConnection2[]> = new Map()

  /** The copy a VtValue makes of a held node (its copy constructor). */
  Clone(): HdMaterialNode2 {
    const copy = new HdMaterialNode2()
    copy.nodeTypeId = this.nodeTypeId
    copy.parameters = new Map(this.parameters)
    copy.inputConnections = new Map([...this.inputConnections].map(([k, v]) => [k, v.map(c => ({ ...c }))]))
    return copy
  }
}

/** The TfType a VtValue holding an HdMaterialNode2 carries (VtValue's
 *  typeid of HdMaterialNode2 upstream). */
export const HdMaterialNode2Type = TfType.define('HdMaterialNode2')

/** material.h:160-177 */
export class HdMaterialNetwork2 {
  nodes: Map<string, HdMaterialNode2> = new Map()
  terminals: Map<string, HdMaterialConnection2> = new Map()
  primvars: string[] = []
  config: Map<string, unknown> = new Map()
}

function _SortedMap<V>(m: Map<string, V>): Map<string, V> {
  return new Map([...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/** material.cpp:51-114. Converts a HdMaterialNetworkMap to a
 *  HdMaterialNetwork2; `isVolume.value` is set when the volume terminal
 *  has nodes. */
export function HdConvertToHdMaterialNetwork2(
  hdNetworkMap: HdMaterialNetworkMap,
  isVolume?: { value: boolean },
): HdMaterialNetwork2 {
  const result = new HdMaterialNetwork2()

  for (const [terminalName, hdNetwork] of _SortedMap(hdNetworkMap.map)) {
    // Check if there are nodes associated with the volume terminal
    // This value is used in Storm to get the proper glslfx fragment shader
    if (terminalName === 'volume' && isVolume) {
      isVolume.value = hdNetwork.nodes.length !== 0
    }

    // Transfer over individual nodes.
    // Note that the same nodes may be shared by multiple terminals.
    // We simply overwrite them here.
    if (hdNetwork.nodes.length === 0) {
      continue
    }
    for (const node of hdNetwork.nodes) {
      let materialNode2 = result.nodes.get(node.path)
      if (!materialNode2) {
        materialNode2 = new HdMaterialNode2()
        result.nodes.set(node.path, materialNode2)
      }
      materialNode2.nodeTypeId = node.identifier
      materialNode2.parameters = _SortedMap(new Map(node.parameters))
    }
    // Assume that the last entry is the terminal
    result.terminals.set(terminalName, {
      upstreamNode: hdNetwork.nodes[hdNetwork.nodes.length - 1]!.path,
      upstreamOutputName: '',
    })

    // Transfer relationships to inputConnections on receiving/downstream nodes.
    for (const rel of hdNetwork.relationships) {
      // outputId (in hdMaterial terms) is the input of the receiving node
      const iter = result.nodes.get(rel.outputId)

      // skip connection if the destination node doesn't exist
      if (!iter) {
        continue
      }

      let conns = iter.inputConnections.get(rel.outputName)
      if (!conns) {
        conns = []
        iter.inputConnections.set(rel.outputName, conns)
        iter.inputConnections = _SortedMap(iter.inputConnections)
      }
      const conn = { upstreamNode: rel.inputId, upstreamOutputName: rel.inputName }

      // skip connection if it already exists (it may be shared
      // between surface and displacement)
      if (!conns.some((c) => c.upstreamNode === conn.upstreamNode &&
        c.upstreamOutputName === conn.upstreamOutputName)) {
        conns.push(conn)
      }
    }

    // Transfer primvars:
    result.primvars = [...hdNetwork.primvars]
  }
  result.nodes = _SortedMap(result.nodes)

  // Transfer config dictionary
  result.config = hdNetworkMap.config

  return result
}

// ---- HdGetSamplerParameters (material.h:186-204, material.cpp:116-311) ----

/** The parts of SdrShaderNode HdGetSamplerParameters reads. */
interface _SdrNodeForSamplerParameters {
  getShaderInput(name: string): { getDefaultValue(): unknown } | undefined
}

/** A token value held by a parameter (VtValue holding TfToken, or a bare
 *  string). */
function _TokenOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'IsHolding' in value && 'Get' in value) {
    const v = value as unknown as { getTypeName(): string, Get<T>(): T }
    const typeName = v.getTypeName()
    if (typeName === 'token' || typeName === 'TfToken') return v.Get<string>()
  }
  return undefined
}

/** material.cpp:116-147 _ResolveParameter<TfToken> */
function _ResolveTokenParameter(
  parameters: ReadonlyMap<string, unknown>,
  sdrNode: _SdrNodeForSamplerParameters | null,
  name: string,
  defaultValue: string,
): string {
  // First consult parameters...
  const it = parameters.get(name)
  if (it !== undefined) {
    const value = _TokenOf(it)
    if (value !== undefined) {
      return value
    }
  }

  // Then fallback to SdrNode.
  if (sdrNode) {
    const input = sdrNode.getShaderInput(name)
    if (input) {
      const value = _TokenOf(input.getDefaultValue())
      if (value !== undefined) {
        return value
      }
    }
  }

  return defaultValue
}

/** material.cpp:149-193 */
function _ResolveWrapSamplerParameter(
  nodeTypeId: string,
  parameters: ReadonlyMap<string, unknown>,
  sdrNode: _SdrNodeForSamplerParameters | null,
  nodePath: string,
  name: string,
): HdWrap {
  const value = _ResolveTokenParameter(parameters, sdrNode, name, 'useMetadata')

  if (value === 'repeat') {
    return HdWrap.HdWrapRepeat
  }

  if (value === 'mirror') {
    return HdWrap.HdWrapMirror
  }

  if (value === 'clamp') {
    return HdWrap.HdWrapClamp
  }

  if (value === 'black') {
    return HdWrap.HdWrapBlack
  }

  if (value === 'useMetadata') {
    if (nodeTypeId === 'HwUvTexture_1') {
      return HdWrap.HdWrapLegacy
    }
    return HdWrap.HdWrapUseMetadata
  }

  if (nodePath !== '') {
    RaiseWarning(`Unknown wrap mode on prim ${nodePath}: ${value}`)
  } else {
    RaiseWarning(`Unknown wrap mode: ${value}`)
  }

  return HdWrap.HdWrapUseMetadata
}

/** material.cpp:195-242 */
function _ResolveMinSamplerParameter(
  parameters: ReadonlyMap<string, unknown>,
  sdrNode: _SdrNodeForSamplerParameters | null,
): HdMinFilter {
  // Using linearMipmapLinear as fallback value.
  const value = _ResolveTokenParameter(parameters, sdrNode, 'minFilter',
    'linearMipmapLinear')

  switch (value) {
    case 'nearest': return HdMinFilter.HdMinFilterNearest
    case 'linear': return HdMinFilter.HdMinFilterLinear
    case 'nearestMipmapNearest': return HdMinFilter.HdMinFilterNearestMipmapNearest
    case 'nearestMipmapLinear': return HdMinFilter.HdMinFilterNearestMipmapLinear
    case 'linearMipmapNearest': return HdMinFilter.HdMinFilterLinearMipmapNearest
    case 'linearMipmapLinear': return HdMinFilter.HdMinFilterLinearMipmapLinear
  }

  return HdMinFilter.HdMinFilterLinearMipmapLinear
}

/** material.cpp:244-259 */
function _ResolveMagSamplerParameter(
  parameters: ReadonlyMap<string, unknown>,
  sdrNode: _SdrNodeForSamplerParameters | null,
): HdMagFilter {
  const value = _ResolveTokenParameter(parameters, sdrNode, 'magFilter', 'linear')

  if (value === 'nearest') {
    return HdMagFilter.HdMagFilterNearest
  }

  return HdMagFilter.HdMagFilterLinear
}

/** material.cpp:261-282, 284-295 HdGetSamplerParameters(node, sdrNode,
 *  nodePath) and 297-309 (nodeTypeId, parameters, nodePath). Extracts
 *  HdSamplerParameters from the parameters on the node if present.
 *  Otherwise extracts the sampler parameters from the SdrNode. */
export function HdGetSamplerParameters(
  node: HdMaterialNode2 | { nodeTypeId: string, parameters: ReadonlyMap<string, unknown> },
  sdrNode: _SdrNodeForSamplerParameters | null = null,
  nodePath = '',
): HdSamplerParameters {
  return new HdSamplerParameters(
    _ResolveWrapSamplerParameter(node.nodeTypeId, node.parameters, sdrNode, nodePath, 'wrapS'),
    _ResolveWrapSamplerParameter(node.nodeTypeId, node.parameters, sdrNode, nodePath, 'wrapT'),
    _ResolveWrapSamplerParameter(node.nodeTypeId, node.parameters, sdrNode, nodePath, 'wrapR'),
    _ResolveMinSamplerParameter(node.parameters, sdrNode),
    _ResolveMagSamplerParameter(node.parameters, sdrNode),
    HdBorderColor.HdBorderColorTransparentBlack,
    /*enableCompare*/false,
    HdCompareFunction.HdCmpFuncNever,
    /*maxAnisotropy*/16)
}
