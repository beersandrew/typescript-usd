// Ported from OpenUSD 26.11.1:
//  pxr/exec/execUsd/testenv/testExecUsdConnectionsStochastic.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/execUsd/testenv/testExecUsdConnectionsStochastic.cpp
//
// The program builds a namespace tree of --branchingFactor and --treeDepth
// CustomSchema prims (each with the schema's 'attr'), applies
// --numMutations random scene edits (connection adds and removes, and
// activation toggles), and validates the computeConnections and
// computeIncomingConnections computations against connections read from the
// scene. It runs here with the program's default arguments (:321-351:
// branching factor 5, depth 5, and ten mutations per prim), the only
// configuration registered (pxr/exec/execUsd/CMakeLists.txt:189-193).
// --numThreads only sets the concurrency limit: threading is out of scope
// (exec runs single-threaded, docs/openexec-x1.md section 5).
//
// The codeless test schema is registered from the upstream testenv
// resources (fixtures/testExecUsdConnectionsStochastic/resources). The random
// decisions use std::mt19937 and std::uniform_int_distribution<size_t>
// exactly as libc++ evaluates them (pxr/exec/esfUsd/tests/stdRandom.ts), so
// the mutation sequence is the native test's. Mapping: ASSERT_EQ is expect;
// SdfPathVector is an SdfPath array, compared as path strings, and
// std::set<SdfPath> is a sorted, duplicate-free SdfPath array (_MakePathSet),
// both registered under their C++ names; UsdStage/UsdPrim/UsdAttribute/
// SdfPrimSpec calls are the typescript-usd counterparts, and SetActive is
// awaited. The requests made per attribute are destroyed at the end of each
// iteration (Destroy()), as upstream's scoped requests are.
// UsdAttribute::GetConnections(SdfPathVector*) is the bool overload
// getConnections(paths).

import { describe, expect, it } from 'vitest'
import { TF_AXIOM, TF_CODING_ERROR, TfRegistryManager, Type as TfType } from 'typescript-usd/tf'
import { Layer as SdfLayer, PrimSpec as SdfPrimSpec } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { PrimDefaultPredicate as UsdPrimDefaultPredicate, Stage as UsdStage, type Prim as UsdPrim } from 'typescript-usd/usd'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfReadIteratorRange, Vdf_SetSizeof } from 'typescript-usd/vdf'
import {
  Connections, EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA, ExecBuiltinComputations, ExecTypeRegistry,
  IncomingConnections, SdfPathType,
} from 'typescript-usd/exec'
import { StdMt19937, StdUniformIntDistribution } from '../../../esfUsd/tests/stdRandom.ts'
import { ExecUsdSystem } from '../../src/system.ts'
import { ExecUsdValueKey } from '../../src/valueKey.ts'
import { _RegisterTestResources } from '../testHelpers.ts'

const SdfPathVectorType = TfType.define('std::vector<SdfPath>')
const StdSetSdfPathType = TfType.define('std::set<SdfPath>')
// sizeof(SdfPathVector) and sizeof(std::set<SdfPath>) in the native build (macOS arm64, libc++),
// the TS stand-in for sizeof (pxr/exec/vdf/src/estimateSize.ts).
Vdf_SetSizeof(SdfPathVectorType, 24)
Vdf_SetSizeof(StdSetSdfPathType, 24)

// std::set<SdfPath>(first, last): unique paths in SdfPath operator< order.
function _MakePathSet(paths: Iterable<SdfPath>): SdfPath[] {
  const unique = new Map<string, SdfPath>()
  for (const path of paths) {
    unique.set(path.pathString, path)
  }
  return [...unique.values()].sort(SdfPath.compare)
}

// TF_REGISTRY_FUNCTION(ExecTypeRegistry)
TfRegistryManager.add('ExecTypeRegistry', () => {
  ExecTypeRegistry.registerType(SdfPathVectorType, [] as SdfPath[])
  ExecTypeRegistry.registerType(StdSetSdfPathType, [] as SdfPath[])
})

// TF_DEFINE_PRIVATE_TOKENS
const _tokens = {
  attr: 'attr',
  computeConnections: 'computeConnections',
  computeIncomingConnections: 'computeIncomingConnections',
} as const

EXEC_REGISTER_COMPUTATIONS_FOR_SCHEMA(
  'TestExecUsdConnectionsStochasticCustomSchema', (self) => {
    // Attribute computation that returns the attribute's outgoing
    // connections, as an SdfPathVector.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computeConnections)
      .Callback(SdfPathVectorType, (ctx: VdfContext) => {
        const range = new VdfReadIteratorRange<SdfPath>(
          SdfPathType, ctx, ExecBuiltinComputations.computePath)
        return [...range]
      })
      .inputs(
        Connections(
          SdfPathType, ExecBuiltinComputations.computePath),
      )

    // Attribute computation that returns the incoming connections that
    // target the attribute, as a std::set<SdfPath>.
    self.attributeComputation(
      _tokens.attr,
      _tokens.computeIncomingConnections)
      .Callback(StdSetSdfPathType, (ctx: VdfContext) => {
        const range = new VdfReadIteratorRange<SdfPath>(
          SdfPathType, ctx, ExecBuiltinComputations.computePath)
        return _MakePathSet(range)
      })
      .inputs(
        IncomingConnections(
          SdfPathType, ExecBuiltinComputations.computePath),
      )
  })

// Create all the necessary tokens for child prim names. The vector is static
// so these are only generated once.
const childNames: string[] = []

// testExecUsdConnectionsStochastic.cpp:111-143
function _AddPrimHierarchyUnder(
  parentPrimSpec: SdfPrimSpec,
  branchingFactor: number,
  treeDepth: number,
  attrPaths: SdfPath[],
): void {
  if (treeDepth === 0) {
    return
  }

  for (let index = childNames.length; index < branchingFactor; ++index) {
    childNames.push(`Prim${index}`)
  }

  for (let i = 0; i < branchingFactor; ++i) {
    const childPrimSpec = SdfPrimSpec.new(
      parentPrimSpec,
      childNames[i]!,
      'def',
      'CustomSchema')
    TF_AXIOM(childPrimSpec)

    attrPaths.push(
      childPrimSpec!.getPath().appendProperty(_tokens.attr))

    // Add the child's descendants.
    _AddPrimHierarchyUnder(
      childPrimSpec!, branchingFactor, treeDepth - 1, attrPaths)
  }
}

// testExecUsdConnectionsStochastic.cpp:145-160
function _AddPrimHierarchy(
  layer: SdfLayer,
  rootPrimName: string,
  branchingFactor: number,
  treeDepth: number,
  attrPaths: SdfPath[],
): void {
  // Define the prim at the root of the hierarchy.
  const rootPrimSpec =
    SdfPrimSpec.new(layer, rootPrimName, 'def', 'Scope')
  TF_AXIOM(rootPrimSpec)

  // Define the descendant prims.
  _AddPrimHierarchyUnder(rootPrimSpec!, branchingFactor, treeDepth, attrPaths)
}

// UsdPrimDefaultPredicate(prim) (pxr/usd/usd/primFlags.cpp:21-28).
function _DefaultPredicate(prim: UsdPrim | undefined): boolean {
  if (!prim || !prim.isValid()) {
    TF_CODING_ERROR('Applying predicate to invalid prim.')
    return false
  }
  return UsdPrimDefaultPredicate.evaluate(prim)
}

// testExecUsdConnectionsStochastic.cpp:162-221
function _ValidateConnections(
  stage: UsdStage,
): void {
  const execSystem = new ExecUsdSystem(stage)

  // Compute the actual incoming connections by traversing all active,
  // loaded, defined, non-abstract prims, gathering their attributes, and
  // building up a map of incoming connections for each targeted attribute.
  const actualIncoming = new Map<string, [SdfPath, SdfPath[]]>()

  for (const prim of stage.getPrim('/')!.getDescendants()) {
    for (const attr of prim.getAttributes()) {
      const targetPaths: SdfPath[] = []
      if (!attr.getConnections(targetPaths)) {
        continue
      }

      // Filter target paths: Computation providers must be loaded, active,
      // defined, and non-abstract.
      for (let i = targetPaths.length - 1; i >= 0; --i) {
        if (!_DefaultPredicate(
          stage.getPrim(targetPaths[i]!.getPrimPath().pathString))) {
          targetPaths.splice(i, 1)
        }
      }

      const request = execSystem.buildRequest([
        new ExecUsdValueKey(attr, _tokens.computeConnections)])
      const view = execSystem.compute(request)
      const v = view.Get(0)

      expect(v.Get<SdfPath[]>().map(p => p.pathString))
        .toEqual(targetPaths.map(p => p.pathString))

      const ownerPath = SdfPath.fromString(attr.getPath())
      for (const targetPath of targetPaths) {
        let entry = actualIncoming.get(targetPath.pathString)
        if (!entry) {
          entry = [targetPath, []]
          actualIncoming.set(targetPath.pathString, entry)
        }
        entry[1].push(ownerPath)
      }

      request.destroy()
    }
  }

  for (const [targetPath, actual] of actualIncoming.values()) {
    const attr = stage.getAttributeAtPath(targetPath.pathString)!

    const request = execSystem.buildRequest([
      new ExecUsdValueKey(attr, _tokens.computeIncomingConnections)])
    const view = execSystem.compute(request)
    const v = view.Get(0)

    expect(v.Get<SdfPath[]>().map(p => p.pathString))
      .toEqual(_MakePathSet(actual).map(p => p.pathString))

    request.destroy()
  }

  execSystem.destroy()
}

// testExecUsdConnectionsStochastic.cpp:223-275
async function _MutateScene(
  numIterations: number,
  stage: UsdStage,
  attrPaths: readonly SdfPath[],
): Promise<void> {
  const rng = new StdMt19937(0)
  const randomPath = new StdUniformIntDistribution(0, attrPaths.length - 1)
  const randomOp = new StdUniformIntDistribution(0, 2)

  for (let j = 0; j < numIterations; ++j) {
    const op = randomOp.Sample(rng)

    if (op === 0) {
      // If we find an attribute at the owner path, add a connection.
      const ownerI = randomPath.Sample(rng)
      const targetI = randomPath.Sample(rng)

      const owner = stage.getAttributeAtPath(attrPaths[ownerI]!.pathString)
      if (owner) {
        owner.addConnection(attrPaths[targetI]!.pathString)
      }
    } else if (op === 1) {
      // If we find an attribute at the owner path and it has connections,
      // remove a random connection.
      const ownerI = randomPath.Sample(rng)

      const owner = stage.getAttributeAtPath(attrPaths[ownerI]!.pathString)
      if (owner) {
        const connections = owner.getConnections()

        // connections.size()-1 is SIZE_MAX for an empty vector.
        const randomConnection = new StdUniformIntDistribution(
          0, connections.length - 1)
        const connectionI = randomConnection.sampleBig(rng)

        if (connections.length !== 0) {
          owner.removeConnection(connections[Number(connectionI)]!)
        }
      }
    } else if (op === 2) {
      // If we find a prim at the path, toggle its activation state.
      const primI = randomPath.Sample(rng)

      const prim = stage.getPrim(attrPaths[primI]!.getPrimPath().pathString)
      if (prim) {
        await prim.setActive(!prim.isActive)
      }
    } else {
      throw new Error(`Unexpected op ${op}`)
    }
  }
}

// Test (testExecUsdConnectionsStochastic.cpp:279-315).
class Test {
  constructor(
    private readonly _numMutations: number,
    private readonly _branchingFactor: number,
    private readonly _treeDepth: number,
  ) {}

  // Runs the test.
  async run(): Promise<void> {
    const attrPaths: SdfPath[] = []

    const layer = SdfLayer.createAnonymous('.usda')
    this._populateLayer(layer, attrPaths)
    const stage = await UsdStage.open(layer)
    TF_AXIOM(stage)

    await _MutateScene(this._numMutations, stage, attrPaths)

    _ValidateConnections(stage)
  }

  private _populateLayer(layer: SdfLayer, attrPaths: SdfPath[]): void {
    _AddPrimHierarchy(
      layer, 'Root', this._branchingFactor, this._treeDepth, attrPaths)
  }
}

// main(): load test custom schemas.
{
  const testPlugins = _RegisterTestResources('testExecUsdConnectionsStochastic')
  expect(testPlugins.length).toBe(1)
  expect(testPlugins[0]!.getName()).toBe('testExecUsdConnectionsStochastic')
}

describe('testExecUsdConnectionsStochastic', () => {
  // main (testExecUsdConnectionsStochastic.cpp:319-363) with its default
  // arguments.
  it('main', async () => {
    const branchingFactor = 5
    const treeDepth = 5

    // If numMutations isn't set, perform ten mutations for every prim in the
    // tree.
    const numMutations = Math.trunc(10 *
      (Math.pow(branchingFactor, treeDepth + 1) - 1) / (branchingFactor - 1))

    await new Test(numMutations, branchingFactor, treeDepth).run()
  }, 1_200_000)
})
