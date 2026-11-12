// Ported from OpenUSD 26.11.1: pxr/imaging/hd/collectionPredicateLibrary.cpp,
//  pxr/imaging/hd/collectionPredicateLibrary.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/collectionPredicateLibrary.{h,cpp} and the schema
// builders/readers the predicates rely on (visibilitySchema, purposeSchema,
// primvarsSchema/primvarSchema, materialBindingsSchema/materialBindingSchema).
//
// HdGetCollectionPredicateLibrary() returns the foundational set of predicates
// keyed by name, each a fn(prim, args) -> SdfPredicateFunctionResult evaluated
// against an HdSceneIndexPrim. These drive SdfPathExpression `{...}` predicates
// in HdCollectionExpressionEvaluator.

import {
  HdContainerDataSource,
  HdRetainedContainerDataSource,
  HdRetainedTypedSampledDataSource,
  type HdDataSourceBase,
} from './dataSource.ts'
import { HdDataSourceLocator } from './dataSourceLocator.ts'
// Reuse the canonical primvar schema tokens from meshSchema rather than
// redefining them here (they'd otherwise collide on the package barrel).
import { HdPrimvarsSchemaTokens } from './primvarsSchema.ts'
import { HdPrimvarSchemaTokens } from './primvarSchema.ts'
import type { HdSceneIndexPrim } from './sceneIndex.ts'
import {
  SdfPredicateFunctionResult,
  type SdfPathExprFnArg,
} from 'typescript-usd/sdf/pathExpression'
import { PredicateLibrary as SdfPredicateLibrary, type PredicateFunction as SdfPredicateFunction } from 'typescript-usd/sdf'

// ---------------------------------------------------------------------------
// Schema tokens (mirror the *SchemaTokens macros in the corresponding headers).

export const HdVisibilitySchemaTokens = { visibility: 'visibility' } as const
export const HdPurposeSchemaTokens = { purpose: 'purpose' } as const
export const HdMaterialBindingsSchemaTokens = {
  materialBindings: 'materialBindings',
  // allPurpose is the EMPTY token "" (see materialBindingsSchema.h).
  allPurpose: '',
} as const
export const HdMaterialBindingSchemaTokens = { path: 'path' } as const

// ---------------------------------------------------------------------------
// Schema builders (mirror HdVisibilitySchema::Builder etc.) used to assemble a
// prim container, matching the test's _MakePrimContainer.

export function HdMakeVisibilityDataSource(visible: boolean): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdVisibilitySchemaTokens.visibility],
    [HdRetainedTypedSampledDataSource.new<boolean>(visible)],
  )
}

export function HdMakePurposeDataSource(purpose: string): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [HdPurposeSchemaTokens.purpose],
    [HdRetainedTypedSampledDataSource.new<string>(purpose)],
  )
}

export function HdMakePrimvarsDataSource(primvarNames: string[]): HdContainerDataSource {
  // Each primvar is a container holding a primvarValue (here an int, matching
  // the test). The presence of the named child is what hdHasPrimvar tests.
  const values = primvarNames.map(() =>
    HdRetainedContainerDataSource.new(
      [HdPrimvarSchemaTokens.primvarValue],
      [HdRetainedTypedSampledDataSource.new<number>(1)],
    ),
  )
  return HdRetainedContainerDataSource.new(primvarNames, values)
}

export type HdTokenPathPair = readonly [purpose: string, path: string]

export function HdMakeMaterialBindingsDataSource(
  bindings: readonly HdTokenPathPair[],
): HdContainerDataSource {
  const purposes = bindings.map((b) => b[0])
  const values = bindings.map((b) =>
    HdRetainedContainerDataSource.new(
      [HdMaterialBindingSchemaTokens.path],
      [HdRetainedTypedSampledDataSource.new<string>(b[1])],
    ),
  )
  return HdRetainedContainerDataSource.new(purposes, values)
}

export function HdMakePrimContainer(
  visibility: boolean,
  purpose: string,
  primvarNames: string[] = [],
  matBindings: readonly HdTokenPathPair[] = [],
): HdContainerDataSource {
  return HdRetainedContainerDataSource.new(
    [
      HdVisibilitySchemaTokens.visibility,
      HdPurposeSchemaTokens.purpose,
      HdPrimvarsSchemaTokens.primvars,
      HdMaterialBindingsSchemaTokens.materialBindings,
    ],
    [
      HdMakeVisibilityDataSource(visibility),
      HdMakePurposeDataSource(purpose),
      HdMakePrimvarsDataSource(primvarNames),
      HdMakeMaterialBindingsDataSource(matBindings),
    ],
  )
}

// ---------------------------------------------------------------------------
// Schema readers used by the predicates.

function getValue<T>(ds: HdDataSourceBase | undefined): T | undefined {
  // The retained typed sources expose GetTypedValue; treat anything else as
  // unauthored.
  if (ds === undefined) return undefined
  const typed = ds as { getTypedValue?: (t: number) => T }
  if (typeof typed.getTypedValue === 'function') return typed.getTypedValue(0)
  return undefined
}

function readVisibility(prim: HdSceneIndexPrim): boolean | undefined {
  const ds = HdContainerDataSource.Get(
    prim.dataSource,
    new HdDataSourceLocator(
      HdVisibilitySchemaTokens.visibility,
      HdVisibilitySchemaTokens.visibility,
    ),
  )
  return getValue<boolean>(ds)
}

function readPurpose(prim: HdSceneIndexPrim): string | undefined {
  const ds = HdContainerDataSource.Get(
    prim.dataSource,
    new HdDataSourceLocator(
      HdPurposeSchemaTokens.purpose,
      HdPurposeSchemaTokens.purpose,
    ),
  )
  return getValue<string>(ds)
}

function hasPrimvar(prim: HdSceneIndexPrim, name: string): boolean {
  const ds = HdContainerDataSource.Get(
    prim.dataSource,
    new HdDataSourceLocator(HdPrimvarsSchemaTokens.primvars, name),
  )
  return ds !== undefined
}

function readAllPurposeMaterialBindingPath(prim: HdSceneIndexPrim): string | undefined {
  const ds = HdContainerDataSource.Get(
    prim.dataSource,
    new HdDataSourceLocator(
      HdMaterialBindingsSchemaTokens.materialBindings,
      HdMaterialBindingsSchemaTokens.allPurpose,
      HdMaterialBindingSchemaTokens.path,
    ),
  )
  return getValue<string>(ds)
}

// ---------------------------------------------------------------------------
// Predicate library (collectionPredicateLibrary.h:20-21:
// using HdCollectionPredicateLibrary =
//     SdfPredicateLibrary<const HdSceneIndexPrim &>).

/** A predicate function of the library: PredicateFunction of
 *  SdfPredicateLibrary<const HdSceneIndexPrim &>. */
export type HdCollectionPredicateFn = SdfPredicateFunction<HdSceneIndexPrim>

// A class (rather than the alias) so `new HdCollectionPredicateLibrary()` and
// `HdCollectionPredicateLibrary.Copy(base)` (the copy constructor) work.
export class HdCollectionPredicateLibrary extends SdfPredicateLibrary<HdSceneIndexPrim> {}

type FnArgs = readonly SdfPathExprFnArg[]

/** collectionPredicateLibrary.cpp:31-45 */
function _BuildTokenFromPredicateArg(args: FnArgs, idx: number): string {
  if (idx < args.length) {
    const arg = args[idx]!
    if (arg.value.type === 'string') {
      return arg.value.value
    }
  }
  return ''
}

/** collectionPredicateLibrary.cpp:47-65 */
function _BuildLocatorFromPredicateArg(args: FnArgs, idx: number): HdDataSourceLocator {
  if (idx < args.length) {
    const arg = args[idx]!
    if (arg.value.type === 'string') {
      // TfStringSplit: an empty string gives no tokens; a trailing '.'
      // gives a trailing empty token.
      const locator = arg.value.value
      const tokens = locator === '' ? [] : locator.split('.')
      return new HdDataSourceLocator(...tokens)
    }
  }
  return HdDataSourceLocator.EmptyLocator
}

/** collectionPredicateLibrary.cpp:67-260 _MakeCollectionPredicateLibrary */
function makeCollectionPredicateLibrary(): HdCollectionPredicateLibrary {
  const PredResult = SdfPredicateFunctionResult

  const lib = new HdCollectionPredicateLibrary()

  const hdTypeImpl = (p: HdSceneIndexPrim, type: string) => {
    const primType = p.primType
    // Type can vary for descendant prims.
    return PredResult.makeVarying(primType === type)
  }

  // Returns true if the prim type of the given scene index prim is hdType.
  lib
    .define('hdType', hdTypeImpl, ['string'])
    // \deprecated Use hdType instead.
    .define('type', hdTypeImpl, ['string'])

  const hdVisibleImpl = (p: HdSceneIndexPrim, visibility: boolean) => {
    const vis = readVisibility(p)
    // If visibility isn't authored, always return false.
    const result = vis !== undefined && vis === visibility
    return PredResult.makeVarying(result)
  }

  // Returns true if the scene index prim's visibility is `visibility`
  // (default true). Returns false if the prim has no visibility opinion.
  lib
    .define('hdVisible', hdVisibleImpl, ['bool'], [{ name: 'isVisible', val: true }])
    // \deprecated Use hdVisible instead.
    .define('visible', hdVisibleImpl, ['bool'], [{ name: 'isVisible', val: true }])

  const hdPurposeImpl = (args: FnArgs): HdCollectionPredicateFn => {
    // Build a token from the predicate argument once and capture it in the
    // lambda returned below.
    const argIdx = 0 // Expect only one argument for this predicate.
    const purpose = _BuildTokenFromPredicateArg(args, argIdx)
    return (p: HdSceneIndexPrim) => {
      const value = readPurpose(p)
      // If purpose isn't authored, we always return false.
      const result = value !== undefined && value === purpose
      return PredResult.makeVarying(result)
    }
  }

  // Returns true if the scene index prim's purpose is `purpose`.
  lib
    .defineBinder('hdPurpose', hdPurposeImpl)
    // \deprecated Use hdPurpose instead.
    .defineBinder('purpose', hdPurposeImpl)

  const hdHasDataSourceImpl = (args: FnArgs): HdCollectionPredicateFn => {
    // Build the locator from the predicate argument once and capture it in
    // the lambda returned below.
    const argIdx = 0 // Expect only one argument for this predicate.
    const locator = _BuildLocatorFromPredicateArg(args, argIdx)
    return (p: HdSceneIndexPrim) =>
      PredResult.makeVarying(HdContainerDataSource.Get(p.dataSource, locator) !== undefined)
  }

  // Returns true if querying the scene index prim's container with the data
  // source locator string (`.`-separated) results in a valid data source.
  lib
    .defineBinder('hdHasDataSource', hdHasDataSourceImpl)
    // \deprecated Use hdHasDataSource instead.
    .defineBinder('hasDataSource', hdHasDataSourceImpl)

  const hdHasPrimvarImpl = (args: FnArgs): HdCollectionPredicateFn => {
    // Build a token from the predicate argument once and capture it in the
    // lambda returned below.
    const argIdx = 0 // Expect only one argument for this predicate.
    const primvarName = _BuildTokenFromPredicateArg(args, argIdx)
    return (p: HdSceneIndexPrim) => PredResult.makeVarying(hasPrimvar(p, primvarName))
  }

  // Convenience form of the "hasDataSource" predicate to query presence of a
  // primvar.
  lib
    .defineBinder('hdHasPrimvar', hdHasPrimvarImpl)
    // \deprecated Use hdHasPrimvar instead.
    .defineBinder('hasPrimvar', hdHasPrimvarImpl)

  const hdHasMaterialBindingImpl = (p: HdSceneIndexPrim, materialPath: string) => {
    const path = readAllPurposeMaterialBindingPath(p)
    const result = path !== undefined && path.includes(materialPath)
    return PredResult.makeVarying(result)
  }

  // Returns true if the scene index prim's resolved (allPurpose) material
  // binding path contains the substring `materialPath`.
  lib
    .define('hdHasMaterialBinding', hdHasMaterialBindingImpl, ['string'])
    // \deprecated Use hdHasMaterialBinding instead.
    .define('hasMaterialBinding', hdHasMaterialBindingImpl, ['string'])

  return lib
}

let _foundationalLibrary: HdCollectionPredicateLibrary | undefined

/** collectionPredicateLibrary.cpp:264-271 */
export function HdGetCollectionPredicateLibrary(): HdCollectionPredicateLibrary {
  if (_foundationalLibrary === undefined) {
    _foundationalLibrary = makeCollectionPredicateLibrary()
  }
  return _foundationalLibrary
}
