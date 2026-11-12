// Portions ported from OpenUSD 26.11.1, including: pxr/usd/pcp/types.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { describe, expect, it } from 'vitest'
import {
  ArcType as PcpArcType,
  pcpCompareArcTypeStrength,
  pcpIsClassBasedArc,
  pcpIsInheritArc,
  pcpIsSpecializeArc,
} from '../../src/index.ts'

describe('PcpArcType', () => {
  it('matches upstream pcp/types.h integer values (and the inline ARC map)', () => {
    expect(PcpArcType.Root).toBe(0)
    expect(PcpArcType.Inherit).toBe(1)
    expect(PcpArcType.Variant).toBe(2)
    expect(PcpArcType.Relocate).toBe(3)
    expect(PcpArcType.Reference).toBe(4)
    expect(PcpArcType.Payload).toBe(5)
    expect(PcpArcType.Specialize).toBe(6)
  })

  it('classifies class-based arcs (inherit + specialize)', () => {
    expect(pcpIsInheritArc(PcpArcType.Inherit)).toBe(true)
    expect(pcpIsInheritArc(PcpArcType.Specialize)).toBe(false)
    expect(pcpIsSpecializeArc(PcpArcType.Specialize)).toBe(true)
    expect(pcpIsSpecializeArc(PcpArcType.Inherit)).toBe(false)

    expect(pcpIsClassBasedArc(PcpArcType.Inherit)).toBe(true)
    expect(pcpIsClassBasedArc(PcpArcType.Specialize)).toBe(true)
    for (const arc of [PcpArcType.Root, PcpArcType.Variant, PcpArcType.Relocate, PcpArcType.Reference, PcpArcType.Payload]) {
      expect(pcpIsClassBasedArc(arc)).toBe(false)
    }
  })

  it('orders arc-type strength low=stronger (root strongest)', () => {
    expect(pcpCompareArcTypeStrength(PcpArcType.Root, PcpArcType.Inherit)).toBeLessThan(0)
    expect(pcpCompareArcTypeStrength(PcpArcType.Inherit, PcpArcType.Variant)).toBeLessThan(0)
    expect(pcpCompareArcTypeStrength(PcpArcType.Reference, PcpArcType.Payload)).toBeLessThan(0)
    expect(pcpCompareArcTypeStrength(PcpArcType.Reference, PcpArcType.Reference)).toBe(0)
  })
})
