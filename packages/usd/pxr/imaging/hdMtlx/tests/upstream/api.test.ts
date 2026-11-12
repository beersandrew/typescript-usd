// Ported from OpenUSD 26.11.1: pxr/imaging/hdMtlx/hdMtlx.cpp,
//  pxr/imaging/hdMtlx/hdMtlx.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The hdMtlx API (pxr/imaging/hdMtlx/hdMtlx.{h,cpp}, OpenUSD 26.11.1) against
// the reference build: fixtures/api/api.json and fixtures/api/*.mtlx are
// written by the capture in fixtures/api (FIXTURES.md). Each
// value/network below is the one the capture builds, with VtValues of the
// same types.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { writeToXmlString } from '@mtlx/format'
import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  Matrix3d as GfMatrix3d,
  Matrix4d as GfMatrix4d,
  Vec2f as GfVec2f,
  Vec3d as GfVec3d,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { NodeDef } from '@mtlx/core'
import { HdMaterialNetwork2, HdMaterialNode2 } from '../../../hd/src/material.ts'
import { HdMaterialNetwork2Interface } from '../../../hd/src/materialNetwork2Interface.ts'
import {
  HdMtlxConvertToString,
  HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface,
  HdMtlxCreateMtlxDocumentFromHdNetwork,
  HdMtlxGetMxTerminalName,
  HdMtlxGetNodeDef,
  HdMtlxGetNodeDefName,
  HdMtlxGetPrimvarDefaultInputName,
  HdMtlxGetPrimvarNameInputName,
  HdMtlxIsPrimvarReaderNodeDef,
  HdMtlxStdLibraries,
  HdMtlxTexturePrimvarData,
} from '../../src/hdMtlx.ts'

const fixtures = new URL('fixtures/api/', import.meta.url)
const fixture = (name: string) => readFileSync(new URL(name, fixtures), 'utf8')
const expected = JSON.parse(fixture('api.json')).payload

const _assetType = TfType.declare('SdfAssetPath')
const V = {
  bool: (v: boolean) => VtValue.create(v, VtValueTypes.bool),
  int: (v: number) => VtValue.create(v, VtValueTypes.int),
  float: (v: number) => VtValue.create(Math.fround(v), VtValueTypes.float),
  double: (v: number) => VtValue.create(v, VtValueTypes.double),
  string: (v: string) => VtValue.create(v, VtValueTypes.string),
  token: (v: string) => VtValue.create(TfToken(v), VtValueTypes.token),
  asset: (p: string, resolved?: string) =>
    VtValue.create(resolved === undefined ? new SdfAssetPath(p) : new SdfAssetPath(p, resolved), _assetType),
  vec2f: (...v: [number, number]) => VtValue.create(new GfVec2f(...v), VtValueTypes.GfVec2f),
  vec3f: (...v: [number, number, number]) => VtValue.create(new GfVec3f(...v), VtValueTypes.GfVec3f),
  vec4f: (...v: [number, number, number, number]) => VtValue.create(new GfVec4f(...v), VtValueTypes.GfVec4f),
}

/** The capture's main(): the HdMtlxConvertToString inputs. */
const convertInputs: Record<string, unknown> = {
  bool_true: V.bool(true),
  bool_false: V.bool(false),
  int_0: V.int(0),
  int_7: V.int(7),
  int_neg: V.int(-42),
  int_large: V.int(123456789),
  float_quarter: V.float(0.25),
  float_tenth: V.float(0.1),
  float_third: V.float(Math.fround(1) / Math.fround(3)),
  float_tiny: V.float(1e-7),
  float_large: V.float(1234567.0),
  float_2p24: V.float(16777216.0),
  float_neg: V.float(-2.5),
  float_one: V.float(1.0),
  vec2f: V.vec2f(0.1, 1234567.0),
  vec3f: V.vec3f(0.2, 0.4, 0.6),
  vec3f_mixed: V.vec3f(Math.fround(Math.fround(1) / Math.fround(3)), 1e-5, 100000.0),
  vec4f: V.vec4f(1.0, 0.5, 0.25, 1e7),
  matrix3d: VtValue.create(new GfMatrix3d(1.5, 1.0 / 3.0, 0, 0, 1, 0, 2e-5, 1234567, -1), VtValueTypes.GfMatrix3d),
  matrix4d_identity: VtValue.create(new GfMatrix4d(1), VtValueTypes.GfMatrix4d),
  matrix4d: VtValue.create(new GfMatrix4d(1, 2, 3, 4, 0.1, 0.2, 0.3, 0.4,
    1.0 / 3.0, 1e-7, 1e7, -0.5, 10, 20, 30, 1), VtValueTypes.GfMatrix4d),
  asset: V.asset('textures/wood.png'),
  asset_resolved: V.asset('wood.png', '/abs/wood.png'),
  string: V.string('hello world'),
  token: V.token('srgb_texture'),
  unsupported_double: V.double(0.5),
  unsupported_vec3d: VtValue.create(new GfVec3d(1, 2, 3), VtValueTypes.GfVec3d),
  empty: VtValue.getEmpty(),
}

/** The capture's PreviewNetwork() */
function previewNetwork(): HdMaterialNetwork2 {
  const n = new HdMaterialNetwork2()
  const node = (path: string, typeId: string): HdMaterialNode2 => {
    const m = new HdMaterialNode2()
    m.nodeTypeId = typeId
    n.nodes.set(path, m)
    return m
  }
  const s = node('/Mat/PreviewSurface', 'ND_UsdPreviewSurface_surfaceshader')
  s.parameters.set('roughness', V.float(0.4))
  s.parameters.set('useSpecularWorkflow', V.int(1))
  s.parameters.set('emissiveColor', V.vec3f(0.1, 0.2, 0.3))
  s.inputConnections.set('diffuseColor', [{ upstreamNode: '/Mat/Tex', upstreamOutputName: 'rgb' }])
  s.inputConnections.set('opacity', [{ upstreamNode: '/Mat/Tex', upstreamOutputName: 'a' }])
  s.inputConnections.set('clearcoat', [{ upstreamNode: '/Mat/Geom', upstreamOutputName: 'out' }])
  s.inputConnections.set('occlusion', [{ upstreamNode: '/Mat/Occ', upstreamOutputName: 'out' }])
  const t = node('/Mat/Tex', 'ND_UsdUVTexture')
  t.parameters.set('file', V.asset('wood.png'))
  t.parameters.set('colorSpace:file', V.token('srgb_texture'))
  t.parameters.set('wrapS', V.token('repeat'))
  t.parameters.set('scale', V.vec4f(1.0, 0.5, 0.25, 1.0))
  t.inputConnections.set('st', [{ upstreamNode: '/Mat/St', upstreamOutputName: 'result' }])
  const st = node('/Mat/St', 'ND_UsdPrimvarReader_vector2')
  st.parameters.set('varname', V.string('st'))
  st.parameters.set('fallback', V.vec2f(0.5, 0.25))
  const g = node('/Mat/Geom', 'ND_geompropvalue_float')
  g.parameters.set('geomprop', V.string('coat'))
  const o = node('/Mat/Occ', 'ND_image_float')
  o.parameters.set('file', V.asset('occ.png'))
  o.parameters.set('typeName:file', V.token('asset'))
  o.inputConnections.set('texcoord', [{ upstreamNode: '/Mat/Uv', upstreamOutputName: 'out' }])
  node('/Mat/Uv', 'ND_texcoord_vector2')
  return n
}

/** The capture's MxHdDataJson: the std::map / std::set<SdfPath> members in
 *  their sorted order. */
function mxHdDataJson(d: HdMtlxTexturePrimvarData) {
  const paths = (s: Set<string>) =>
    [...s].map((p) => SdfPath.fromString(p)).sort(SdfPath.compare).map((p) => p.pathString)
  return {
    mxHdTextureMap: Object.fromEntries([...d.mxHdTextureMap]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, [...v].sort()])),
    hdTextureNodes: paths(d.hdTextureNodes),
    hdPrimvarNodes: paths(d.hdPrimvarNodes),
  }
}

/** The capture's NodeDefJson */
function nodeDefJson(nd: NodeDef | null) {
  if (!nd) return null
  return {
    name: nd.getName(),
    type: nd.getType(),
    node: nd.getNodeString(),
    inputs: nd.getActiveInputs().map((i) => [i.getName(), i.getType()]),
  }
}

describe('HdMtlxConvertToString (hdMtlx.cpp:136-202)', () => {
  for (const [name, value] of Object.entries(convertInputs)) {
    it(name, () => {
      expect(HdMtlxConvertToString(value)).toBe(expected.convertToString[name])
    })
  }
})

describe('HdMtlxGetMxTerminalName (hdMtlx.cpp:719-742)', () => {
  it('by MaterialX terminal type', () => {
    for (const [type, name] of Object.entries(expected.mxTerminalNameByType)) {
      expect(HdMtlxGetMxTerminalName(type), type).toBe(name)
    }
  })
  it('by Hydra terminal node', () => {
    const n = new HdMaterialNetwork2()
    for (const [path, id] of [['/M/Preview', 'ND_UsdPreviewSurface_surfaceshader'],
      ['/M/Displace', 'ND_displacement_float'], ['/M/Unknown', 'ND_not_a_nodedef']] as const) {
      const m = new HdMaterialNode2()
      m.nodeTypeId = id
      n.nodes.set(path, m)
    }
    const ni = new HdMaterialNetwork2Interface('/M', n)
    for (const [node, name] of Object.entries(expected.mxTerminalNameByNode)) {
      expect(HdMtlxGetMxTerminalName(ni, node), node).toBe(name)
    }
  })
})

describe('primvar reader nodedefs (hdMtlx.cpp:217-276)', () => {
  for (const [id, want] of Object.entries(expected.primvarReader) as [string, Record<string, unknown>][]) {
    it(id, () => {
      const nd = id === 'null' ? null : HdMtlxGetNodeDef(id)
      const got: Record<string, unknown> = {
        isPrimvarReader: HdMtlxIsPrimvarReaderNodeDef(nd),
        primvarNameInputName: HdMtlxGetPrimvarNameInputName(nd),
        primvarDefaultInputName: HdMtlxGetPrimvarDefaultInputName(nd),
      }
      if (id !== 'null') got.found = nd !== null
      expect(got).toEqual(want)
    })
  }
})

describe('HdMtlxGetNodeDefName / HdMtlxGetNodeDef (hdMtlx.cpp:328-402)', () => {
  it('HdMtlxGetNodeDefName', () => {
    for (const [name, want] of Object.entries(expected.nodeDefName)) {
      expect(HdMtlxGetNodeDefName(name), name).toBe(want)
    }
  })
  for (const [id, want] of Object.entries(expected.nodeDef)) {
    it(`HdMtlxGetNodeDef(${id})`, () => {
      expect(nodeDefJson(HdMtlxGetNodeDef(id))).toEqual(want)
    })
  }
})

describe('UsdPreviewSurface network documents (hdMtlx.cpp:744-908)', () => {
  it('HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface via HdMaterialNetwork2Interface', () => {
    const n = previewNetwork()
    const ni = new HdMaterialNetwork2Interface('/Mat', n)
    const terminal = TfToken('/Mat/PreviewSurface')
    const d = new HdMtlxTexturePrimvarData()
    const doc = HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface(
      ni, terminal, ni.getNodeInputConnectionNames(terminal), HdMtlxStdLibraries(), d)
    expect(writeToXmlString(doc)).toBe(fixture('previewSurface.mtlx'))
    expect(mxHdDataJson(d)).toEqual(expected.previewSurface)
  })

  it('a subset of the terminal connections, with a mtlx:version config', () => {
    const n = previewNetwork()
    n.config.set('mtlx:version', V.string('1.39'))
    const ni = new HdMaterialNetwork2Interface('/Mat', n)
    const d = new HdMtlxTexturePrimvarData()
    const doc = HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface(
      ni, '/Mat/PreviewSurface', ['diffuseColor', 'clearcoat'], HdMtlxStdLibraries(), d)
    expect(writeToXmlString(doc)).toBe(fixture('previewSurfaceSubset.mtlx'))
    expect(mxHdDataJson(d)).toEqual(expected.previewSurfaceSubset)
  })

  it('HdMtlxCreateMtlxDocumentFromHdNetwork with mxHdData', () => {
    const n = previewNetwork()
    const d = new HdMtlxTexturePrimvarData()
    const doc = HdMtlxCreateMtlxDocumentFromHdNetwork(
      n, n.nodes.get('/Mat/PreviewSurface')!, '/Mat/PreviewSurface', '/Mat', HdMtlxStdLibraries(), d)
    expect(writeToXmlString(doc)).toBe(fixture('previewSurfaceFromHdNetwork.mtlx'))
    expect(mxHdDataJson(d)).toEqual(expected.previewSurfaceFromHdNetwork)
  })
})
