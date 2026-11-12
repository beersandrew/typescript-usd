// Ported from OpenUSD 26.11.1: pxr/usd/usdGeom/xformCache.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Two diagnostics OpenUSD 26.11.1 does not post, observed with its Python
// build: composing a reference with no prim path (`@./missing.usda@`) posts
// only the missing-asset composition error, with no "Ill-formed SdfPath <>"
// warning; and UsdGeom.XformCache().GetLocalTransformation(pseudoRoot) gives
// (identity, False) with no warning. Querying the cache through a child
// reaches the pseudo-root, whose entry has no XformQuery because it is not an
// Xformable (xformCache.cpp:84-99), so nothing reads `/.xformOpOrder`.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TfDiagnosticMgr } from 'typescript-usd/tf'
import { Layer } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { XformCache } from 'typescript-usd/usdGeom'

let warnings: string[]
const delegate: Parameters<TfDiagnosticMgr['addDelegate']>[0] = {
  issueError() {}, issueStatus() {},
  issueWarning(warning) { warnings.push(warning.getCommentary()) },
}
beforeEach(() => { warnings = []; TfDiagnosticMgr.GetInstance().addDelegate(delegate) })
afterEach(() => { TfDiagnosticMgr.GetInstance().removeDelegate(delegate) })

describe('diagnostics OpenUSD does not post', () => {
  it('parses a reference without a prim path without a path warning', () => {
    const layer = Layer.createAnonymous()
    layer.importFromString('#usda 1.0\ndef Xform "A" (\n    references = @./missing.usda@\n)\n{\n}\n')
    expect(warnings.filter(w => w.startsWith('Ill-formed SdfPath'))).toEqual([])
  })

  it('caches the pseudo-root without reading xformOpOrder on it', async () => {
    const layer = Layer.createAnonymous()
    layer.importFromString('#usda 1.0\ndef Xform "A"\n{\n}\n')
    const stage = await Stage.open(layer)
    const cache = new XformCache(0)
    cache.getLocalToWorldTransform(stage.getPrim('/A')!)
    cache.transformMightBeTimeVarying(stage.getPrim('/')!)
    const local = cache.getLocalTransformation(stage.getPrim('/')!)
    expect(local.resetsXformStack).toBe(false)
    expect(local.matrix).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    expect(warnings).toEqual([])
  })
})

// UsdGeom.XformCache(0) in OpenUSD 26.11.1, over
//   def Xform "A" { double3 xformOp:translate = (1, 2, 3); uniform token[] xformOpOrder = ["xformOp:translate"]
//     def Scope "S" { double3 xformOp:translate = (10, 0, 0); uniform token[] xformOpOrder = ["xformOp:translate"] } }
// GetLocalTransformation(/A/S) is (identity, False) and
// GetLocalToWorldTransform(/A/S) is the translate (1, 2, 3): a Scope is not an
// Xformable, so its authored ops are not applied.
describe('XformCache on prims that are not Xformable', () => {
  it('ignores xform ops authored on a Scope', async () => {
    const layer = Layer.createAnonymous()
    layer.importFromString(`#usda 1.0
def Xform "A"
{
    double3 xformOp:translate = (1, 2, 3)
    uniform token[] xformOpOrder = ["xformOp:translate"]

    def Scope "S"
    {
        double3 xformOp:translate = (10, 0, 0)
        uniform token[] xformOpOrder = ["xformOp:translate"]
    }
}
`)
    const stage = await Stage.open(layer)
    const cache = new XformCache(0)
    const local = cache.getLocalTransformation(stage.getPrim('/A/S')!)
    expect(local).toEqual({ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], resetsXformStack: false })
    expect(cache.getLocalToWorldTransform(stage.getPrim('/A/S')!)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 2, 3, 1])
  })
})
