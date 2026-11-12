// Ported from OpenUSD 26.11.1: pxr/usd/usdShade/testenv/testUsdShadeBinding.py
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usdShade/testenv/testUsdShadeBinding.py (OpenUSD 26.11.1).
// Line numbers below cite that file. Python's
// UsdShade.MaterialBindingAPI(prim).ComputeBoundMaterial()[0] maps to the
// static MaterialBindingAPI.computeBoundMaterial(stage, primPath), which
// returns null where Python returns an invalid UsdShadeMaterial.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Material, MaterialBindingAPI } from '../../src/index.ts'

describe('TestUsdShadeBinding', () => {
  // testUsdShadeBinding.py:15-59 (test_Basic).
  it('test_Basic', async () => {
    const s = Stage.createNew()
    const rl = s.getRootLayer()

    // :18-27 set up so the weaker subtree binds gprim to look1.
    const lw1 = Material.define(s, '/weaker/look1')
    Material.define(s, '/weaker/look2')
    const gpw = s.overridePrim('/weaker/gprim')
    MaterialBindingAPI.apply(gpw).bind(lw1)
    expect(new MaterialBindingAPI(gpw).getDirectBindingRel().getTargets()).toEqual(['/weaker/look1'])

    // :29-35 and the stronger subtree binds gprim to look2.
    Material.define(s, '/stronger/look1')
    const ls2 = Material.define(s, '/stronger/look2')
    const gps = s.overridePrim('/stronger/gprim')
    MaterialBindingAPI.apply(gps).bind(ls2)
    expect(new MaterialBindingAPI(gps).getDirectBindingRel().getTargets()).toEqual(['/stronger/look2'])

    // :37-40
    const cr = s.overridePrim('/composed')
    await cr.getReferences().addReference(rl.identifier, '/stronger')
    await cr.getReferences().addReference(rl.identifier, '/weaker')

    // :42-46 validate we get look2, the stronger binding.
    const gpc = s.getPrim('/composed/gprim')!
    const lb = new MaterialBindingAPI(gpc).getDirectBindingRel()
    expect(lb.getTargets()).toEqual(['/composed/look2'])

    // :48-51 upon unbinding *in* the stronger site we should still be
    // unbound in the fully composed view.
    new MaterialBindingAPI(gps).unbindAllBindings()
    expect(lb.getTargets()).toEqual([])

    // :53-59 but *clearing* the target on the referenced prim should allow
    // the weaker binding to shine through.
    new MaterialBindingAPI(gps).getDirectBindingRel().clearTargets(true)
    expect(lb.getTargets()).toEqual(['/composed/look1'])
  })

  // testUsdShadeBinding.py:61-78 (test_GetBoundMaterial).
  it('test_GetBoundMaterial', () => {
    const stage = Stage.createNew()
    const look = Material.define(stage, '/World/Material')
    expect(look.isValid()).toBe(true)
    const gprim = stage.overridePrim('/World/Gprim')
    expect(gprim.isValid()).toBe(true)

    const gprimBindingAPI = MaterialBindingAPI.apply(gprim)
    expect(MaterialBindingAPI.computeBoundMaterial(stage, gprim.path)).toBeNull()
    gprimBindingAPI.bind(look)
    const bound = MaterialBindingAPI.computeBoundMaterial(stage, gprim.path)
    expect(bound?.materialPath).toBeTruthy()
    expect(bound?.bindingRelPath).toBeTruthy()

    // :75-78 now add one more target to mess things up.
    const rel = gprimBindingAPI.getDirectBindingRel()
    rel.addTarget('/World')
    expect(MaterialBindingAPI.computeBoundMaterial(stage, gprim.path)).toBeNull()
  })

  // testUsdShadeBinding.py:80-91 (test_BlockingOnOver).
  it('test_BlockingOnOver', async () => {
    const stage = Stage.createNew()
    const over = stage.overridePrim('/World/over')
    const look = Material.define(stage, '/World/Material')
    expect(look.isValid()).toBe(true)
    const gprim = stage.definePrim('/World/gprim')

    new MaterialBindingAPI(over).unbindDirectBinding()
    MaterialBindingAPI.apply(gprim).bind(look)
    // This will compose in gprim's binding, but should still be blocked.
    await over.getInherits().addInherit('/World/gprim')
    expect(MaterialBindingAPI.computeBoundMaterial(stage, '/World/over')).toBeNull()
  })
})
