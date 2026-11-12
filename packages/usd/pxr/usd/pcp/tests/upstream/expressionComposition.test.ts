// Ported from OpenUSD 26.11.1: pxr/usd/pcp/changes.cpp,
//  pxr/usd/pcp/primIndex.cpp,
//  pxr/usd/pcp/testenv/testPcpExpressionComposition.py
// Copyright 2016, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/usd/pcp/testenv/testPcpExpressionComposition.py,
// using its testPcpExpressionComposition.testenv fixtures. The test runs with
// the testenv as the working directory, as upstream's test registration does.
//
// typescript-usd caches are USD-mode; the upstream suite builds legacy (non-USD)
// caches. Every expectation below was re-captured from OpenUSD v26.08 with
// Pcp.Cache(..., usd=True): all of them match the upstream expectations
// except PcpPrimIndex::ComposeAuthoredVariantSelections, which reads the prim
// stack that USD mode does not retain (primIndex.cpp:295-338, 4625-4635) and
// so returns {} in USD mode. PCP_ENABLE_MINIMAL_CHANGES_FOR_LAYER_OPERATIONS
// is on by default (changes.cpp:27-32), so INCREMENTAL_CHANGES is true.
// Sdf layers are reference counted upstream, so each test case opens its
// layers afresh; the per-test layer table stands in for SdfLayer::FindOrOpen
// and SdfLayer::Find.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Layer } from 'typescript-usd/usd/_internal'
import {
  Cache as PcpCache, ErrorVariableExpressionError,
  _TestChangeProcessor as PcpTestChangeProcessor,
  type Error as PcpError, type LayerOpener as PcpLayerOpener, type NodeRef as PcpNodeRef,
  type PrimIndex as PcpPrimIndex,
} from '../../src/index.ts'

const TESTENV = path.join(
  fileURLToPath(new URL('.', import.meta.url)),
  'fixtures/testPcpExpressionComposition.testenv',
)

const INCREMENTAL_CHANGES = true

type Vars = Record<string, string>
// nodeEntry : [(data tuple), [nodeEntry data, children, ...]]
type NodeEntry = readonly [readonly [string, Vars], readonly unknown[]]

// SdfLayer::FindOrOpen / SdfLayer::Find over the layers this test opened.
class Layers {
  private readonly _byId = new Map<string, Layer>()

  readonly opener: PcpLayerOpener = async (identifier) => {
    try {
      return await this.findOrOpen(identifier)
    } catch {
      return null
    }
  }

  async findOrOpen(assetPath: string): Promise<Layer> {
    const id = this._id(assetPath)
    const existing = this._byId.get(id)
    if (existing) return existing
    const layer = (await Layer.open(id))!
    this._byId.set(id, layer)
    return layer
  }

  find(assetPath: string): Layer | undefined {
    return this._byId.get(this._id(assetPath))
  }

  add(layer: Layer): Layer {
    this._byId.set(layer.identifier, layer)
    return layer
  }

  // A readable name for a layer, which also checks its identity.
  label(layer: unknown): string {
    for (const [id, candidate] of this._byId) {
      if (candidate === layer) return path.relative(process.cwd(), id) || id
    }
    return `<unknown layer ${(layer as Layer | undefined)?.identifier}>`
  }

  private _id(assetPath: string): string {
    return assetPath.startsWith('anon:') ? assetPath : path.resolve(assetPath)
  }
}

async function loadPcpCache(layers: Layers, rootLayer: string): Promise<PcpCache> {
  const l = await layers.findOrOpen(rootLayer)
  return PcpCache.create(l, layers.opener)
}

async function computePrimIndex(
  cache: PcpCache, primPath: string,
): Promise<[PcpPrimIndex, PcpError[]]> {
  const err: PcpError[] = []
  const pi = await cache.computePrimIndex(primPath, err)
  return [pi, err]
}

// Python's PcpPrimIndex.primStack (PcpComputePrimStackForPrimIndex).
function primStack(layers: Layers, pi: PcpPrimIndex): string[] {
  return pi.composePrimStack().map(entry =>
    `${layers.label(entry.layer)}:${entry.path.pathString}`)
}

// layer.GetPrimAtPath(path), named the way primStack names it.
function prim(layers: Layers, layer: Layer, primPath: string): string {
  expect(layer.getPrimAtPath(primPath)).toBeTruthy()
  return `${layers.label(layer)}:${primPath}`
}

function layerStackLayers(layers: Layers, pi: PcpPrimIndex | PcpNodeRef): string[] {
  const node = 'rootNode' in pi ? pi.rootNode : pi
  return node.layerStack.layers.map(({ layer }) => layers.label(layer))
}

const labels = (layers: Layers, list: readonly Layer[]): string[] =>
  list.map(layer => layers.label(layer))

const setExpressionVariables = (layer: Layer, vars: Vars): void =>
  layer.setField('/', 'expressionVariables', vars)
const clearExpressionVariables = (layer: Layer): void =>
  layer.eraseField('/', 'expressionVariables')
const appendSubLayerPath = (layer: Layer, subLayerPath: string): void =>
  layer.insertSubLayerPath(subLayerPath)
const deleteLastSubLayerPath = (layer: Layer): void =>
  layer.removeSubLayerPath(layer.getSubLayerPaths().length - 1)

interface ChangeSummary {
  getSignificantChanges(): string[]
  getSpecChanges(): string[]
  getPrimChanges(): string[]
}

// `with Pcp._TestChangeProcessor(pcpCache) as changes:` around the edits in
// `mutate`; `check` runs inside the with block.
async function withChanges(
  cache: PcpCache, mutate: () => void, check: (changes: ChangeSummary) => void,
): Promise<void> {
  const changes = new PcpTestChangeProcessor(cache).enter()
  mutate()
  await changes.process()
  check(changes)
  await changes.exit()
}

// Pcp._TestPrimIndex (pxr/usd/pcp/__init__.py:13-80).
function* testPrimIndex(
  primIndex: PcpPrimIndex, expected: NodeEntry,
): Generator<[PcpNodeRef, readonly [string, Vars]]> {
  function* recurse(
    node: PcpNodeRef, entry: NodeEntry,
  ): Generator<[PcpNodeRef, readonly [string, Vars]]> {
    if (entry[0] === undefined) {
      throw new Error(`No entry in expected corresponding to node ${node.path.pathString}`)
    }
    yield [node, entry[0]]

    if (entry[1].length % 2 !== 0) {
      throw new Error('Invalid children list. Each element in the list ' +
        'must be a tuple of node data followed by another list')
    }

    const numExpectedChildren = entry[1].length / 2
    if (node.children.length !== numExpectedChildren) {
      throw new Error(`Expected ${numExpectedChildren} children but have ` +
        `${node.children.length} for node ${node.path.pathString}`)
    }

    for (const [idx, n] of node.children.entries()) {
      const expectedSubtree = entry[1].slice(idx * 2, idx * 2 + 2) as unknown as NodeEntry
      yield* recurse(n, expectedSubtree)
    }
  }
  yield* recurse(primIndex.rootNode, expected)
}

describe('TestPcpExpressionComposition', () => {
  let cwd: string
  beforeAll(() => {
    cwd = process.cwd()
    process.chdir(TESTENV)
  })
  afterAll(() => {
    process.chdir(cwd)
  })

  // Helper function for verifying the expected value of expression variables
  // in the layer stacks throughout the prim index for the prim at the given
  // path. See Pcp._TestPrimIndex for more info.
  //
  // If "errorsExpected" is false, then this function fails if any
  // composition errors are generated when computing the prim index.
  async function assertVariables(
    layers: Layers, pcpCache: PcpCache, primPath: string, expected: NodeEntry,
    errorsExpected = false,
  ): Promise<PcpPrimIndex> {
    const [pi, err] = await computePrimIndex(pcpCache, primPath)
    if (errorsExpected) {
      expect(err.length, 'Composition errors expected').toBeGreaterThan(0)
    } else {
      expect(err, `Unexpected composition errors: ${err.map(e => e.message).join(',')}`)
        .toEqual([])
    }

    for (const [node, entry] of testPrimIndex(pi, expected)) {
      const [expectedRootLayerId, expectedVariables] = entry

      expect(layers.label(node.layerStack.identifier.rootLayer))
        .toBe(layers.label(layers.find(expectedRootLayerId)))

      expect(node.layerStack.expressionVariables.getVariables(),
        `Unexpected expression variables for layer stack ${expectedRootLayerId}`)
        .toEqual(expectedVariables)
    }

    return pi
  }

  it('test_BasicSublayers', async () => {
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'sublayers/root.usda')
    const rootLayer = pcpCache.getLayerStackIdentifier().rootLayer as Layer

    const aLayer = await layers.findOrOpen('sublayers/A.usda')
    const bLayer = await layers.findOrOpen('sublayers/B.usda')
    const bSubLayer = await layers.findOrOpen('sublayers/B_sub.usda')
    const cLayer = await layers.findOrOpen('sublayers/C.usda')

    // Verify initial state.
    let [pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test'),
      prim(layers, aLayer, '/Test')])

    let layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toEqual([])
    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer, aLayer]))

    // Modify the expression variable to X=B. This should drop A.usda and load
    // B.usda as a sublayer. Since B.usda is not empty, this should incur a
    // significant resync.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { X: 'B' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test'),
      prim(layers, bLayer, '/Test'),
      prim(layers, bSubLayer, '/Test')])

    layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toEqual([])
    expect(layerStackLayers(layers, pi))
      .toEqual(labels(layers, [rootLayer, bLayer, bSubLayer]))

    // Modify the expression variable to X=C. This drops B.usda and loads
    // C.usda as a sublayer. This incurs a significant resync even though
    // C.usda is empty -- see comment in
    // PcpChanges::_DidChangeLayerStackExpressionVariables
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { X: 'C' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([prim(layers, rootLayer, '/Test')])

    layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toHaveLength(0)
    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer, cLayer]))

    // Modify the expression variable to X=BAD. This should drop C.usda and
    // attempt to load BAD.usda as a sublayer, but fail to do so since
    // BAD.usda does not exist.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { X: 'BAD' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([prim(layers, rootLayer, '/Test')])

    layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toHaveLength(1)
    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer]))

    // Modify the expression variable to X=A. This should resolve the error
    // and load A.usda again.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { X: 'A' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test'),
      prim(layers, aLayer, '/Test')])

    layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toEqual([])
    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer, aLayer]))

    // Author a new expression variable Y=B. This should cause no changes
    // since nothing relies on that variable.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { X: 'A', Y: 'B' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual([])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test'),
      prim(layers, aLayer, '/Test')])

    layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toEqual([])
    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer, aLayer]))
  })

  it('test_SublayerAuthoring', async () => {
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'sublayers/root.usda')
    const rootLayer = pcpCache.getLayerStackIdentifier().rootLayer as Layer

    const aLayer = await layers.findOrOpen('sublayers/A.usda')
    const bLayer = await layers.findOrOpen('sublayers/B.usda')
    const bSubLayer = await layers.findOrOpen('sublayers/B_sub.usda')
    const cLayer = await layers.findOrOpen('sublayers/C.usda')

    // Verify initial state.
    let [pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test'),
      prim(layers, aLayer, '/Test')])

    let layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toEqual([])
    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer, aLayer]))

    // Add a new sublayer using an expression that evaluates to B.usda.
    // Since B.usda is not empty, this should incur a significant resync.
    await withChanges(pcpCache, () => {
      appendSubLayerPath(rootLayer, '`"./B.usda"`')
    }, (changes) => {
      if (INCREMENTAL_CHANGES) {
        expect(changes.getSignificantChanges()).toEqual(['/Test'])
      } else {
        expect(changes.getSignificantChanges()).toEqual(['/'])
      }

      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test'),
      prim(layers, aLayer, '/Test'),
      prim(layers, bLayer, '/Test'),
      prim(layers, bSubLayer, '/Test')])

    layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toEqual([])
    expect(layerStackLayers(layers, pi))
      .toEqual(labels(layers, [rootLayer, aLayer, bLayer, bSubLayer]))

    // Remove the sublayer we just added to reverse the changes.
    await withChanges(pcpCache, () => {
      deleteLastSubLayerPath(rootLayer)
    }, (changes) => {
      if (INCREMENTAL_CHANGES) {
        expect(changes.getSignificantChanges()).toEqual(['/Test'])
      } else {
        expect(changes.getSignificantChanges()).toEqual(['/'])
      }

      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test'),
      prim(layers, aLayer, '/Test')])

    layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toEqual([])
    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer, aLayer]))

    // Add a new sublayer using an expression that evaluates to C.usda.
    // Since C.usda is empty, this should not incur any changes to /Test.
    await withChanges(pcpCache, () => {
      appendSubLayerPath(rootLayer, '`"./C.usda"`')
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual([])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test'),
      prim(layers, aLayer, '/Test')])

    layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toEqual([])
    expect(layerStackLayers(layers, pi))
      .toEqual(labels(layers, [rootLayer, aLayer, cLayer]))

    // Remove the sublayer we just added to reverse the changes.
    await withChanges(pcpCache, () => {
      deleteLastSubLayerPath(rootLayer)
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual([])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test'),
      prim(layers, aLayer, '/Test')])

    layerStack = pi.rootNode.layerStack
    expect(layerStack.localErrors).toEqual([])
    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer, aLayer]))
  })

  it('test_SublayerAuthoringAndVariableChange', async () => {
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'multi_sublayer_auth/base_ref.usda')

    const rootLayer = pcpCache.getLayerStackIdentifier().rootLayer as Layer
    await layers.findOrOpen('multi_sublayer_auth/A.usda')
    const bLayer = await layers.findOrOpen('multi_sublayer_auth/B.usda')

    // Verify initial state.
    let [pi, err] = await computePrimIndex(pcpCache, '/BaseRef')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([prim(layers, rootLayer, '/BaseRef')])

    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer]))

    // Add a new sublayer expression and the variable it depends on
    // in the same change block. The newly-authored variable should
    // be used when evaluating the sublayer, which should be loaded
    // successfully and cause the appropriate resyncs.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { X: 'B' })
      appendSubLayerPath(rootLayer, '`"./${X}.usda"`')
    }, (changes) => {
      if (INCREMENTAL_CHANGES) {
        expect(changes.getSignificantChanges()).toEqual(['/BaseRef'])
      } else {
        expect(changes.getSignificantChanges()).toEqual(['/'])
      }

      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/BaseRef')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/BaseRef'),
      prim(layers, bLayer, '/BaseRef')])

    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer, bLayer]))

    // Undo the changes in the same change block to reverse the
    // effects.
    await withChanges(pcpCache, () => {
      clearExpressionVariables(rootLayer)
      deleteLastSubLayerPath(rootLayer)
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/BaseRef')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([prim(layers, rootLayer, '/BaseRef')])

    expect(layerStackLayers(layers, pi)).toEqual(labels(layers, [rootLayer]))
  })

  it('test_SublayerAuthoringWithNoEffectiveChange', async () => {
    // Tests behavior when updating a sublayer variable expression
    // without actually changing the sublayers in the layer stack.
    const test = async () => {
      const layers = new Layers()
      const subLayer = layers.add(Layer.createAnonymous('sub'))
      subLayer.importFromString(`#usda 1.0

            def "Def"
            {
            }

            over "Over"
            {
            }
            `)

      const rootLayer = layers.add(Layer.createAnonymous())
      rootLayer.importFromString(`#usda 1.0
            (
                subLayers = [
                    @\`if(contains(["foo", "bar"], \${VAR}), "${subLayer.identifier}")\`@
                ]
                expressionVariables = {
                    string "VAR" = "foo"
                }
            )

            def "Def"
            {
            }

            over "Over"
            {
            }
            `)

      const pcp = await PcpCache.create(rootLayer, layers.opener)

      let [pi, err] = await computePrimIndex(pcp, '/Def')
      expect(err).toEqual([])
      expect(pi.rootNode.hasSpecs).toBe(true)
      expect(primStack(layers, pi)).toEqual([
        prim(layers, rootLayer, '/Def'),
        prim(layers, subLayer, '/Def')])

      ;[pi, err] = await computePrimIndex(pcp, '/Over')
      expect(err).toEqual([])
      expect(pi.rootNode.hasSpecs).toBe(true)
      expect(primStack(layers, pi)).toEqual([
        prim(layers, rootLayer, '/Over'),
        prim(layers, subLayer, '/Over')])

      // Change the condition in the sublayer expression such that it
      // still passes and the sublayer remains loaded.
      //
      // XXX: In the future Pcp could detect this and not issue any
      // invalidations, in which case this test would need to be updated.
      await withChanges(pcp, () => {
        const subLayerPaths = rootLayer.getSubLayerPaths()
        subLayerPaths[0] =
          `\`if(contains(["foo"], \${VAR}), "${subLayer.identifier}")\``
        rootLayer.setSubLayerPaths(subLayerPaths)
      }, (cp) => {
        if (INCREMENTAL_CHANGES) {
          expect(cp.getSignificantChanges()).toEqual(['/Def'])
          expect(cp.getSpecChanges()).toEqual(['/Over'])
        } else {
          expect(cp.getSignificantChanges()).toEqual(['/'])
          expect(cp.getSpecChanges()).toEqual([])
        }
      })

      ;[pi, err] = await computePrimIndex(pcp, '/Def')
      expect(err).toEqual([])
      expect(pi.rootNode.hasSpecs).toBe(true)
      expect(primStack(layers, pi)).toEqual([
        prim(layers, rootLayer, '/Def'),
        prim(layers, subLayer, '/Def')])

      ;[pi, err] = await computePrimIndex(pcp, '/Over')
      expect(err).toEqual([])
      expect(pi.rootNode.hasSpecs).toBe(true)
      expect(primStack(layers, pi)).toEqual([
        prim(layers, rootLayer, '/Over'),
        prim(layers, subLayer, '/Over')])
    }

    // Upstream runs _test(usd=False) and _test(usd=True); typescript-usd caches
    // are USD-mode.
    await test()
  })

  it('test_SublayerAuthoringAffectingMultipleLayerStacks', async () => {
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'multi_sublayer_auth/root.usda')

    const rootLayer = pcpCache.getLayerStackIdentifier().rootLayer as Layer
    const ref1Layer = await layers.findOrOpen('multi_sublayer_auth/ref1.usda')
    const ref2Layer = await layers.findOrOpen('multi_sublayer_auth/ref2.usda')
    const baseRefLayer = await layers.findOrOpen('multi_sublayer_auth/base_ref.usda')

    const aLayer = await layers.findOrOpen('multi_sublayer_auth/A.usda')
    const bLayer = await layers.findOrOpen('multi_sublayer_auth/B.usda')

    const baseRefNode = (pi: PcpPrimIndex): PcpNodeRef =>
      pi.rootNode.children[0]!.children[0]!

    // Verify initial state.
    let [pi, err] = await computePrimIndex(pcpCache, '/Test_1')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test_1'),
      prim(layers, ref1Layer, '/Ref_1'),
      prim(layers, baseRefLayer, '/BaseRef')])

    let baseRefLayerStack = baseRefNode(pi).layerStack
    expect(baseRefLayerStack.identifier.rootLayer).toBe(baseRefLayer)
    expect(layerStackLayers(layers, baseRefNode(pi))).toEqual(labels(layers, [baseRefLayer]))

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test_2')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test_2'),
      prim(layers, ref2Layer, '/Ref_2'),
      prim(layers, baseRefLayer, '/BaseRef')])

    baseRefLayerStack = baseRefNode(pi).layerStack
    expect(baseRefLayerStack.identifier.rootLayer).toBe(baseRefLayer)
    expect(layerStackLayers(layers, baseRefNode(pi))).toEqual(labels(layers, [baseRefLayer]))

    // Add a sublayer that refers to the expression variable X in
    // base_ref.usda. This variable is assigned different values in the
    // various referenced layer stacks:
    //
    //   - In ref1.usda, X=A, which should load insignificant sublayer
    //     A.usda, causing no changes for /Test_1.
    //
    //   - In ref2.usda, X=B, which should load significant sublayer
    //     B.usda, causing a significant resync for /Test_2.
    await withChanges(pcpCache, () => {
      appendSubLayerPath(baseRefLayer, '`"./${X}.usda"`')
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/Test_2'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test_1')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test_1'),
      prim(layers, ref1Layer, '/Ref_1'),
      prim(layers, baseRefLayer, '/BaseRef')])

    baseRefLayerStack = baseRefNode(pi).layerStack
    expect(baseRefLayerStack.identifier.rootLayer).toBe(baseRefLayer)
    expect(layerStackLayers(layers, baseRefNode(pi)))
      .toEqual(labels(layers, [baseRefLayer, aLayer]))

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test_2')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test_2'),
      prim(layers, ref2Layer, '/Ref_2'),
      prim(layers, baseRefLayer, '/BaseRef'),
      prim(layers, bLayer, '/BaseRef')])

    baseRefLayerStack = baseRefNode(pi).layerStack
    expect(baseRefLayerStack.identifier.rootLayer).toBe(baseRefLayer)
    expect(layerStackLayers(layers, baseRefNode(pi)))
      .toEqual(labels(layers, [baseRefLayer, bLayer]))

    // Remove the sublayer to reverse the changes.
    await withChanges(pcpCache, () => {
      deleteLastSubLayerPath(baseRefLayer)
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/Test_2'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test_1')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test_1'),
      prim(layers, ref1Layer, '/Ref_1'),
      prim(layers, baseRefLayer, '/BaseRef')])

    baseRefLayerStack = baseRefNode(pi).layerStack
    expect(baseRefLayerStack.identifier.rootLayer).toBe(baseRefLayer)
    expect(layerStackLayers(layers, baseRefNode(pi))).toEqual(labels(layers, [baseRefLayer]))

    ;[pi, err] = await computePrimIndex(pcpCache, '/Test_2')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Test_2'),
      prim(layers, ref2Layer, '/Ref_2'),
      prim(layers, baseRefLayer, '/BaseRef')])

    baseRefLayerStack = baseRefNode(pi).layerStack
    expect(baseRefLayerStack.identifier.rootLayer).toBe(baseRefLayer)
    expect(layerStackLayers(layers, baseRefNode(pi))).toEqual(labels(layers, [baseRefLayer]))
  })

  it('test_BasicReferencesAndPayloads', async () => {
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'refs_and_payloads/root.usda')
    const rootLayer = pcpCache.getLayerStackIdentifier().rootLayer as Layer
    await layers.findOrOpen('refs_and_payloads/A.usda')
    await layers.findOrOpen('refs_and_payloads/B.usda')

    // Load payloads.
    pcpCache.requestPayloads(['/Payload', '/NoExpressionPayload'], [])

    const tree = (vars: Vars, ref?: string): NodeEntry => [
      ['refs_and_payloads/root.usda', vars], ref === undefined ? [] : [
        [ref, vars], [
        ],
      ],
    ]

    // Verify initial state.
    await assertVariables(layers, pcpCache, '/Ref',
      tree({ REF: 'A' }, 'refs_and_payloads/A.usda'))
    await assertVariables(layers, pcpCache, '/Payload',
      tree({ REF: 'A' }, 'refs_and_payloads/A.usda'))
    await assertVariables(layers, pcpCache, '/NoExpressionRef',
      tree({ REF: 'A' }, 'refs_and_payloads/A.usda'))
    await assertVariables(layers, pcpCache, '/NoExpressionPayload',
      tree({ REF: 'A' }, 'refs_and_payloads/A.usda'))

    // Author a new 'OTHER_REF' variable in the root layer. No prims
    // rely on this variable in a reference arc, so this does not result
    // in any resyncs.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { REF: 'A', OTHER_REF: 'A' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual([])
    })

    await assertVariables(layers, pcpCache, '/Ref',
      tree({ REF: 'A', OTHER_REF: 'A' }, 'refs_and_payloads/A.usda'))
    await assertVariables(layers, pcpCache, '/Payload',
      tree({ REF: 'A', OTHER_REF: 'A' }, 'refs_and_payloads/A.usda'))
    await assertVariables(layers, pcpCache, '/NoExpressionRef',
      tree({ REF: 'A', OTHER_REF: 'A' }, 'refs_and_payloads/A.usda'))
    await assertVariables(layers, pcpCache, '/NoExpressionPayload',
      tree({ REF: 'A', OTHER_REF: 'A' }, 'refs_and_payloads/A.usda'))

    // Change the value of the 'REF' variable. Since both /Ref and /Payload
    // depend on this variable, they should be resynced.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { REF: 'B' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/Payload', '/Ref'])
    })

    await assertVariables(layers, pcpCache, '/Ref',
      tree({ REF: 'B' }, 'refs_and_payloads/B.usda'))
    await assertVariables(layers, pcpCache, '/Payload',
      tree({ REF: 'B' }, 'refs_and_payloads/B.usda'))
    await assertVariables(layers, pcpCache, '/NoExpressionRef',
      tree({ REF: 'B' }, 'refs_and_payloads/A.usda'))
    await assertVariables(layers, pcpCache, '/NoExpressionPayload',
      tree({ REF: 'B' }, 'refs_and_payloads/A.usda'))

    // Change the value of the 'REF' variable to an invalid expression.
    // Both /Ref and /Payload should be resynced but raise composition
    // errors due to the invalid expression.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { REF: '`${BAD`' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/Payload', '/Ref'])
    })

    let pi = await assertVariables(layers, pcpCache, '/Ref',
      tree({ REF: '`${BAD`' }), true)

    expect(pi.localErrors[0]).toBeInstanceOf(ErrorVariableExpressionError)

    pi = await assertVariables(layers, pcpCache, '/Payload',
      tree({ REF: '`${BAD`' }), true)

    expect(pi.localErrors[0]).toBeInstanceOf(ErrorVariableExpressionError)

    await assertVariables(layers, pcpCache, '/NoExpressionRef',
      tree({ REF: '`${BAD`' }, 'refs_and_payloads/A.usda'))
    await assertVariables(layers, pcpCache, '/NoExpressionPayload',
      tree({ REF: '`${BAD`' }, 'refs_and_payloads/A.usda'))
  })

  it('test_ExpressionVarChanges_MultipleReferences', async () => {
    // Test expression variable changes involving multiple references on
    // a single prim.
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'multi_ref/root.usda')
    const rootLayer = await layers.findOrOpen('multi_ref/root.usda')
    const ref1Layer = await layers.findOrOpen('multi_ref/ref1.usda')
    const ref2Layer = await layers.findOrOpen('multi_ref/ref2.usda')
    await layers.findOrOpen('multi_ref/base_ref.usda')

    const tree = (root: Vars, ref1: Vars, ref2: Vars): NodeEntry => [
      ['multi_ref/root.usda', root], [
        ['multi_ref/ref1.usda', ref1], [
          ['multi_ref/base_ref.usda', ref1], [
          ],
        ],
        ['multi_ref/ref2.usda', ref2], [
          ['multi_ref/base_ref.usda', ref2], [
          ],
        ],
      ],
    ]

    await assertVariables(layers, pcpCache, '/MultiRef',
      tree({}, { SOURCE: 'ref1' }, { SOURCE: 'ref2' }))

    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { SOURCE: 'root' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/MultiRef'])
    })

    let multiRef = await assertVariables(layers, pcpCache, '/MultiRef',
      tree({ SOURCE: 'root' }, { SOURCE: 'root' }, { SOURCE: 'root' }))

    expect(multiRef.rootNode.children[0]!.children[0]!.layerStack)
      .toBe(multiRef.rootNode.children[1]!.children[0]!.layerStack)

    await withChanges(pcpCache, () => {
      setExpressionVariables(ref1Layer, { A: 'B' })
      setExpressionVariables(ref2Layer, { A: 'C' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/MultiRef'])
    })

    multiRef = await assertVariables(layers, pcpCache, '/MultiRef',
      tree({ SOURCE: 'root' }, { SOURCE: 'root', A: 'B' }, { SOURCE: 'root', A: 'C' }))

    expect(multiRef.rootNode.children[0]!.children[0]!.layerStack)
      .not.toBe(multiRef.rootNode.children[1]!.children[0]!.layerStack)

    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { SOURCE: 'root', A: 'D' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/MultiRef'])
    })

    multiRef = await assertVariables(layers, pcpCache, '/MultiRef',
      tree({ SOURCE: 'root', A: 'D' }, { SOURCE: 'root', A: 'D' }, { SOURCE: 'root', A: 'D' }))

    expect(multiRef.rootNode.children[0]!.children[0]!.layerStack)
      .toBe(multiRef.rootNode.children[1]!.children[0]!.layerStack)
  })

  it('test_ExpressionVarChanges_CommonReference', async () => {
    // Test that changes to authored expression variables invalidate the
    // appropriate layer stacks and prim pcpCache.
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'common_ref/root.usda')
    const ref1Layer = await layers.findOrOpen('common_ref/ref1.usda')
    const ref2Layer = await layers.findOrOpen('common_ref/ref2.usda')
    await layers.findOrOpen('common_ref/base_ref.usda')

    const tree = (ref: string, vars: Vars): NodeEntry => [
      ['common_ref/root.usda', { A: 'B' }], [
        [ref, vars], [
          ['common_ref/base_ref.usda', vars], [
          ],
        ],
      ],
    ]

    let ref1 = await assertVariables(layers, pcpCache, '/A',
      tree('common_ref/ref1.usda', { A: 'B' }))
    let ref2 = await assertVariables(layers, pcpCache, '/B',
      tree('common_ref/ref2.usda', { A: 'B' }))

    // We expect the root.usda and base_ref.usda layer stacks to be shared
    // across the two prim indexes, even though base_ref.usda is referenced
    // from different layer stacks.
    expect(ref1.rootNode.layerStack).toBe(ref2.rootNode.layerStack)
    expect(ref1.rootNode.children[0]!.layerStack)
      .not.toBe(ref2.rootNode.children[0]!.layerStack)
    expect(ref1.rootNode.children[0]!.children[0]!.layerStack)
      .toBe(ref2.rootNode.children[0]!.children[0]!.layerStack)

    // Author new expression variables in ref1.usda. This should affect only
    // /A and not /B, since /B does not reference ref1.usda. The new
    // expression variables should show up in the ref1.usda and base_ref.usda
    // layer stacks.
    await withChanges(pcpCache, () => {
      setExpressionVariables(ref1Layer, { X: 'Y' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/A'])
    })

    ref1 = await assertVariables(layers, pcpCache, '/A',
      tree('common_ref/ref1.usda', { A: 'B', X: 'Y' }))
    ref2 = await assertVariables(layers, pcpCache, '/B',
      tree('common_ref/ref2.usda', { A: 'B' }))

    // At this point, the base_ref.usda layer stacks must differ between
    // the two prim indexes since they have different composed expression
    // variables.
    expect(ref1.rootNode.layerStack).toBe(ref2.rootNode.layerStack)
    expect(ref1.rootNode.children[0]!.layerStack)
      .not.toBe(ref2.rootNode.children[0]!.layerStack)
    expect(ref1.rootNode.children[0]!.children[0]!.layerStack)
      .not.toBe(ref2.rootNode.children[0]!.children[0]!.layerStack)

    // Remove the authored opinion and verify everything goes back to
    // how it was.
    await withChanges(pcpCache, () => {
      clearExpressionVariables(ref1Layer)
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/A'])
    })

    ref1 = await assertVariables(layers, pcpCache, '/A',
      tree('common_ref/ref1.usda', { A: 'B' }))
    ref2 = await assertVariables(layers, pcpCache, '/B',
      tree('common_ref/ref2.usda', { A: 'B' }))

    expect(ref1.rootNode.layerStack).toBe(ref2.rootNode.layerStack)
    expect(ref1.rootNode.children[0]!.layerStack)
      .not.toBe(ref2.rootNode.children[0]!.layerStack)
    expect(ref1.rootNode.children[0]!.children[0]!.layerStack)
      .toBe(ref2.rootNode.children[0]!.children[0]!.layerStack)

    // Batch changes to expression variables in both ref1.usda and ref2.usda
    // and verify that the base_ref.usda layer stack in /A and /B have
    // different composed expression variables.
    await withChanges(pcpCache, () => {
      setExpressionVariables(ref1Layer, { X: 'Y' })
      setExpressionVariables(ref2Layer, { X: 'Z' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/A', '/B'])
    })

    ref1 = await assertVariables(layers, pcpCache, '/A',
      tree('common_ref/ref1.usda', { A: 'B', X: 'Y' }))
    ref2 = await assertVariables(layers, pcpCache, '/B',
      tree('common_ref/ref2.usda', { A: 'B', X: 'Z' }))

    // Again, we expect the base_ref.usda layer stack to differ between the
    // two prim indexes because of the different composed expression
    // variables.
    expect(ref1.rootNode.layerStack).toBe(ref2.rootNode.layerStack)
    expect(ref1.rootNode.children[0]!.layerStack)
      .not.toBe(ref2.rootNode.children[0]!.layerStack)
    expect(ref1.rootNode.children[0]!.children[0]!.layerStack)
      .not.toBe(ref2.rootNode.children[0]!.children[0]!.layerStack)
  })

  it('test_ExpressionVarChanges_ChainedReferences', async () => {
    // Test that changes to expression variables propagates to downstream
    // layer stacks in cases where multiple references have been chained
    // together
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'chained_ref/root.usda')
    const ref1Layer = await layers.findOrOpen('chained_ref/ref1.usda')
    const ref2Layer = await layers.findOrOpen('chained_ref/ref2.usda')
    await layers.findOrOpen('chained_ref/ref3.usda')

    await assertVariables(layers, pcpCache, '/Root1', [
      ['chained_ref/root.usda', { A: 'B' }], [
        ['chained_ref/ref1.usda', { A: 'B' }], [
          ['chained_ref/ref2.usda', { A: 'B' }], [
            ['chained_ref/ref3.usda', { A: 'B' }], [
            ],
          ],
        ],
      ],
    ])

    await assertVariables(layers, pcpCache, '/Root2', [
      ['chained_ref/root.usda', { A: 'B' }], [
        ['chained_ref/ref2.usda', { A: 'B' }], [
          ['chained_ref/ref3.usda', { A: 'B' }], [
          ],
        ],
      ],
    ])

    await assertVariables(layers, pcpCache, '/Root3', [
      ['chained_ref/root.usda', { A: 'B' }], [
        ['chained_ref/ref3.usda', { A: 'B' }], [
        ],
      ],
    ])

    // Batch together changes to the expression variables in ref1.usda and
    // ref2.usda and verify they propagate to downstream layer stacks
    // in all prim indexes.
    await withChanges(pcpCache, () => {
      setExpressionVariables(ref1Layer, { I: 'J' })
      setExpressionVariables(ref2Layer, { X: 'Y' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/Root1', '/Root2'])
    })

    await assertVariables(layers, pcpCache, '/Root1', [
      ['chained_ref/root.usda', { A: 'B' }], [
        ['chained_ref/ref1.usda', { A: 'B', I: 'J' }], [
          ['chained_ref/ref2.usda', { A: 'B', I: 'J', X: 'Y' }], [
            ['chained_ref/ref3.usda', { A: 'B', I: 'J', X: 'Y' }], [
            ],
          ],
        ],
      ],
    ])

    await assertVariables(layers, pcpCache, '/Root2', [
      ['chained_ref/root.usda', { A: 'B' }], [
        ['chained_ref/ref2.usda', { A: 'B', X: 'Y' }], [
          ['chained_ref/ref3.usda', { A: 'B', X: 'Y' }], [
          ],
        ],
      ],
    ])

    await assertVariables(layers, pcpCache, '/Root3', [
      ['chained_ref/root.usda', { A: 'B' }], [
        ['chained_ref/ref3.usda', { A: 'B' }], [
        ],
      ],
    ])
  })

  it('test_ExpressionVarChanges_SignificantLayerStackChanges', async () => {
    // Test scenarios involving significant changes to layer stacks
    // combined with expression variable changes
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'sig_changes/root.usda')
    const rootLayer = await layers.findOrOpen('sig_changes/root.usda')
    const ref1Layer = await layers.findOrOpen('sig_changes/ref1.usda')
    await layers.findOrOpen('sig_changes/ref2.usda')

    const root1 = (root: Vars, ref: Vars): NodeEntry => [
      ['sig_changes/root.usda', root], [
        ['sig_changes/ref1.usda', ref], [
          ['sig_changes/ref2.usda', ref], [
          ],
        ],
      ],
    ]
    const root2 = (vars: Vars): NodeEntry => [
      ['sig_changes/root.usda', vars], [
        ['sig_changes/ref2.usda', vars], [
        ],
      ],
    ]

    await assertVariables(layers, pcpCache, '/Root1', root1({ A: 'B' }, { A: 'B' }))
    await assertVariables(layers, pcpCache, '/Root2', root2({ A: 'B' }))

    // Batch together a change to the expression variables in the root layer
    // stack and a significant layer stack change. The variable change
    // should still propagate to all downstream layer stacks.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { A: 'C' })
      appendSubLayerPath(rootLayer, 'sig_changes/sub.usda')
    }, (changes) => {
      if (INCREMENTAL_CHANGES) {
        expect(changes.getSignificantChanges()).toEqual(['/Dummy'])
      } else {
        expect(changes.getSignificantChanges()).toEqual(['/'])
      }
    })

    await assertVariables(layers, pcpCache, '/Root1', root1({ A: 'C' }, { A: 'C' }))
    await assertVariables(layers, pcpCache, '/Root2', root2({ A: 'C' }))

    // Batch together a change to the expression variables in root.usda and
    // ref1.usda, along with a significant layer stack change. We expect
    // only /Root1 to be resynced since its the only index that references
    // ref1.usda, and variable changes should be propagated appropriately.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { A: 'D' })
      setExpressionVariables(ref1Layer, { X: 'Y' })
      appendSubLayerPath(ref1Layer, 'sig_changes/sub1.usda')
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/Root1'])
    })

    await assertVariables(layers, pcpCache, '/Root1',
      root1({ A: 'D' }, { A: 'D', X: 'Y' }))
    await assertVariables(layers, pcpCache, '/Root2', root2({ A: 'D' }))
  })

  it('test_BasicVariantSelections', async () => {
    // Test expressions in variant selections.
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'variants/root.usda')
    const rootLayer = pcpCache.getLayerStackIdentifier().rootLayer as Layer

    // Verify initial state
    let [pi, err] = await computePrimIndex(pcpCache, '/Basic')
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Basic'),
      prim(layers, rootLayer, '/Basic{v=x_sel}')])
    // USD mode retains no prim stack: {} (upstream non-USD: {'v':'x_sel'}).
    expect(pi.composeAuthoredVariantSelections()).toEqual({})
    expect(pi.getSelectionAppliedForVariantSet('v')).toBe('x_sel')

    // Author expression variable ROOT=y, which affects the variant selection
    // on /BasicVariantSelections and should cause it to be resynced.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { ROOT: 'y' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/Basic'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi, err] = await computePrimIndex(pcpCache, '/Basic')
    expect(err).toHaveLength(0)
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Basic'),
      prim(layers, rootLayer, '/Basic{v=y_sel}')])
    // USD mode retains no prim stack: {} (upstream non-USD: {'v':'y_sel'}).
    expect(pi.composeAuthoredVariantSelections()).toEqual({})
    expect(pi.getSelectionAppliedForVariantSet('v')).toBe('y_sel')
  })

  it('test_VariantSelectionInReference', async () => {
    // Test variant selection expressions across references.
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'variants/root.usda')
    const rootLayer = pcpCache.getLayerStackIdentifier().rootLayer as Layer
    const refLayer = await layers.findOrOpen('variants/ref.usda')

    // Verify initial state
    let [pi] = await computePrimIndex(pcpCache, '/Reference')
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Reference'),
      prim(layers, refLayer, '/Ref'),
      prim(layers, refLayer, '/Ref{v=x_sel}')])
    // USD mode retains no prim stack: {} (upstream non-USD: {'v':'x_sel'}).
    expect(pi.composeAuthoredVariantSelections()).toEqual({})
    expect(pi.getSelectionAppliedForVariantSet('v')).toBe('x_sel')

    // Author expression variable REF=y in the referenced layer ref.usda.
    // This affects the variant selection used by /Reference, so it should
    // cause a resync.
    await withChanges(pcpCache, () => {
      setExpressionVariables(refLayer, { REF: 'y' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/Reference'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi] = await computePrimIndex(pcpCache, '/Reference')
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Reference'),
      prim(layers, refLayer, '/Ref'),
      prim(layers, refLayer, '/Ref{v=y_sel}')])
    // USD mode retains no prim stack: {} (upstream non-USD: {'v':'y_sel'}).
    expect(pi.composeAuthoredVariantSelections()).toEqual({})
    expect(pi.getSelectionAppliedForVariantSet('v')).toBe('y_sel')

    // Author expression variable REF=z in the root layer stack. This
    // should override the variable in ref.usda and affect the variant
    // selection on /Reference again.
    await withChanges(pcpCache, () => {
      setExpressionVariables(rootLayer, { REF: 'z' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual(['/Reference'])
      expect(changes.getSpecChanges()).toEqual([])
    })

    ;[pi] = await computePrimIndex(pcpCache, '/Reference')
    expect(primStack(layers, pi)).toEqual([
      prim(layers, rootLayer, '/Reference'),
      prim(layers, refLayer, '/Ref'),
      prim(layers, refLayer, '/Ref{v=z_sel}')])
    // USD mode retains no prim stack: {} (upstream non-USD: {'v':'z_sel'}).
    expect(pi.composeAuthoredVariantSelections()).toEqual({})
    expect(pi.getSelectionAppliedForVariantSet('v')).toBe('z_sel')
  })

  it('test_NoChanges', async () => {
    // Test scenarios where no recomputations are expected.
    const layers = new Layers()
    const pcpCache = await loadPcpCache(layers, 'no_changes/root.usda')
    const rootLayer = pcpCache.getLayerStackIdentifier().rootLayer as Layer

    // Authoring expression variables in the root layer stack should
    // not incur any significant changes if nothing depends on those
    // expression variables.
    await computePrimIndex(pcpCache, '/A')
    await withChanges(pcpCache, () => {
      rootLayer.getPseudoRoot().setInfo('expressionVariables', { X: 'A' })
    }, (changes) => {
      expect(changes.getSignificantChanges()).toEqual([])
      expect(changes.getSpecChanges()).toEqual([])
      expect(changes.getPrimChanges()).toEqual([])
    })
  })

  it('test_ExpressionVariableCompositionInLayerSTack', async () => {
    // Test expression variable composition in layer stacks
    const layers = new Layers()
    const sessionSublayer = layers.add(Layer.createAnonymous('session-sublayer'))
    sessionSublayer.importFromString(`
        #usda 1.0
        (
            expressionVariables = {
                string SESSION_SUBLAYER_ONLY = "session-sublayer"
            }
        )
        `.trim())

    const sessionLayer = layers.add(Layer.createAnonymous('session'))
    sessionLayer.importFromString(`
        #usda 1.0
        (
            expressionVariables = {
                string SESSION_ONLY = "session"
                string SESSION_OVERRIDE = "session"
            }
            subLayers = [
                @${sessionSublayer.identifier}@
            ]
        )
        `.trim())

    const subLayer = layers.add(Layer.createAnonymous('sublayer'))
    subLayer.importFromString(`
        #usda 1.0
        (
            expressionVariables = {
                string SUBLAYER_ONLY = "sublayer"
            }
        )
        `.trim())

    const rootLayer = layers.add(Layer.createAnonymous('root'))
    rootLayer.importFromString(`
        #usda 1.0
        (
            expressionVariables = {
                string ROOT_ONLY = "root"
                string SESSION_OVERRIDE = "root"
            }
            subLayers = [
                @${subLayer.identifier}@
            ]
        )
        `.trim())

    const pcpCache = await PcpCache.create(rootLayer, layers.opener, sessionLayer)
    const rootId = pcpCache.getLayerStackIdentifier()

    const rootLayerStack = pcpCache.computeLayerStack(rootId, [])
    expect(rootLayerStack.expressionVariables.getVariables()).toEqual({
      SESSION_ONLY: 'session',
      SESSION_OVERRIDE: 'session',
      ROOT_ONLY: 'root',
    })
  })
})
