// Ported from OpenUSD 26.11.1: pxr/usd/pcp/primIndex.cpp,
//  pxr/usd/pcp/testenv/testPcpIterator.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/testenv/testPcpIterator.cpp, using its
// testPcpIterator.testenv fixtures. The test runs in the testenv, and its
// iteration output is compared with baseline/iteration_results.txt
// (DIFF_COMPARE, pxr/usd/pcp/CMakeLists.txt:1444-1449).
//
// typescript-usd caches are USD-mode; the upstream test builds a legacy (non-USD)
// cache. The baseline here was re-captured from OpenUSD v26.08 with
// Pcp.Cache(..., usd=True) and Pcp.BuildPrimPropertyIndex. The node and
// property output matches upstream's baseline exactly; the prim spec
// sections are empty because USD mode does not retain prim stacks
// (Pcp_RescanForSpecs, primIndex.cpp:4625-4634), so PcpPrimIndex::
// GetPrimRange is empty and the comparison, symmetry and random access
// checks of prim ranges have nothing to iterate.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/usd/_internal'
import {
  ArcType as PcpArcType, Cache as PcpCache,
  NodeReverseIterator as PcpNodeReverseIterator,
  PrimReverseIterator as PcpPrimReverseIterator,
  PropertyReverseIterator as PcpPropertyReverseIterator,
  RangeType as PcpRangeType,
  pcpBuildPrimPropertyIndex,
  type Error as PcpError, type LayerOpener as PcpLayerOpener, type NodeRef as PcpNodeRef,
  type PrimIndex as PcpPrimIndex, type PropertyIndex as PcpPropertyIndex,
} from '../../src/index.ts'

const TESTENV = path.join(
  fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testPcpIterator.testenv',
)

const opener: PcpLayerOpener = async (filePath) => {
  try {
    return (await Layer.findOrOpen(filePath))!
  } catch {
    return null
  }
}

// TfEnum display names (types.cpp:16-36).
const ARC_TYPE_NAMES: Record<PcpArcType, string> = {
  [PcpArcType.Root]: 'root',
  [PcpArcType.Inherit]: 'inherit',
  [PcpArcType.Relocate]: 'relocate',
  [PcpArcType.Variant]: 'variant',
  [PcpArcType.Reference]: 'reference',
  [PcpArcType.Payload]: 'payload',
  [PcpArcType.Specialize]: 'specialize',
}
const RANGE_TYPE_NAMES: Record<PcpRangeType, string> = {
  [PcpRangeType.Root]: 'root',
  [PcpRangeType.Inherit]: 'inherit',
  [PcpRangeType.Variant]: 'variant',
  [PcpRangeType.Reference]: 'reference',
  [PcpRangeType.Payload]: 'payload',
  [PcpRangeType.Specialize]: 'specialize',
  [PcpRangeType.All]: 'all',
  [PcpRangeType.WeakerThanRoot]: 'weaker than root',
  [PcpRangeType.StrongerThanPayload]: 'stronger than payload',
  [PcpRangeType.Invalid]: 'invalid',
}

// Pcp_FormatSite with PcpIdentifierFormatBaseName (diagnostic.cpp:433-447).
function formatSite(layerPath: string, sitePath: string): string {
  return `@${path.basename(layerPath)}@<${sitePath}>`
}

function formatNodeSite(node: PcpNodeRef): string {
  return formatSite(node.getLayerStack().identifier.rootLayer.filePath, node.getPath().pathString)
}

class Output {
  private readonly _lines: string[] = ['']
  write(text: string): this {
    const parts = text.split('\n')
    this._lines[this._lines.length - 1] += parts[0]!
    this._lines.push(...parts.slice(1))
    return this
  }
  endl(): this { return this.write('\n') }
  toString(): string { return this._lines.join('\n') }
}

function validateAndPrintNode(out: Output, node: PcpNodeRef): void {
  expect(node).toBeTruthy()
  out.write(formatNodeSite(node)).write('\t').write(ARC_TYPE_NAMES[node.getArcType()])
}

function validateAndPrintPrimFromNode(
  out: Output, sdSite: { layer: { filePath: string }, path: { pathString: string } },
  node: PcpNodeRef,
): void {
  expect(node).toBeTruthy()
  expect(node.getPath().pathString).toBe(sdSite.path.pathString)
  expect(node.getLayerStack().identifier.rootLayer).toBe(sdSite.layer)
  out.write(formatSite(sdSite.layer.filePath, sdSite.path.pathString))
    .write('\t').write(ARC_TYPE_NAMES[node.getArcType()])
}

const rootPathText = (primIndex: PcpPrimIndex): string =>
  `<${primIndex.getRootNode().getPath().pathString}>:`

function iterateAndPrintPrimIndexNodes(
  out: Output, primIndex: PcpPrimIndex, type: PcpRangeType = PcpRangeType.All,
): void {
  out.write(`Iterating over ${RANGE_TYPE_NAMES[type]} nodes for `)
    .write(rootPathText(primIndex)).endl()
  for (const node of primIndex.getNodeRange(type)) {
    out.write(' ')
    validateAndPrintNode(out, node)
    out.endl()
  }

  out.endl()
  out.write(`Reverse iterating over ${RANGE_TYPE_NAMES[type]} nodes for `)
    .write(rootPathText(primIndex)).endl()
  const reversed = primIndex.getNodeRange(type).reversed()
  for (const it = reversed.first; !it.equals(reversed.second); it.increment()) {
    out.write(' ')
    validateAndPrintNode(out, it.deref())
    out.endl()
  }
}

function iterateAndPrintPrimIndexPrims(
  out: Output, primIndex: PcpPrimIndex, type: PcpRangeType = PcpRangeType.All,
): void {
  out.write(`Iterating over ${RANGE_TYPE_NAMES[type]} prim specs for `)
    .write(rootPathText(primIndex)).endl()
  const range = primIndex.getPrimRange(type)
  for (const it = range.first; !it.equals(range.second); it.increment()) {
    out.write(' ')
    validateAndPrintPrimFromNode(out, it.deref(), it.getNode())
    out.endl()
  }

  out.endl()
  out.write(`Reverse iterating over ${RANGE_TYPE_NAMES[type]} prim specs for `)
    .write(rootPathText(primIndex)).endl()
  const reversed = primIndex.getPrimRange(type).reversed()
  for (const it = reversed.first; !it.equals(reversed.second); it.increment()) {
    out.write(' ')
    validateAndPrintPrimFromNode(out, it.deref(), it.getNode())
    out.endl()
  }
}

async function computePrimIndex(cache: PcpCache, primPath: string): Promise<PcpPrimIndex> {
  const errors: PcpError[] = []
  const primIndex = await cache.computePrimIndex(primPath, errors)
  expect(errors).toEqual([])
  return primIndex
}

function computePropertyIndex(
  cache: PcpCache, primIndex: PcpPrimIndex, propPath: string,
): PcpPropertyIndex {
  const [propIndex, errors] = pcpBuildPrimPropertyIndex(propPath, cache, primIndex)
  expect(errors).toEqual([])
  return propIndex
}

async function iterateAndPrintPrimIndex(
  out: Output, cache: PcpCache, primPath: string, type: PcpRangeType = PcpRangeType.All,
): Promise<void> {
  const primIndex = await computePrimIndex(cache, primPath)
  iterateAndPrintPrimIndexNodes(out, primIndex, type)
  out.endl()
  iterateAndPrintPrimIndexPrims(out, primIndex, type)
}

async function iterateAndPrintPrimIndexSubtreeRanges(
  out: Output, cache: PcpCache, primPath: string,
): Promise<void> {
  const primIndex = await computePrimIndex(cache, primPath)
  for (const node of primIndex.getNodeRange()) {
    out.endl()
    out.write('Subtree iterating over subtree nodes starting at node ')
      .write(formatNodeSite(node)).write(':').endl()
    for (const subtreeNode of primIndex.getNodeSubtreeRange(node)) {
      out.write(' ')
      validateAndPrintNode(out, subtreeNode)
      out.endl()
    }
  }
}

function iterateAndPrintPropertyIndex(
  out: Output, cache: PcpCache, primIndex: PcpPrimIndex, propPath: string, localOnly: boolean,
): void {
  const propIndex = computePropertyIndex(cache, primIndex, propPath)

  out.write(`Iterating over ${localOnly ? 'local' : 'all'} property specs for `)
    .write(`<${propPath}>:`).endl()
  const range = propIndex.getPropertyRange(localOnly)
  for (const it = range.first; !it.equals(range.second); it.increment()) {
    const spec = it.deref()
    out.write(' ').write(formatSite(spec.getLayer().filePath, spec.getPath().pathString))
      .write(' from node ')
    validateAndPrintNode(out, it.getNode())
    out.endl()
  }

  out.endl()

  out.write(`Reverse iterating over ${localOnly ? 'local' : 'all'} property specs for `)
    .write(`<${propPath}>:`).endl()
  const reversed = propIndex.getPropertyRange(localOnly).reversed()
  for (const it = reversed.first; !it.equals(reversed.second); it.increment()) {
    const spec = it.deref()
    out.write(' ').write(formatSite(spec.getLayer().filePath, spec.getPath().pathString))
      .write(' from node ')
    validateAndPrintNode(out, it.getNode())
    out.endl()
  }
}

interface RandomAccessIterator<Self> {
  clone(): Self
  increment(): Self
  decrement(): Self
  plus(n: number): Self
  minus(n: number): Self
  subtract(other: Self): number
  equals(other: Self): boolean
}

function testComparisonOperations<It extends RandomAccessIterator<It>>(
  first: It, last: It,
): void {
  expect(first.equals(last)).toBe(false)

  first = first.clone()
  let first2 = first.clone()
  const last2 = last.clone()
  do {
    expect(first.equals(first2)).toBe(true)
    first.increment()
    expect(first.equals(first2)).toBe(false)
    first2 = first2.clone().increment()
  } while (!first.equals(last) && !first2.equals(last2))
}

function testRandomAccessOperations<It extends RandomAccessIterator<It>>(
  first: It, last: It,
): void {
  expect(first.equals(last)).toBe(false)

  let idx = 0
  for (const it = first.clone(); !it.equals(last); it.increment(), ++idx) {
    expect(it.subtract(first)).toBe(idx)
    expect(it.minus(idx).equals(first)).toBe(true)
    expect(it.equals(first.plus(idx))).toBe(true)
  }
}

// Ensure that using increment/decrement operators and std::prev / std::next
// produce symmetrical results
function testIncrementAndAdvanceSymmetry<It extends RandomAccessIterator<It>>(
  first: It, last: It,
): void {
  expect(first.equals(last)).toBe(false)
  expect(last.subtract(first)).toBeGreaterThan(2)

  const byIncrement = first.clone()
  byIncrement.increment()
  byIncrement.increment()
  byIncrement.decrement()

  const byAdvance = first.plus(2).minus(1)

  expect(byIncrement.subtract(first)).toBe(1)
  expect(byAdvance.subtract(first)).toBe(1)
  expect(first.subtract(byIncrement)).toBe(-1)
  expect(first.subtract(byAdvance)).toBe(-1)
  expect(byIncrement.subtract(byAdvance)).toBe(0)
  expect(byIncrement.equals(byAdvance)).toBe(true)
}

describe('testPcpIterator', () => {
  let cache: PcpCache

  beforeAll(async () => {
    const rootLayer = (await Layer.findOrOpen(path.join(TESTENV, 'root.usda')))!
    expect(rootLayer).toBeTruthy()
    cache = await PcpCache.create(rootLayer, opener)
    cache.requestPayloads(['/Model'], [])
  })

  it('Testing comparison operators...', async () => {
    const primIndex = await computePrimIndex(cache, '/Model')

    const nodeRange = primIndex.getNodeRange()
    testComparisonOperations(nodeRange.first, nodeRange.second)

    const primRange = primIndex.getPrimRange()
    expect(primRange.first.equals(primRange.second)).toBe(true)

    const propIndex = computePropertyIndex(cache, primIndex, '/Model.a')
    const propRange = propIndex.getPropertyRange()
    testComparisonOperations(propRange.first, propRange.second)
  })

  it('Testing Increment / Advance Symmetry', async () => {
    const primIndex = await computePrimIndex(cache, '/Model')

    const nodeRange = primIndex.getNodeRange()
    testIncrementAndAdvanceSymmetry(nodeRange.first, nodeRange.second)

    const primRange = primIndex.getPrimRange()
    expect(primRange.first.equals(primRange.second)).toBe(true)

    const propIndex = computePropertyIndex(cache, primIndex, '/Model.a')
    const propRange = propIndex.getPropertyRange()
    testIncrementAndAdvanceSymmetry(propRange.first, propRange.second)
  })

  it('Testing random access operations...', async () => {
    const primIndex = await computePrimIndex(cache, '/Model')

    const nodeRange = primIndex.getNodeRange()
    testRandomAccessOperations(nodeRange.first, nodeRange.second)
    testRandomAccessOperations(
      new PcpNodeReverseIterator(nodeRange.second),
      new PcpNodeReverseIterator(nodeRange.first))

    const primRange = primIndex.getPrimRange()
    expect(primRange.first.equals(primRange.second)).toBe(true)
    expect(new PcpPrimReverseIterator(primRange.second)
      .equals(new PcpPrimReverseIterator(primRange.first))).toBe(true)

    const propIndex = computePropertyIndex(cache, primIndex, '/Model.a')
    const propRange = propIndex.getPropertyRange()
    testRandomAccessOperations(propRange.first, propRange.second)
    testRandomAccessOperations(
      new PcpPropertyReverseIterator(propRange.second),
      new PcpPropertyReverseIterator(propRange.first))
  })

  it('Testing MoveToNextSubtree', async () => {
    const primIndex = await computePrimIndex(cache, '/Model')

    const isDescendantOfNode = (ancestorNode: PcpNodeRef, n: PcpNodeRef | null): boolean => {
      for (; n; n = n.getParentNode()) {
        if (n.equals(ancestorNode)) return true
      }
      return false
    }

    const range = primIndex.getNodeRange()
    for (const first = range.first; !first.equals(range.second); first.increment()) {
      // Manually compute the iterator pointing to the next subtree
      // after range.first by incrementing until we find the first
      // node that does not have range.first's node as an ancestor.
      const expectedNextSubtreeIter = first.clone()
      for (; !expectedNextSubtreeIter.equals(range.second);
        expectedNextSubtreeIter.increment()) {
        if (!isDescendantOfNode(first.deref(), expectedNextSubtreeIter.deref())) break
      }

      // Use MoveToNextSubtree to compute the iterator pointing
      // to the next subtree. This should match the above.
      const computedNextSubtreeIter = first.clone()
      computedNextSubtreeIter.moveToNextSubtree()

      expect(expectedNextSubtreeIter.equals(computedNextSubtreeIter)).toBe(true)
    }
  })

  it('Testing GetNodeIteratorAtNode', async () => {
    const primIndex = await computePrimIndex(cache, '/Model')

    const nodeRange = primIndex.getNodeRange()
    for (const it = nodeRange.first; !it.equals(nodeRange.second); it.increment()) {
      const node = it.deref()
      const iteratorAtNode = primIndex.getNodeIteratorAtNode(node)
      expect(it.equals(iteratorAtNode)).toBe(true)
    }

    expect(primIndex.getNodeIteratorAtNode(null).equals(nodeRange.second)).toBe(true)
  })

  it('Testing iteration (output to file)...', async () => {
    const outfile = new Output()
    for (let type = PcpRangeType.Root; type !== PcpRangeType.Invalid; type = (type + 1) as PcpRangeType) {
      await iterateAndPrintPrimIndex(outfile, cache, '/Model', type)
      outfile.endl()
        .write('====================').endl()
        .endl()
    }

    await iterateAndPrintPrimIndexSubtreeRanges(outfile, cache, '/Model')

    outfile.endl()
      .write('====================').endl()
      .endl()

    const primIndex = await computePrimIndex(cache, '/Model')
    iterateAndPrintPropertyIndex(outfile, cache, primIndex, '/Model.a', /* localOnly */ true)

    outfile.endl()
      .write('====================').endl()
      .endl()

    iterateAndPrintPropertyIndex(outfile, cache, primIndex, '/Model.a', /* localOnly */ false)

    const baseline = fs.readFileSync(
      path.join(TESTENV, 'baseline/iteration_results.txt'), 'utf8')
    expect(outfile.toString()).toBe(baseline)
  })
})
