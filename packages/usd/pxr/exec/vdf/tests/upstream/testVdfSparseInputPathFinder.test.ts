// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/testenv/testVdfSparseInputPathFinder.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfSparseInputPathFinder.cpp
//
// One it() per test function. TF_AXIOM(cond) becomes expect(). The printed
// progress and paths are not compared upstream (the testenv baselines are
// only the grapher's images) and are not ported. The VdfGrapher calls with
// main()'s VdfGrapherOptions write debug graphs into the program's working
// directory, a fresh temporary directory here; nothing compares them.
//
// graph[name] is graph.Get(name) and `a >> b.In(...)` is
// a.ShiftRight(b.In(...)) (VdfTestUtils port).

import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { Token as TfToken } from 'typescript-usd/tf'
import { TfCompressedBits } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec3d as GfVec3d } from 'typescript-usd/gf'

import type { VdfConnection } from '../../src/connection.ts'
import type { VdfContext } from '../../src/context.ts'
import { VdfExecutionTypeRegistry } from '../../src/executionTypeRegistry.ts'
import { VdfGrapher } from '../../src/grapher.ts'
import { VdfGrapherOptions } from '../../src/grapherOptions.ts'
import type { VdfInput } from '../../src/input.ts'
import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import { VdfSparseInputPathFinder } from '../../src/sparseInputPathFinder.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

const GfVec3dType = VtValueTypes.GfVec3d

// The program's working directory (see the file header).
const _testDirectory = mkdtempSync(join(tmpdir(), 'testVdfSparseInputPathFinder-'))

// main()'s VdfGrapherOptions (testVdfSparseInputPathFinder.cpp:400-404).
const options = new VdfGrapherOptions()
options.setDrawMasks(true)
options.setDrawAffectsMasks(true)
options.setPrintSingleOutputs(true)
options.setPageSize(-1, -1)
const boolType = VtValueTypes.bool

// TF_DEFINE_PRIVATE_TOKENS (testVdfSparseInputPathFinder.cpp:26-37).
const _tokens = {
  select: TfToken('select'),
  s1: TfToken('s1'),
  s2: TfToken('s2'),
  points: TfToken('points'),
  out: TfToken('out'),
  enable: TfToken('enable'),
  axis: TfToken('axis'),
  pool: TfToken('.pool'),
}

// TF_REGISTRY_FUNCTION(VdfExecutionTypeRegistry) (testVdfSparseInputPathFinder.cpp:39-43).
VdfExecutionTypeRegistry.define(boolType, false)
VdfExecutionTypeRegistry.define(GfVec3dType, new GfVec3d(0))

function TF_AXIOM(cond: boolean): void {
  expect(cond).toBe(true)
}

// _Compute (testVdfSparseInputPathFinder.cpp:45-48).
function _Compute(_context: VdfContext): void {}

// _ComputeDependencies (testVdfSparseInputPathFinder.cpp:50-68).
function _ComputeDependencies(
  maskedOutput: VdfMaskedOutput,
  inputConnection: VdfConnection): TfCompressedBits {
  const bits = new TfCompressedBits(1)

  TF_AXIOM(maskedOutput.GetOutput()!.getName() === _tokens.out)
  TF_AXIOM(maskedOutput.GetMask().getSize() === 2)

  const inName = inputConnection.getTargetInput().getName()

  if (inName === _tokens.axis) {
    bits.setAll()
  } else if (inName === _tokens.enable && maskedOutput.GetMask().isSet(1)) {
    bits.setAll()
  }

  return bits
}

// BuildTestNetwork (testVdfSparseInputPathFinder.cpp:70-158).
function BuildTestNetwork(graph: VdfTestUtils.Network, style: number): void {
  const translateNodeType = new VdfTestUtils.CallbackNodeType(_Compute)
  translateNodeType
    .readWrite(GfVec3dType, _tokens.pool, _tokens.pool)
    .Read(GfVec3dType, _tokens.axis)

  const selectNodeType = new VdfTestUtils.CallbackNodeType(_Compute)
  selectNodeType
    .Read(GfVec3dType, _tokens.s1)
    .Read(GfVec3dType, _tokens.s2)
    .Read(boolType, _tokens.select)
    .out(GfVec3dType, _tokens.out)

  const expressionNodeType = new VdfTestUtils.CallbackNodeType(_Compute)
  expressionNodeType
    .Read(boolType, _tokens.enable)
    .Read(GfVec3dType, _tokens.axis)
    .out(GfVec3dType, _tokens.out)

  const expressionNodeTypeDependencies = new VdfTestUtils.CallbackNodeType(_Compute)
  expressionNodeTypeDependencies
    .Read(boolType, _tokens.enable)
    .Read(GfVec3dType, _tokens.axis)
    .out(GfVec3dType, _tokens.out)
    .computeInputDependencyMaskCallback(_ComputeDependencies)

  graph.addInputVector(GfVec3dType, 'pool')
  graph.addInputVector(GfVec3dType, 'axis1')
  graph.addInputVector(GfVec3dType, 'axis2')
  graph.addInputVector(GfVec3dType, 'disconnectedOutput')
  graph.addInputVector(boolType, 'select1')
  graph.addInputVector(boolType, 'select2')
  graph.addInputVector(boolType, 'extraNode')
  graph.add('translate1', translateNodeType)
  graph.add('translate2', translateNodeType)
  graph.add('selectNode1', selectNodeType)
  graph.add('selectNode2', selectNodeType)
  graph.add('expression1', expressionNodeType)
  graph.add('expression2', expressionNodeTypeDependencies)

  const m01 = new VdfMask(2)
  const m10 = new VdfMask(2)
  m01.setIndex(0)
  m10.setIndex(1)

  graph.Get('pool').shiftRight(graph.Get('translate1').in(_tokens.pool, VdfMask.allOnes(2)))
  graph.Get('translate1').shiftRight(graph.Get('translate2').in(_tokens.pool, VdfMask.allOnes(2)))

  graph.Get('select1').shiftRight(graph.Get('selectNode1').in(_tokens.select, VdfMask.allOnes(1)))
  graph.Get('select2').shiftRight(graph.Get('selectNode2').in(_tokens.select, VdfMask.allOnes(1)))

  graph.Get('selectNode1').shiftRight(graph.Get('expression1').in(_tokens.axis, VdfMask.allOnes(1)))
  graph.Get('selectNode2').shiftRight(graph.Get('expression2').in(_tokens.axis, VdfMask.allOnes(1)))

  graph.Get('expression1').shiftRight(graph.Get('translate1').in(_tokens.axis, VdfMask.allOnes(1)))
  graph.Get('expression2').shiftRight(graph.Get('translate2').in(_tokens.axis, m01))
  graph.Get('expression2').shiftRight(graph.Get('selectNode1').in(_tokens.s2, m10))

  graph.Get('extraNode').shiftRight(graph.Get('expression2').in(_tokens.enable, VdfMask.allOnes(1)))

  graph.Get('axis1').shiftRight(graph.Get('selectNode1').in(_tokens.s1, VdfMask.allOnes(1)))
  graph.Get('axis1').shiftRight(graph.Get('selectNode2').in(_tokens.s1, VdfMask.allOnes(1)))

  // Add connection to be disconnected on the source output side.
  graph.Get('disconnectedOutput').shiftRight(
    graph.Get('selectNode1').in(_tokens.s1, VdfMask.allOnes(1)))

  if (style === 0) {
    graph.Get('axis2').shiftRight(graph.Get('selectNode2').in(_tokens.s2, VdfMask.allOnes(1)))
  } else {
    graph.Get('expression1').shiftRight(graph.Get('selectNode2').in(_tokens.s2, VdfMask.allOnes(1)))
  }

  const mask10 = new VdfMask(2)
  mask10.setIndex(0)
  const mask01 = new VdfMask(2)
  mask01.setIndex(1)

  graph.Get('translate1').getVdfNode().GetOutput()!.setAffectsMask(mask10)
  graph.Get('translate2').getVdfNode().GetOutput()!.setAffectsMask(mask01)
}

let _enableSelectNodeDetection = false

// _InputCB (testVdfSparseInputPathFinder.cpp:162-171).
function _InputCB(input: VdfInput): boolean {
  if (!_enableSelectNodeDetection) return false
  return input.getName() === _tokens.s1 || input.getName() === _tokens.s2
}

// _PathToString (testVdfSparseInputPathFinder.cpp:175-190): reversed path.
function _PathToString(path: readonly VdfConnection[]): string {
  let res = ''
  for (let i = path.length - 1; i >= 0; --i) {
    if (res !== '') res += ' | '
    res += path[i]!.getDebugName()
  }
  return res
}

// _PathVectorToStringSet (testVdfSparseInputPathFinder.cpp:192-202).
function _PathVectorToStringSet(paths: readonly VdfConnection[][]): Set<string> {
  const res = new Set<string>()
  for (const i of paths) res.add(_PathToString(i))
  return res
}

const count = (set: Set<string>, s: string): number => (set.has(s) ? 1 : 0)

describe('testVdfSparseInputPathFinder', () => {
  it('testPathFinderNoCycles', () => {
    const testNetwork = new VdfTestUtils.Network()
    BuildTestNetwork(testNetwork, 0 /* no cycles */)

    const oneOneMask = VdfMask.allOnes(1)
    const mask10 = new VdfMask(2)
    const mask01 = new VdfMask(2)
    mask10.setIndex(0)
    mask01.setIndex(1)

    // Graph the network in order to understand the test.
    VdfGrapher.graphToFile(testNetwork.getNetwork(), join(_testDirectory, 'withoutCycles.dot'), options)

    let paths: VdfConnection[][] = []
    let pathStrings: Set<string>

    // Searching 'select2' from 'translate2' via 0b10, combining all paths.
    paths = []
    VdfSparseInputPathFinder.traverse(
      new VdfMaskedOutput(testNetwork.Get('translate2').GetOutput(), mask10),
      new VdfMaskedOutput(testNetwork.Get('select2').GetOutput(), oneOneMask),
      _InputCB, paths)
    TF_AXIOM(paths.length === 1)
    pathStrings = _PathVectorToStringSet(paths)
    TF_AXIOM(count(pathStrings,
      'VdfInputVector<bool> select2[out] -> ' +
      '[select]VdfTestUtils::DependencyCallbackNode selectNode2 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression2 | ' +
      'VdfTestUtils::DependencyCallbackNode expression2[out] -> ' +
      '[s2]VdfTestUtils::DependencyCallbackNode selectNode1 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode1[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression1 | ' +
      'VdfTestUtils::DependencyCallbackNode expression1[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode translate1 | ' +
      'VdfTestUtils::DependencyCallbackNode translate1[.pool] -> ' +
      '[.pool]VdfTestUtils::DependencyCallbackNode translate2') === 1)

    // Searching 'select2' from 'translate2' via 0b01, combining all paths.
    paths = []
    VdfSparseInputPathFinder.traverse(
      new VdfMaskedOutput(testNetwork.Get('translate2').GetOutput(), mask01),
      new VdfMaskedOutput(testNetwork.Get('select2').GetOutput(), oneOneMask),
      _InputCB, paths)
    TF_AXIOM(paths.length === 1)
    pathStrings = _PathVectorToStringSet(paths)
    TF_AXIOM(count(pathStrings,
      'VdfInputVector<bool> select2[out] -> ' +
      '[select]VdfTestUtils::DependencyCallbackNode selectNode2 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression2 | ' +
      'VdfTestUtils::DependencyCallbackNode expression2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode translate2') === 1)

    // Searching 'select2' from 'translate2' via 0b11, combining all paths.
    // _enableSelectNodeDetection is false, so we expect only one path.
    paths = []
    VdfSparseInputPathFinder.traverse(
      new VdfMaskedOutput(testNetwork.Get('translate2').GetOutput(), VdfMask.allOnes(2)),
      new VdfMaskedOutput(testNetwork.Get('select2').GetOutput(), oneOneMask),
      _InputCB, paths)
    TF_AXIOM(paths.length === 1)
    pathStrings = _PathVectorToStringSet(paths)
    TF_AXIOM(count(pathStrings,
      'VdfInputVector<bool> select2[out] -> ' +
      '[select]VdfTestUtils::DependencyCallbackNode selectNode2 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression2 | ' +
      'VdfTestUtils::DependencyCallbackNode expression2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode translate2') === 1)

    // Searching 'select2' from 'translate2' via 0b11, separating all paths.
    // _enableSelectNodeDetection is true, so we expect two paths.
    _enableSelectNodeDetection = true
    paths = []
    VdfSparseInputPathFinder.traverse(
      new VdfMaskedOutput(testNetwork.Get('translate2').GetOutput(), VdfMask.allOnes(2)),
      new VdfMaskedOutput(testNetwork.Get('select2').GetOutput(), oneOneMask),
      _InputCB, paths)
    TF_AXIOM(paths.length === 2)
    pathStrings = _PathVectorToStringSet(paths)
    TF_AXIOM(count(pathStrings,
      'VdfInputVector<bool> select2[out] -> ' +
      '[select]VdfTestUtils::DependencyCallbackNode selectNode2 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression2 | ' +
      'VdfTestUtils::DependencyCallbackNode expression2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode translate2') === 1)
    TF_AXIOM(count(pathStrings,
      'VdfInputVector<bool> select2[out] -> ' +
      '[select]VdfTestUtils::DependencyCallbackNode selectNode2 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression2 | ' +
      'VdfTestUtils::DependencyCallbackNode expression2[out] -> ' +
      '[s2]VdfTestUtils::DependencyCallbackNode selectNode1 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode1[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression1 | ' +
      'VdfTestUtils::DependencyCallbackNode expression1[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode translate1 | ' +
      'VdfTestUtils::DependencyCallbackNode translate1[.pool] -> ' +
      '[.pool]VdfTestUtils::DependencyCallbackNode translate2') === 1)
  })

  it('testPathFinderWithCycle', () => {
    const testNetwork = new VdfTestUtils.Network()
    BuildTestNetwork(testNetwork, 1 /* cycles */)

    const oneOneMask = VdfMask.allOnes(1)
    const mask10 = new VdfMask(2)
    const mask01 = new VdfMask(2)
    mask10.setIndex(0)
    mask01.setIndex(1)

    // Graph the network in order to understand the test.
    VdfGrapher.graphToFile(testNetwork.getNetwork(), join(_testDirectory, 'withCycles.dot'), options)

    let paths: VdfConnection[][] = []
    let pathStrings: Set<string>

    // Disable select node detection and thus merge all paths together.
    _enableSelectNodeDetection = false
    paths = []
    VdfSparseInputPathFinder.traverse(
      new VdfMaskedOutput(testNetwork.Get('translate2').GetOutput(), mask01),
      new VdfMaskedOutput(testNetwork.Get('select2').GetOutput(), oneOneMask),
      _InputCB, paths)
    TF_AXIOM(paths.length === 1)
    pathStrings = _PathVectorToStringSet(paths)
    TF_AXIOM(count(pathStrings,
      'VdfInputVector<bool> select2[out] -> ' +
      '[select]VdfTestUtils::DependencyCallbackNode selectNode2 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression2 | ' +
      'VdfTestUtils::DependencyCallbackNode expression2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode translate2') === 1)

    // _enableSelectNodeDetection is true, so we expect multiple paths. This
    // case checks that loops via select nodes are dealt with.
    _enableSelectNodeDetection = true
    paths = []
    VdfSparseInputPathFinder.traverse(
      new VdfMaskedOutput(testNetwork.Get('translate2').GetOutput(), mask01),
      new VdfMaskedOutput(testNetwork.Get('select2').GetOutput(), oneOneMask),
      _InputCB, paths)
    TF_AXIOM(paths.length === 2)
    pathStrings = _PathVectorToStringSet(paths)
    TF_AXIOM(count(pathStrings,
      'VdfInputVector<bool> select2[out] -> ' +
      '[select]VdfTestUtils::DependencyCallbackNode selectNode2 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression2 | ' +
      'VdfTestUtils::DependencyCallbackNode expression2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode translate2') === 1)
    TF_AXIOM(count(pathStrings,
      'VdfInputVector<bool> select2[out] -> ' +
      '[select]VdfTestUtils::DependencyCallbackNode selectNode2 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression2 | ' +
      'VdfTestUtils::DependencyCallbackNode expression2[out] -> ' +
      '[s2]VdfTestUtils::DependencyCallbackNode selectNode1 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode1[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression1 | ' +
      'VdfTestUtils::DependencyCallbackNode expression1[out] -> ' +
      '[s2]VdfTestUtils::DependencyCallbackNode selectNode2 | ' +
      'VdfTestUtils::DependencyCallbackNode selectNode2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode expression2 | ' +
      'VdfTestUtils::DependencyCallbackNode expression2[out] -> ' +
      '[axis]VdfTestUtils::DependencyCallbackNode translate2') === 1)
  })
})
