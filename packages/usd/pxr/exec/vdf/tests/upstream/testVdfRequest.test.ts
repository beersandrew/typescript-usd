// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testenv/testVdfRequest.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testenv/testVdfRequest.cpp
//
// One it() per entry of the upstream tests[] table (TestHash is not in the
// table). TF_AXIOM(cond) becomes expect(). VdfRequest(std::move(v)) is
// VdfRequest.FromMovedVector(v); graph[name] is graph.Get(name) and
// `a >> b.In(...)` is a.ShiftRight(b.In(...)) (VdfTestUtils port). The
// std::cout of r.GetSize() is not ported.

import { describe, expect, it } from 'vitest'
import { Token as TfToken } from 'typescript-usd/tf'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'

import { VdfMask } from '../../src/mask.ts'
import { VdfMaskedOutput } from '../../src/maskedOutput.ts'
import type { VdfMaskedOutputVector } from '../../src/maskedOutputVector.ts'
import { VdfRequest } from '../../src/request.ts'
import type { VdfContext } from '../../src/context.ts'
import { VdfTestUtils } from '../../src/testUtils.ts'

// TF_DEFINE_PRIVATE_TOKENS (testVdfRequest.cpp:16-24).
const _tokens = {
  axis: TfToken('axis'),
  moves: TfToken('moves'),
  out: TfToken('out'),
  out1: TfToken('out1'),
  out2: TfToken('out2'),
}

function TF_AXIOM(cond: boolean): void {
  expect(cond).toBe(true)
}

// CallbackFunction (testVdfRequest.cpp:26-29).
function CallbackFunction(_context: VdfContext): void {}

// BuildTestNetwork (testVdfRequest.cpp:31-86).
function BuildTestNetwork(graph: VdfTestUtils.Network): void {
  const bigMask = VdfMask.allOnes(100)
  const littleMask = new VdfMask(2)
  littleMask.setIndex(1)

  //          GN1  GN2
  //          |\   /|
  //          | MON |
  //          | / \ |
  //          TN1  TN2
  //           \   /
  //            TN3

  const generatorType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  generatorType
    .out(VtValueTypes.int, _tokens.out)

  const multipleOutputType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  multipleOutputType
    .Read(VtValueTypes.int, _tokens.axis)
    .Read(VtValueTypes.int, _tokens.moves)
    .out(VtValueTypes.int, _tokens.out1)
    .out(VtValueTypes.int, _tokens.out2)

  const translateType = new VdfTestUtils.CallbackNodeType(CallbackFunction)
  translateType
    .Read(VtValueTypes.int, _tokens.axis)
    .readWrite(VtValueTypes.int, _tokens.moves, _tokens.out)

  graph.add('gn1', generatorType)
  graph.add('gn2', generatorType)
  graph.add('mon', multipleOutputType)
  graph.add('tn1', translateType)
  graph.add('tn2', translateType)
  graph.add('tn3', translateType)

  graph.Get('gn1').shiftRight(graph.Get('mon').in(_tokens.axis, littleMask))
  graph.Get('gn1').shiftRight(graph.Get('tn1').in(_tokens.axis, littleMask))

  graph.Get('gn2').shiftRight(graph.Get('mon').in(_tokens.moves, bigMask))
  graph.Get('gn2').shiftRight(graph.Get('tn2').in(_tokens.moves, bigMask))

  graph.Get('mon').Output(_tokens.out1).shiftRight(
    graph.Get('tn1').in(_tokens.moves, littleMask))
  graph.Get('mon').Output(_tokens.out2).shiftRight(
    graph.Get('tn2').in(_tokens.axis, littleMask))

  graph.Get('tn1').shiftRight(graph.Get('tn3').in(_tokens.axis, bigMask))
  graph.Get('tn2').shiftRight(graph.Get('tn3').in(_tokens.moves, bigMask))
}

describe('testVdfRequest', () => {
  it('TestConstruction', () => {
    // Empty construction
    let r = new VdfRequest()
    TF_AXIOM(r.getSize() === 0)
    TF_AXIOM(r.IsEmpty())

    // Test single output construction
    r = new VdfRequest(new VdfMaskedOutput())
    TF_AXIOM(r.getSize() === 1)
    TF_AXIOM(!r.IsEmpty())

    // Test creation from VdfMaskedOutputVector
    const graph = new VdfTestUtils.Network()
    BuildTestNetwork(graph)
    const out = new VdfMaskedOutput(graph.Get('tn3').getVdfNode().GetOutput(), new VdfMask())
    let v: VdfMaskedOutputVector = [out, out, out]
    r = new VdfRequest(v)
    TF_AXIOM(r.getSize() === 1)
    TF_AXIOM(!r.IsEmpty())
    TF_AXIOM(v.length === 3)

    // Test creation from moving vector
    r = VdfRequest.fromMovedVector(v)
    TF_AXIOM(r.getSize() === 1)
    TF_AXIOM(!r.IsEmpty())
    TF_AXIOM(v.length === 0)

    // Test creation from vector with 2 unique masked outputs.
    const out1 = new VdfMaskedOutput(
      graph.Get('tn2').getVdfNode().GetOutput(),
      VdfMask.allOnes(3))
    v = [out, out, out1, out, out1]
    r = new VdfRequest(v)
    TF_AXIOM(r.getSize() === 2)
    TF_AXIOM(!r.IsEmpty())
    TF_AXIOM(v.length === 5)

    const r1 = VdfRequest.fromMovedVector(v)
    TF_AXIOM(r1.getSize() === 2)
    TF_AXIOM(!r1.IsEmpty())
    TF_AXIOM(v.length === 0)
    TF_AXIOM(r.Equals(r1))
  })

  it('TestQueries', () => {
    const graph = new VdfTestUtils.Network()
    BuildTestNetwork(graph)

    // Test get network.
    const r = new VdfRequest(
      new VdfMaskedOutput(graph.Get('tn3').getVdfNode().GetOutput(), new VdfMask()))
    TF_AXIOM(graph.getNetwork() === r.getNetwork())
  })

  it('TestFullRequestIterator', () => {
    const graph = new VdfTestUtils.Network()
    BuildTestNetwork(graph)

    const out1 = new VdfMaskedOutput(graph.Get('gn1').getVdfNode().GetOutput(), new VdfMask())
    const out2 = new VdfMaskedOutput(graph.Get('gn2').getVdfNode().GetOutput(), new VdfMask())
    const out3 = new VdfMaskedOutput(graph.Get('tn1').getVdfNode().GetOutput(), new VdfMask())
    const out4 = new VdfMaskedOutput(graph.Get('tn2').getVdfNode().GetOutput(), new VdfMask())
    const v: VdfMaskedOutputVector = [out1, out2, out3, out4]
    const r = new VdfRequest(v)

    // Test direct use of the iterator.
    const i = r.begin()
    let count = 0
    for (; i.notEquals(r.end()); i.increment()) {
      TF_AXIOM(i.deref().Equals(v[count]!))
      ++count
    }

    TF_AXIOM(count === 4)

    // Test iterator in a range-based loop.
    count = 0
    for (const mo of r) {
      TF_AXIOM(mo.Equals(v[count]!))
      ++count
    }

    TF_AXIOM(count === 4)
  })

  it('TestSubsetOperators', () => {
    const graph = new VdfTestUtils.Network()
    BuildTestNetwork(graph)

    const out1 = new VdfMaskedOutput(graph.Get('gn1').getVdfNode().GetOutput(), new VdfMask())
    const out2 = new VdfMaskedOutput(graph.Get('gn2').getVdfNode().GetOutput(), new VdfMask())
    const out3 = new VdfMaskedOutput(graph.Get('tn1').getVdfNode().GetOutput(), new VdfMask())
    const out4 = new VdfMaskedOutput(graph.Get('tn2').getVdfNode().GetOutput(), new VdfMask())
    const v: VdfMaskedOutputVector = [out1, out2, out3, out4]
    const r = new VdfRequest(v)
    const r_copy = r.Clone()

    TF_AXIOM(r.getSize() === 4)
    TF_AXIOM(r_copy.getSize() === 4)
    TF_AXIOM(r.Equals(r_copy))
    TF_AXIOM(VdfRequest.Hash(r) === VdfRequest.Hash(r_copy))

    const it = r_copy.begin()
    r.remove(it)
    TF_AXIOM(r.getSize() === 3)
    TF_AXIOM(r_copy.getSize() === 4)
    TF_AXIOM(r.notEquals(r_copy))
    TF_AXIOM(VdfRequest.Hash(r) !== VdfRequest.Hash(r_copy))
    let count = 0
    for (const mo of r) {
      TF_AXIOM(mo.Equals(v[count + 1]!))
      ++count
    }
    TF_AXIOM(count === 3)

    it.increment(); it.increment() // iterator at index = 2
    r.remove(it)
    TF_AXIOM(r.getSize() === 2)
    TF_AXIOM(r_copy.getSize() === 4)
    TF_AXIOM(r.notEquals(r_copy))
    TF_AXIOM(VdfRequest.Hash(r) !== VdfRequest.Hash(r_copy))
    count = 0
    for (const mo of r) {
      TF_AXIOM(mo.Equals(v[(2 * count) + 1]!))
      ++count
    }
    TF_AXIOM(count === 2)

    r.removeAll()
    TF_AXIOM(r.getSize() === 0)
    TF_AXIOM(r_copy.getSize() === 4)
    TF_AXIOM(r.notEquals(r_copy))
    TF_AXIOM(VdfRequest.Hash(r) !== VdfRequest.Hash(r_copy))
    count = 0
    for (const mo of r) {
      TF_AXIOM(mo.Equals(v[0]!))
      ++count
    }
    TF_AXIOM(count === 0)

    it.increment() // iterator at index = 3
    r.add(it)
    TF_AXIOM(r.getSize() === 1)
    TF_AXIOM(r_copy.getSize() === 4)
    TF_AXIOM(r.notEquals(r_copy))
    TF_AXIOM(VdfRequest.Hash(r) !== VdfRequest.Hash(r_copy))
    count = 0
    for (const mo of r) {
      TF_AXIOM(mo.Equals(v[3]!))
      ++count
    }
    TF_AXIOM(count === 1)

    r.addAll()
    TF_AXIOM(r.getSize() === 4)
    TF_AXIOM(r.Equals(r_copy))
    TF_AXIOM(VdfRequest.Hash(r) === VdfRequest.Hash(r_copy))
  })
})
