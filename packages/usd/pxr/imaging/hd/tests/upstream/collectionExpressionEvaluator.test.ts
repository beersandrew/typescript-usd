// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdCollectionExpressionEvaluator.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hd/testenv/testHdCollectionExpressionEvaluator.cpp.
//
// Exercises HdCollectionExpressionEvaluator against a retained scene index:
// path-pattern matching, the foundational hd predicate library, a custom
// predicate library layered over it, and the PopulateMatches utilities with
// each MatchKind.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { SdfPath } from 'typescript-usd/sdf/path'
import {
  SdfPathExpression,
  SdfPredicateFunctionResult,
} from 'typescript-usd/sdf/pathExpression'

import { HdRetainedSceneIndex } from '../../src/retainedSceneIndex.ts'
import {
  HdCollectionExpressionEvaluator,
} from '../../src/collectionExpressionEvaluator.ts'
import {
  HdGetCollectionPredicateLibrary,
  HdCollectionPredicateLibrary,
  HdMakePrimContainer,
  HdMaterialBindingsSchemaTokens,
  type HdTokenPathPair,
} from '../../src/collectionPredicateLibrary.ts'

// ---- Tokens (mirror the TF_DEFINE_PRIVATE_TOKENS in the test) ----

const primType = {
  fruit: 'fruit',
  mesh: 'mesh',
  scope: 'scope',
  veg: 'veg',
  foo: 'foo',
  bar: 'bar',
  baz: 'baz',
  b: 'b',
} as const

const purpose = {
  food: 'food',
  furniture: 'furniture',
} as const

const primvar = {
  fresh: 'fresh',
  sour: 'sour',
  roughness: 'roughness',
  glossy: 'foo:glossy',
} as const

const matPurpose = {
  preview: 'preview',
  render: 'render',
} as const

const allPurpose = HdMaterialBindingsSchemaTokens.allPurpose

// ---- Test scene ----

function createTestScene(): HdRetainedSceneIndex {
  const si = HdRetainedSceneIndex.new()
  si.addPrims([
    { primPath: '/A', primType: primType.scope, dataSource: undefined },
    { primPath: '/A/B', primType: primType.scope, dataSource: undefined },
    {
      primPath: '/A/B/Carrot',
      primType: primType.veg,
      dataSource: HdMakePrimContainer(
        true,
        purpose.food,
        [primvar.fresh],
        [[allPurpose, '/Looks/OrangeMat'] as HdTokenPathPair],
      ),
    },
    {
      primPath: '/A/B/Broccoli',
      primType: primType.veg,
      dataSource: HdMakePrimContainer(
        true,
        purpose.food,
        [],
        [
          [matPurpose.preview, '/Looks/GreenMat'] as HdTokenPathPair,
          [allPurpose, '/Looks/WiltedGreenMat'] as HdTokenPathPair,
        ],
      ),
    },
    {
      primPath: '/A/B/Tomato',
      primType: primType.fruit,
      dataSource: HdMakePrimContainer(
        true,
        purpose.food,
        [primvar.fresh, primvar.glossy],
        [[matPurpose.preview, '/Looks/GlossyRedMat'] as HdTokenPathPair],
      ),
    },
    {
      primPath: '/A/B/Apricot',
      primType: primType.fruit,
      dataSource: HdMakePrimContainer(
        true,
        purpose.food,
        [],
        [
          [matPurpose.preview, '/Looks/DriedOrangeMat'] as HdTokenPathPair,
          [allPurpose, '/Looks/DriedOrangeMat'] as HdTokenPathPair,
        ],
      ),
    },
    { primPath: '/A/C', primType: primType.scope, dataSource: undefined },
    {
      primPath: '/A/C/Table',
      primType: primType.mesh,
      dataSource: HdMakePrimContainer(true, purpose.furniture),
    },
    {
      primPath: '/A/C/Chair1',
      primType: primType.mesh,
      dataSource: HdMakePrimContainer(
        true,
        purpose.furniture,
        [primvar.glossy],
        [[matPurpose.preview, '/Looks/MetallicMat'] as HdTokenPathPair],
      ),
    },
    {
      primPath: '/A/C/Chair2',
      primType: primType.mesh,
      dataSource: HdMakePrimContainer(false, purpose.furniture),
    },
  ])
  return si
}

// Custom predicate library extending the foundational hd one (mirrors the
// test's _MakeCustomPredicateLibrary "eatable" predicate).
function getCustomPredicateLibrary(): HdCollectionPredicateLibrary {
  const lib = HdCollectionPredicateLibrary.copy(HdGetCollectionPredicateLibrary())
  // testHdCollectionExpressionEvaluator.cpp:161-165
  lib.define('eatable', (p, _eatability: boolean) =>
    SdfPredicateFunctionResult.makeVarying(
      p.primType === primType.veg || p.primType === primType.fruit,
    ), ['bool'], [{ name: 'isEatable', val: true }],
  )
  return lib
}

// ---- Helpers ----

function match(ev: HdCollectionExpressionEvaluator, path: string): boolean {
  return ev.match(SdfPath.fromString(path)).GetValue()
}

function pathSet(paths: SdfPath[]): Set<string> {
  return new Set(paths.map((p) => p.pathString))
}

// ---------------------------------------------------------------------------

describe('HdCollectionExpressionEvaluator', () => {
  it('TestEmptyEvaluator', () => {
    {
      const ev = new HdCollectionExpressionEvaluator()
      expect(ev.IsEmpty()).toBe(true)
      expect(match(ev, '/A')).toBe(false)
    }
    {
      const ev = new HdCollectionExpressionEvaluator(
        undefined,
        new SdfPathExpression('/Foo'),
      )
      expect(ev.IsEmpty()).toBe(true)
      expect(match(ev, '/A')).toBe(false)
    }
    {
      const si = createTestScene()
      const ev = new HdCollectionExpressionEvaluator(si, new SdfPathExpression())
      expect(ev.IsEmpty()).toBe(true)
      expect(match(ev, '/A')).toBe(false)
    }
  })

  it('TestPathExpressions', () => {
    const si = HdRetainedSceneIndex.new()
    // Ancestors are implicitly added.
    si.addPrims([
      { primPath: '/a/b/c/x/y/z/a/b/c', primType: primType.foo, dataSource: undefined },
      { primPath: '/a/b/c/d/e/f/a/b/a/b/c', primType: primType.scope, dataSource: undefined },
    ])

    {
      const ev = new HdCollectionExpressionEvaluator(si, new SdfPathExpression('//b'))

      expect(match(ev, '/a/b')).toBe(true)
      expect(match(ev, '/a/b/c/x/y/z/a/b')).toBe(true)
      expect(match(ev, '/a/b/c/d/e/f/a/b')).toBe(true)
      expect(match(ev, '/a/b/c/d/e/f/a/b/a/b')).toBe(true)

      // Matching is on the path PATTERN; non-existent paths still match.
      expect(match(ev, '/PrimDoesNotExist/b')).toBe(true)

      expect(match(ev, '/a/b/c')).toBe(false)
      // A descendant of a match, but not matched by the expression.
      expect(match(ev, '/a/b/c/x/y/z/a/b/c')).toBe(false)
    }

    {
      const ev = new HdCollectionExpressionEvaluator(si, new SdfPathExpression('//x//a//'))

      expect(match(ev, '/a/b/c/x/y/z/a')).toBe(true)
      expect(match(ev, '/a/b/c/x/y/z/a/b')).toBe(true)
      expect(match(ev, '/a/b/c/x/y/z/a/b/c')).toBe(true)

      // Matches the pattern though the prim does not exist in the scene index.
      expect(match(ev, '/a/b/PrimDoesNotExist/x/y/z/a')).toBe(true)
    }
  })

  it('TestHdPredicateLibrary', () => {
    const si = createTestScene()

    // prim type queries
    {
      // Match prims with type "scope".
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdType:scope}'),
      )
      expect(match(ev, '/A')).toBe(true)
      expect(match(ev, '/A/B')).toBe(true)
      expect(match(ev, '/A/C')).toBe(true)

      expect(match(ev, '/PrimDoesNotExist/C')).toBe(false)
      expect(match(ev, '/A/B/Carrot')).toBe(false)
    }
    {
      // Match children of any prim "B" whose type is "fruit" (deprecated alias).
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//B/{type:fruit}'),
      )
      expect(match(ev, '/A/B/Tomato')).toBe(true)
      expect(match(ev, '/A/B/Apricot')).toBe(true)

      expect(match(ev, '/A/B/Carrot')).toBe(false)
      expect(match(ev, '/A/C')).toBe(false)
    }

    // locator presence queries
    {
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdHasDataSource:purpose}'),
      )
      expect(match(ev, '/A/B/Carrot')).toBe(true)
      expect(match(ev, '/A/C/Table')).toBe(true)

      expect(match(ev, '/A/B')).toBe(false)
      expect(match(ev, '/PrimDoesNotExist/C')).toBe(false)
      expect(match(ev, '/A')).toBe(false)
    }
    {
      // Match prims with an allPurpose (empty token) binding.
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdHasDataSource:"materialBindings."}'),
      )
      expect(match(ev, '/A/B/Carrot')).toBe(true)
      expect(match(ev, '/A/B/Broccoli')).toBe(true)
      expect(match(ev, '/A/B/Apricot')).toBe(true)

      expect(match(ev, '/A/B/Tomato')).toBe(false)
      expect(match(ev, '/A/B')).toBe(false)
      expect(match(ev, '/A/C/Chair1')).toBe(false)
      expect(match(ev, '/PrimDoesNotExist/C')).toBe(false)
    }

    // primvar presence queries
    {
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdHasPrimvar:fresh}'),
      )
      expect(match(ev, '/A/B/Carrot')).toBe(true)
      expect(match(ev, '/A/B/Tomato')).toBe(true)

      expect(match(ev, '/A/B/Broccoli')).toBe(false)
      expect(match(ev, '/PrimDoesNotExist/C')).toBe(false)
      expect(match(ev, '/A')).toBe(false)
    }
    {
      // Namespaced primvar via deprecated "hasPrimvar" alias.
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression("//{hasPrimvar:'foo:glossy'}"),
      )
      expect(match(ev, '/A/B/Tomato')).toBe(true)
      expect(match(ev, '/A/C/Chair1')).toBe(true)

      expect(match(ev, '/A/B/Broccoli')).toBe(false)
      expect(match(ev, '/PrimDoesNotExist/C')).toBe(false)
      expect(match(ev, '/A')).toBe(false)
    }

    // purpose queries
    {
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdPurpose:food}'),
      )
      expect(match(ev, '/A/B/Carrot')).toBe(true)
      expect(match(ev, '/A/B/Broccoli')).toBe(true)

      expect(match(ev, '/A')).toBe(false)
      expect(match(ev, '/PrimDoesNotExist/C')).toBe(false)
      expect(match(ev, '/A/C/Table')).toBe(false)
    }
    {
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdPurpose:furniture}'),
      )
      expect(match(ev, '/A/C/Table')).toBe(true)
      expect(match(ev, '/A/C/Chair2')).toBe(true)

      expect(match(ev, '/A/B/Tomato')).toBe(false)
      expect(match(ev, '/A/B/Apricot')).toBe(false)
    }

    // visibility queries
    {
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdVisible:true}'),
      )
      expect(match(ev, '/A/B/Carrot')).toBe(true)
      expect(match(ev, '/A/C/Table')).toBe(true)
      expect(match(ev, '/A/B/Broccoli')).toBe(true)

      expect(match(ev, '/A')).toBe(false)
      expect(match(ev, '/PrimDoesNotExist/C')).toBe(false)
      expect(match(ev, '/A/C/Chair2')).toBe(false)
    }
    {
      // Alias: no-arg "hdVisible" defaults to true.
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdVisible}'),
      )
      expect(match(ev, '/A/B/Carrot')).toBe(true)
      expect(match(ev, '/A/C/Table')).toBe(true)
      expect(match(ev, '/A/B/Broccoli')).toBe(true)

      expect(match(ev, '/A')).toBe(false)
      expect(match(ev, '/PrimDoesNotExist/C')).toBe(false)
      expect(match(ev, '/A/C/Chair2')).toBe(false)
    }

    // material binding queries
    {
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdHasMaterialBinding:"Orange"}'),
      )
      expect(match(ev, '/A/B/Carrot')).toBe(true)
      expect(match(ev, '/A/B/Apricot')).toBe(true)

      expect(match(ev, '/A/B/Tomato')).toBe(false)
      expect(match(ev, '/A/B')).toBe(false)
      expect(match(ev, '/A/C/Chair1')).toBe(false)
      expect(match(ev, '/PrimDoesNotExist/C')).toBe(false)
    }
  })

  it('TestCustomPredicateLibrary', () => {
    const si = createTestScene()

    {
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{eatable:true}'),
        getCustomPredicateLibrary(),
      )
      expect(match(ev, '/A/B/Tomato')).toBe(true)
      expect(match(ev, '/A/B/Apricot')).toBe(true)
      expect(match(ev, '/A/B/Carrot')).toBe(true)
      expect(match(ev, '/A/C')).toBe(false)
      expect(match(ev, '/A/C/Chair')).toBe(false)
    }
    {
      // Predicate alias (no arg).
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{eatable}'),
        getCustomPredicateLibrary(),
      )
      expect(match(ev, '/A/B/Tomato')).toBe(true)
      expect(match(ev, '/A/B/Apricot')).toBe(true)
      expect(match(ev, '/A/B/Carrot')).toBe(true)
      expect(match(ev, '/A/C')).toBe(false)
      expect(match(ev, '/A/C/Chair')).toBe(false)
    }
    {
      // Foundational predicates still work through the extended library.
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdPurpose:furniture}'),
        getCustomPredicateLibrary(),
      )
      expect(match(ev, '/A/C/Table')).toBe(true)
      expect(match(ev, '/A/C/Chair2')).toBe(true)

      expect(match(ev, '/A/B/Tomato')).toBe(false)
      expect(match(ev, '/A/B/Apricot')).toBe(false)
    }
  })

  it('TestEvaluatorUtilities', () => {
    const si = createTestScene()

    // Match all prims with purpose "food" and a primvar "fresh".
    {
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdPurpose:food and hdHasPrimvar:fresh}'),
      )
      const resultVec: SdfPath[] = []
      ev.populateAllMatches(SdfPath.absoluteRootPath, resultVec)

      expect(pathSet(resultVec)).toEqual(
        new Set(['/A/B/Carrot', '/A/B/Tomato']),
      )
    }

    // Match all prims with an authored visibility opinion that are invisible.
    {
      const ev = new HdCollectionExpressionEvaluator(
        si,
        new SdfPathExpression('//{hdHasDataSource:visibility and hdVisible:false}'),
      )
      const resultVec: SdfPath[] = []
      ev.populateAllMatches(SdfPath.absoluteRootPath, resultVec)

      expect(pathSet(resultVec)).toEqual(new Set(['/A/C/Chair2']))
    }

    // PopulateMatches with the supported MatchKind options.
    {
      const si2 = HdRetainedSceneIndex.new()
      // Ancestors are implicitly added; prim type isn't relevant here.
      si2.addPrims([
        { primPath: '/a/foobar/b', primType: primType.b, dataSource: undefined },
        { primPath: '/a/foobar/bar', primType: primType.bar, dataSource: undefined },
        { primPath: '/a/foobar/baz', primType: primType.baz, dataSource: undefined },
      ])
      // Scene index contains:
      // {"/a", "/a/foobar", "/a/foobar/b", "/a/foobar/bar", "/a/foobar/baz"}

      const ev = new HdCollectionExpressionEvaluator(si2, new SdfPathExpression('//*bar'))

      {
        const resultVec: SdfPath[] = []
        ev.populateMatches(
          SdfPath.absoluteRootPath,
          HdCollectionExpressionEvaluator.MatchAll,
          resultVec,
        )
        expect(pathSet(resultVec)).toEqual(
          new Set(['/a/foobar', '/a/foobar/bar']),
        )
      }
      {
        const resultVec: SdfPath[] = []
        ev.populateMatches(
          SdfPath.absoluteRootPath,
          HdCollectionExpressionEvaluator.ShallowestMatches,
          resultVec,
        )
        expect(pathSet(resultVec)).toEqual(new Set(['/a/foobar']))
      }
      {
        const resultVec: SdfPath[] = []
        ev.populateMatches(
          SdfPath.absoluteRootPath,
          HdCollectionExpressionEvaluator.ShallowestMatchesAndAllDescendants,
          resultVec,
        )
        expect(pathSet(resultVec)).toEqual(
          new Set([
            '/a/foobar',
            '/a/foobar/b',
            '/a/foobar/bar',
            '/a/foobar/baz',
          ]),
        )
      }
    }
  })
})

describe('HdCollectionExpressionEvaluator PopulateMatches constancy', () => {
  // Native results (fixtures/collectionMatchConstancy; FIXTURES.md), captured
  // over the same scene and expressions.
  const expected = JSON.parse(readFileSync(
    new URL('./fixtures/collectionMatchConstancy/expected.json', import.meta.url), 'utf8',
  )).payload as Record<string, Record<string, string[]>>
  const kinds = {
    MatchAll: HdCollectionExpressionEvaluator.MatchAll,
    ShallowestMatches: HdCollectionExpressionEvaluator.ShallowestMatches,
    ShallowestMatchesAndAllDescendants:
      HdCollectionExpressionEvaluator.ShallowestMatchesAndAllDescendants,
  }
  for (const [expression, byKind] of Object.entries(expected)) {
    it(`populates ${expression} matches like native`, () => {
      const si = HdRetainedSceneIndex.new()
      si.addPrims([
        { primPath: '/a/foobar/bar', primType: primType.bar, dataSource: undefined },
        { primPath: '/a/foobar/bar/child', primType: primType.b, dataSource: undefined },
        { primPath: '/a/Foo/Bar', primType: primType.baz, dataSource: undefined },
      ])
      const ev = new HdCollectionExpressionEvaluator(si, new SdfPathExpression(expression))
      for (const [kind, paths] of Object.entries(byKind)) {
        const resultVec: SdfPath[] = []
        ev.populateMatches(SdfPath.absoluteRootPath, kinds[kind as keyof typeof kinds], resultVec)
        expect([...pathSet(resultVec)].sort(), kind).toEqual(paths)
      }
    })
  }
})
