// Shared loading of the native regression-shape fixture
// (fixtures/farRegressionShapes.json.gz, captured by the capture tooling kept
// outside this repository; FIXTURES.md).

import { expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type { StencilTableReal, TopologyRefiner } from '../../src/far/index.ts'
import type { SchemeType } from '../../src/sdc/index.ts'
import { parseObj, refineShape, readFixture, decodeF32, compareFloats } from './shapeUtils.ts'

const here = dirname(fileURLToPath(import.meta.url))

export interface NativeStencilTable {
  numControlVertices: number
  numStencils: number
  weightsLength: number
  sizes: number[]
  offsets: number[]
  indices: number[]
  weightsF32: string
}

export interface ShapeFixture {
  scheme: SchemeType
  level: number
  isLeftHanded: boolean
  strippedUVs: boolean
  obj: string
  native: Record<string, unknown> & {
    levelVertices: number[]
    levelFaces: number[]
    levelFVarValues?: number[]
    numFVarChannels: number
    maxValence: number
    numVerticesTotal: number
    stormVertexStencils: NativeStencilTable
    stormVaryingStencils: NativeStencilTable
    stormFVarStencils: NativeStencilTable | null
    defaultVertexStencils: NativeStencilTable | null
    unfactorizedVertexStencils: NativeStencilTable | null
    refinedPositionsF32: string
    limitPositionsF32: string
    refinedUVsF32?: string
  }
}

export const fixture = readFixture<{ shapes: Record<string, ShapeFixture> }>(
  join(here, 'fixtures', 'farRegressionShapes.json.gz'),
)

// Weight tolerance in float ulps of the larger magnitude, and an absolute
// floor for weights that are float cancellations of O(1) terms.
export const WEIGHT_ULPS = 64
export const WEIGHT_ABS = 2 ** -20

export function buildShape(name: string): { shape: ShapeFixture; refiner: TopologyRefiner } {
  const shape = fixture.shapes[name]!
  const parsed = parseObj(shape.obj, shape.scheme, shape.isLeftHanded)
  if (shape.strippedUVs) {
    parsed.uvs = []
    parsed.faceuvs = []
  }
  return { shape, refiner: refineShape(parsed, shape.level) }
}

export function expectStencilTable(actual: StencilTableReal, expected: NativeStencilTable): void {
  expect(actual.getNumControlVertices()).toBe(expected.numControlVertices)
  expect(actual.getNumStencils()).toBe(expected.numStencils)
  expect(actual.getSizes()).toEqual(expected.sizes)
  expect(actual.getOffsets()).toEqual(expected.offsets)
  expect(actual.getControlIndices()).toEqual(expected.indices)
  // upstream copyStencilData leaves the weights at the builder's length
  // (stencilTable.cpp:121-138)
  expect(actual.getWeights().length).toBe(expected.weightsLength)
  const n = expected.indices.length
  const cmp = compareFloats(actual.getWeights().slice(0, n), decodeF32(expected.weightsF32), WEIGHT_ABS)
  expect(cmp.length).toBe(n)
  expect(cmp.maxUlps).toBeLessThanOrEqual(WEIGHT_ULPS)
}

