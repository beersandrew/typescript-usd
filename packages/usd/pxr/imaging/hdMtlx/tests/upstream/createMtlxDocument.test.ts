// Ported from OpenUSD 26.11.1: pxr/imaging/hdMtlx/hdMtlx.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdMtlxCreateMtlxDocumentFromHdNetwork (pxr/imaging/hdMtlx/hdMtlx.cpp:744-908,
// OpenUSD 26.11.1) against the reference build: fixtures/native.mtlx is
// MaterialX::writeToXmlString of the document the capture builds
// (FIXTURES.md), less the installation-specific <xi:include> lines.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { writeToXmlString } from '@mtlx/format'
import { Token as TfToken, Type as TfType } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec3f as GfVec3f } from 'typescript-usd/gf'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { HdMaterialNetwork2, HdMaterialNode2 } from '../../../hd/src/material.ts'
import { HdMtlxCreateMtlxDocumentFromHdNetwork, HdMtlxStdLibraries } from '../../src/hdMtlx.ts'

const fixture = (name: string) => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8')

const _assetType = TfType.declare('SdfAssetPath')
const tok = (s: string) => VtValue.create(TfToken(s), VtValueTypes.token)

/** The capture's lines 11-25 */
function captureNetwork(): HdMaterialNetwork2 {
  const n = new HdMaterialNetwork2()
  const node = (path: string, typeId: string): HdMaterialNode2 => {
    const m = new HdMaterialNode2()
    m.nodeTypeId = typeId
    n.nodes.set(path, m)
    return m
  }
  const s = node('/Mat/Surface', 'ND_standard_surface_surfaceshader')
  s.parameters.set('metalness', VtValue.create(0.25, VtValueTypes.float))
  s.inputConnections.set('base_color', [{ upstreamNode: '/Mat/Image', upstreamOutputName: 'out' }])
  s.inputConnections.set('specular_roughness', [{ upstreamNode: '/Mat/Split', upstreamOutputName: 'outy' }])
  const i = node('/Mat/Image', 'ND_image_color3')
  i.parameters.set('file', VtValue.create(new SdfAssetPath('texture.png'), _assetType))
  i.parameters.set('colorSpace:file', tok('srgb_texture'))
  i.parameters.set('typeName:file', tok('asset'))
  i.inputConnections.set('texcoord', [{ upstreamNode: '/Mat/UV', upstreamOutputName: 'out' }])
  const uv = node('/Mat/UV', 'ND_texcoord_vector2')
  uv.parameters.set('index', VtValue.create(0, VtValueTypes.int))
  const split = node('/Mat/Split', 'ND_separate3_vector3')
  split.parameters.set('in', VtValue.create(new GfVec3f(0.2, 0.4, 0.6), VtValueTypes.GfVec3f))
  return n
}

describe('HdMtlxCreateMtlxDocumentFromHdNetwork (native capture)', () => {
  it('writes the same document as the reference build (native.mtlx)', () => {
    const n = captureNetwork()
    const s = n.nodes.get('/Mat/Surface')!
    const doc = HdMtlxCreateMtlxDocumentFromHdNetwork(n, s, '/Mat/Surface', '/Mat', HdMtlxStdLibraries())
    expect(writeToXmlString(doc)).toBe(fixture('native.mtlx'))
  })
})
