// Benchmarks for the core's hot paths: time-sample authoring and reads, value
// resolution through composition, instancing, stage open (prim-index builds),
// structural authoring, traversal, and file I/O. Scenes are generated here, so
// the benchmarks need nothing but Node. Run with `pnpm bench`.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { bench, describe } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { TsKnot, TsSpline } from 'typescript-usd/ts'
import { serializeUsdc } from '../pxr/usd/sdf/src/crateFile.ts'

const dir = mkdtempSync(path.join(tmpdir(), 'typescript-usd-bench-'))
const write = (name: string, text: string) => {
  const file = path.join(dir, name)
  writeFileSync(file, text)
  return file
}

const SAMPLES = 1000
const samples = (n: number) => Array.from({ length: n }, (_, i) => `${i}: ${i * 0.5}`).join(', ')

// An asset with an animated attribute, referenced from a root layer.
write('asset.usda', `#usda 1.0
def Xform "Asset"
{
    double weight.timeSamples = { ${samples(SAMPLES)} }
    def Mesh "Geom"
    {
        double size = 2
    }
}
`)
const referenced = write('referenced.usda', `#usda 1.0
def "World"
{
    def "Ref" (
        references = @./asset.usda@</Asset>
    )
    {
    }
}
`)

// 1,000 instanceable references to the asset.
const INSTANCES = 1000
const instanced = write('instanced.usda', `#usda 1.0
def "World"
{
${Array.from({ length: INSTANCES }, (_, i) => `    def "I_${i}" (
        instanceable = true
        references = @./asset.usda@</Asset>
    )
    {
    }`).join('\n')}
}
`)

// A 5,000-prim hierarchy (50 groups x 100 prims) with a few properties each.
const GROUPS = 50, PER_GROUP = 100
const hierarchy = write('hierarchy.usda', `#usda 1.0
def "World"
{
${Array.from({ length: GROUPS }, (_, g) => `    def Xform "G_${g}"
    {
${Array.from({ length: PER_GROUP }, (_, i) => `        def Mesh "M_${i}"
        {
            double size = ${i}
            token purpose = "default"
            float3[] extent = [(0, 0, 0), (1, 1, 1)]
        }`).join('\n')}
    }`).join('\n')}
}
`)

const stageWithSamples = () => {
  const stage = Stage.createNew()
  stage.definePrim('/Anim', 'Xform')
  stage.getRootLayer().setField('/Anim.weight', 'typeName', 'double')
  const attr = stage.getPrim('/Anim')!.attr('weight')
  for (let t = 0; t < SAMPLES; t++) attr.setTimeSample(t, t * 0.5)
  return { stage, attr }
}

describe('time samples', () => {
  bench(`author ${SAMPLES} samples on one attribute`, () => {
    stageWithSamples()
  })

  const { attr } = stageWithSamples()
  bench(`read every one of ${SAMPLES} samples`, () => {
    for (let t = 0; t < SAMPLES; t++) attr.getValueAtTime(t + 0.25)
  })

  bench(`list ${SAMPLES} sample times x100`, () => {
    for (let i = 0; i < 100; i++) attr.getTimeSampleKeys()
  })
})

describe('splines', () => {
  const KNOTS = 2000
  const spline = () => {
    const s = new TsSpline('double')
    for (let i = 0; i < KNOTS; i++) {
      const knot = new TsKnot()
      knot.SetTime(i)
      knot.setValue(i % 7)
      s.setKnot(knot)
    }
    return s
  }
  bench(`author ${KNOTS} knots one at a time`, () => {
    spline()
  })
  const s = spline()
  bench(`evaluate between each of ${KNOTS} knots`, () => {
    for (let i = 0; i + 1 < KNOTS; i++) s.eval(i + 0.5)
  })
})

describe('composition', () => {
  let stage: Stage
  bench('read samples through a reference (x200)', async () => {
    stage ??= (await Stage.open(referenced))!
    const attr = stage.get('/World/Ref.weight')!
    for (let t = 0; t < 200; t++) attr.getValueAtTime(t)
  })

  bench(`open a stage with ${INSTANCES} instanced references`, async () => {
    await Stage.open(instanced)
  })

  let instances: Stage
  bench(`read an attribute on each of ${INSTANCES} instance proxies`, async () => {
    instances ??= (await Stage.open(instanced))!
    for (let i = 0; i < INSTANCES; i++) instances.getPrim(`/World/I_${i}/Geom`)!.getAttr('size')!.getValueAtTime(0)
  })
})

describe('stage structure', () => {
  bench(`open a ${GROUPS * PER_GROUP}-prim hierarchy`, async () => {
    await Stage.open(hierarchy)
  })

  let big: Stage
  bench(`traverse ${GROUPS * PER_GROUP} prims and list property names`, async () => {
    big ??= (await Stage.open(hierarchy))!
    for (const primPath of big.traverse()) big.getPrim(primPath)?.getPropertyNames()
  })

  bench('define 200 prims on a 5,000-prim stage, then flush', async () => {
    const stage = (await Stage.open(hierarchy))!
    for (let i = 0; i < 200; i++) stage.definePrim(`/World/New_${i}`, 'Xform')
    await stage.flushChanges()
  })
})

describe('file I/O', () => {
  const POINTS = 100_000
  const meshLayer = () => {
    const layer = Layer.createAnonymous()
    layer.definePrimSpec('/Mesh', 'Mesh')
    layer.setField('/Mesh.points', 'typeName', 'point3f[]')
    layer.setAttrDefault('/Mesh', 'points', Array.from({ length: POINTS }, (_, i) => [i, i + 1, i + 2]))
    return layer
  }
  const mesh = meshLayer()
  const usda = mesh.toUsda()
  const usdc = serializeUsdc(mesh)

  bench(`parse USDA with ${POINTS.toLocaleString()} points`, () => {
    Layer.createInMemory('bench.usda', usda)
  })
  bench(`write USDA with ${POINTS.toLocaleString()} points`, () => {
    mesh.toUsda()
  })
  // Opening a layer decodes structure; values decode when read.
  bench(`open a USDC layer with ${POINTS.toLocaleString()} points`, () => {
    Layer.fromBytes(usdc, 'bench.usdc')
  })
  bench(`open a USDC layer and read ${POINTS.toLocaleString()} points`, () => {
    Layer.fromBytes(usdc, 'bench.usdc').getField('/Mesh.points', 'default')
  })
  bench(`write USDC with ${POINTS.toLocaleString()} points`, () => {
    serializeUsdc(mesh)
  })

  const hierarchyLayer = Layer.createInMemory('hierarchy.usda', readFileSync(hierarchy, 'utf8'))
  const hierarchyUsdc = serializeUsdc(hierarchyLayer)
  bench(`open a USDC layer with ${GROUPS * PER_GROUP} prims`, () => {
    Layer.fromBytes(hierarchyUsdc, 'hierarchy.usdc')
  })
  bench(`write USDC with ${GROUPS * PER_GROUP} prims`, () => {
    serializeUsdc(hierarchyLayer)
  })
})
