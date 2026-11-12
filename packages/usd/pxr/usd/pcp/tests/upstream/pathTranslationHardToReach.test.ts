// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpPathTranslation_HardToReach.cpp
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08
// pxr/usd/pcp/testenv/testPcpPathTranslation_HardToReach.cpp (registered as
// testPcpPathTranslation_HardToReach), with its
// testPcpPathTranslation_HardToReach.testenv fixtures. typescript-usd caches are
// USD-mode and cull.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Layer, sdfCreatePrimInLayer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { TfDiagnosticTrap } from 'typescript-usd/tf'
import { Layer as UsdLayer } from 'typescript-usd/usd/_internal'
import {
  ArcType as PcpArcType, Cache as PcpCache,
  type Layer as PcpLayer, type LayerOpener as PcpLayerOpener,
  type Node as PcpNodeRef, type PrimIndex as PcpPrimIndex,
  pcpTranslatePathFromNodeToRoot, pcpTranslatePathFromRootToNode,
} from '../../src/index.ts'

const TESTENV = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testPcpPathTranslation_HardToReach.testenv')

// SdfLayer::FindOrOpen.
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

async function createCacheForRootLayer(rootLayerPath: string): Promise<PcpCache> {
  const rootLayer = await opener(path.join(TESTENV, rootLayerPath))
  if (!rootLayer) throw new Error(`Unable to open @${rootLayerPath}@`)
  return PcpCache.create(rootLayer, opener)
}

const sdfPath = (p: string): SdfPath => SdfPath.fromString(p)

function testReverseTranslation(
  _primIndex: PcpPrimIndex, node: PcpNodeRef,
  targetPath: SdfPath, expectedReversePath: SdfPath,
): void {
  // Reverse translate targetPath to the given node and compare with the
  // expected result.
  const revPath = pcpTranslatePathFromRootToNode(node, targetPath).path
  expect(revPath.pathString).toBe(expectedReversePath.pathString)

  // Forward translate the reverse translated path from above and ensure
  // it matches the original target path.
  const fwdPath = pcpTranslatePathFromNodeToRoot(node, revPath).path
  expect(fwdPath.pathString).toBe(targetPath.pathString)
}

function isExpectedNode(
  node: PcpNodeRef, expectedArcType: PcpArcType, expectedSitePath: SdfPath,
): boolean {
  return node.arcType === expectedArcType &&
    node.getSite().path.pathString === expectedSitePath.pathString
}

describe('testPcpPathTranslation_HardToReach', () => {
  it('TestReverseTranslation_1', async () => {
    const pcpCache = await createCacheForRootLayer('TestReverseTranslation_1/1.usda')
    const index = await pcpCache.computePrimIndex('/M_1/B')
    expect(index.localErrors).toEqual([])

    const nodeRange = [...index.getNodeRange()]
    let i = 0

    // First node is the root node, which requires no path translation.
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Root, sdfPath('/M_1/B'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, sdfPath('/M_1/B'), sdfPath('/M_1/B'))

    // Next node is the propagated relocation.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Relocate, sdfPath('/M_1/A'))).toBe(true)

    // Next node is reference to @2.usda@</M_2/B>. Note that this is before
    // the relocation of A -> B in 3.usda, so we expect that not to have any
    // effect on the path translation.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Reference, sdfPath('/M_2/B'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, sdfPath('/M_1/B'), sdfPath('/M_2/B'))

    // Next node is the propagated relocation.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Relocate, sdfPath('/M_2/A'))).toBe(true)

    // Next is the reference to @3.usda@</M_3/B>. Although this is in the
    // layer stack where the relocation of A -> B is specified, this is still
    // before the relocation node in the prim index, so that relocation should
    // still have no effect.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Reference, sdfPath('/M_3/B'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, sdfPath('/M_1/B'), sdfPath('/M_3/B'))

    // Next we have the relocation node, which represents the A -> B
    // relocation. (Upstream leaves this translation unchecked: reverse
    // translation always returns a path in the node's final relocated
    // namespace.)
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Relocate, sdfPath('/M_3/A'))).toBe(true)

    // Next, the reference node to @4.usda@</M_4/A>. This is on the
    // other side of the relocation, so reverse translating to this node
    // should translate B to A.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Reference, sdfPath('/M_4/A'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, sdfPath('/M_1/B'), sdfPath('/M_4/A'))

    // The reference node to @4.usda@</M_4/B> is culled from the graph since
    // culling is enabled.

    // Done!
    ++i
    expect(i).toBe(nodeRange.length)
  })

  it('TestReverseTranslation_2', async () => {
    const pcpCache = await createCacheForRootLayer('TestReverseTranslation_1/1.usda')
    const index = await pcpCache.computePrimIndex('/M_1/C')
    expect(index.localErrors).toEqual([])

    const nodeRange = [...index.getNodeRange()]
    let i = 0

    // First node is the root node, which requires no path translation.
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Root, sdfPath('/M_1/C'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, sdfPath('/M_1/B'), sdfPath('/M_1/B'))

    // Next node is reference to @2.usda@</M_2/C>. Note that this is before
    // the relocation of A -> B in 3.usda, so we expect that not to have any
    // effect on the path translation.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Reference, sdfPath('/M_2/C'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, sdfPath('/M_1/B'), sdfPath('/M_2/B'))

    // Next is the reference to @3.usda@</M_3/C>. Since this is the layer
    // stack where the relocation of A -> B is authored, we expect
    // reverse translation to this node to still refer to B.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Reference, sdfPath('/M_3/C'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, sdfPath('/M_1/B'), sdfPath('/M_3/B'))

    // Lastly, the reference node to @4.usda@</M_4/C>. This is on the
    // other side of the relocation, so reverse translating to this node
    // should translate B to A.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Reference, sdfPath('/M_4/C'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, sdfPath('/M_1/B'), sdfPath('/M_4/A'))

    // Done!
    ++i
    expect(i).toBe(nodeRange.length)
  })

  it('TestReverseTranslation_3', async () => {
    const pcpCache = await createCacheForRootLayer('TestReverseTranslation_3/root.usda')

    const primPath = sdfPath('/CharRig/Rig/LArm/Rig/Some_Internal_Rig_Prim')
    const targetPath = sdfPath('/CharRig/Anim/LArm.bendAmount')

    const index = await pcpCache.computePrimIndex(primPath)
    expect(index.localErrors).toEqual([])

    const nodeRange = [...index.getNodeRange()]
    let i = 0

    // First node is the root node, which requires no path translation.
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Root, primPath)).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, targetPath, targetPath)

    // Next is an implied subroot inherit node to the symmetric arm rig
    // that originates from within the referenced HumanRig below.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Inherit,
      sdfPath('/CharRig/Rig/SymArm/Rig/Some_Internal_Rig_Prim'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, targetPath,
      sdfPath('/CharRig/Rig/SymArm/Anim.bendAmount'))

    // Next is the reference node to the LArm instance in HumanRig.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Reference,
      sdfPath('/HumanRig/Rig/LArm/Rig/Some_Internal_Rig_Prim'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, targetPath,
      sdfPath('/HumanRig/Anim/LArm.bendAmount'))

    // Next is the subroot inherit to the symmetric arm class.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Inherit,
      sdfPath('/HumanRig/Rig/SymArm/Rig/Some_Internal_Rig_Prim'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, targetPath,
      sdfPath('/HumanRig/Rig/SymArm/Anim.bendAmount'))

    // Finally, we have a reference from the symmetric arm class in
    // HumanRig to the actual arm rig.
    ++i
    expect(isExpectedNode(nodeRange[i]!, PcpArcType.Reference,
      sdfPath('/ArmRig/Rig/Some_Internal_Rig_Prim'))).toBe(true)
    testReverseTranslation(index, nodeRange[i]!, targetPath,
      sdfPath('/ArmRig/Anim.bendAmount'))

    ++i
    expect(i).toBe(nodeRange.length)
  })

  it('TestErrorsTranslatingInvalidPaths', async () => {
    const layer = Layer.createAnonymous('.usda')
    opened.set(layer.filePath, layer)
    sdfCreatePrimInLayer(layer, '/foo')

    const pcpCache = await PcpCache.create(layer, opener)
    const index = await pcpCache.computePrimIndex('/foo')
    expect(index.localErrors).toEqual([])

    const rootNode = index.getRootNode()

    // Relative paths are disallowed
    let errMark = new TfDiagnosticTrap()
    const badPath1 = sdfPath('relative/path')
    expect(badPath1.isEmpty()).toBe(false)
    expect(errMark.isClean()).toBe(true)
    pcpTranslatePathFromNodeToRoot(rootNode, badPath1)
    expect(errMark.hasErrors()).toBe(true)
    errMark.clear()
    errMark.dismiss()

    // Variant-selection paths are disallowed
    errMark = new TfDiagnosticTrap()
    const badPath2 = sdfPath('/Variant/Selection{vset=sel}Is/Invalid')
    expect(badPath2.isEmpty()).toBe(false)
    expect(errMark.isClean()).toBe(true)
    pcpTranslatePathFromRootToNode(rootNode, badPath2)
    expect(errMark.hasErrors()).toBe(true)
    errMark.clear()
    errMark.dismiss()
  })
})
