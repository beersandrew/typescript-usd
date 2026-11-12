// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdInstanceProxy.py,
//  pxr/usd/usd/testenv/testUsdInstancing.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// P9B: native scenegraph instancing — testUsdInstancing /
// testUsdInstanceProxy essentials. Every expectation in this file was
// pinned against Pixar 26.05 python (Usd.Stage) on the identical layers:
// prototype sharing and contents, the direct-arc candidate rule, ignored
// local descendant overrides, bare prototype roots, instance-proxy
// resolution, per-prim variant prototypes, nested instancing shape, and
// editing restrictions.
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> { const name = assetPath.split('/').pop() ?? assetPath; return new ArResolvedPath(files[name] === undefined ? '' : assetPath) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

const PROP = `#usda 1.0
(
    defaultPrim = "Prop"
)
def Xform "Prop"
{
    double localAttr = 1
    def Cube "geom"
    {
        double size = 2
        double fromAsset = 10
    }
}
`

const ROOT = `#usda 1.0
def Xform "World"
{
    def "Inst1" (
        instanceable = true
        references = @./prop.usda@
    )
    {
        double3 xformOp:translate = (5, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
        over "geom"
        {
            double localOver = 99
            double fromAsset = 11
        }
    }
    def "Inst2" (
        instanceable = true
        references = @./prop.usda@
    )
    {
        double3 xformOp:translate = (-5, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
    def "NotInst" (
        instanceable = true
    )
    {
        def Cube "child" {
        }
    }
}
`

async function openBasic(): Promise<Stage> {
  files = { 'root.usda': ROOT, 'prop.usda': PROP }
  return (await Stage.open('root.usda'))!
}

describe('prototype identification (Usd_InstanceCache)', () => {
  it('instances with identical arcs share one prototype', async () => {
    const stage = await openBasic()
    const protos = stage.getPrototypes()
    expect(protos.map(p => p.path)).toEqual(['/__Prototype_1'])
    const i1 = stage.getPrim('/World/Inst1')!
    const i2 = stage.getPrim('/World/Inst2')!
    expect(i1.isInstance()).toBe(true)
    expect(i2.isInstance()).toBe(true)
    expect(i1.getPrototype()?.path).toBe('/__Prototype_1')
    expect(i2.getPrototype()?.path).toBe('/__Prototype_1')
    expect(stage.getInstances('/__Prototype_1')).toEqual(['/World/Inst1', '/World/Inst2'])
  })

  it('instanceable without direct arcs is not an instance (direct-arc rule)', async () => {
    const stage = await openBasic()
    const ni = stage.getPrim('/World/NotInst')!
    expect(ni.isInstanceable()).toBe(true)
    expect(ni.isInstance()).toBe(false)
    // and its children remain ordinary scenegraph prims
    expect(stage.getChildPrimPaths('/World/NotInst')).toEqual(['/World/NotInst/child'])
  })

  it('local descendant overrides are ignored and do not break sharing', async () => {
    const stage = await openBasic()
    // Inst1 carries local overs beneath it — still shares Inst2's prototype
    expect(stage.getPrim('/World/Inst1')!.getPrototype()?.path)
      .toBe(stage.getPrim('/World/Inst2')!.getPrototype()?.path)
    // and the prototype composes WITHOUT them (Pixar: localOver None, fromAsset 10)
    const geom = stage.getPrim('/__Prototype_1/geom')!
    expect(geom.getAttr('fromAsset')?.getValue()).toBe(10)
    expect(geom.getAttr('localOver')?.getValue()).toBeUndefined()
  })

  it('the prototype root is a bare container; instances keep their own opinions', async () => {
    const stage = await openBasic()
    const proto = stage.getPrototypes()[0]!
    // Pixar: prototype root has no typeName and no properties
    expect(proto.typeName).toBe('')
    expect(proto.attrNames).toEqual([])
    expect(proto.isPrototype()).toBe(true)
    // the instance composes its full root-level state (reference + local)
    const i1 = stage.getPrim('/World/Inst1')!
    expect(i1.typeName).toBe('Xform')
    expect(i1.getAttr('localAttr')?.getValue()).toBe(1)
    expect(i1.getAttr('xformOp:translate')?.getValue()).toEqual([5, 0, 0])
  })
})

describe('instance proxies (testUsdInstanceProxy)', () => {
  it('instances have no scenegraph children; proxies resolve through getPrim', async () => {
    const stage = await openBasic()
    expect(stage.getChildPrimPaths('/World/Inst1')).toEqual([])
    const proxy = stage.getPrim('/World/Inst1/geom')!
    expect(proxy.path).toBe('/World/Inst1/geom')
    expect(proxy.isInstanceProxy()).toBe(true)
    expect(proxy.typeName).toBe('Cube')
    expect(proxy.getAttr('fromAsset')?.getValue()).toBe(10)
    expect(proxy.getPrimInPrototype()?.path).toBe('/__Prototype_1/geom')
    // prototype-side prims are not proxies
    expect(stage.getPrim('/__Prototype_1/geom')!.isInstanceProxy()).toBe(false)
    expect(stage.getPrim('/__Prototype_1/geom')!.isInPrototype()).toBe(true)
  })

  it('getChildPrimPaths with instanceProxies rebases prototype children', async () => {
    const stage = await openBasic()
    expect(stage.getChildPrimPaths('/World/Inst1', { instanceProxies: true }))
      .toEqual(['/World/Inst1/geom'])
  })

  it('prototypes are hidden from traverse() and the pseudo-root children', async () => {
    const stage = await openBasic()
    expect(stage.getChildPrimPaths('/')).toEqual(['/World'])
    for (const path of stage.traverse()) {
      expect(path.startsWith('/__Prototype_')).toBe(false)
    }
  })
})

describe('editing restrictions', () => {
  it('authoring beneath an instance or into a prototype throws; the instance root is editable', async () => {
    const stage = await openBasic()
    expect(() => stage.definePrim('/World/Inst1/newChild')).toThrow(/instance/)
    expect(() => stage.definePrim('/__Prototype_1/newChild')).toThrow(/prototype/)
    // the instance prim itself is editable (e.g. its transform)
    expect(() => stage.definePrim('/World/Inst1')).not.toThrow()
  })
})

describe('variant-only candidates', () => {
  it('per-prim variant sites produce distinct prototypes (Pixar parity)', async () => {
    files = {
      'root.usda': `#usda 1.0
def Xform "World" {
    def Xform "V1" (
        instanceable = true
        variantSets = "look"
        variants = { string look = "red" }
    ) {
        variantSet "look" = {
            "red" {
                def Cube "geo" {
                }
            }
        }
    }
    def Xform "V2" (
        instanceable = true
        variantSets = "look"
        variants = { string look = "red" }
    ) {
        variantSet "look" = {
            "red" {
                def Cube "geo" {
                }
            }
        }
    }
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const v1 = stage.getPrim('/World/V1')!
    const v2 = stage.getPrim('/World/V2')!
    // Pixar 26.05: both are instances, but their variant specs live at
    // different sites, so they do NOT share a prototype.
    expect(v1.isInstance()).toBe(true)
    expect(v2.isInstance()).toBe(true)
    expect(v1.getPrototype()?.path).not.toBe(v2.getPrototype()?.path)
    expect(stage.getPrim(`${v1.getPrototype()!.path}/geo`)?.typeName).toBe('Cube')
  })
})

describe('nested instancing', () => {
  it('inner instances live at in-prototype paths (Pixar parity)', async () => {
    files = {
      'inner.usda': `#usda 1.0
( defaultPrim = "Leaf" )
def Xform "Leaf" {
    def Cube "geo" {
        double size = 1
    }
}
`,
      'mid.usda': `#usda 1.0
( defaultPrim = "Mid" )
def Xform "Mid" {
    def "A" (
        instanceable = true
        references = @./inner.usda@
    ) {
        double3 xformOp:translate = (1, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
    def "B" (
        instanceable = true
        references = @./inner.usda@
    ) {
        double3 xformOp:translate = (-1, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
}
`,
      'root.usda': `#usda 1.0
def Xform "World" {
    def "M1" (
        instanceable = true
        references = @./mid.usda@
    ) {}
    def "M2" (
        instanceable = true
        references = @./mid.usda@
    ) {}
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const protos = stage.getPrototypes().map(p => p.path).sort()
    expect(protos.length).toBe(2)

    const outer = stage.getPrim('/World/M1')!.getPrototype()!
    expect(stage.getPrim('/World/M2')!.getPrototype()!.path).toBe(outer.path)
    expect(stage.getInstances(outer.path)).toEqual(['/World/M1', '/World/M2'])

    // the outer prototype's children are themselves instances of the inner
    const outerKids = stage.getChildPrimPaths(outer.path)
    expect(outerKids.map(p => p.split('/').pop())).toEqual(['A', 'B'])
    const innerA = stage.getPrim(outerKids[0]!)!
    expect(innerA.isInstance()).toBe(true)
    const inner = innerA.getPrototype()!
    expect(inner.path).not.toBe(outer.path)
    // Pixar: instances of the inner prototype are the IN-PROTOTYPE paths
    expect(stage.getInstances(inner.path)).toEqual(outerKids)
    expect(stage.getPrim(`${inner.path}/geo`)?.typeName).toBe('Cube')

    // proxy resolution chains through nested instances
    const deep = stage.getPrim('/World/M1/A/geo')!
    expect(deep.isInstanceProxy()).toBe(true)
    expect(deep.typeName).toBe('Cube')
    expect(deep.getAttr('size')?.getValue()).toBe(1)
  })
})

describe('ancestral-arc boundary (BasicInstancing museum case, distilled)', () => {
  it('prototype composes direct arcs + implied inherits; ancestral and local opinions stay out', async () => {
    files = {
      'prop.usda': `#usda 1.0
class "_class_Prop"
{
}
def "Prop" (
    inherits = </_class_Prop>
)
{
    double a = 1.0
    def "geom"
    {
        double x = 1.0
    }
}
`,
      'set.usda': `#usda 1.0
def "Set"
{
    def "InstancedProp" (
        references = @./prop.usda@</Prop>
        instanceable = true
    )
    {
        double a = 2.0
        def "From_set"
        {
        }
        over "geom"
        {
            double x = 2.0
        }
    }
}
`,
      'root.usda': `#usda 1.0
class "_class_Prop"
{
    double a = 3.5
    def "From_class_in_root"
    {
    }
    over "geom"
    {
        double x = 3.5
    }
}
def "Set_1" (
    references = @./set.usda@</Set>
)
{
    over "InstancedProp"
    {
        double a = 3.0
        def "From_root"
        {
        }
        over "geom"
        {
            double x = 3.0
        }
    }
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const inst = stage.getPrim('/Set_1/InstancedProp')!
    expect(inst.isInstance()).toBe(true)
    const proto = inst.getPrototype()!

    const kids = stage.getChildPrimPaths(proto.path).map(p => p.split('/').pop()!)
    // Pixar: geom (direct reference) + From_class_in_root (implied inherit
    // in the root layer stack); NOT From_set (ancestral reference arc) and
    // NOT From_root (local override beneath the instance).
    expect(kids).toContain('geom')
    expect(kids).toContain('From_class_in_root')
    expect(kids).not.toContain('From_set')
    expect(kids).not.toContain('From_root')

    // Pixar: the root-layer CLASS over wins inside the prototype (x = 3.5,
    // inherit strength) — not the ancestral set over (2.0), not the local
    // over (3.0), not the referenced value (1.0).
    const geomX = stage.getPrim(`${proto.path}/geom`)!.getAttr('x')?.getValue()
    expect(geomX).toBe(3.5)

    // the instance ROOT still honors its local property override
    expect(inst.getAttr('a')?.getValue()).toBe(3)
  })
})
