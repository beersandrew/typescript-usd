// Ported from OpenUSD 26.11.1: pxr/usd/sdf/fileIO_Common.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

/**
 * Shortest-round-trip numeric formatting in the USDA writer.
 *
 * OpenUSD v26.08 pxr/usd/sdf/fileIO_Common.cpp formats doubles and floats
 * with shortest-round-trip (dtoa) text so re-parsing recovers the exact stored
 * bit pattern. A value declared `float` is a 32-bit float, so its text must be
 * the shortest decimal that round-trips through Float32 — not the (longer)
 * shortest-f64 string that would otherwise appear, and which would re-parse to a
 * neighboring f32. These tests gate that write -> parse recovers the exact f32.
 */

import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Vec3f } from 'typescript-usd/gf'
import { Array as VtArray } from 'typescript-usd/vt'
import { parseUsda } from '../../src/textFileFormatParser.ts'

type FieldScene = Record<string, Record<string, { value: unknown }>>

// Author one attribute with an explicit declared type, serialize, re-parse.
function roundTripTyped(typeName: string, value: unknown): { usda: string; back: unknown } {
  const stage = Stage.createNew()
  const t = stage.getEditTarget().getLayer()!
  stage.definePrim('/P')
  t.setField('/P.v', 'typeName', typeName)
  t.setField('/P.v', 'default', value)
  // Register the property so the writer emits it.
  t.setField('/P', 'properties', ['v'])
  const usda = stage.exportToUsda()
  const scene = parseUsda(usda) as unknown as FieldScene
  return { usda, back: scene['/P.v']?.['default']?.value }
}

describe('usda writer / float32 shortest round-trip', () => {
  it('emits the shortest f32 decimal for 0.1 (not the f64 expansion)', () => {
    const f32 = Math.fround(0.1) // 0.10000000149011612 as a double
    const { usda, back } = roundTripTyped('float', f32)
    // The text must be the short form, not the f64 expansion.
    expect(usda).toContain('float v = 0.1')
    expect(usda).not.toContain('0.10000000149011612')
    // And it must re-parse to the exact same f32 value.
    expect(Math.fround(back as number)).toBe(f32)
  })

  it('round-trips an arbitrary f32 to the exact bit pattern', () => {
    const f32 = Math.fround(1 / 3) // 0.3333333432674408 as a double
    const { back } = roundTripTyped('float', f32)
    expect(Math.fround(back as number)).toBe(f32)
  })

  it('round-trips f32 components inside a vector (point3f)', () => {
    const v = [Math.fround(0.1), Math.fround(0.2), Math.fround(1 / 3)]
    const { usda, back } = roundTripTyped('point3f', v)
    expect(usda).not.toContain('0.10000000149011612')
    expect([...(back as Vec3f).data]).toEqual(v)
  })

  it('round-trips an f32 array (float[])', () => {
    const v = [Math.fround(0.1), Math.fround(0.7), Math.fround(123.456)]
    const { back } = roundTripTyped('float[]', v)
    expect((back as VtArray<number>).toArray()).toEqual(v)
  })

  it('keeps full f64 precision for a double attribute', () => {
    // 0.1 as a double needs its long shortest-f64 form (which is "0.1"); a value
    // that genuinely needs many digits as f64 must keep them, not be narrowed.
    const d = 0.1 + 0.2 // 0.30000000000000004
    const { usda, back } = roundTripTyped('double', d)
    expect(usda).toContain('0.30000000000000004')
    expect(back).toBe(d)
  })
})
