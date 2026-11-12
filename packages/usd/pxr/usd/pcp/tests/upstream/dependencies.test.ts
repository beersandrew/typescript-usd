// Ported from OpenUSD 26.11.1:
//  pxr/usd/pcp/testenv/testPcpCompositionResults.py,
//  pxr/usd/pcp/testenv/testPcpDependencies.py,
//  pxr/usd/pcp/testenv/testPcpPrimIndex.py
// Copyright 2017, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the graph/dependency/property-index surface exercised by OpenUSD
// v26.08 pxr/usd/pcp/testenv/testPcpDependencies.py,
// testPcpPrimIndex.py, and testPcpCompositionResults.py. These are registered
// as testPcpDependencies, testPcpPrimIndex, and the Pcp museum tranche in
// pxr/usd/pcp/CMakeLists.txt.

import { describe, expect, it } from 'vitest'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Layer } from 'typescript-usd/sdf'
import * as Pcp from '../../src/index.ts'
import {
  ArcType as PcpArcType,
  Cache as PcpCache,
  Dependency,
  DependencyType,
  InstanceKey,
  Layer as PcpLayer,
  LayerOpener as PcpLayerOpener,
  LayerStackSite,
  MapFunction,
  NodeRef,
  PcpArc,
  PcpArcInfo,
  PcpArcTypeInherit,
  PcpArcTypePayload,
  PcpArcTypeReference,
  PcpArcTypeRelocate,
  PcpArcTypeRoot,
  PcpArcTypeSpecialize,
  PcpArcTypeVariant,
  pcpBuildFilteredTargetIndex,
  pcpBuildPrimPropertyIndex,
  pcpBuildPropertyIndex,
  pcpBuildTargetIndex,
  pcpClassifyNodeDependency,
  pcpCompareNodeStrength,
  pcpSite,
} from '../../src/index.ts'

describe('Pcp dependency public constants', () => {
  it('exports the OpenUSD v26.08 dependency bitmask enumerators', () => {
    expect(Pcp.PcpDependencyTypeNone).toBe(DependencyType.None)
    expect(Pcp.PcpDependencyTypeRoot).toBe(DependencyType.Root)
    expect(Pcp.PcpDependencyTypePurelyDirect).toBe(DependencyType.PurelyDirect)
    expect(Pcp.PcpDependencyTypePartlyDirect).toBe(DependencyType.PartlyDirect)
    expect(Pcp.PcpDependencyTypeAncestral).toBe(DependencyType.Ancestral)
    expect(Pcp.PcpDependencyTypeVirtual).toBe(DependencyType.Virtual)
    expect(Pcp.PcpDependencyTypeNonVirtual).toBe(DependencyType.NonVirtual)
    expect(Pcp.PcpDependencyTypeDirect).toBe(DependencyType.Direct)
    expect(Pcp.PcpDependencyTypeAnyNonVirtual).toBe(DependencyType.AnyNonVirtual)
    expect(Pcp.PcpDependencyTypeAnyIncludingVirtual)
      .toBe(DependencyType.AnyIncludingVirtual)
  })
})

function openerOver(layers: PcpLayer[]): PcpLayerOpener {
  const byPath = new Map(layers.map(layer => [layer.filePath, layer]))
  return async filePath => byPath.get(filePath) ?? null
}

async function graph() {
  const root: PcpLayer = Layer.createInMemory('/root.usda', `#usda 1.0
def "Base"
{
}

def "Model" (
    references = </Base>
)
{
    rel rel = </Target>
}

def "Target"
{
}
`)
  const cache = await PcpCache.create(root, openerOver([root]))
  const index = await cache.computePrimIndex('/Model')
  return { root, cache, index }
}

describe('testPcpPrimIndex graph introspection', () => {
  it('publishes NodeRef sites, arcs, dependency classification, and strength', async () => {
    const { index } = await graph()
    const root = index.rootNode
    const reference = root.children.find(node => node.arcType === PcpArcType.Reference)!

    expect(root).toBeInstanceOf(NodeRef)
    expect(root.site).toBeInstanceOf(LayerStackSite)
    expect(root.site.path.pathString).toBe('/Model')
    expect(root.getRootNode()).toBe(root)
    expect(reference.parent).toBe(root)
    expect(reference.origin).toBe(root)
    expect(reference.getIntroPath().pathString).toBe('/Model')
    expect(reference.getPathAtIntroduction().pathString).toBe('/Base')
    expect(pcpCompareNodeStrength(root, reference)).toBe(-1)
    expect(pcpClassifyNodeDependency(root)).toBe(DependencyType.Root)
    expect(pcpClassifyNodeDependency(reference)).toBe(
      DependencyType.PurelyDirect | DependencyType.NonVirtual)
  })

  it('publishes graph edge/provenance/value records', async () => {
    const { root, index } = await graph()
    const reference = index.rootNode.children[0]!
    const arc = new PcpArc(PcpArcType.Reference, index.rootNode)
    const info = new PcpArcInfo(root)
    const site = new LayerStackSite(index.rootNode.layerStack, index.rootNode.path)
    const dependency = new Dependency('/Model', '/Base', reference.mapToRoot.evaluate())

    expect(arc.type).toBe(PcpArcType.Reference)
    expect(info.sourceLayer).toBe(root)
    expect(site.equals(index.rootNode.site)).toBe(true)
    expect(dependency.equals(new Dependency(
      SdfPath.fromString('/Model'), SdfPath.fromString('/Base'),
      reference.mapToRoot.evaluate(),
    ))).toBe(true)
    expect(new InstanceKey().toString()).toContain('(none)')
    expect(new InstanceKey(index).equals(new InstanceKey(index))).toBe(true)
    expect(MapFunction.identity().isIdentity()).toBe(true)
  })
})

describe('testPcpCompositionResults property and target builders', () => {
  it('runs all four PcpBuild index functions against a computed prim index', async () => {
    const { cache, index } = await graph()
    const propertyPath = SdfPath.fromString('/Model.rel')
    const [primPropertyIndex, primErrors] = pcpBuildPrimPropertyIndex(
      propertyPath, cache, index)
    const [propertyIndex, propertyErrors] = await pcpBuildPropertyIndex(
      propertyPath, cache)
    const site = pcpSite(index.rootNode.layerStack.identifier, '/Model.rel')
    const [targetIndex, targetErrors] = pcpBuildTargetIndex(
      site, propertyIndex, 'relationship')
    const [filteredIndex, deletedPaths, filteredErrors] =
      pcpBuildFilteredTargetIndex(
        site, propertyIndex, 'relationship', false, null, false, cache)

    expect(primErrors).toEqual([])
    expect(propertyErrors).toEqual([])
    expect(primPropertyIndex.propertyStack.map(spec => spec.getPath().pathString))
      .toEqual(['/Model.rel'])
    expect(propertyIndex.propertyStack.map(spec => spec.getPath().pathString))
      .toEqual(['/Model.rel'])
    expect(targetErrors).toEqual([])
    expect(filteredErrors).toEqual([])
    expect(targetIndex.paths.map(path => path.pathString)).toEqual(['/Target'])
    expect(filteredIndex.paths.map(path => path.pathString)).toEqual(['/Target'])
    expect(deletedPaths).toEqual([])
  })
})

describe('PcpArcType registered constants', () => {
  it('exports the seven v26.08 arc constants independently', () => {
    expect([
      PcpArcTypeRoot,
      PcpArcTypeInherit,
      PcpArcTypeVariant,
      PcpArcTypeRelocate,
      PcpArcTypeReference,
      PcpArcTypePayload,
      PcpArcTypeSpecialize,
    ]).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
