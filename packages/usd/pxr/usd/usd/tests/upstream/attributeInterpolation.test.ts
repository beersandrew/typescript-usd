// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdAttributeInterpolationCpp.cpp,
//  pxr/usd/usd/interpolators.h, pxr/usd/usd/stage.cpp
// Copyright 2016, 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _resolverContextForResolver } from 'typescript-usd/usd/_internal'
// Complete applicable port of the registered C++ test
// pxr/usd/usd/testenv/testUsdAttributeInterpolationCpp.cpp (OpenUSD v26.05).
// CMake registers testUsdAttributeInterpolationCpp as a native executable.
// The matching live binary passes eight runs: direct, layer-offset,
// mismatched-shape, and value-clip interpolation for both USDA and USDC.
// typescript-usd exercises the same value/query mechanisms through its in-memory and
// USDA paths; USDC decoding has its own registered conformance rail.

import { describe, expect, it } from 'vitest'
import { AssetPath } from 'typescript-usd/sdf'
import { _sdfCloneValue } from 'typescript-usd/sdf/_internal'
import { _MatrixBase as GfMatrixBase, _QuatBase as GfQuatBase, _VecBase as GfVecBase } from 'typescript-usd/gf'
import { Array as VtArray } from 'typescript-usd/vt'
import * as Usd from 'typescript-usd/usd'
import { Stage, AttributeQuery as UsdAttributeQuery } from 'typescript-usd/usd'
import { ArInMemoryResolver } from 'typescript-usd/usd/_internal'

type Mode = 'held' | 'linear'
type Value = boolean | number | string | Value[]

interface ValueCase {
  name: string
  typeName: string
  linear: boolean
  zero: Value
  two: Value
  midpoint: Value
  literalKind?: 'asset' | 'string'
  shaped?: boolean
}

const fill = (size: number, value: number): number[] => Array(size).fill(value)
const matrix = (size: number, value: number): number[][] =>
  Array.from({ length: size }, () => fill(size, value))

const cases: ValueCase[] = [
  { name: 'bool', typeName: 'bool', linear: false, zero: true, two: false, midpoint: true },
  { name: 'string', typeName: 'string', linear: false, zero: 's1', two: 's2', midpoint: 's1', literalKind: 'string' },
  { name: 'token', typeName: 'token', linear: false, zero: 's1', two: 's2', midpoint: 's1', literalKind: 'string' },
  { name: 'asset', typeName: 'asset', linear: false, zero: 's1', two: 's2', midpoint: 's1', literalKind: 'asset' },
  { name: 'pathExpression', typeName: 'pathExpression', linear: false, zero: '/TestPrim/p1', two: '/TestPrim/p2', midpoint: '/TestPrim/p1', literalKind: 'string', shaped: false },
  ...['uchar', 'int', 'uint', 'int64', 'uint64'].map(typeName => ({
    name: typeName, typeName, linear: false, zero: 0, two: 2, midpoint: 0,
  })),
  ...['half', 'float', 'double', 'timecode'].map(typeName => ({
    name: typeName, typeName, linear: true, zero: 0, two: 2, midpoint: 1,
  })),
  ...([2, 3, 4] as const).flatMap(size => [
    ...(['double', 'float', 'half'] as const).map(base => ({
      name: `${base}${size}`, typeName: `${base}${size}`, linear: true,
      zero: fill(size, 0), two: fill(size, 2), midpoint: fill(size, 1),
    })),
    {
      name: `int${size}`, typeName: `int${size}`, linear: false,
      zero: fill(size, 0), two: fill(size, 2), midpoint: fill(size, 0),
    },
  ]),
  ...([2, 3, 4] as const).map(size => ({
    name: `matrix${size}d`, typeName: `matrix${size}d`, linear: true,
    zero: matrix(size, 0), two: matrix(size, 2), midpoint: matrix(size, 1),
  })),
  { name: 'quatd', typeName: 'quatd', linear: true, zero: [0, 0, 0, 0], two: [1, 0, 0, 0], midpoint: [0.7071067811865475, 0, 0, 0] },
  { name: 'quatf', typeName: 'quatf', linear: true, zero: [0, 0, 0, 0], two: [1, 0, 0, 0], midpoint: [0.7071067690849304, 0, 0, 0] },
  { name: 'quath', typeName: 'quath', linear: true, zero: [0, 0, 0, 0], two: [1, 0, 0, 0], midpoint: [0.70703125, 0, 0, 0] },
]

const shaped = (testCase: ValueCase): boolean => testCase.shaped !== false
const clone = <T>(value: T): T => _sdfCloneValue(value) as T
const arrayValue = (value: Value): Value[] => [clone(value), clone(value)]

// The components of a Gf value or VtArray, in the nested shape the expected
// values are written in: rows for matrices, real-first for quaternions.
function components(value: unknown): unknown {
  if(value instanceof AssetPath)return value.getAssetPath()
  if (value instanceof VtArray) return value.toArray()
  if (value instanceof GfQuatBase) return [value.GetReal(), ...value.GetImaginary().data]
  if (value instanceof GfMatrixBase) {
    const flat = value.GetArray(), n = value.dimension
    return Array.from({ length: n }, (_, r) => flat.slice(r * n, r * n + n))
  }
  if (value instanceof GfVecBase) return [...value.data]
  return value
}

function expectValue(actual: unknown, expected: Value): void {
  actual = components(actual)
  if (typeof expected === 'number') {
    if (typeof actual === 'bigint') expect(actual).toBe(BigInt(expected))
    else expect(actual).toBeCloseTo(expected, 6)
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true)
    expect((actual as unknown[]).length).toBe(expected.length)
    for (let i = 0; i < expected.length; i++) expectValue((actual as unknown[])[i], expected[i]!)
  } else {
    expect(actual).toEqual(expected)
  }
}

function interpolationConstants(): { held: unknown; linear: unknown } {
  const module = Usd as unknown as Record<string, unknown>
  expect(module.InterpolationTypeHeld).toBeDefined()
  expect(module.InterpolationTypeLinear).toBeDefined()
  return { held: module.InterpolationTypeHeld, linear: module.InterpolationTypeLinear }
}

function setMode(stage: Stage, mode: Mode): void {
  const typed = stage as unknown as {
    setInterpolationType?: (value: unknown) => void
    getInterpolationType?: () => unknown
  }
  expect(typeof typed.setInterpolationType).toBe('function')
  expect(typeof typed.getInterpolationType).toBe('function')
  const value = interpolationConstants()[mode]
  typed.setInterpolationType!(value)
  expect(typed.getInterpolationType!()).toBe(value)
}

function authorDirect(testCase: ValueCase): { stage: Stage; scalar: string; array?: string } {
  const stage = Stage.createNew()
  const prim = stage.definePrim('/TestPrim', '')
  const scalar = `test${testCase.name}`
  stage.declareProperty('/TestPrim', scalar, testCase.typeName)
  prim.attr(scalar).setTimeSample(0, clone(testCase.zero))
  prim.attr(scalar).setTimeSample(2, clone(testCase.two))
  if (!shaped(testCase)) return { stage, scalar }
  const array = `${scalar}Array`
  stage.declareProperty('/TestPrim', array, `${testCase.typeName}[]`)
  prim.attr(array).setTimeSample(0, arrayValue(testCase.zero))
  prim.attr(array).setTimeSample(2, arrayValue(testCase.two))
  return { stage, scalar, array }
}

const quote = (text: string): string => JSON.stringify(text)
function literal(testCase: ValueCase, value: Value): string {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    return testCase.literalKind === 'asset' ? `@${value}@` : quote(value)
  }
  if (testCase.typeName.startsWith('matrix')) {
    return `( ${(value as Value[]).map(row => `(${(row as number[]).join(', ')})`).join(', ')} )`
  }
  return `(${value.join(', ')})`
}

function attrDeclaration(testCase: ValueCase, sampleTwo: Value, sampleTime = 1): string {
  const scalar = `${testCase.typeName} value.timeSamples = { 0: ${literal(testCase, testCase.zero)}, ${sampleTime}: ${literal(testCase, sampleTwo)} }`
  if (!shaped(testCase)) return scalar
  return `${scalar}\n    ${testCase.typeName}[] valueArray.timeSamples = { 0: [${literal(testCase, testCase.zero)}, ${literal(testCase, testCase.zero)}], ${sampleTime}: [${literal(testCase, sampleTwo)}, ${literal(testCase, sampleTwo)}] }`
}

function bytes(files: Record<string, string>): Record<string, Uint8Array> {
  return Object.fromEntries(Object.entries(files).map(([path, text]) =>
    [path, new TextEncoder().encode(text)]))
}

async function openOffset(testCase: ValueCase): Promise<Stage> {
  const sampleTwo = testCase.typeName === 'timecode' ? 1 : testCase.two
  return (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver(bytes({
    'root.usda': `#usda 1.0\n(subLayers = [@./sub.usda@ (scale = 2)])\n`,
    'sub.usda': `#usda 1.0\nover "TestPrim" {\n    ${attrDeclaration(testCase, sampleTwo)}\n}\n`,
  }))) }))!
}

async function openClip(testCase: ValueCase): Promise<Stage> {
  const sampleTwo = testCase.typeName === 'timecode' ? 1 : testCase.two
  const declarations = shaped(testCase)
    ? `${testCase.typeName} value\n    ${testCase.typeName}[] valueArray`
    : `${testCase.typeName} value`
  return (await Stage.open('root.usda', { resolverContext: _resolverContextForResolver(new ArInMemoryResolver(bytes({
    'root.usda': `#usda 1.0
over "TestPrim" (clips = { dictionary default = {
    double2[] active = [(0, 0)]
    asset[] assetPaths = [@./clip.usda@]
    string primPath = "/TestPrim"
    double2[] times = [(0, 0), (2, 1)]
}
 }) { ${declarations}
}
`,
    'clip.usda': `#usda 1.0\nover "TestPrim" {\n    ${attrDeclaration(testCase, sampleTwo)}\n}\n`,
  }))) }))!
}

function verifyConsumers(stage: Stage, path: string, expected: Value): void {
  const attr = stage.get(path)!
  expectValue(attr.getValueAtTime(1), expected)
  expectValue(new UsdAttributeQuery(attr).get(1), expected)
}

describe('testUsdAttributeInterpolationCpp / registered value families', () => {
  it('tracks all 33 SDF_VALUE_TYPES families (32 valued plus opaque)', () => {
    expect(cases).toHaveLength(32)
  })

  it.each(cases)('$name — direct scalar and shaped interpolation', testCase => {
    const { stage, scalar, array } = authorDirect(testCase)
    setMode(stage, 'linear')
    verifyConsumers(stage, `/TestPrim.${scalar}`, testCase.midpoint)
    if (array) verifyConsumers(stage, `/TestPrim.${array}`, arrayValue(testCase.midpoint))
    setMode(stage, 'held')
    verifyConsumers(stage, `/TestPrim.${scalar}`, testCase.zero)
    if (array) verifyConsumers(stage, `/TestPrim.${array}`, arrayValue(testCase.zero))
  })

  it.each(cases)('$name — layer-offset scalar and shaped interpolation', async testCase => {
    const stage = await openOffset(testCase)
    setMode(stage, 'linear')
    verifyConsumers(stage, '/TestPrim.value', testCase.midpoint)
    if (shaped(testCase)) verifyConsumers(stage, '/TestPrim.valueArray', arrayValue(testCase.midpoint))
    setMode(stage, 'held')
    verifyConsumers(stage, '/TestPrim.value', testCase.zero)
    if (shaped(testCase)) verifyConsumers(stage, '/TestPrim.valueArray', arrayValue(testCase.zero))
  })

  it.each(cases)('$name — value-clip scalar and shaped interpolation', async testCase => {
    const stage = await openClip(testCase)
    setMode(stage, 'linear')
    verifyConsumers(stage, '/TestPrim.value', testCase.midpoint)
    if (shaped(testCase)) verifyConsumers(stage, '/TestPrim.valueArray', arrayValue(testCase.midpoint))
    setMode(stage, 'held')
    verifyConsumers(stage, '/TestPrim.value', testCase.zero)
    if (shaped(testCase)) verifyConsumers(stage, '/TestPrim.valueArray', arrayValue(testCase.zero))
  })

  it('linear interpolation holds the lower mismatched-shape array sample', () => {
    const stage = Stage.createNew()
    const prim = stage.definePrim('/TestPrim', '')
    stage.declareProperty('/TestPrim', 'testAttr', 'double[]')
    prim.attr('testAttr').setTimeSample(0, [1, 1, 1, 1, 1])
    prim.attr('testAttr').setTimeSample(2, [3, 3, 3])
    setMode(stage, 'linear')
    verifyConsumers(stage, '/TestPrim.testAttr', [1, 1, 1, 1, 1])
  })

  // OpenUSD v26.08 interpolators.h:60-75 and stage.cpp:8997-9011.
  it('clamps held and linear values at both authored-sample boundaries', async () => {
    const stage = (await Stage.open('boundaries.usda', {
      resolverContext: _resolverContextForResolver(new ArInMemoryResolver(bytes({
        'boundaries.usda': `#usda 1.0
def "TestPrim" {
    int held.timeSamples = { 0: 2, 10: 12 }
    double linear.timeSamples = { 0: 2, 10: 12 }
}
`,
      }))),
    }))!
    setMode(stage, 'held')
    expect([-5, 0, 5, 10, 15].map(time =>
      stage.get('/TestPrim.held')!.getValueAtTime(time)))
      .toEqual([2, 2, 2, 12, 12])
    setMode(stage, 'linear')
    expect([-5, 0, 5, 10, 15].map(time =>
      stage.get('/TestPrim.linear')!.getValueAtTime(time)))
      .toEqual([2, 2, 7, 12, 12])
  })
})
