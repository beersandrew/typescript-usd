// Ported from OpenUSD 26.11.1: pxr/imaging/hd/materialNetwork2Interface.cpp,
//  pxr/imaging/hd/materialNetwork2Interface.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdMaterialNetwork2Interface (pxr/imaging/hd/materialNetwork2Interface.{h,cpp},
// OpenUSD 26.11.1). Upstream has no test of its own for the class; the
// expectations are the reference build's: the capture of
// fixtures/materialNetwork2Interface builds the network below, queries it
// through the interface, mutates it through the interface and queries it
// again (expected.json).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { HdMaterialNetwork2, HdMaterialNode2 } from '../../src/material.ts'
import { HdMaterialNetwork2Interface } from '../../src/materialNetwork2Interface.ts'
import type {
  HdMaterialNetworkInterface,
  HdMaterialNetworkInterfaceInputConnectionVector,
} from '../../src/materialNetworkInterface.ts'

const expected = JSON.parse(readFileSync(
  new URL('fixtures/materialNetwork2Interface/expected.json', import.meta.url), 'utf8')).payload

const _assetType = TfType.declare('SdfAssetPath')
const V = {
  int: (v: number) => VtValue.create(v, VtValueTypes.int),
  float: (v: number) => VtValue.create(v, VtValueTypes.float),
  string: (v: string) => VtValue.create(v, VtValueTypes.string),
  token: (v: string) => VtValue.create(TfToken(v), VtValueTypes.token),
  asset: (p: string) => VtValue.create(new SdfAssetPath(p), _assetType),
  dict: (entries: [string, VtValue][]) => VtValue.createDictionary(new VtDictionary(entries)),
}

// The capture's Val(): VtValue::GetTypeName() and TfStringify of the values
// this network holds (C++ type names; SdfAssetPath streams as @path@, a
// VtDictionary as {'key': value, ...}).
const _cppTypeName: Record<string, string> = { token: 'TfToken' }
function _Stringify(v: VtValue): string {
  const held = v.Get<unknown>()
  if (held instanceof SdfAssetPath) return `@${held.getAssetPath()}@`
  if (held instanceof VtDictionary) {
    return '{' + [...held].map(([k, x]) => `'${k}': ${_Stringify(x)}`).join(', ') + '}'
  }
  return String(held)
}
function Val(v: unknown) {
  if (v === undefined || (v instanceof VtValue && v.IsEmpty())) return { type: 'void', value: '' }
  const value = v as VtValue
  const t = value.getTypeName()
  return { type: _cppTypeName[t] ?? t, value: _Stringify(value) }
}
const Conns = (v: HdMaterialNetworkInterfaceInputConnectionVector) =>
  v.map((c) => [c.upstreamNodeName, c.upstreamOutputName])

/** The capture's Dump() */
function Dump(ni: HdMaterialNetworkInterface) {
  return {
    materialPrimPath: ni.getMaterialPrimPath(),
    modelAssetName: ni.getModelAssetName(),
    configKeys: ni.getMaterialConfigKeys(),
    config: Object.fromEntries(ni.getMaterialConfigKeys().map((k) => [k, Val(ni.getMaterialConfigValue(k))])),
    nodeNames: ni.getNodeNames(),
    nodes: Object.fromEntries(ni.getNodeNames().map((n) => [n, {
      type: ni.getNodeType(n),
      typeInfoKeys: ni.getNodeTypeInfoKeys(n),
      typeInfoValue: Val(ni.getNodeTypeInfoValue(n, 'sourceType')),
      parameterNames: ni.getAuthoredNodeParameterNames(n),
      parameters: Object.fromEntries(ni.getAuthoredNodeParameterNames(n).map((p) => {
        const d = ni.getNodeParameterData(n, p)
        return [p, {
          value: Val(ni.getNodeParameterValue(n, p)),
          data: { value: Val(d.value), colorSpace: d.colorSpace, typeName: d.typeName },
        }]
      })),
      connectionNames: ni.getNodeInputConnectionNames(n),
      connections: Object.fromEntries(ni.getNodeInputConnectionNames(n).map((c) =>
        [c, Conns(ni.getNodeInputConnection(n, c))])),
    }])),
    terminalNames: ni.getTerminalNames(),
    terminals: Object.fromEntries(ni.getTerminalNames().map((t) => {
      const [found, c] = ni.getTerminalConnection(t)
      return [t, [found, c.upstreamNodeName, c.upstreamOutputName]]
    })),
  }
}

/** The capture's main(): the network, inserted in a different order from
 *  the std::map's so the interface's ordering is what is tested. */
function network(): HdMaterialNetwork2 {
  const n = new HdMaterialNetwork2()
  const node = (path: string, typeId: string) => {
    const m = new HdMaterialNode2()
    m.nodeTypeId = typeId
    n.nodes.set(path, m)
    return m
  }
  node('/Mat/b', 'ND_b')
  const a = node('/Mat/A', 'ND_a')
  a.parameters.set('zeta', V.float(0.5))
  a.parameters.set('Alpha', V.int(3))
  a.parameters.set('alpha', V.string('s'))
  a.parameters.set('file', V.asset('tex.png'))
  a.parameters.set('colorSpace:file', V.token('raw'))
  a.parameters.set('typeName:file', V.token('asset'))
  a.inputConnections.set('zIn', [{ upstreamNode: '/Mat/b', upstreamOutputName: 'out' },
    { upstreamNode: '/Mat/Z', upstreamOutputName: 'out2' }])
  a.inputConnections.set('aIn', [{ upstreamNode: '/Mat/a', upstreamOutputName: '' }])
  node('/Mat/Z', 'ND_z')
  const la = node('/Mat/a', 'ND_lower_a')
  la.parameters.set('in', V.int(1))
  la.parameters.set('colorSpace:in', V.string('raw'))
  node('/Mat/A_x', 'ND_a_x')
  node('/Mat/A/child', 'ND_child')
  n.terminals.set('surface', { upstreamNode: '/Mat/A', upstreamOutputName: '' })
  n.terminals.set('displacement', { upstreamNode: '/Mat/Z', upstreamOutputName: 'out' })
  n.config.set('nest', V.dict([['y', V.int(1)], ['x', V.dict([['inner', V.int(2)]])]]))
  n.config.set('mtlx:version', V.string('1.38'))
  n.config.set('b', V.int(1))
  return n
}

describe('HdMaterialNetwork2Interface (native capture)', () => {
  const n = network()
  const ni = new HdMaterialNetwork2Interface('/Mat', n)

  it('queries', () => {
    expect(Dump(ni)).toEqual(expected.before)
  })

  it('queries of missing nodes, parameters, connections, config and terminals', () => {
    expect({
      nodeType: ni.getNodeType('/Mat/Nope'),
      parameterValue: Val(ni.getNodeParameterValue('/Mat/A', 'nope')),
      parameterNames: ni.getAuthoredNodeParameterNames('/Mat/Nope'),
      connection: Conns(ni.getNodeInputConnection('/Mat/A', 'nope')),
      configValue: Val(ni.getMaterialConfigValue('nest:x')),
      terminal: [ni.getTerminalConnection('volume')[0]],
    }).toEqual(expected.missing)
  })

  it('SetNodeType / SetNodeParameterValue / SetNodeParameterData', () => {
    ni.setNodeType('/Mat/New', 'ND_new')
    ni.setNodeParameterValue('/Mat/New2', 'p', V.float(1.5))
    ni.setNodeParameterData('/Mat/A', 'file',
      { value: V.asset('other.png'), colorSpace: 'srgb_texture', typeName: '' })
    ni.setNodeParameterData('/Mat/b', 'q', { value: V.int(2), colorSpace: '', typeName: 'int' })
    expect(Dump(ni)).toEqual(expected.afterSet)
  })

  it('deletions, connections and terminals', () => {
    ni.setNodeTypeInfoValue('/Mat/A', 'sourceType', V.token('mtlx'))
    ni.deleteNodeParameter('/Mat/A', 'zeta')
    ni.deleteNodeParameter('/Mat/A', 'file')
    ni.setNodeInputConnection('/Mat/b', 'in', [{ upstreamNodeName: '/Mat/a', upstreamOutputName: 'out' }])
    ni.deleteNodeInputConnection('/Mat/A', 'aIn')
    ni.deleteNode('/Mat/Z')
    ni.setTerminalConnection('volume', { upstreamNodeName: '/Mat/New', upstreamOutputName: 'out' })
    ni.deleteTerminal('displacement')
    expect(Dump(ni)).toEqual(expected.after)
  })
})
