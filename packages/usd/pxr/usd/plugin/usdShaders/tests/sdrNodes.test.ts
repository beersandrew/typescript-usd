// Ported from OpenUSD 26.11.1: pxr/usd/sdr/registry.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// What SdrRegistry reports for the usdShaders shader nodes
// (pxr/usd/plugin/usdShaders, through UsdShadersDiscoveryPlugin and
// UsdShadeShaderDefParserPlugin) and for glslfx nodes created from source
// code (SdrGlslfxParserPlugin through SdrRegistry::GetShaderNodeFromSourceCode,
// pxr/usd/sdr/registry.cpp:596-655), compared with the pinned build
// (fixtures/sdrNodes, captured with Sdr's Python API; FIXTURES.md).
//
// Property metadata is compared on the keys 'swizzle', 'primvarProperty' and
// 'renderType'; one input's whole metadata is compared in the last test.
//
// Controller (Node) test.

import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  Registry as SdrRegistry,
  ShaderPropertyGetDefaultValue,
  type ShaderNode as SdrShaderNode,
} from 'typescript-usd/sdr'
import { HioGlslfx } from 'typescript-usd/hio'
import { UsdShaders_RegisterShaderNodesAsync } from '../src/index.ts'
// previewSurface.glslfx imports $TOOLS/hdSt/shaders/... (hdSt's shader
// resources), which hdSt registers when it is imported.
import { HdSt_RegisterShaderResources } from '../../../../imaging/hdSt/src/shaderResources.ts'
import { UsdShaders_ShaderResourceFiles } from '../src/shaders.generated.ts'

const fixture = JSON.parse(readFileSync(new URL('fixtures/sdrNodes/expected.json', import.meta.url), 'utf8')).payload

// The C++ value type names of the capture, as this repository's VtValue type
// names (vt/src/types.ts names types by their USD type names).
const CPP_TO_TS: Record<string, string> = {
  float: 'float', int: 'int', TfToken: 'token', 'std::string': 'string',
  string: 'string', SdfAssetPath: 'SdfAssetPath', GfVec2f: 'GfVec2f',
  GfVec3f: 'GfVec3f', GfVec4f: 'GfVec4f', GfMatrix4d: 'GfMatrix4d',
}
const PY_TO_TS: Record<string, string> = {
  'builtins.float': 'float', 'builtins.int': 'int', 'builtins.str': 'string',
  'Gf.Vec2f': 'GfVec2f', 'Gf.Vec3f': 'GfVec3f', 'Gf.Vec4f': 'GfVec4f',
}
const SHARED_METADATA_KEYS = ['swizzle', 'primvarProperty', 'renderType']

function plain(v: unknown): unknown {
  if (v === undefined || v === null) return null
  if (typeof v === 'number' || typeof v === 'string') return v
  if (typeof v === 'boolean') return Number(v)
  if (v instanceof String) return String(v)
  const o = v as { data?: ArrayLike<number>, getAssetPath?: () => string }
  if (o.getAssetPath) return o.getAssetPath()
  if (o.data) return Array.from(o.data)
  if (Symbol.iterator in Object(v)) return [...(v as Iterable<unknown>)]
  return v
}

function compareNode(node: SdrShaderNode | undefined, expected: Record<string, any>, usd: boolean) {
  expect(node).toBeDefined()
  const n = node!
  expect(n.getIdentifier()).toBe(expected.identifier)
  expect(n.getName()).toBe(expected.name)
  expect(n.getFunction()).toBe(expected.function)
  expect(n.getContext()).toBe(expected.context)
  expect(n.getSourceType()).toBe(expected.sourceType)
  expect(n.getRole()).toBe(expected.role)
  expect(n.getShaderInputNames()).toEqual(expected.inputNames)
  expect(n.getShaderOutputNames()).toEqual(expected.outputNames)
  expect(n.getAssetIdentifierInputNames()).toEqual(expected.assetIdentifierInputNames)
  expect(n.getDefaultInput()?.getName() ?? null).toBe(expected.defaultInput)
  expect(n.getAdditionalPrimvarProperties()).toEqual(expected.additionalPrimvarProperties)
  expect(n.getPrimvars()).toEqual(expected.primvars)
  const impl = n.getResolvedImplementationURI()
  expect(impl ? impl.slice(impl.lastIndexOf('/') + 1) : '').toBe(expected.implementationFile)
  for (const key of ['role', 'primvars', 'domain', 'sdrUsdEncodingVersion']) {
    expect(n.getMetadata()[key], key).toBe(expected.metadata[key])
  }
  for (const [name, p] of Object.entries<any>(expected.properties)) {
    const prop = p.isOutput ? n.getShaderOutput(name) : n.getShaderInput(name)
    expect(prop, name).toBeDefined()
    expect(prop!.getType(), name).toBe(p.type)
    expect(prop!.getArraySize(), name).toBe(p.arraySize)
    const value = ShaderPropertyGetDefaultValue(prop!)
    if (p.default === null) {
      expect(value.IsEmpty(), name).toBe(true)
    } else {
      const want = usd ? CPP_TO_TS[p.valueType] : PY_TO_TS[p.pythonType]
      expect(value.getTypeName(), name).toBe(want)
      const got = plain(value.Get<unknown>())
      if (Array.isArray(p.default)) {
        expect((got as number[]).map(Math.fround), name).toEqual(p.default.map(Math.fround))
      } else if (typeof p.default === 'number') {
        expect(Math.fround(got as number), name).toBe(Math.fround(p.default))
      } else {
        expect(got, name).toBe(p.default)
      }
    }
    for (const key of SHARED_METADATA_KEYS) {
      expect(prop!.getMetadata()[key], `${name} ${key}`).toBe(p.metadata[key])
    }
  }
}

beforeAll(async () => {
  HdSt_RegisterShaderResources()
  await UsdShaders_RegisterShaderNodesAsync()
})

describe('usdShaders shader nodes (shaderDefs.usda)', () => {
  for (const [id, expected] of Object.entries<any>(fixture.usdShaders)) {
    it(`${id} matches the native Sdr node`, () => {
      compareNode(SdrRegistry.getInstance().getShaderNodeByIdentifierAndType(id, 'glslfx'), expected, true)
    })
  }

  it('GetShaderNodeByIdentifier with the priority [glslfx, mtlx] finds the same nodes', () => {
    for (const [id, expected] of Object.entries<string>(fixture.byIdentifierWithPriority)) {
      expect(SdrRegistry.getInstance().getShaderNodeByIdentifier(id, ['glslfx', 'mtlx'])?.getIdentifier()).toBe(expected)
    }
  })

  it('the resolved implementation URIs name the bundled glslfx resources', () => {
    for (const id of Object.keys(fixture.usdShaders)) {
      const uri = SdrRegistry.getInstance().getShaderNodeByIdentifierAndType(id, 'glslfx')!
        .getResolvedImplementationURI()
      expect(UsdShaders_ShaderResourceFiles[`shaders/${uri.slice(uri.lastIndexOf('/') + 1)}`], id).toBeDefined()
    }
    // HdStMaterialNetwork reads the terminal's surface source through
    // HioGlslfx(GetResolvedImplementationURI()) (materialNetwork.cpp:128-151).
    const surface = SdrRegistry.getInstance().getShaderNodeByIdentifierAndType('UsdPreviewSurface', 'glslfx')!
    const glslfx = new HioGlslfx(surface.getResolvedImplementationURI())
    expect(glslfx.isValid()).toBe(true)
    expect(glslfx.getSurfaceSource()).toContain('surfaceShader')
  })

  it('the bundled resources are the files of shaders/', () => {
    for (const [name, text] of Object.entries(UsdShaders_ShaderResourceFiles)) {
      expect(text, name).toBe(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'))
    }
  })

  // SdrShaderProperty::GetMetadata spells the Sdr-internal keys as
  // shaderPropertyMetadata.h:22-45 does.
  it('property metadata keys match the native spellings', () => {
    const node = SdrRegistry.getInstance().getShaderNodeByIdentifierAndType('UsdUVTexture', 'glslfx')!
    expect(node.getShaderInput('fallback')!.getMetadata()).toEqual(fixture.usdShaders.UsdUVTexture.properties.fallback.metadata)
  })
})

describe('glslfx nodes from source code (SdrGlslfxParserPlugin)', () => {
  for (const [key, entry] of Object.entries<any>(fixture.fromSourceCode)) {
    it(`${key} matches the native Sdr node`, () => {
      const node = SdrRegistry.getInstance().getShaderNodeFromSourceCode(
        entry.sourceCode, 'glslfx', entry.metadataArg ?? {})
      compareNode(node, entry.node, false)
      // A second request returns the registered node.
      expect(SdrRegistry.getInstance().getShaderNodeFromSourceCode(
        entry.sourceCode, 'glslfx', entry.metadataArg ?? {})).toBe(node)
      expect(SdrRegistry.getInstance().getShaderNodeByIdentifierAndType(
        entry.node.identifier, 'glslfx')).toBe(node)
    })
  }
})
