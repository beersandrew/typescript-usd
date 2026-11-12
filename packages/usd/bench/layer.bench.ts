// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/generatedSchema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Benchmarks for layer construction and reads: USDA parsing versus building a
// whole layer from text, USDC open, attribute value resolution through a
// stage, and time-sample-heavy layers. Inputs are generated deterministically
// here; the one real asset is usdGeom's generatedSchema.usda (vendored from
// OpenUSD, pxr/usd/usdGeom/generatedSchema.usda). Run with `pnpm bench`;
// `node bench/record.mjs <label>` records results under bench/results/.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { bench, describe } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { parseUsda } from '../pxr/usd/sdf/src/textFileFormatParser.ts'
import { serializeUsdc } from '../pxr/usd/sdf/src/crateFile.ts'
import { Dictionary as VtDictionary, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Type as TfType } from 'typescript-usd/tf'

// A deterministic USDA scene of `meshes` cube meshes under /World, each with
// metadata, array-valued attributes, a transform and a relationship.
function meshScene(meshes: number): string {
  const parts = ['#usda 1.0\n(\n    defaultPrim = "World"\n)\n\ndef Xform "World"\n{\n']
  for (let i = 0; i < meshes; i++) {
    parts.push(`    def Mesh "M${i}" (
        kind = "component"
        customData = { int a = ${i % 7} string b = "x" }
    )
    {
        float3[] extent = [(-1, -1, -1), (1, 1, 1)]
        int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
        int[] faceVertexIndices = [0, 1, 3, 2, 2, 3, 5, 4, 4, 5, 7, 6, 6, 7, 1, 0, 1, 7, 5, 3, 6, 0, 2, 4]
        point3f[] points = [(-0.5, -0.5, 0.5), (0.5, -0.5, 0.5), (-0.5, 0.5, 0.5), (0.5, 0.5, 0.5), (-0.5, 0.5, -0.5), (0.5, 0.5, -0.5), (-0.5, -0.5, -0.5), (0.5, -0.5, -0.5)]
        double3 xformOp:translate = (${i}, 0, ${(i * 0.25).toFixed(2)})
        uniform token[] xformOpOrder = ["xformOp:translate"]
        rel material:binding = </World/Mat>
    }
`)
  }
  parts.push('}\n')
  return parts.join('')
}

// A deterministic USDA scene of `attrs` double attributes with `samples`
// time samples each.
function sampleScene(attrs: number, samples: number): string {
  const parts = ['#usda 1.0\n\ndef Xform "Anim"\n{\n']
  for (let a = 0; a < attrs; a++) {
    const values = Array.from({ length: samples }, (_, t) => `${t}: ${((t * 7 + a) % 101) * 0.5}`)
    parts.push(`    double a${a}.timeSamples = { ${values.join(', ')} }\n`)
  }
  parts.push('}\n')
  return parts.join('')
}

// A fixed permutation of 0..n-1 (a linear congruential shuffle), so the
// random-order authoring benchmark inserts the same times on every run.
function shuffledTimes(n: number): number[] {
  const times = Array.from({ length: n }, (_, i) => i)
  let seed = 12345
  for (let i = n - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const j = seed % (i + 1)
    ;[times[i], times[j]] = [times[j]!, times[i]!]
  }
  return times
}

const MB = (text: string) => `${(Buffer.byteLength(text) / 1e6).toFixed(2)} MB`

const sizes = [
  { name: 'small', meshes: 200, iterations: 20 },
  { name: 'medium', meshes: 2000, iterations: 10 },
  { name: 'large', meshes: 20000, iterations: 5 },
] as const

for (const { name, meshes, iterations } of sizes) {
  const text = meshScene(meshes)
  describe(`USDA import, ${name} (${meshes} meshes, ${MB(text)})`, () => {
    const options = { iterations, time: 0 }
    bench('parseUsda (text to parser scene)', () => { parseUsda(text) }, options)
    bench('Layer.createInMemory (parse and build layer)', () => {
      Layer.createInMemory('bench.usda', text)
    }, options)
    bench('Layer.importFromString into an anonymous layer', () => {
      Layer.createAnonymous().importFromString(text)
    }, options)
  })
}

const schemaPath = fileURLToPath(new URL('../pxr/usd/usdGeom/plugin/generatedSchema.usda', import.meta.url))
const schemaText = readFileSync(schemaPath, 'utf8')
describe(`USDA import, real asset (usdGeom generatedSchema.usda, ${MB(schemaText)})`, () => {
  const text = schemaText
  bench('parseUsda (text to parser scene)', () => { parseUsda(text) })
  bench('Layer.createInMemory (parse and build layer)', () => {
    Layer.createInMemory('generatedSchema.usda', text)
  })
})

describe('USDC open (2000 meshes)', () => {
  const usdc = serializeUsdc(Layer.createInMemory('medium.usda', meshScene(2000)))
  bench(`Layer.fromBytes (${(usdc.byteLength / 1e6).toFixed(2)} MB)`, () => {
    Layer.fromBytes(usdc, 'medium.usdc')
  })
  bench('Layer.fromBytes and read every points default', () => {
    const layer = Layer.fromBytes(usdc, 'medium.usdc')
    for (let i = 0; i < 2000; i++) layer.getField(`/World/M${i}.points`, 'default')
  })
})

describe('attribute value resolution through Usd (2000 meshes)', () => {
  const layer = Layer.createInMemory('resolve.usda', meshScene(2000))
  let stage: Stage | undefined
  const attrs: Array<{ getValueAtTime(time: number): unknown }> = []
  const ready = async () => {
    if (stage) return
    stage = await Stage.open(layer)
    for (let i = 0; i < 2000; i++) {
      const prim = stage.getPrim(`/World/M${i}`)!
      attrs.push(prim.getAttr('points')!, prim.getAttr('xformOp:translate')!, prim.getAttr('extent')!)
    }
  }
  bench('Stage.open on a built layer', async () => { await Stage.open(layer) })
  bench('resolve 6000 attribute defaults', async () => {
    await ready()
    for (const attr of attrs) attr.getValueAtTime(0)
  })
})

describe('time samples', () => {
  const text = sampleScene(200, 500)
  bench(`Layer.createInMemory, 200 attributes x 500 samples (${MB(text)})`, () => {
    Layer.createInMemory('samples.usda', text)
  }, { iterations: 10, time: 0 })

  const N = 10_000
  const order = shuffledTimes(N)
  const authored = (times: readonly number[]) => {
    const layer = Layer.createAnonymous()
    layer.definePrimSpec('/Anim', 'Xform')
    layer.setField('/Anim.w', 'typeName', 'double')
    for (const t of times) layer.setAttrTimeSample('/Anim', 'w', t, t * 0.5)
    return layer
  }
  bench(`author ${N} samples in increasing time order`, () => {
    authored(order.slice().sort((a, b) => a - b))
  }, { iterations: 10, time: 0 })
  bench(`author ${N} samples in shuffled time order`, () => {
    authored(order)
  }, { iterations: 10, time: 0 })

  const layer = authored(order)
  bench(`query and bracket ${N} times on a ${N}-sample attribute`, () => {
    for (const t of order) {
      layer.queryTimeSample('/Anim.w', t)
      layer.getBracketingTimeSamplesForPath('/Anim.w', t + 0.5)
    }
  })

  let attr: { getValueAtTime(time: number): unknown, getBracketingTimeSamples(time: number): unknown } | undefined
  bench(`resolve ${N} interpolated times through Usd`, async () => {
    attr ??= (await Stage.open(layer)).getPrim('/Anim')!.getAttr('w')!
    for (const t of order) attr.getValueAtTime(t + 0.5)
  })
  bench(`bracket ${N / 10} times through Usd`, async () => {
    attr ??= (await Stage.open(layer)).getPrim('/Anim')!.getAttr('w')!
    for (let i = 0; i < N / 10; i++) attr.getBracketingTimeSamples(order[i]! + 0.5)
  })
})

describe('VtValue copies', () => {
  // 1000 entries holding 100-element string arrays and nested dictionaries.
  const strings = TfType.declare('string[]')
  const source = new VtDictionary()
  for (let i = 0; i < 1000; i++) {
    source.set(`s${i}`, VtValue.create(Array.from({ length: 100 }, (_, j) => `v${i}_${j}`), strings))
    source.set(`d${i}`, VtValue.createDictionary(new VtDictionary([
      ['a', VtValue.create(i, VtValueTypes.int)],
      ['b', VtValue.create(`x${i}`, VtValueTypes.string)],
    ])))
  }
  bench('copy a 2000-entry VtDictionary x10', () => {
    for (let k = 0; k < 10; k++) new VtDictionary(source)
  })
})
