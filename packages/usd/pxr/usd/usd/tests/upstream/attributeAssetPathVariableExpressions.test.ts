// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/usd/testenv/testUsdAttributeAssetPathVariableExpressions.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _setResolverForTest } from 'typescript-usd/usd/_internal'
// Ported from pxr/usd/usd/testenv/testUsdAttributeAssetPathVariableExpressions.py
// (OpenUSD v26.05). The suite reads `asset`/`asset[]` attributes whose authored
// value is a VARIABLE EXPRESSION (a string wrapped in backticks, e.g.
// `` @`"./${NAME}.usda"`@ ``) and checks that UsdAttribute::Get returns an
// Sdf.AssetPath whose `authoredPath` is the raw expression and whose
// `evaluatedPath` is the expression resolved against the stage's
// `expressionVariables` layer metadata — at the default time AND across
// time samples (held).
//
// Golden authored/evaluated paths were captured from the Pixar 26.05 build.

import { beforeEach, describe, expect, it } from 'vitest'
import { Array as VtArray } from 'typescript-usd/vt'
import { Stage } from 'typescript-usd/usd'
import { ArAsset, ArInMemoryAsset, ArResolvedPath, ArResolver, SdfAssetPath } from 'typescript-usd/usd/_internal'
import { sdfEvaluateVariableExpression } from 'typescript-usd/sdf'

let files: Record<string, string> = {}
class FixtureResolver extends ArResolver {
  async resolve(assetPath: string): Promise<ArResolvedPath> {
    const name = assetPath.split('/').pop() ?? assetPath
    return new ArResolvedPath(files[name] === undefined ? '' : assetPath)
  }
  async openAsset(path: ArResolvedPath): Promise<ArAsset | undefined> {
    const name = path.toString().split('/').pop() ?? path.toString()
    const text = files[name]
    return text === undefined ? undefined : new ArInMemoryAsset(new TextEncoder().encode(text))
  }
}
beforeEach(() => {
  _setResolverForTest(new FixtureResolver())
})

// test_Get
describe('asset attr with variable expression', () => {
  const scene = `#usda 1.0
(
    expressionVariables = {
        string NAME = "assetPathsTest"
        string NAME5 = "assetPathsTest5"
        string NAME10 = "assetPathsTest10"
    }
)

def "Test"
{
    asset a = @\`"./\${NAME}.usda"\`@
    asset a.timeSamples = {
        5: @\`"./\${NAME5}.usda"\`@,
        10: @\`"./\${NAME10}.usda"\`@
    }
}
`

  it('returns the authored expression at the default time', async () => {
    files = { 'root.usda': scene }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/Test.a')
    expect(attr).toBeDefined()
    // upstream: assetPath.authoredPath == '`"./${NAME}.usda"`'
    expect((attr!.getValue() as SdfAssetPath).getAuthoredPath()).toBe('`"./${NAME}.usda"`')
  })

  it('returns the authored expression at/around each time sample (held)', async () => {
    files = { 'root.usda': scene }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/Test.a')!
    expect(attr.getTimeSampleKeys()).toEqual([5, 10])
    // upstream: attr.Get(5).authoredPath == '`"./${NAME5}.usda"`'
    expect((attr.getValueAtTime(5) as SdfAssetPath).getAuthoredPath())
      .toBe('`"./${NAME5}.usda"`')
    // upstream: attr.Get(100).authoredPath == '`"./${NAME10}.usda"`'  (held past last)
    expect((attr.getValueAtTime(100) as SdfAssetPath).getAuthoredPath())
      .toBe('`"./${NAME10}.usda"`')
  })

  it('the variable-expression engine resolves authored -> evaluated against expressionVariables', async () => {
    files = { 'root.usda': scene }
    const stage = (await Stage.open('root.usda'))!
    const vars = stage.getMetadata('expressionVariables') as Record<string, unknown>
    // golden evaluatedPath values from the Pixar 26.05 build
    expect(sdfEvaluateVariableExpression('`"./${NAME}.usda"`', vars as never).value)
      .toBe('./assetPathsTest.usda')
    expect(sdfEvaluateVariableExpression('`"./${NAME5}.usda"`', vars as never).value)
      .toBe('./assetPathsTest5.usda')
    expect(sdfEvaluateVariableExpression('`"./${NAME10}.usda"`', vars as never).value)
      .toBe('./assetPathsTest10.usda')
  })

  it('attr.Get().evaluatedPath resolves the expression to ./assetPathsTest.usda', async () => {
    files = { 'root.usda': scene }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/Test.a')!
    expect((attr.getValue() as SdfAssetPath).getEvaluatedPath()).toBe('./assetPathsTest.usda')
  })

  it('attr.Get(5/100).evaluatedPath resolves to ./assetPathsTest5/10.usda', async () => {
    files = { 'root.usda': scene }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/Test.a')!
    expect((attr.getValueAtTime(5) as SdfAssetPath).getEvaluatedPath())
      .toBe('./assetPathsTest5.usda')
    expect((attr.getValueAtTime(100) as SdfAssetPath).getEvaluatedPath())
      .toBe('./assetPathsTest10.usda')
  })
})

// test_GetArray
describe('asset[] attr with variable expressions', () => {
  const scene = `#usda 1.0
(
    expressionVariables = {
        string NAME0 = "assetPathsTest0"
        string NAME1 = "assetPathsTest1"
        string NAME2 = "assetPathsTest2"

        string NAME_5_0 = "assetPathsTest5_0"
        string NAME_5_1 = "assetPathsTest5_1"
        string NAME_5_2 = "assetPathsTest5_2"

        string NAME_10_0 = "assetPathsTest10_0"
        string NAME_10_1 = "assetPathsTest10_1"
        string NAME_10_2 = "assetPathsTest10_2"
    }
)

def "Test"
{
    asset[] a = [
            @\`"./\${NAME0}.usda"\`@,
            @\`"./\${NAME1}.usda"\`@,
            @\`"./\${NAME2}.usda"\`@
    ]
    asset[] a.timeSamples = {
        5: [
                @\`"./\${NAME_5_0}.usda"\`@,
                @\`"./\${NAME_5_1}.usda"\`@,
                @\`"./\${NAME_5_2}.usda"\`@,
            ],
        10: [
                @\`"./\${NAME_10_0}.usda"\`@,
                @\`"./\${NAME_10_1}.usda"\`@,
                @\`"./\${NAME_10_2}.usda"\`@,
            ],
    }
}
`

  it('returns the authored expression array at the default time', async () => {
    files = { 'root.usda': scene }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/Test.a')!
    expect((attr.getValue() as VtArray<SdfAssetPath>).toArray().map(value => value.getAuthoredPath())).toEqual([
      '`"./${NAME0}.usda"`',
      '`"./${NAME1}.usda"`',
      '`"./${NAME2}.usda"`',
    ])
  })

  it('returns the authored expression arrays at/around time samples (held)', async () => {
    files = { 'root.usda': scene }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/Test.a')!
    expect(attr.getTimeSampleKeys()).toEqual([5, 10])
    // upstream attr.Get(3) -> the t=5 sample (held below first key)
    expect((attr.getValueAtTime(3) as VtArray<SdfAssetPath>).toArray().map(value => value.getAuthoredPath())).toEqual([
      '`"./${NAME_5_0}.usda"`',
      '`"./${NAME_5_1}.usda"`',
      '`"./${NAME_5_2}.usda"`',
    ])
    expect((attr.getValueAtTime(10) as VtArray<SdfAssetPath>).toArray().map(value => value.getAuthoredPath())).toEqual([
      '`"./${NAME_10_0}.usda"`',
      '`"./${NAME_10_1}.usda"`',
      '`"./${NAME_10_2}.usda"`',
    ])
  })

  it('attr.Get() array elements carry resolved evaluatedPath values', async () => {
    files = { 'root.usda': scene }
    const stage = (await Stage.open('root.usda'))!
    const attr = stage.get('/Test.a')!
    expect((attr.getValue() as VtArray<SdfAssetPath>).toArray().map(value => value.getEvaluatedPath())).toEqual([
      './assetPathsTest0.usda',
      './assetPathsTest1.usda',
      './assetPathsTest2.usda',
    ])
  })
})
