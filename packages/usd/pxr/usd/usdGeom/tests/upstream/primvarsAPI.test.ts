// Mirrors pxr/usd/usdGeom/testenv/testUsdGeomPrimvarsAPI.py (enumeration parts)
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { Mesh, PrimvarsAPI } from 'typescript-usd/usdGeom'

function makeMesh() {
  const stage = Stage.createNew()
  const mesh = Mesh.define(stage, '/M')
  return { stage, mesh, prim: () => stage.getPrim('/M')! }
}

describe('UsdGeomPrimvarsAPI', () => {
  it('createPrimvar authors primvars:NAME with interpolation', () => {
    const { stage, mesh, prim } = makeMesh()
    const api = new PrimvarsAPI(mesh.prim, stage)
    api.createPrimvar('st', 'texCoord2f[]', 'faceVarying').set([[0, 0], [1, 0], [1, 1]])

    const pv = PrimvarsAPI.getPrimvar(prim(), 'st')
    expect(pv).not.toBeNull()
    expect(pv!.getInterpolation()).toBe('faceVarying')
    expect(pv!.getValue()).toEqual([[0, 0], [1, 0], [1, 1]])
    expect(prim().getAttr('primvars:st')?.getField('interpolation')).toBe('faceVarying')
    expect(prim().attrNames).not.toContain('primvars:st:interpolation')
  })

  it('getPrimvars enumerates value attrs, skipping :indices and :interpolation', () => {
    const { stage, mesh, prim } = makeMesh()
    const api = new PrimvarsAPI(mesh.prim, stage)
    api.createPrimvar('st', 'texCoord2f[]', 'faceVarying').set([[0, 0]])
    api.setIndices('st', [0, 0, 0])
    api.createPrimvar('displayColor', 'color3f[]', 'constant').set([[1, 0, 0]])

    const names = PrimvarsAPI.getPrimvars(prim()).map(p => p.name)
    expect(names).toEqual(['displayColor', 'st'])
  })

  it('indexed primvars expose their index array', () => {
    const { stage, mesh, prim } = makeMesh()
    const api = new PrimvarsAPI(mesh.prim, stage)
    api.createPrimvar('st', 'texCoord2f[]', 'faceVarying').set([[0, 0], [1, 1]])
    api.setIndices('st', [0, 1, 1, 0])

    const pv = PrimvarsAPI.getPrimvar(prim(), 'st')!
    expect(pv.isIndexed()).toBe(true)
    expect([...pv.getIndices()!]).toEqual([0, 1, 1, 0])
  })

  it('interpolation falls back to constant when unauthored', () => {
    const { stage, mesh, prim } = makeMesh()
    const api = new PrimvarsAPI(mesh.prim, stage)
    api.createPrimvar('foo', 'float[]').set([1, 2, 3])
    expect(PrimvarsAPI.getPrimvar(prim(), 'foo')!.getInterpolation()).toBe('constant')
  })

  it('getPrimvar returns null for missing primvars; hasPrimvar agrees', () => {
    const { prim } = makeMesh()
    expect(PrimvarsAPI.getPrimvar(prim(), 'nope')).toBeNull()
    expect(PrimvarsAPI.hasPrimvar(prim(), 'nope')).toBe(false)
  })

  it('finds only constant primvars through the OpenUSD v26.08 inheritance walk', () => {
    const stage = Stage.createNew()
    const root = Mesh.define(stage, '/Root')
    const child = Mesh.define(stage, '/Root/Child')
    const rootApi = new PrimvarsAPI(root.prim, stage)
    rootApi.createPrimvar('constantValue', 'float', 'constant').set(1)
    rootApi.createPrimvar('varyingValue', 'float[]', 'varying').set([2])
    const childApi = new PrimvarsAPI(child.prim, stage)
    expect(childApi.findPrimvarWithInheritance('constantValue')?.primPath).toBe('/Root')
    expect(childApi.findPrimvarWithInheritance('varyingValue')).toBeNull()
    expect(childApi.findPrimvarsWithInheritance().map(primvar => primvar.name)).toEqual(['constantValue'])
    expect(childApi.hasPossiblyInheritedPrimvar('constantValue')).toBe(true)
  })
})
