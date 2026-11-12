// Ported from OpenUSD 26.11.1:
//  pxr/exec/esfUsd/testenv/testEsfUsdConnectionTablesStochastic.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/testenv/testEsfUsdConnectionTablesStochastic.cpp
//
// The program builds a stage per --numStages with a namespace tree of
// --branchingFactor and --treeDepth (each prim owning one double attribute),
// registers stage data for each stage, applies --numMutations random scene
// edits (connection adds and removes, attribute spec removal and creation,
// and activation toggles), and validates the stage data's connection tables
// against connections computed from the scene. It runs here with the
// program's default arguments (testEsfUsdConnectionTablesStochastic.cpp:
// 556-563, 588-593: one stage, branching factor 5, depth 5, and ten
// mutations per prim), and with the stage count of its registered
// _Perf/_Mem configurations (pxr/exec/esfUsd/CMakeLists.txt:77-97). The
// _Threading configuration (:70-75, 50 stages) is a multithreading stress
// test and is not run: stages are independent, and its first ten stages are
// those of the 10-stage configuration.
//
// The random decisions use std::mt19937 and
// std::uniform_int_distribution<size_t> exactly as libc++ evaluates them
// (../stdRandom.ts), so each stage sees the same mutation sequence as the
// native test. Mapping: TF_AXIOM and ASSERT_EQ are expect; SdfPathVector
// compares as path-string arrays and std::set<SdfPath> as sorted
// path-string arrays; UsdStage/UsdPrim/UsdAttribute/SdfLayer calls are the
// typescript-usd counterparts, and SetActive is awaited.
//
// Out of scope: the --numThreads, --memory, --spy and --trace options, and
// the _PerformanceTracker and _MemoryMetrics classes (:236-440), which only
// report timings and memory use; WorkParallelForEach over stages runs
// serially (typescript-usd/work).
import { describe, expect, it } from 'vitest'
import { AttributeSpec as SdfAttributeSpec, Layer, PrimSpec as SdfPrimSpec } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Stage } from 'typescript-usd/usd'
import { WorkParallelForEach } from 'typescript-usd/work'
import { EsfUsdStageData } from '../../src/stageData.ts'
import { StdMt19937, StdUniformIntDistribution } from '../stdRandom.ts'

const P = (path: string): SdfPath => SdfPath.fromString(path)

// _MakePathSet (testEsfUsdConnectionTablesStochastic.cpp:64-67).
function _MakePathSet(paths: Iterable<SdfPath>): string[] {
  const unique = new Map<string, SdfPath>()
  for (const path of paths) {
    unique.set(path.pathString, path)
  }
  return [...unique.values()].sort(SdfPath.compare).map(path => path.pathString)
}

// Create all the necessary tokens for child prim names. The vector is static
// so these are only generated once.
const childNames: string[] = []
const attrName = 'attr'

// testEsfUsdConnectionTablesStochastic.cpp:69-109
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
    const childPrimSpec = SdfPrimSpec.new(parentPrimSpec, childNames[i]!, 'def', 'Scope')
    expect(childPrimSpec).toBeTruthy()

    const attrSpec = SdfAttributeSpec.new(childPrimSpec, attrName, 'double')
    expect(attrSpec).toBeTruthy()
    attrPaths.push(attrSpec!.getPath())

    // Add the child's descendants.
    _AddPrimHierarchyUnder(childPrimSpec!, branchingFactor, treeDepth - 1, attrPaths)
  }
}

// testEsfUsdConnectionTablesStochastic.cpp:111-126
function _AddPrimHierarchy(
  layer: Layer,
  rootPrimName: string,
  branchingFactor: number,
  treeDepth: number,
  attrPaths: SdfPath[],
): void {
  // Define the prim at the root of the hierarchy.
  const rootPrimSpec = SdfPrimSpec.new(layer, rootPrimName, 'def', 'Scope')
  expect(rootPrimSpec).toBeTruthy()

  // Define the descendant prims.
  _AddPrimHierarchyUnder(rootPrimSpec!, branchingFactor, treeDepth, attrPaths)
}

// testEsfUsdConnectionTablesStochastic.cpp:128-166
function _ValidateConnections(stage: Stage): void {
  // Compute the actual incoming connections by traversing all active,
  // loaded, defined, non-abstract prims, gathering their attributes, and
  // building up a map of incoming connections for each targeted attribute.
  const actualIncoming = new Map<string, [SdfPath, SdfPath[]]>()

  for (const prim of stage.getPrim('/')!.getDescendants()) {
    for (const attr of prim.getAttributes()) {
      const targetPaths = attr.getConnections().map(P)
      if (targetPaths.length === 0) {
        continue
      }
      const ownerPath = P(attr.getPath())

      expect(EsfUsdStageData.getOutgoingConnections(stage, ownerPath).map(p => p.pathString))
        .toEqual(targetPaths.map(p => p.pathString))

      for (const targetPath of targetPaths) {
        let entry = actualIncoming.get(targetPath.pathString)
        if (!entry) {
          entry = [targetPath, []]
          actualIncoming.set(targetPath.pathString, entry)
        }
        entry[1].push(ownerPath)
      }
    }
  }

  for (const [path, actual] of actualIncoming.values()) {
    expect(_MakePathSet(EsfUsdStageData.getIncomingConnections(stage, path)))
      .toEqual(_MakePathSet(actual))
  }
}

// testEsfUsdConnectionTablesStochastic.cpp:168-234
async function _MutateScene(
  randomSeed: number,
  numIterations: number,
  stage: Stage,
  attrPaths: readonly SdfPath[],
): Promise<void> {
  const rng = new StdMt19937(randomSeed)
  const randomPath = new StdUniformIntDistribution(0, attrPaths.length - 1)
  const randomOp = new StdUniformIntDistribution(0, 3)

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
        const randomConnection = new StdUniformIntDistribution(0, connections.length - 1)
        const connectionI = randomConnection.sampleBig(rng)

        if (connections.length !== 0) {
          owner.removeConnection(connections[Number(connectionI)]!)
        }
      }
    } else if (op === 2) {
      // If we find an attribute at the path, remove its spec. Otherwise, if
      // there's an owning prim, create the attribute spec.
      const attrI = randomPath.Sample(rng)
      const attrPath = attrPaths[attrI]!

      const layer = stage.getRootLayer()
      const prim = layer.getPrimAtPath(attrPath.getPrimPath())
      expect(prim).toBeTruthy()

      const attr = layer.getAttributeAtPath(attrPath)
      if (attr) {
        prim!.removeProperty(attr)
      } else {
        const attrSpec = SdfAttributeSpec.new(prim, attrPath.name, 'double')
        expect(attrSpec).toBeTruthy()
      }
    } else if (op === 3) {
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

// Test (testEsfUsdConnectionTablesStochastic.cpp:442-551).
class Test {
  constructor(
    private readonly _numStages: number,
    private readonly _numMutations: number,
    private readonly _branchingFactor: number,
    private readonly _treeDepth: number,
  ) {}

  // Runs the test.
  async run(): Promise<void> {
    const stages: Stage[] = []
    const attrPaths: SdfPath[][] = []

    // Populating stages.
    for (let i = 0; i < this._numStages; ++i) {
      const layer = Layer.createAnonymous('.usda')
      attrPaths.push([])
      this._populateLayer(layer, attrPaths[i]!)
      const stage = await Stage.open(layer)
      expect(stage).toBeTruthy()

      stages.push(stage)
    }

    const indices = Array.from({ length: this._numStages }, (_, i) => i)
    let stageData: Array<EsfUsdStageData | undefined> = new Array(this._numStages)

    // Registering stage data.
    WorkParallelForEach(indices, (i: number) => {
      stageData[i] = EsfUsdStageData.registerStage(stages[i]!, /* listener */ null)
    })

    // Mutating the scene.
    for (const i of indices) {
      await _MutateScene(i, this._numMutations, stages[i]!, attrPaths[i]!)
    }

    // Validate connections.
    for (const stage of stages) {
      _ValidateConnections(stage)
    }

    // Deactivate root prims.
    for (const stage of stages) {
      const pseudoRoot = stage.getPrim('/')!
      for (const root of pseudoRoot.getChildren()) {
        await root.setActive(false)
      }
    }

    // Free stage data.
    stageData = []
    expect(stageData.length).toBe(0)

    // Free stages.
    stages.length = 0
  }

  private _populateLayer(layer: Layer, attrPaths: SdfPath[]): void {
    _AddPrimHierarchy(layer, 'Root', this._branchingFactor, this._treeDepth, attrPaths)
  }
}

// main (testEsfUsdConnectionTablesStochastic.cpp:553-625): if numMutations
// isn't set, perform ten mutations for every prim in the tree.
function _DefaultNumMutations(branchingFactor: number, treeDepth: number): number {
  return Math.trunc(10 *
    (Math.pow(branchingFactor, treeDepth + 1) - 1) / (branchingFactor - 1))
}

describe('testEsfUsdConnectionTablesStochastic', () => {
  it('main', async () => {
    const numStages = 1
    const branchingFactor = 5
    const treeDepth = 5
    const numMutations = _DefaultNumMutations(branchingFactor, treeDepth)
    await new Test(numStages, numMutations, branchingFactor, treeDepth).run()
  }, 600_000)

  // testEsfUsdConnectionTables_Perf, _Perf_SingleThreaded and _Mem
  // (pxr/exec/esfUsd/CMakeLists.txt:77-97): --numStages 10 --treeDepth 5
  // --branchingFactor 5, with only out-of-scope reporting options besides.
  it('testEsfUsdConnectionTables_Perf', async () => {
    const numStages = 10
    const branchingFactor = 5
    const treeDepth = 5
    const numMutations = _DefaultNumMutations(branchingFactor, treeDepth)
    await new Test(numStages, numMutations, branchingFactor, treeDepth).run()
  }, 600_000)
})
