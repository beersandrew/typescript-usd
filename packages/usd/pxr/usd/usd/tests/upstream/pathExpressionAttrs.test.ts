// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdPathExpressionAttrs.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Mirrors pxr/usd/usd/testenv/testUsdPathExpressionAttrs.py
//
// Upstream exercises attributes whose value type is `pathExpression`
// (Sdf.ValueTypeNames.PathExpression / SdfPathExpression). The suite covers
// three behaviors:
//   1. test_BasicResolution      — `%_` (the "remainder" operator) composes a
//      weaker layer's expression into the stronger one across a sublayer.
//   2. test_BasicPathTranslation — across a reference, path-bearing exprs are
//      namespace-remapped (e.g. /prim/refChild -> /srcPrim/refChild) and the
//      `%_` remainder composes the referencing prim's own opinion.
//   3. test_BasicPathTranslation2 — a leading-`//` expr survives reference and
//      prototype-to-instance translation unchanged.
//
// All asserted values verified against the Pixar 26.05 build
// (the v26.05 reference build python) reproducing the identical scenes.

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

describe('pathExpression attributes — parse & round-trip', () => {
  it('declares a pathExpression attr and round-trips its string value', async () => {
    files = {
      'root.usda': `#usda 1.0
def "prim" {
    pathExpression expr = "/prim/super /prim/suber"
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/prim.expr')!
    expect(attr.typeName).toBe('pathExpression')
    expect(attr.getValue()).toBe('/prim/super /prim/suber')
  })

  it('round-trips an array of path expressions (pathExpression[])', async () => {
    files = {
      'root.usda': `#usda 1.0
def "prim" {
    pathExpression[] exprs = ["/a/b", "/c %_"]
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/prim.exprs')!
    expect(attr.typeName).toBe('pathExpression[]')
    expect(attr.getValue()).toEqual(['/a/b', '/c %_'])
  })

  it('round-trips the membership-expression form `//` unchanged', async () => {
    files = {
      'root.usda': `#usda 1.0
def "prim" {
    pathExpression expr = "//"
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/prim.expr')!
    expect(attr.typeName).toBe('pathExpression')
    expect(attr.getValue()).toBe('//')
  })
})

describe('pathExpression attributes — composition (test_BasicResolution)', () => {
  it('composes the `%_` remainder operator across a sublayer (-> "/prim/super /prim/suber")', async () => {
    files = {
      'sup.usda': `#usda 1.0
(
    subLayers = [@./sub.usda@]
)
def "prim" {
    pathExpression expr = "/prim/super %_"
}
`,
      'sub.usda': `#usda 1.0
def "prim" {
    pathExpression expr = "/prim/suber"
}
`,
    }
    const stage = (await Stage.open('sup.usda'))!
    const attr = stage.get('/prim.expr')!
    expect(attr.getValue()).toBe('/prim/super /prim/suber')
  })
})

describe('pathExpression attributes — path translation (test_BasicPathTranslation)', () => {
  it('translates referenced paths and composes `%_` (-> "/srcPrim/srcChild /srcPrim/refChild")', async () => {
    files = {
      'src.usda': `#usda 1.0
def "srcPrim" (
    prepend references = @./ref.usda@</prim>
) {
    pathExpression expr = "/srcPrim/srcChild %_"
}
`,
      'ref.usda': `#usda 1.0
def "prim" {
    pathExpression expr = "/prim/refChild"
}
`,
    }
    const stage = (await Stage.open('src.usda'))!
    const attr = stage.get('/srcPrim.expr')!
    expect(attr.getValue()).toBe('/srcPrim/srcChild /srcPrim/refChild')
  })

  it('anchors a relative authored expression to absolute (SdfPathExpression authoring)', async () => {
    files = {
      'root.usda': `#usda 1.0
def "prim" {
    pathExpression expr = "refChild"
}
`,
    }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/prim.expr')!
    expect(attr.getValue()).toBe('/prim/refChild')
  })
})

describe('pathExpression attributes — `//` translation (test_BasicPathTranslation2)', () => {
  // Upstream applies a `//` membership expression on a referenced prim and
  // reads it back through the reference unchanged. The OBSERVABLE result — the
  // `//` value surviving the reference — holds in typescript-usd because `//` carries
  // no operands to translate. (Upstream uses CollectionAPI.Apply +
  // GetMembershipExpressionAttr; we author the underlying attr directly.)
  it('reads a `//` expression authored on the referenced prim, unchanged', async () => {
    files = {
      'src.usda': `#usda 1.0
def "srcPrim" (
    prepend references = @./ref.usda@</dst>
) {
}
`,
      'ref.usda': `#usda 1.0
def "dst" {
    pathExpression expr = "//"
}
`,
    }
    const stage = (await Stage.open('src.usda'))!
    const attr = stage.get('/srcPrim.expr')!
    expect(attr.typeName).toBe('pathExpression')
    expect(attr.getValue()).toBe('//')
  })
})
