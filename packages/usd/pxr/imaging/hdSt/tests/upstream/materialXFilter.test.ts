// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/materialXFilter.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdSt_ApplyMaterialXFilter (pxr/imaging/hdSt/materialXFilter.cpp, OpenUSD
// 26.11.1). Upstream has no test of the filter itself; the expectations are
// the reference build's results for the networks of
// ../fixtures/materialXFilter/networks.json (FIXTURES.md)
// (the capture applies the filter on HdStResourceRegistries whose Hgi reports
// HgiTokens->OpenGL, as BufferTestHgi does here): per case the returned
// shader (cache reuse through the anonymized topology hash), its pixel-stage
// glslfx source, the HdSt_MaterialParams and the rewritten network.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import 'typescript-usd/usdMtlx'
// The sdrGlslfx parser plugin SdrRegistry finds through Plug.
import 'typescript-usd/sdrGlslfx'
import { Registry as SdrRegistry } from 'typescript-usd/sdr'
import { Type as TfType, Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  Vec2f as GfVec2f,
  Vec3f as GfVec3f,
  Vec4f as GfVec4f,
} from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import {
  MaterialNetwork2 as HdMaterialNetwork2,
  MaterialNode2 as HdMaterialNode2,
} from 'typescript-usd/hd'
import { HgiDeviceCapabilitiesBits } from 'typescript-usd/hgi'
import { Stage, type Shader } from '@mtlx/genshader'
import { HioGlslfxTokens } from 'typescript-usd/hio'
import { HdSt_ApplyMaterialXFilter } from '../../src/materialXFilter.ts'
import { HdSt_MaterialParam } from '../../src/materialParam.ts'
import { HdStResourceRegistry } from '../../src/resourceRegistry.ts'
import { BufferTestHgi } from '../bufferTestHgi.ts'

const fixtures = new URL('../fixtures/materialXFilter/', import.meta.url)

type ValueSpec = [string, unknown]
interface NodeSpec {
  type: string
  parameters?: Record<string, ValueSpec>
  connections?: Record<string, Array<[string, string]>>
}
interface CaseSpec {
  name: string
  registry: string
  materialPath: string
  terminal: string
  terminals: Record<string, string>
  config?: Record<string, ValueSpec>
  nodes: Record<string, NodeSpec>
}
interface CaseResult {
  name: string
  shader: number | null
  terminalIsGeneratedGlslfx?: boolean
  materialParams: unknown[]
  nodes: Record<string, unknown>
}

const networks = JSON.parse(readFileSync(new URL('networks.json', fixtures), 'utf8')) as { cases: CaseSpec[] }
const expected = (JSON.parse(readFileSync(new URL('expected.json', fixtures), 'utf8')) as
  { payload: CaseResult[] }).payload

/** The capture's _ReadValue */
function _ReadValue([type, v]: ValueSpec): VtValue {
  switch (type) {
    case 'float': return VtValue.create(Math.fround(v as number), VtValueTypes.float)
    case 'int': return VtValue.create(v as number, VtValueTypes.int)
    case 'bool': return VtValue.create(v as boolean, VtValueTypes.bool)
    case 'string': return VtValue.create(v as string, VtValueTypes.string)
    case 'token': return VtValue.create(TfToken(v as string), VtValueTypes.token)
    case 'asset': return VtValue.create(new SdfAssetPath(v as string), TfType.declare('SdfAssetPath'))
    case 'float2': return VtValue.create(new GfVec2f(...(v as number[])), VtValueTypes.GfVec2f)
    case 'float3': return VtValue.create(new GfVec3f(...(v as number[])), VtValueTypes.GfVec3f)
    case 'float4': return VtValue.create(new GfVec4f(...(v as number[])), VtValueTypes.GfVec4f)
  }
  throw new Error(`unknown value type ${type}`)
}

/** The capture's _Portable */
function _Portable(path: string): string {
  return path.endsWith('/fallbackBlackDomeLight.png')
    ? '<hdSt>/textures/fallbackBlackDomeLight.png' : path
}

/** The capture's _WriteValue */
function _WriteValue(value: unknown): unknown[] {
  if (!(value instanceof VtValue)) return ['<not a VtValue>', null]
  if (value.IsEmpty()) return ['empty', null]
  const held = value.Get<unknown>()
  const vec = (n: number) => Array.from({ length: n }, (_, i) => (held as { get(i: number): number }).get(i))
  switch (value.getTypeName()) {
    case 'float': case 'double': case 'int': case 'bool': case 'string':
      return [value.getTypeName(), held]
    case 'token': return ['token', String(held)]
    case 'SdfAssetPath': {
      const p = held as SdfAssetPath
      return ['asset', [_Portable(p.getAssetPath()), _Portable(p.getResolvedPath())]]
    }
    case 'GfVec2f': return ['float2', vec(2)]
    case 'GfVec3f': return ['float3', vec(3)]
    case 'GfVec4f': return ['float4', vec(4)]
    case 'GfVec2i': return ['int2', vec(2)]
    case 'GfVec3i': return ['int3', vec(3)]
    case 'GfVec4i': return ['int4', vec(4)]
  }
  return [value.getTypeName(), null]
}

function _Sorted<V>(m: ReadonlyMap<string, V>): Array<[string, V]> {
  return [...m].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

function _MakeRegistry(bindless: boolean): HdStResourceRegistry {
  const hgi = new BufferTestHgi()
  hgi.capabilities.setFlag(
    HgiDeviceCapabilitiesBits.HgiDeviceCapabilitiesBitsBindlessTextures, bindless)
  return new HdStResourceRegistry(hgi)
}

interface Run {
  result: CaseResult
  source: string | null
}

/** The capture's main, in TS: every case in order, on one registry per kind. */
function _RunAll(): Map<string, Run> {
  const registries = new Map<string, HdStResourceRegistry>()
  const shaders: Shader[] = []
  const runs = new Map<string, Run>()
  for (const c of networks.cases) {
    if (!registries.has(c.registry)) {
      registries.set(c.registry, _MakeRegistry(c.registry === 'glBindless'))
    }
    const net = new HdMaterialNetwork2()
    for (const path of Object.keys(c.nodes).sort()) {
      const spec = c.nodes[path]!
      const node = new HdMaterialNode2()
      node.nodeTypeId = spec.type
      for (const [name, value] of Object.entries(spec.parameters ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
        node.parameters.set(name, _ReadValue(value))
      }
      for (const [name, conns] of Object.entries(spec.connections ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
        node.inputConnections.set(name, conns.map(([upstreamNode, upstreamOutputName]) =>
          ({ upstreamNode, upstreamOutputName })))
      }
      net.nodes.set(path, node)
    }
    for (const [name, path] of Object.entries(c.terminals)) {
      net.terminals.set(name, { upstreamNode: path, upstreamOutputName: '' })
    }
    for (const [name, value] of Object.entries(c.config ?? {})) {
      net.config.set(name, _ReadValue(value))
    }

    const params: HdSt_MaterialParam[] = []
    const shader = HdSt_ApplyMaterialXFilter(
      net, c.materialPath, net.nodes.get(c.terminal)!, c.terminal, params,
      registries.get(c.registry)!)

    const result: CaseResult = { name: c.name, shader: null, materialParams: [], nodes: {} }
    let source: string | null = null
    if (shader) {
      let index = shaders.indexOf(shader)
      if (index === -1) index = shaders.push(shader) - 1
      result.shader = index
      source = shader.getSourceCode(Stage.PIXEL)
      const sdrNode = SdrRegistry.getInstance().getShaderNodeByIdentifierAndType(
        net.nodes.get(c.terminal)!.nodeTypeId, HioGlslfxTokens.glslfx)
      result.terminalIsGeneratedGlslfx = !!sdrNode && sdrNode.getSourceCode() === source
    }
    result.materialParams = params.map((p) => ({
      arrayOfTexturesSize: p.arrayOfTexturesSize,
      fallbackValue: _WriteValue(p.fallbackValue),
      isPremultiplied: p.isPremultiplied,
      name: String(p.name),
      paramType: p.paramType,
      samplerCoords: p.samplerCoords.map(String),
      swizzle: p.swizzle,
      textureType: p.textureType,
    }))
    for (const [path, node] of _Sorted(net.nodes)) {
      result.nodes[path] = {
        connections: Object.fromEntries(_Sorted(node.inputConnections).map(([name, conns]) =>
          [name, conns.map((conn) => [conn.upstreamNode, conn.upstreamOutputName])])),
        nodeTypeId: shader && path === c.terminal ? '<generated>' : node.nodeTypeId,
        parameters: Object.fromEntries(_Sorted(node.parameters).map(([name, v]) => [name, _WriteValue(v)])),
      }
    }
    runs.set(c.name, { result, source })
  }
  return runs
}

/** The domeLightFallback nodes' file parameters. */
function _DomeLightFiles(nodes: Record<string, unknown>): unknown[] {
  return Object.entries(nodes)
    .filter(([path]) => path.endsWith('/domeLightFallback'))
    .map(([, node]) => (node as { parameters: Record<string, unknown> }).parameters['file'])
}

/** The nodes with the domeLightFallback nodes' file parameters removed. */
function _WithoutDomeLightFile(nodes: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(nodes).map(([path, node]) => {
    if (!path.endsWith('/domeLightFallback')) return [path, node]
    const n = node as { parameters: Record<string, unknown> }
    const { file: _file, ...parameters } = n.parameters
    return [path, { ...n, parameters }]
  }))
}

let _runs: Map<string, Run> | null = null
function _Run(name: string): Run {
  _runs ??= _RunAll()
  return _runs.get(name)!
}

describe('HdSt_ApplyMaterialXFilter (reference-build capture)', () => {
  for (const exp of expected) {
    describe(exp.name, () => {
      it('returns the shader the reference build returns (cache reuse by topology)', () => {
        expect(_Run(exp.name).result.shader).toEqual(exp.shader)
      })
      it('replaces the terminal with the Sdr glslfx node of the generated source', () => {
        expect(_Run(exp.name).result.terminalIsGeneratedGlslfx).toEqual(exp.terminalIsGeneratedGlslfx)
      })
      it('produces the reference HdSt_MaterialParams', () => {
        expect(_Run(exp.name).result.materialParams).toEqual(exp.materialParams)
      })
      it('rewrites the network as the reference build does', () => {
        // The fallback dome light texture's path is compared below.
        expect(_WithoutDomeLightFile(_Run(exp.name).result.nodes))
          .toEqual(_WithoutDomeLightFile(exp.nodes))
      })
      if (exp.shader !== null) {
        it('generates the reference glslfx source', () => {
          const source = readFileSync(new URL(`${exp.name}.glslfx`, fixtures), 'utf8')
          expect(_Run(exp.name).source).toBe(source)
        })
      }
    })
  }

  // Known gap: HdStPackageFallbackDomeLightTexture() (package.ts) finds no
  // 'textures/fallbackBlackDomeLight.png' resource, since
  // HdSt_RegisterShaderResources (shaderResources.ts) attaches only Storm's
  // shaders to the hdSt plugin, so the domeLightFallback node's file is an
  // empty SdfAssetPath (and TF_VERIFY posts an error).
  it('adds the domeLightFallback node with the hdSt fallback dome light texture', () => {
    for (const exp of expected) {
      expect(_DomeLightFiles(_Run(exp.name).result.nodes), exp.name)
        .toEqual(_DomeLightFiles(exp.nodes))
    }
  })
})
