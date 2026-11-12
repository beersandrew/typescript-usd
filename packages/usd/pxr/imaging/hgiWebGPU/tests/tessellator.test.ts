// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/graphicsPipeline.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiWebGPUTessellator (the Direct3D 11 fixed-function tessellator ported
// from Microsoft's reference, src/tessellator.ts) against a native capture
// of Apple's tessellator through Metal (tests/fixtures/tessellator/
// capture.swift, run on the reference machine; expected.json.gz). Metal is
// the tessellator hgiMetal hands Storm's post-tessellation draws to
// (hgiMetal/graphicsPipeline.mm:178-235); the expectations are what it
// produced, not values derived from the port.
//
// Per case (domain, partition mode, output winding, the six or four
// half-float factors): the domain points must be the same set, exactly
// (16.16 fixed point); every triangle Metal rasterized (reconstructed per
// pixel, so triangles that cover no pixel center are not seen) must be a
// triangle of the port, with the same orientation; and every port triangle
// covering at least two pixel centers must have been seen.
//
// Controller (Node) test: no GPU, no browser.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  HgiWebGPUTessellator,
  HgiWebGPUTessellatorOutputPrimitive,
  HgiWebGPUTessellatorOutputPrimitiveForMetalWinding,
  HgiWebGPUTessellatorPartitioning,
} from '../src/tessellator.ts'

interface Case {
  domain: 'quad' | 'tri'
  partitioning: 'integer' | 'pow2' | 'fractionalOdd' | 'fractionalEven'
  winding: 'ccw' | 'cw'
  factors: number[]
  patchStart: number
  patchIds: number[]
  points: number[]
  triangles: number[]
  coveredPixels: number
  unsnappedPixels: number
  wSumsToOne: boolean
}
const capture = JSON.parse(gunzipSync(readFileSync(
  new URL('./fixtures/tessellator/expected.json.gz', import.meta.url))).toString('utf8')) as
  { device: string, os: string, cases: Case[] }

const partitionings = {
  integer: HgiWebGPUTessellatorPartitioning.Integer,
  pow2: HgiWebGPUTessellatorPartitioning.Pow2,
  fractionalOdd: HgiWebGPUTessellatorPartitioning.FractionalOdd,
  fractionalEven: HgiWebGPUTessellatorPartitioning.FractionalEven,
}

function tessellate(c: Case) {
  const t = new HgiWebGPUTessellator()
  // Metal's tessellationOutputWindingOrder to Direct3D's output primitive
  // (the same mapping HgiWebGPU draws with).
  t.init(partitionings[c.partitioning],
    HgiWebGPUTessellatorOutputPrimitiveForMetalWinding(c.winding === 'ccw' ? 'ccw' : 'cw'))
  const f = c.factors
  if (c.domain === 'quad') t.tessellateQuadDomain(f[0]!, f[1]!, f[2]!, f[3]!, f[4]!, f[5]!)
  else t.tessellateTriDomain(f[0]!, f[1]!, f[2]!, f[3]!)
  return { points: t.getPointsFixed(), indices: t.getIndices() }
}

const key = (u: number, v: number) => `${u},${v}`

describe(`the Direct3D 11 tessellator port against Apple's tessellator (${capture.device}, ${capture.os})`, () => {
  it('has the capture', () => {
    expect(capture.cases.length).toBeGreaterThan(400)
    // Every patch drawn from slot 2 reports patch_id 2 and reads slot 2's
    // factors (patch_id counts from the buffer's first patch on this GPU).
    expect(capture.cases.every(c => c.patchIds.length === 1 && c.patchIds[0] === c.patchStart)).toBe(true)
    // Every covered pixel's triangle was reconstructed: all of the square
    // for quads, the pixel centers below the diagonal for triangles.
    expect(capture.cases.every(c => c.unsnappedPixels === 0 &&
      c.coveredPixels === (c.domain === 'quad' ? 1024 * 1024 : 523776))).toBe(true)
  })

  for (const domain of ['quad', 'tri'] as const) {
    for (const partitioning of Object.keys(partitionings) as Case['partitioning'][]) {
      const cases = capture.cases.filter(c => c.domain === domain && c.partitioning === partitioning)
      it(`${domain} domain, ${partitioning} partitioning: ${cases.length} factor sets`, () => {
        const failures: string[] = []
        for (const c of cases) {
          const ours = tessellate(c)
          const label = `${c.winding} [${c.factors.join(', ')}]`
          // Domain points: the same set (the port can define a point twice
          // when an inside factor rounds to the degenerate ring).
          const ourSet = new Set<string>()
          for (let i = 0; i < ours.points.length; i += 2) ourSet.add(key(ours.points[i]!, ours.points[i + 1]!))
          const capPoints: string[] = []
          for (let i = 0; i < c.points.length; i += 2) capPoints.push(key(c.points[i]!, c.points[i + 1]!))
          if (ourSet.size !== capPoints.length || capPoints.some(p => !ourSet.has(p))) {
            failures.push(`${label}: points ${ourSet.size} vs native ${capPoints.length}`)
            continue
          }
          // Triangles, keyed by their point set, with their cyclic order.
          const ourTris = new Map<string, string[]>()
          for (let i = 0; i < ours.indices.length; i += 3) {
            const tri = [0, 1, 2].map(k => {
              const p = ours.indices[i + k]!
              return key(ours.points[2 * p]!, ours.points[2 * p + 1]!)
            })
            ourTris.set([...tri].sort().join('|'), tri)
          }
          const seen = new Set<string>()
          for (let i = 0; i < c.triangles.length; i += 4) {
            const tri = [c.triangles[i]!, c.triangles[i + 1]!, c.triangles[i + 2]!].map(k => capPoints[k]!)
            const k = [...tri].sort().join('|')
            seen.add(k)
            const ourTri = ourTris.get(k)
            if (!ourTri) { failures.push(`${label}: native triangle ${k} missing`); continue }
            const s = ourTri.indexOf(tri[0]!)
            if (ourTri[(s + 1) % 3] !== tri[1]) failures.push(`${label}: triangle ${k} winds the other way`)
          }
          // Port triangles big enough to cover pixel centers at 1024 x 1024.
          for (const [k, tri] of ourTris) {
            if (seen.has(k)) continue
            const [a, b, d] = tri.map(p => p.split(',').map(Number)) as [number[], number[], number[]]
            const area = Math.abs((b[0]! - a[0]!) * (d[1]! - a[1]!) - (d[0]! - a[0]!) * (b[1]! - a[1]!)) / 2 /
              (65536 * 65536) * 1024 * 1024
            if (area >= 2) failures.push(`${label}: triangle ${k} (${area.toFixed(1)} px) not drawn natively`)
          }
        }
        expect(failures.slice(0, 10)).toEqual([])
      })
    }
  }

  it('maps Metal output winding to the Direct3D output primitive as the capture shows', () => {
    // Metal's counter-clockwise output winding emits the reference's
    // "clockwise" triangles (DefineClockwiseTriangle, tessellator.cpp:1605-1620).
    expect(HgiWebGPUTessellatorOutputPrimitiveForMetalWinding('ccw'))
      .toBe(HgiWebGPUTessellatorOutputPrimitive.TriangleCW)
    expect(HgiWebGPUTessellatorOutputPrimitiveForMetalWinding('cw'))
      .toBe(HgiWebGPUTessellatorOutputPrimitive.TriangleCCW)
  })
})
