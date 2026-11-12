// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingCollectionPredicateLibrary.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usdImaging/usdImaging/testenv/testUsdImagingCollectionPredicateLibrary.cpp
// (OpenUSD 26.11.1), registered in pxr/usdImaging/usdImaging/CMakeLists.txt:474-477.
// Each RUNTEST of main() (cpp:600-627) is an it(); TF_AXIOMs are expect()s.
// The USD-side evaluator is SdfMakePathExpressionEval(expr,
// UsdGetCollectionPredicateLibrary()) matched against
// stage->GetObjectAtPath(p), as the test's _Checker does (cpp:103-170).
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CollectionExpressionEvaluator as HdCollectionExpressionEvaluator,
  GetCollectionPredicateLibrary as HdGetCollectionPredicateLibrary,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import {
  Layer as SdfLayer,
  MakePathExpressionEval as SdfMakePathExpressionEval,
  PathExpression as SdfPathExpression,
  type PathExpressionEval as SdfPathExpressionEval,
} from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { TfErrorMark } from 'typescript-usd/tf'
import {
  GetCollectionPredicateLibrary as UsdGetCollectionPredicateLibrary,
  SchemaRegistry as UsdSchemaRegistry,
  Stage as UsdStage,
} from 'typescript-usd/usd'
import { UsdImagingGetCollectionPredicateLibrary, UsdImagingStageSceneIndex } from 'typescript-usd/usdImaging'

// testUsdImagingCollectionPredicateLibrary.cpp:36-70
//
// /World          def   Scope  kind=assembly
// /World/Car      def   Xform  kind=group,     [GeomModelAPI]
// /World/Car/Body def   Mesh   kind=component, [CollectionAPI:foo,
//                                               CollectionAPI:bar]
// /World/Car/Wheel def  Mesh   kind=component, [MaterialBindingAPI]
// /World/Asset    def   Xform  kind=component, [GeomModelAPI]
// /World/Abstract class -      (no kind)
// /World/Override over  -      (no kind)
// /World/NoKind   def   Scope  (no kind)
//
// Note: UsdImagingStageSceneIndex uses "!UsdPrimIsAbstract" in its traversal
// predicate, so /World/Abstract does not appear in the Hd scene index.
// Tests involving that path are marked "USD-only".
const kTestUsda = `
#usda 1.0

def Scope "World" (
    kind = "assembly"
) {
    def Xform "Car" (
        kind = "group"
        prepend apiSchemas = ["GeomModelAPI"]
    ) {
        def Mesh "Body" (
            kind = "component"
            prepend apiSchemas = ["CollectionAPI:foo",
                                  "CollectionAPI:bar"]
        ) {
        }
        def Mesh "Wheel" (
            kind = "component"
            prepend apiSchemas = ["MaterialBindingAPI"]
        ) {
        }
    }
    def Xform "Asset" (
        kind = "component"
        prepend apiSchemas = ["GeomModelAPI"]
    ) {
    }
    class "Abstract" {
    }
    over "Override" {
    }
    def Scope "NoKind" {
    }
}
`

/** testUsdImagingCollectionPredicateLibrary.cpp:72-78 */
async function _CreateStage(): Promise<UsdStage> {
  const layer = SdfLayer.createAnonymous('.usda')
  expect(layer.importFromString(kTestUsda)).toBe(true)
  return UsdStage.open(layer)
}

/** testUsdImagingCollectionPredicateLibrary.cpp:80-86 */
function _CreateSceneIndex(stage: UsdStage): UsdImagingStageSceneIndex {
  const si = UsdImagingStageSceneIndex.new()
  si.SetStage(stage)
  return si
}

type _UsdObject = ReturnType<UsdStage['getObjectAtPath']>

/** testUsdImagingCollectionPredicateLibrary.cpp:88-170 _Checker: creates both
 *  evaluators for an expression and checks that both the USD and UsdImaging
 *  libraries return the expected result. Check() is only valid for paths in
 *  the Hd scene index (def and over prims); use CheckUsdOnly() for class
 *  prim paths. */
class _Checker {
  readonly expr: SdfPathExpression
  readonly usdEval: SdfPathExpressionEval<_UsdObject>
  readonly hdEval: HdCollectionExpressionEvaluator

  constructor(exprStr: string, readonly stage: UsdStage, si: HdSceneIndexBase) {
    this.expr = new SdfPathExpression(exprStr)
    this.usdEval = SdfMakePathExpressionEval(this.expr, UsdGetCollectionPredicateLibrary())
    this.hdEval = new HdCollectionExpressionEvaluator(si, this.expr, UsdImagingGetCollectionPredicateLibrary())
  }

  /** Assert that both evaluators return `expected` for `path`. */
  check(pathStr: string, expected: boolean): void {
    const path = SdfPath.fromString(pathStr)
    const usdRes = this.usdEval.match(path, p => this.stage.getObjectAtPath(p.pathString)).GetValue()
    const hdRes = this.hdEval.match(path).GetValue()
    expect(usdRes, `USD eval of ${this.expr.getText()} at <${pathStr}>`).toBe(expected)
    expect(hdRes, `Hd eval of ${this.expr.getText()} at <${pathStr}>`).toBe(expected)
  }

  /** Assert that the USD evaluator returns `expected` for `path`. */
  checkUsdOnly(pathStr: string, expected: boolean): void {
    const path = SdfPath.fromString(pathStr)
    const usdRes = this.usdEval.match(path, p => this.stage.getObjectAtPath(p.pathString)).GetValue()
    expect(usdRes, `USD eval of ${this.expr.getText()} at <${pathStr}>`).toBe(expected)
  }
}

let stage: UsdStage
let si: HdSceneIndexBase

describe('testUsdImagingCollectionPredicateLibrary', () => {
  // testUsdImagingCollectionPredicateLibrary.cpp:604-614
  beforeAll(async () => {
    stage = await _CreateStage()
    si = _CreateSceneIndex(stage)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:174-201 */
  it('TestAbstract', () => {
    const mark = new TfErrorMark()
    {
      const c = new _Checker('//{abstract}', stage, si) // cpp:182
      c.checkUsdOnly('/World/Abstract', true)
      c.check('/World', false)
      c.check('/World/Car', false)
      c.check('/World/Override', false)
      c.check('/World/NoKind', false)
    }
    {
      const c = new _Checker('//{abstract:false}', stage, si) // cpp:192
      c.checkUsdOnly('/World/Abstract', false)
      c.check('/World', true)
      c.check('/World/Car', true)
      c.check('/World/Override', true)
      c.check('/World/NoKind', true)
    }
    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:204-234 */
  it('TestDefined', () => {
    const mark = new TfErrorMark()
    {
      const c = new _Checker('//{defined}', stage, si) // cpp:210
      c.check('/World', true)
      c.check('/World/Car', true)
      c.check('/World/Car/Body', true)
      c.check('/World/NoKind', true)
      c.check('/World/Override', false)
    }
    {
      const c = new _Checker('//{defined:false}', stage, si) // cpp:224
      c.check('/World/Override', true)
      c.check('/World', false)
      c.check('/World/Car', false)
    }
    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:237-277 */
  it('TestSpecifier', () => {
    const mark = new TfErrorMark()
    {
      const c = new _Checker('//{specifier:def}', stage, si) // cpp:243
      c.check('/World', true)
      c.check('/World/Car/Body', true)
      c.check('/World/Override', false)
      c.checkUsdOnly('/World/Abstract', false)
    }
    {
      const c = new _Checker('//{specifier:class}', stage, si) // cpp:253
      c.checkUsdOnly('/World/Abstract', true)
      c.checkUsdOnly('/World', false)
    }
    {
      const c = new _Checker('//{specifier:over}', stage, si) // cpp:260
      c.check('/World/Override', true)
      c.check('/World', false)
      c.checkUsdOnly('/World/Abstract', false)
    }
    {
      const c = new _Checker('//{specifier("over","class")}', stage, si) // cpp:269
      c.check('/World/Override', true)
      c.checkUsdOnly('/World/Abstract', true)
      c.check('/World', false)
      c.check('/World/Car', false)
    }
    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:280-327 */
  it('TestKind', () => {
    const mark = new TfErrorMark()
    {
      const c = new _Checker('//{kind:assembly}', stage, si) // cpp:286
      c.check('/World', true)
      c.check('/World/Car', false)
      c.check('/World/Car/Body', false)
    }
    {
      const c = new _Checker('//{kind:group}', stage, si) // cpp:294
      c.check('/World', true)
      c.check('/World/Car', true)
      c.check('/World/Car/Body', false)
      c.check('/World/NoKind', false)
    }
    {
      const c = new _Checker('//{kind(group,strict=true)}', stage, si) // cpp:303
      c.check('/World', false)
      c.check('/World/Car', true)
      c.check('/World/Car/Body', false)
    }
    {
      const c = new _Checker('//{kind:component}', stage, si) // cpp:311
      c.check('/World/Car/Body', true)
      c.check('/World/Car/Wheel', true)
      c.check('/World/Asset', true)
      c.check('/World', false)
      c.check('/World/NoKind', false)
    }
    {
      const c = new _Checker('//{kind:assembly}', stage, si) // cpp:321
      c.check('/World/Override', false)
      c.check('/World/NoKind', false)
    }
    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:330-354 */
  it('TestModel', () => {
    const mark = new TfErrorMark()
    {
      const c = new _Checker('//{model}', stage, si) // cpp:335
      c.check('/World', true)
      c.check('/World/Car', true)
      c.check('/World/Car/Body', true)
      c.check('/World/Asset', true)
      c.check('/World/NoKind', false)
      c.check('/World/Override', false)
    }
    {
      const c = new _Checker('//{model:false}', stage, si) // cpp:346
      c.check('/World/NoKind', true)
      c.check('/World/Override', true)
      c.check('/World', false)
      c.check('/World/Car/Body', false)
    }
    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:357-380 */
  it('TestGroup', () => {
    const mark = new TfErrorMark()
    {
      const c = new _Checker('//{group}', stage, si) // cpp:363
      c.check('/World', true)
      c.check('/World/Car', true)
      c.check('/World/Car/Body', false)
      c.check('/World/NoKind', false)
    }
    {
      const c = new _Checker('//{group:false}', stage, si) // cpp:372
      c.check('/World/Car/Body', true)
      c.check('/World/NoKind', true)
      c.check('/World', false)
      c.check('/World/Car', false)
    }
    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:383-436 */
  it('TestHasAPI', () => {
    const mark = new TfErrorMark()
    {
      const c = new _Checker('//{hasAPI:GeomModelAPI}', stage, si) // cpp:389
      c.check('/World/Car', true)
      c.check('/World/Asset', true)
      c.check('/World', false)
      c.check('/World/Car/Body', false)
      c.check('/World/Override', false)
    }
    {
      const c = new _Checker('//{hasAPI:MaterialBindingAPI}', stage, si) // cpp:399
      c.check('/World/Car/Wheel', true)
      c.check('/World/Car/Body', false)
      c.check('/World/Car', false)
    }
    {
      const c = new _Checker('//{hasAPI:CollectionAPI}', stage, si) // cpp:408
      c.check('/World/Car/Body', true)
      c.check('/World/Car/Wheel', false)
      c.check('/World/Car', false)
    }
    {
      const c = new _Checker('//{hasAPI(CollectionAPI,instanceName=foo)}', stage, si) // cpp:416
      c.check('/World/Car/Body', true)
      c.check('/World/Car/Wheel', false)
    }
    {
      const c = new _Checker('//{hasAPI(CollectionAPI,instanceName=bar)}', stage, si) // cpp:423
      c.check('/World/Car/Body', true)
      c.check('/World/Car/Wheel', false)
    }
    {
      const c = new _Checker('//{hasAPI:GeomModelAPI}', stage, si) // cpp:430
      c.check('/World/NoKind', false)
      c.check('/World/Override', false)
    }
    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:439-503 */
  it('TestIsa', () => {
    const mark = new TfErrorMark()
    // testUsdImagingCollectionPredicateLibrary.cpp:443-450: isa requires the
    // USD schema registry to resolve type names; both are registered here.
    expect(UsdSchemaRegistry.getTypeFromSchemaTypeName('Mesh').isUnknown()).toBe(false)
    expect(UsdSchemaRegistry.getTypeFromSchemaTypeName('Xformable').isUnknown()).toBe(false)
    {
      const c = new _Checker('//{isa:Mesh}', stage, si) // cpp:457
      c.check('/World/Car/Body', true)
      c.check('/World/Car/Wheel', true)
      c.check('/World', false)
      c.check('/World/Car', false)
    }
    {
      const c = new _Checker('//{isa(Mesh,strict=true)}', stage, si) // cpp:466
      c.check('/World/Car/Body', true)
      c.check('/World/Car/Wheel', true)
      c.check('/World', false)
      c.check('/World/Car', false)
    }
    {
      const c = new _Checker('//{isa:Xformable}', stage, si) // cpp:481
      c.check('/World/Car', true)
      c.check('/World/Car/Body', true)
      c.check('/World', false)
    }
    {
      const c = new _Checker('//{isa(Xformable,strict=true)}', stage, si) // cpp:490
      c.check('/World/Car', false)
      c.check('/World/Car/Body', false)
    }
    {
      const c = new _Checker('//{isa:Mesh}', stage, si) // cpp:498
      c.check('/World/Override', false)
    }
    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:506-528 */
  it('TestCompoundPredicates', () => {
    const mark = new TfErrorMark()
    {
      const c = new _Checker('//{kind:component and hasAPI:GeomModelAPI}', stage, si) // cpp:512
      c.check('/World/Asset', true)
      c.check('/World/Car', false)
      c.check('/World/Car/Body', false)
    }
    {
      const c = new _Checker('//{defined and group}', stage, si) // cpp:520
      c.check('/World', true)
      c.check('/World/Car', true)
      c.check('/World/Override', false)
      c.check('/World/Car/Body', false)
    }
    expect(mark.isClean()).toBe(true)
  })
  /** testUsdImagingCollectionPredicateLibrary.cpp:530-565 */
  it('TestUsdAndHydraPredicates', () => {
    const mark = new TfErrorMark()
    // The composed library (Hd + UsdImaging predicates) supports both
    // Hydra (i.e. hd*) and USD predicates in a single expression.
    const composedLib = UsdImagingGetCollectionPredicateLibrary(HdGetCollectionPredicateLibrary())
    const match = (ev: HdCollectionExpressionEvaluator, p: string) =>
      ev.match(SdfPath.fromString(p)).GetValue()

    // hdType:mesh works with the composed library.
    {
      const ev = new HdCollectionExpressionEvaluator(si, new SdfPathExpression('//{hdType:mesh}'), composedLib)
      expect(match(ev, '/World/Car/Body')).toBe(true)
      expect(match(ev, '/World/Car/Wheel')).toBe(true)
      expect(match(ev, '/World')).toBe(false) // Scope
      expect(match(ev, '/World/Car')).toBe(false) // Xform
    }

    // Mix Hd and USD predicates in a single expression:
    // component kind AND hdType:mesh (component Mesh prims only).
    {
      const ev = new HdCollectionExpressionEvaluator(si,
        new SdfPathExpression('//{kind:component and hdType:mesh}'), composedLib)
      expect(match(ev, '/World/Car/Body')).toBe(true)
      expect(match(ev, '/World/Car/Wheel')).toBe(true)
      expect(match(ev, '/World/Asset')).toBe(false) // empty hdType
      expect(match(ev, '/World')).toBe(false)
    }
    expect(mark.isClean()).toBe(true)
  })

  /** testUsdImagingCollectionPredicateLibrary.cpp:567-584 */
  it('TestMismatchedLibrary', () => {
    // hdType is not in UsdGetCollectionPredicateLibrary(), so attempting to
    // build a USD-side evaluator for an expression containing hdType should
    // fail: SdfMakePathExpressionEval should emit an error and return an
    // empty evaluator.
    const mark = new TfErrorMark()
    const usdEval = SdfMakePathExpressionEval(
      new SdfPathExpression('//{hdType:mesh}'), UsdGetCollectionPredicateLibrary())
    expect(usdEval.IsEmpty()).toBe(true)
    expect(mark.isClean()).toBe(false)
    mark.clear()
  })
})
