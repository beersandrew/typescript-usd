// Ported from OpenUSD 26.11.1: pxr/imaging/hdMtlx/hdMtlx.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HdMtlxGetNodeDef's custom-node path (pxr/imaging/hdMtlx/hdMtlx.cpp:343-373,
// OpenUSD 26.11.1): a nodedef outside the standard libraries, found through
// the Sdr node's ImplementationURI / ImplementationName. Expected:
// fixtures/customNodeDef/ (captured on the reference build), where
// the Sdr node is SdrRegistry::GetShaderNodeFromAsset(custom.mtlx, {},
// 'ND_hdmtlx_test_tint_color3', 'mtlx').

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createDocument } from '@mtlx/core'
import { writeToXmlString } from '@mtlx/format'
import { Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import { Registry as SdrRegistry } from 'typescript-usd/sdr'
import '../../../../usd/usdMtlx/src/plugin/registerPlugin.ts'
import { HdMaterialNetwork2, HdMaterialNode2 } from '../../../hd/src/material.ts'
import {
  HdMtlxCreateMtlxDocumentFromHdNetwork,
  HdMtlxGetNodeDef,
  HdMtlxStdLibraries,
  HdMtlxTexturePrimvarData,
} from '../../src/hdMtlx.ts'

const fixtures = new URL('fixtures/customNodeDef/', import.meta.url)
const expected = JSON.parse(readFileSync(new URL('expected.json', fixtures), 'utf8')).payload
const path = fileURLToPath(new URL('custom.mtlx', fixtures))
const subId = TfToken('ND_hdmtlx_test_tint_color3')

describe('HdMtlxGetNodeDef: custom nodedef through the Sdr ImplementationURI', () => {
  // Known gap: typescript-usd/usdMtlx's MtlxParserPlugin.parseShaderNode
  // (pxr/usd/usdMtlx/src/parser.ts:68-90) parses only against the standard
  // library document: it does not read the document at the discovery
  // result's resolvedUri, nor look the nodedef up by subIdentifier and pass
  // it as the ImplementationName metadata, as upstream does
  // (usdMtlx/parser.cpp:572-626). The Sdr node for custom.mtlx therefore has
  // no implementation URI and HdMtlxGetNodeDef cannot load the nodedef.
  it('resolves the custom nodedef and generates the native document (gap: usdMtlx parser)', () => {
    const node = SdrRegistry.getInstance().getShaderNodeFromAsset(
      new SdfAssetPath(path, path), {}, subId, 'mtlx')
    expect(node !== undefined).toBe(expected.sdrNodeFound)
    expect(node!.getImplementationName()).toBe(expected.implementationName)
    expect(node!.getResolvedImplementationURI() === path).toBe(expected.implementationURIIsAsset)
    expect(HdMtlxStdLibraries().getNodeDef(subId) !== null).toBe(expected.inStdLibraries)

    const doc = createDocument()
    doc.setDataLibrary(HdMtlxStdLibraries())
    const nd = HdMtlxGetNodeDef(node!.getIdentifier(), doc)
    expect(nd && {
      name: nd.getName(), type: nd.getType(), node: nd.getNodeString(),
      inputs: nd.getActiveInputs().map((i) => [i.getName(), i.getType()]),
    }).toEqual(expected.nodeDef)

    const n = new HdMaterialNetwork2()
    const s = new HdMaterialNode2()
    s.nodeTypeId = 'ND_standard_surface_surfaceshader'
    s.inputConnections.set('base_color', [{ upstreamNode: '/Mat/Tint', upstreamOutputName: 'out' }])
    n.nodes.set('/Mat/Surface', s)
    const t = new HdMaterialNode2()
    t.nodeTypeId = node!.getIdentifier()
    t.parameters.set('amount', VtValue.create(0.25, VtValueTypes.float))
    n.nodes.set('/Mat/Tint', t)
    const netDoc = HdMtlxCreateMtlxDocumentFromHdNetwork(
      n, s, '/Mat/Surface', '/Mat', HdMtlxStdLibraries(), new HdMtlxTexturePrimvarData())
    const xml = writeToXmlString(netDoc).split('\n').filter((l) => !l.includes('<xi:include ')).join('\n')
    expect(xml).toBe(readFileSync(new URL('customNodeDef.mtlx', fixtures), 'utf8'))
  })
})
