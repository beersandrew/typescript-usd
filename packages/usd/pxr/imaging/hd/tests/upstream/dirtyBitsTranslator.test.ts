// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdDirtyBitsTranslator.cpp
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful 1:1 port of pxr/imaging/hd/testenv/testHdDirtyBitsTranslator.cpp
//
// Exercises HdDirtyBitsTranslator custom Sprim/Rprim type registration and the
// round-trip between dirty bits and data source locators.

import { describe, it, expect } from 'vitest'

import { HdChangeTracker } from '../../src/changeTracker.ts'
import type { HdDirtyBits } from '../../src/changeTracker.ts'
import {
  HdDataSourceLocator,
  HdDataSourceLocatorSet,
} from '../../src/dataSourceLocator.ts'
import {
  HdDirtyBitsTranslator,
  type HdDirtyBitsRef,
} from '../../src/dirtyBitsTranslator.ts'
import { HdCameraSchema } from '../../src/cameraSchema.ts'

// enum _TacoDirtyBits : HdDirtyBits
const DirtyProtein = 1 << 0
const DirtyTortilla = 1 << 1
const DirtySalsa = 1 << 2

// TF_DEFINE_PRIVATE_TOKENS(_tokens, (taco)(burger)(protein)(tortilla)(salsa))
const _tokens = {
  taco: 'taco',
  burger: 'burger',
  protein: 'protein',
  tortilla: 'tortilla',
  salsa: 'salsa',
} as const

// HdCameraSchema::GetDefaultLocator()
const cameraDefaultLocator = HdCameraSchema.getDefaultLocator()

function _ConvertLocatorSetToDirtyBitsForTacos(
  set: HdDataSourceLocatorSet, bits: HdDirtyBitsRef
): void {
  if (set.intersects(new HdDataSourceLocator(_tokens.taco, _tokens.protein))) {
    bits.value |= DirtyProtein
  }

  if (set.intersects(new HdDataSourceLocator(_tokens.taco, _tokens.tortilla))) {
    bits.value |= DirtyTortilla
  }

  if (set.intersects(new HdDataSourceLocator(_tokens.taco, _tokens.salsa))) {
    bits.value |= DirtySalsa
  }
}

function _ConvertDirtyBitsToLocatorSetForTacos(
  bits: HdDirtyBits, set: HdDataSourceLocatorSet
): void {
  if (bits & DirtyProtein) {
    set.add(new HdDataSourceLocator(_tokens.taco, _tokens.protein))
  }

  if (bits & DirtyTortilla) {
    set.add(new HdDataSourceLocator(_tokens.taco, _tokens.tortilla))
  }

  if (bits & DirtySalsa) {
    set.add(new HdDataSourceLocator(_tokens.taco, _tokens.salsa))
  }
}

describe('testHdDirtyBitsTranslator', () => {
  it('TestCustomSprimTypes', () => {
    // This call would normally go in the type registry for something like a
    // prim adapter, render delegate or scene delegate (who might care deeply
    // about the dirtiness of tacos)
    HdDirtyBitsTranslator.registerTranslatorsForCustomSprimType(
      _tokens.taco,
      _ConvertLocatorSetToDirtyBitsForTacos,
      _ConvertDirtyBitsToLocatorSetForTacos)

    // confirm that dirtying an unrelated locator does not dirty a taco
    const dirtyStuff = new HdDataSourceLocatorSet([cameraDefaultLocator])

    // Expected clean taco.
    expect(HdDirtyBitsTranslator.sprimLocatorSetToDirtyBits(
      _tokens.taco, dirtyStuff)).toBe(HdChangeTracker.Clean)

    // ...and that the unknown burger type will be AllDirty
    // Expected dirty burger.
    expect(HdDirtyBitsTranslator.sprimLocatorSetToDirtyBits(
      _tokens.burger, dirtyStuff)).not.toBe(HdChangeTracker.Clean)

    // test round trip of bits
    const bits: HdDirtyBits = DirtyTortilla | DirtyProtein
    const set = new HdDataSourceLocatorSet()
    HdDirtyBitsTranslator.sprimDirtyBitsToLocatorSet(_tokens.taco, bits, set)

    // Roundtrip of dirty taco doesn't match.
    expect(HdDirtyBitsTranslator.sprimLocatorSetToDirtyBits(
      _tokens.taco, set)).toBe(bits)
  })

  it('TestCustomRprimTypes', () => {
    // This call would normally go in the type registry for something like a
    // prim adapter, render delegate or scene delegate (who might care deeply
    // about the dirtiness of tacos)
    HdDirtyBitsTranslator.registerTranslatorsForCustomRprimType(
      _tokens.taco,
      _ConvertLocatorSetToDirtyBitsForTacos,
      _ConvertDirtyBitsToLocatorSetForTacos)

    // confirm that dirtying an unrelated locator does not dirty a taco
    const dirtyStuff = new HdDataSourceLocatorSet([cameraDefaultLocator])

    // Expected clean taco.
    expect(HdDirtyBitsTranslator.rprimLocatorSetToDirtyBits(
      _tokens.taco, dirtyStuff)).toBe(HdChangeTracker.Clean)

    // test round trip of bits
    const bits: HdDirtyBits = DirtyTortilla | DirtyProtein
    const set = new HdDataSourceLocatorSet()
    HdDirtyBitsTranslator.rprimDirtyBitsToLocatorSet(_tokens.taco, bits, set)

    // Roundtrip of dirty taco doesn't match.
    expect(HdDirtyBitsTranslator.rprimLocatorSetToDirtyBits(
      _tokens.taco, set)).toBe(bits)
  })
})

// OpenUSD 26.11.1 dirtyBitsTranslator.cpp:831-861 explicitly distinguishes
// points/normals/widths leaves from the entire primvars container.
it.each([
  ['points', HdChangeTracker.DirtyPoints],
  ['normals', HdChangeTracker.DirtyNormals],
  ['widths', HdChangeTracker.DirtyWidths],
  ['st', HdChangeTracker.DirtyPrimvar],
] as const)('maps primvars/%s without invalidating unrelated primvars', (name, expected) => {
  const locators = new HdDataSourceLocatorSet([new HdDataSourceLocator('primvars', name, 'primvarValue')])
  expect(HdDirtyBitsTranslator.rprimLocatorSetToDirtyBits('mesh', locators)).toBe(expected)
})
