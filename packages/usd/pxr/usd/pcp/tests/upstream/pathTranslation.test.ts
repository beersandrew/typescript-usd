// Ported from OpenUSD 26.11.1: pxr/usd/pcp/testenv/testPcpPathTranslation.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/testenv/testPcpPathTranslation.py
// (registered as testPcpPathTranslation), with its
// testPcpPathTranslation.testenv fixtures. typescript-usd caches are USD-mode.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Layer as UsdLayer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache, ErrorType as PcpErrorType,
  type Layer as PcpLayer, type LayerOpener as PcpLayerOpener,
  pcpTranslatePathFromNodeToRoot, pcpTranslatePathFromRootToNode,
} from '../../src/index.ts'

const TESTENV = path.join(
  fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testPcpPathTranslation.testenv')

// Sdf.Layer.FindOrOpen: one layer per identifier across caches.
const opened = new Map<string, PcpLayer>()
const opener: PcpLayerOpener = async (identifier) => {
  const existing = opened.get(identifier)
  if (existing) return existing
  try {
    const layer = await UsdLayer.open(identifier)
    if (!layer) return null
    opened.set(identifier, layer)
    return layer
  } catch {
    return null
  }
}

async function getPcpCacheForLayer(rootLayerPath: string): Promise<PcpCache> {
  const rootLayer = await opener(path.join(TESTENV, rootLayerPath))
  expect(rootLayer, `Cannot open layer ${rootLayerPath}`).toBeTruthy()
  return PcpCache.create(rootLayer!, opener)
}

const sdfPath = (p: string): SdfPath => SdfPath.fromString(p)
const pathStrings = (paths: readonly SdfPath[]): string[] => paths.map(p => p.pathString)

describe('testPcpPathTranslation', () => {
  it('test_PathTranslationWithVariants', async () => {
    const pcpCache = await getPcpCacheForLayer('bug77818/unit_main_cam.usda')

    // Verify that translating a path to a variant node keeps any relevant
    // variant selections.
    const primIndex = await pcpCache.computePrimIndex('/main_cam/Lens')
    expect(primIndex.localErrors.length).toBe(0)

    const variantNode = primIndex.rootNode.children[0]!
    expect(variantNode.path.pathString).toBe('/main_cam{lenses=Cooke_S4}Lens')
    expect(pcpTranslatePathFromRootToNode(variantNode, sdfPath('/main_cam/Lens')).path.pathString)
      .toBe('/main_cam{lenses=Cooke_S4}Lens')
    expect(pcpTranslatePathFromNodeToRoot(
      variantNode, sdfPath('/main_cam{lenses=Cooke_S4}Lens')).path.pathString)
      .toBe('/main_cam/Lens')
  })

  // The following test cases are pulled from testCsdLayering8.py.

  it('test_LocalAbsoluteTargetPaths', async () => {
    const pcpCache = await getPcpCacheForLayer('Root.usda')

    const errors = []
    const pathMap: Record<string, string> = {
      '/World/Chars/Ref1.localSelfAbs': '/World/Chars/Ref1',
      '/World/Chars/Ref1.localParentAbs': '/World/Chars',
      '/World/Chars/Ref1.localChildAbs': '/World/Chars/Ref1/RefChild',
      '/World/Chars/Ref1/RefChild.localSelfAbs': '/World/Chars/Ref1/RefChild',
      '/World/Chars/Ref1/RefChild.localParentAbs': '/World/Chars/Ref1',

      '/World/Chars/Ref2.localSelfAbs': '/World/Chars/Ref2',
      '/World/Chars/Ref2.localParentAbs': '/World/Chars',
      '/World/Chars/Ref2.localChildAbs': '/World/Chars/Ref2/RefChild',
      '/World/Chars/Ref2/RefChild.localSelfAbs': '/World/Chars/Ref2/RefChild',
      '/World/Chars/Ref2/RefChild.localParentAbs': '/World/Chars/Ref2',

      '/World/Ref3.localSelfAbs': '/World/Ref3',
      '/World/Ref3.localParentAbs': '/World',
      '/World/Ref3.localChildAbs': '/World/Ref3/RefChild',
      '/World/Ref3/RefChild.localSelfAbs': '/World/Ref3/RefChild',
      '/World/Ref3/RefChild.localParentAbs': '/World/Ref3',
    }

    for (const [relPath, expectedTargetPath] of Object.entries(pathMap)) {
      const { paths: curTargetPaths, errors: curErrors } =
        await pcpCache.computeRelationshipTargetPaths(relPath)
      errors.push(...curErrors)
      expect(pathStrings(curTargetPaths), relPath).toEqual([expectedTargetPath])
    }

    expect(errors.length).toBe(0)
  })

  it('test_LocalRelativeTargetPaths', async () => {
    const pcpCache = await getPcpCacheForLayer('Root.usda')

    const errors = []
    const pathMap: Record<string, string> = {
      '/World/Chars/Ref1.localSelfRel': '.',
      '/World/Chars/Ref1.localParentRel': '..',
      '/World/Chars/Ref1.localChildRel': 'RefChild',
      '/World/Chars/Ref1/RefChild.localSelfRel': '.',
      '/World/Chars/Ref1/RefChild.localParentRel': '..',

      '/World/Chars/Ref2.localSelfRel': '.',
      '/World/Chars/Ref2.localParentRel': '..',
      '/World/Chars/Ref2.localChildRel': 'RefChild',
      '/World/Chars/Ref2/RefChild.localSelfRel': '.',
      '/World/Chars/Ref2/RefChild.localParentRel': '..',

      '/World/Ref3.localSelfRel': '.',
      '/World/Ref3.localParentRel': '..',
      '/World/Ref3.localChildRel': 'RefChild',
      '/World/Ref3/RefChild.localSelfRel': '.',
      '/World/Ref3/RefChild.localParentRel': '..',
    }

    for (const [path, expectedTargetPath] of Object.entries(pathMap)) {
      const relPath = sdfPath(path)
      const { paths: curTargetPaths, errors: curErrors } =
        await pcpCache.computeRelationshipTargetPaths(relPath)
      errors.push(...curErrors)
      expect(pathStrings(curTargetPaths), path).toEqual([
        sdfPath(expectedTargetPath).makeAbsolutePath(relPath.getPrimPath()).pathString])
    }

    expect(errors.length).toBe(0)
  })

  it('test_ReferenceAbsoluteTargetPaths', async () => {
    const pcpCache = await getPcpCacheForLayer('Root.usda')

    const errors = []
    const pathMap: Record<string, string> = {
      '/World/Chars/Ref1.refSelfAbs': '/World/Chars/Ref1',
      '/World/Chars/Ref1.refChildAbs': '/World/Chars/Ref1/RefChild',
      '/World/Chars/Ref1/RefChild.refSelfAbs': '/World/Chars/Ref1/RefChild',
      '/World/Chars/Ref1/RefChild.refParentAbs': '/World/Chars/Ref1',

      '/World/Chars/Ref2.refSelfAbs': '/World/Chars/Ref2',
      '/World/Chars/Ref2.refChildAbs': '/World/Chars/Ref2/RefChild',
      '/World/Chars/Ref2/RefChild.refSelfAbs': '/World/Chars/Ref2/RefChild',
      '/World/Chars/Ref2/RefChild.refParentAbs': '/World/Chars/Ref2',

      '/World/Ref3.refSelfAbs': '/World/Ref3',
      '/World/Ref3.refChildAbs': '/World/Ref3/RefChild',
      '/World/Ref3/RefChild.refSelfAbs': '/World/Ref3/RefChild',
      '/World/Ref3/RefChild.refParentAbs': '/World/Ref3',
    }

    for (const [relPath, expectedTargetPath] of Object.entries(pathMap)) {
      const { paths: curTargetPaths, errors: curErrors } =
        await pcpCache.computeRelationshipTargetPaths(relPath)
      errors.push(...curErrors)
      expect(pathStrings(curTargetPaths), relPath).toEqual([expectedTargetPath])
    }

    expect(errors.length).toBe(0)
  })

  it('test_ReferenceRelativeTargetPaths', async () => {
    const pcpCache = await getPcpCacheForLayer('Root.usda')

    const errors = []
    const pathMap: Record<string, string> = {
      '/World/Chars/Ref1.refSelfRel': '.',
      '/World/Chars/Ref1.refChildRel': 'RefChild',
      '/World/Chars/Ref1/RefChild.refSelfRel': '.',
      '/World/Chars/Ref1/RefChild.refParentRel': '..',

      '/World/Chars/Ref2.refSelfRel': '.',
      '/World/Chars/Ref2.refChildRel': 'RefChild',
      '/World/Chars/Ref2/RefChild.refSelfRel': '.',
      '/World/Chars/Ref2/RefChild.refParentRel': '..',

      '/World/Ref3.refSelfRel': '.',
      '/World/Ref3.refChildRel': 'RefChild',
      '/World/Ref3/RefChild.refSelfRel': '.',
      '/World/Ref3/RefChild.refParentRel': '..',
    }

    for (const [path, expectedTargetPath] of Object.entries(pathMap)) {
      const relPath = sdfPath(path)
      const { paths: curTargetPaths, errors: curErrors } =
        await pcpCache.computeRelationshipTargetPaths(relPath)
      errors.push(...curErrors)
      expect(pathStrings(curTargetPaths), path).toEqual([
        sdfPath(expectedTargetPath).makeAbsolutePath(relPath.getPrimPath()).pathString])
    }

    expect(errors.length).toBe(0)
  })

  it('test_ReferenceErrorCases', async () => {
    const pcpCache = await getPcpCacheForLayer('Root.usda')

    const errors = []
    const paths = [
      '/World/Chars/Ref1.refBadAbs',
      '/World/Chars/Ref1.refBadRel',
      '/World/Chars/Ref1/RefChild.refBadAbs',
      '/World/Chars/Ref1/RefChild.refBadRel',

      '/World/Chars/Ref2.refBadAbs',
      '/World/Chars/Ref2.refBadRel',
      '/World/Chars/Ref2/RefChild.refBadAbs',
      '/World/Chars/Ref2/RefChild.refBadRel',

      '/World/Ref3.refBadAbs',
      '/World/Ref3.refBadRel',
      '/World/Ref3/RefChild.refBadAbs',
      '/World/Ref3/RefChild.refBadRel',
    ]

    for (const path of paths) {
      const { errors: curErrors } = await pcpCache.computeRelationshipTargetPaths(path)
      errors.push(...curErrors)
    }

    for (const err of errors) {
      expect(err.errorType, `Unexpected Error: ${err.message}`)
        .toBe(PcpErrorType.InvalidExternalTargetPath)
    }

    expect(errors.length).toBe(paths.length)
  })
})
