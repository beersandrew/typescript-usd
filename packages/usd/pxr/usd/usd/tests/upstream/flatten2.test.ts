// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdFlatten2.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from upstream testenv/testUsdFlatten2 (museum cases that exercise
// Registered programs: testUsdFlatten2, testUsdFlatten3, testUsdFlatten4.
// Stage.Flatten() over native instancing, nested instances, and variants).
// Upstream opens each scene, calls stage.Flatten(), and diffs the exported
// layer against a baseline. Full-text equality is brittle across
// implementations, so we instead assert the COMPOSED VALUES OpenUSD v26.08
// produces — on both the source stage and the reopened flattened layer — which
// is the property the baseline encodes. Goldens captured from the live OpenUSD
// v26.08 reference build.
import { beforeEach, describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver } from 'typescript-usd/usd/_internal'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(path: string): Promise<ArResolvedPath> { const name = path.split('/').pop() ?? path; return new ArResolvedPath(files[name] === undefined ? '' : path) }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> { const name = path.toString().split('/').pop() ?? path.toString(); const text = files[name]; return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text)) }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

// Reopen a stage's flattened layer through the virtual fs.
async function reopenFlattened(stage: Stage): Promise<Stage> {
  const flatText = stage.flatten().toUsda()
  files = { ...files, 'flat.usda': flatText }
  return (await Stage.open('flat.usda'))!
}

// ---------------------------------------------------------------------------
// BasicInstancing
// ---------------------------------------------------------------------------
const BI_PROP = `#usda 1.0
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
`
const BI_SET = `#usda 1.0
class "_class_Prop"
{
    double a = 2.5
    def "From_class_in_set" {}
    over "geom" { double x = 2.5 ; }
}
def "Set"
{
    def "InstancedProp" (
        references = @./prop.usda@</Prop>
        instanceable = True
    )
    {
        double a = 2.0
        def "From_set" {}
        over "geom" { double x = 2.0 ; }
    }
    def "UninstancedProp" (
        references = @./prop.usda@</Prop>
        instanceable = False
    )
    {
        double a = 2.0
        def "From_set" {}
        over "geom" { double x = 2.0 ; }
    }
}
`
const BI_ROOT = `#usda 1.0
class "_class_Prop"
{
    double a = 3.5
    def "From_class_in_root" {}
    over "geom" { double x = 3.5 ; }
}
def "Set_1" (
    references = @./set.usda@</Set>
)
{
    over "InstancedProp"
    {
        double a = 3.0
        def "From_root" {}
        over "geom" { double x = 3.0 ; }
    }
    over "UninstancedProp"
    {
        double a = 3.0
        def "From_root" {}
        over "geom" { double x = 3.0 ; }
    }
}
def "NotAnInstance" (
    instanceable = True
)
{
    def "Child" {}
}
`

describe('Flatten2 — BasicInstancing', () => {
  const fixture = { 'root.usda': BI_ROOT, 'set.usda': BI_SET, 'prop.usda': BI_PROP }

  // Composed-value checks that must hold on both source and flattened stages.
  function assertComposed(stage: Stage): void {
    // Instance: local opinion at the instance root wins; descendant overrides
    // are ignored (data comes from the prototype).
    const inst = stage.getPrim('/Set_1/InstancedProp')!
    expect(inst.isInstance()).toBe(true)
    expect(inst.getAttr('a')?.getValue()).toBe(3.0)
    // Uninstanced prim composes descendants normally, root override strongest.
    const un = stage.getPrim('/Set_1/UninstancedProp')!
    expect(un.isInstance()).toBe(false)
    expect(un.getAttr('a')?.getValue()).toBe(3.0)
    expect(stage.getPrim('/Set_1/UninstancedProp/geom')?.getAttr('x')?.getValue()).toBe(3.0)
    for (const child of ['From_class_in_set', 'From_set', 'From_class_in_root', 'From_root']) {
      expect(stage.getPrim(`/Set_1/UninstancedProp/${child}`), child).toBeTruthy()
    }
    // instanceable without an instanceable arc is inert (not a real instance).
    expect(stage.getPrim('/NotAnInstance')!.isInstance()).toBe(false)
    expect(stage.getPrim('/NotAnInstance/Child')).toBeTruthy()
    // Instance-proxy reads come from the prototype: geom x = 3.5 (class wins).
    const proxyGeom = stage.getPrim('/Set_1/InstancedProp/geom')!
    expect(proxyGeom.isInstanceProxy()).toBe(true)
    expect(proxyGeom.getAttr('x')?.getValue()).toBe(3.5)
  }

  it('source stage composes museum-case values', async () => {
    files = { ...fixture }
    assertComposed((await Stage.open('root.usda'))!)
  })

  it('flattened layer recomposes the same values', async () => {
    files = { ...fixture }
    const src = (await Stage.open('root.usda'))!
    assertComposed(await reopenFlattened(src))
  })
})

// ---------------------------------------------------------------------------
// BasicInstancingAndVariants
// ---------------------------------------------------------------------------
const BIV_REF = `#usda 1.0
def "Model" (
    variantSets = ["y"]
    variants = { string y = "a" }
)
{
    double x = 5.0
    variantSet "y" = {
        "a" { def "geom" { double x = 10.0 ; }
}
        "b" { def "geom" { double x = 20.0 ; }
}
    }
}
`
const BIV_ROOT = `#usda 1.0
def "InstancedModel" (
    instanceable = True
    references = @./ref.usda@</Model>
    add variantSets = ["x"]
    variants = { string x = "a"; string y = "a" }
)
{
    variantSet "x" = {
        "a" {
            double x = 1.0
            over "geom" { double x = 1.0 ; }
            def "from_a_variant" {}
        }
        "b" {
            double x = 2.0
            over "geom" { double x = 2.0 ; }
            def "from_b_variant" {}
        }
    }
}
def "UninstancedModel" (
    instanceable = False
    references = @./ref.usda@</Model>
    add variantSets = ["x"]
    variants = { string x = "b"; string y = "b" }
)
{
    variantSet "x" = {
        "a" {
            double x = 3.0
            over "geom" { double x = 3.0 ; }
            def "from_a_variant" {}
        }
        "b" {
            double x = 4.0
            over "geom" { double x = 4.0 ; }
            def "from_b_variant" {}
        }
    }
}
`

describe('Flatten2 — BasicInstancingAndVariants', () => {
  const fixture = { 'root.usda': BIV_ROOT, 'ref.usda': BIV_REF }

  // Composed VALUES (variant selection × instancing) — these match Pixar.
  function assertComposed(stage: Stage): void {
    expect(stage.getPrim('/InstancedModel')!.getAttr('x')?.getValue()).toBe(1.0)
    // geom comes from the x=a variant's over (1.0)
    expect(stage.getPrim('/InstancedModel/geom')!.getAttr('x')?.getValue()).toBe(1.0)
    expect(stage.getPrim('/InstancedModel/from_a_variant')).toBeTruthy()
    expect(stage.getPrim('/InstancedModel/from_b_variant')).toBeFalsy()

    expect(stage.getPrim('/UninstancedModel')!.isInstance()).toBe(false)
    expect(stage.getPrim('/UninstancedModel')!.getAttr('x')?.getValue()).toBe(4.0)
    expect(stage.getPrim('/UninstancedModel/geom')?.getAttr('x')?.getValue()).toBe(4.0)
    expect(stage.getPrim('/UninstancedModel/from_b_variant')).toBeTruthy()
    expect(stage.getPrim('/UninstancedModel/from_a_variant')).toBeFalsy()
  }

  it('source stage composes variant + instancing values', async () => {
    files = { ...fixture }
    assertComposed((await Stage.open('root.usda'))!)
  })

  it('flattened layer recomposes the same values', async () => {
    files = { ...fixture }
    const src = (await Stage.open('root.usda'))!
    assertComposed(await reopenFlattened(src))
  })

  // A prim carrying LOCAL variant opinions on top of an instanceable
  // reference arc still classifies as a native instance (Pixar:
  // /InstancedModel.IsInstance()==True, with its geom reachable only as an
  // instance proxy) — this was flagged as a gap in an earlier pass but
  // typescript-usd now classifies it correctly; asserted directly here.
  it('classifies variant-bearing prims as native instances', async () => {
    files = { ...fixture }
    const stage = (await Stage.open('root.usda'))!
    const inst = stage.getPrim('/InstancedModel')!
    expect(inst.isInstance()).toBe(true)
    const proxyGeom = stage.getPrim('/InstancedModel/geom')!
    expect(proxyGeom.isInstanceProxy()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// BasicInstancingAndNestedInstances
// ---------------------------------------------------------------------------
const BIN_PROP = `#usda 1.0
def "Prop"
{
    rel propRel = </Prop/geom>
    int foo = 1
    def "geom"
    {
        int foo.connect = </Prop.foo>
    }
}
`
const BIN_SET = `#usda 1.0
def "Set"
{
    def "PropInstance_1" (
        references = @./prop.usda@</Prop>
        instanceable = true
    )
    {
        rel propInstanceRel = [
            </Set/PropInstance_1/geom>,
            </Set/PropInstance_2/geom>,
            </Set/PropNotAnInstance_1/geom>
        ]
        over "geom" {}
    }
    def "PropInstance_2" (
        references = @./prop.usda@</Prop>
        instanceable = true
    )
    {
        rel propInstanceRel = [
            </Set/PropInstance_1/geom>,
            </Set/PropInstance_2/geom>,
            </Set/PropNotAnInstance_1/geom>
        ]
        over "geom" {}
    }
    def "PropNotAnInstance_1" (
        references = @./prop.usda@</Prop>
    )
    {
        over "geom" {}
    }
}
`
const BIN_ROOT = `#usda 1.0
def "Set_1" (
    references = @./set.usda@</Set>
    instanceable = true
)
{
    rel setInstanceRel = [
        </Set_1/PropInstance_1>,
        </Set_1/PropInstance_1/geom>,
        </Set_1/PropInstance_2>,
        </Set_1/PropInstance_2/geom>,
        </Set_1/PropNotAnInstance_1>,
        </Set_1/PropNotAnInstance_1/geom>
    ]
    over "PropInstance_1" { over "geom" {}
}
    over "PropInstance_2" { over "geom" {}
}
    over "PropNotAnInstance_1" { over "geom" {}
}
}
`

describe('Flatten2 — BasicInstancingAndNestedInstances', () => {
  const fixture = { 'root.usda': BIN_ROOT, 'set.usda': BIN_SET, 'prop.usda': BIN_PROP }

  function assertComposed(stage: Stage): void {
    // The whole /Set_1 is a single instance.
    const set = stage.getPrim('/Set_1')!
    expect(set.isInstance()).toBe(true)
    // Nested instance proxies read from the prototype; their rel targets are
    // remapped from prototype-relative back to the instance namespace.
    const pi1 = stage.getPrim('/Set_1/PropInstance_1')!
    expect(pi1.isInstanceProxy()).toBe(true)
    expect(pi1.getAttr('propInstanceRel')?.getTargets()).toEqual([
      '/Set_1/PropInstance_1/geom',
      '/Set_1/PropInstance_2/geom',
      '/Set_1/PropNotAnInstance_1/geom',
    ])
    expect(pi1.getAttr('propRel')?.getTargets()).toEqual(['/Set_1/PropInstance_1/geom'])
    expect(stage.getPrim('/Set_1/PropNotAnInstance_1')!.getAttr('propRel')?.getTargets())
      .toEqual(['/Set_1/PropNotAnInstance_1/geom'])
  }

  it('source stage composes nested-instance rel remapping', async () => {
    files = { ...fixture }
    assertComposed((await Stage.open('root.usda'))!)
  })

  it('flattened layer recomposes nested-instance rel remapping', async () => {
    files = { ...fixture }
    const src = (await Stage.open('root.usda'))!
    assertComposed(await reopenFlattened(src))
  })
})
