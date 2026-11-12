// Ported from OpenUSD 26.11.1: pxr/usd/usd/collectionPredicateLibrary.cpp,
//  pxr/usd/usd/collectionPredicateLibrary.h,
//  pxr/usd/usd/collectionMembershipQuery.cpp,
//  pxr/usd/usd/collectionMembershipQuery.h
// Copyright 2019, 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usd/collectionPredicateLibrary.{h,cpp} (OpenUSD
// 26.11.1): UsdObjectPredicateLibrary and UsdGetCollectionPredicateLibrary;
// and from pxr/usd/usd/collectionMembershipQuery.{h,cpp}:
// UsdObjectCollectionExpressionEvaluator and the expression branch of
// _ComputeIncludedImpl (UsdComputeIncludedPathsFromCollection for a query
// that holds a membership expression).
//
// The UsdObject domain is Prim | Attribute | UsdRel (stage.getObjectAtPath);
// a path with no object gives undefined, which every predicate treats as a
// non-prim (constant false).

import { ArchRegex } from 'typescript-usd/arch'
import { Registry as KindRegistry, Tokens as KindTokens } from 'typescript-usd/kind'
import {
  MakePathExpressionEval as SdfMakePathExpressionEval,
  PredicateLibrary as SdfPredicateLibrary,
  PathExpressionEval as SdfPathExpressionEval,
  type PathExprFnArg as SdfPathExprFnArg,
  type PredicateFunction as SdfPredicateFunction,
} from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { type SdfPathExpression, SdfPredicateFunctionResult } from 'typescript-usd/sdf/pathExpression'
import { isValidIdentifier as TfIsValidIdentifier, type Type as TfType } from 'typescript-usd/tf'
import { Attribute, Prim } from './prim.ts'
import { UsdPrimRange } from './primRange.ts'
import { type UsdPrimFlagsPredicate, PrimDefaultPredicate, TraverseInstanceProxies } from './primFlags.ts'
import { UsdRel } from './relationship.ts'
import { UsdSchemaRegistry } from './schemaRegistry.ts'
import type { Stage } from './stage.ts'

/** A UsdObject: a prim or a property, or undefined (an invalid object). */
export type UsdObject = Prim | Attribute | UsdRel | undefined

/** collectionPredicateLibrary.h:20: SdfPredicateLibrary<UsdObject const &> */
export class UsdObjectPredicateLibrary extends SdfPredicateLibrary<UsdObject> {}

type FnArgs = readonly SdfPathExprFnArg[]

/** UsdObject::GetPrim */
function _GetPrim(obj: UsdObject): Prim | undefined {
  if (obj instanceof Prim) return obj
  if (obj instanceof UsdRel) return obj.getPrim()
  if (obj instanceof Attribute) return obj.getStage().getPrim(obj.primPath)
  return undefined
}

/** UsdObject::As<UsdPrim> (a valid prim, else undefined) */
function _AsPrim(obj: UsdObject): Prim | undefined {
  return obj instanceof Prim && obj.isValid() ? obj : undefined
}

/** collectionPredicateLibrary.cpp:22-48 */
function _IsStrict(args: FnArgs, defaultStrict = false): boolean {
  for (const arg of args) {
    if (arg.argName === 'strict') {
      if (arg.value.type === 'bool') {
        return arg.value.value
      }
      // IsHolding<int>: the predicate parser stores integers as int64_t
      // (predicateExpressionParser.h:384-388), which is not an int.
      if (arg.value.type === 'string') {
        const str = arg.value.value
        if (str !== '') {
          const firstChar = str[0]
          return firstChar === '1' || firstChar === 'y' || firstChar === 'Y'
        }
      }
      return false
    }
  }
  // No argument, return default.
  return defaultStrict
}

function _TfTypeFromSchemaTypeName(name: string): TfType | undefined {
  const type = UsdSchemaRegistry.getTypeFromSchemaTypeName(name)
  return type.isUnknown() ? undefined : type
}

/** collectionPredicateLibrary.cpp:50-317 */
function _MakeCollectionPredicateLibrary(): UsdObjectPredicateLibrary {
  const PredResult = SdfPredicateFunctionResult
  type PredicateFunction = SdfPredicateFunction<UsdObject>

  const lib = new UsdObjectPredicateLibrary()

  lib
    .define('abstract', (obj: UsdObject, abstract: boolean) => {
      const prim = _GetPrim(obj)
      const primIsAbstract = prim?.isAbstract ?? false
      if (primIsAbstract || !_AsPrim(obj)) {
        return PredResult.makeConstant(primIsAbstract === abstract)
      }
      return PredResult.makeVarying(primIsAbstract === abstract)
    }, ['bool'], [{ name: 'isAbstract', val: true }])

    .define('defined', (obj: UsdObject, defined: boolean) => {
      const prim = _GetPrim(obj)
      const primIsDefined = prim?.isDefined ?? false
      if (!primIsDefined || !_AsPrim(obj)) {
        return PredResult.makeConstant(primIsDefined === defined)
      }
      return PredResult.makeVarying(primIsDefined === defined)
    }, ['bool'], [{ name: 'isDefined', val: true }])

    .define('model', (obj: UsdObject, model: boolean) => {
      const prim = _AsPrim(obj)
      if (prim) {
        const primIsModel = prim.isModel()
        if (!primIsModel) {
          return PredResult.makeConstant(primIsModel === model)
        }
        return PredResult.makeVarying(primIsModel === model)
      }
      // Non-prims are never models.
      return PredResult.makeConstant(false)
    }, ['bool'], [{ name: 'isModel', val: true }])

    .define('group', (obj: UsdObject, group: boolean) => {
      const prim = _AsPrim(obj)
      if (prim) {
        const primIsGroup = prim.isGroup()
        if (!primIsGroup) {
          return PredResult.makeConstant(primIsGroup === group)
        }
        return PredResult.makeVarying(primIsGroup === group)
      }
      // Non-prims are never groups.
      return PredResult.makeConstant(false)
    }, ['bool'], [{ name: 'isGroup', val: true }])

    .defineBinder('kind', (args: FnArgs): PredicateFunction | null => {
      // Build a function that matches the requested kinds.
      const checkSubKinds = !_IsStrict(args, /*default*/false)

      // Build up all the kind tokens to check from unnamed string args.
      const queryKinds: string[] = []
      for (const arg of args) {
        if (arg.argName === '' && arg.value.type === 'string') {
          const kind = arg.value.value
          if (KindRegistry.hasKind(kind)) {
            queryKinds.push(kind)
          }
        }
      }

      if (queryKinds.length === 0) {
        return null
      }

      return (obj: UsdObject) => {
        const prim = _AsPrim(obj)
        if (prim) {
          const primKind = prim.getMetadata('kind')
          if (typeof primKind !== 'string') {
            return PredResult.makeVarying(false)
          }
          for (const queryKind of queryKinds) {
            if (checkSubKinds
              ? KindRegistry.isA(primKind, queryKind)
              : primKind === queryKind) {
              return PredResult.makeVarying(true)
            }
          }
          return PredResult.makeVarying(false)
        }
        // Non-prims have no kinds.
        return PredResult.makeConstant(false)
      }
    })

    .defineBinder('specifier', (args: FnArgs): PredicateFunction | null => {
      // Build a function that matches the requested specifiers.  Supplied
      // args must be unnamed strings: "over", "class", or "def".
      const specTable = new Set<string>()

      for (const arg of args) {
        if (arg.argName !== '' || arg.value.type !== 'string') {
          // Invalid arg.
          return null
        }
        const argVal = arg.value.value
        if (argVal === 'over' || argVal === 'def' || argVal === 'class') {
          specTable.add(argVal)
        } else {
          // Invalid arg.
          return null
        }
      }

      return (obj: UsdObject) => {
        const prim = _AsPrim(obj)
        if (prim) {
          return PredResult.makeVarying(specTable.has(prim.getSpecifier()))
        }
        // Non-prims do not have specifiers.
        return PredResult.makeConstant(false)
      }
    })

    .defineBinder('isa', (args: FnArgs): PredicateFunction => {
      // 'isa' accepts a 'strict' argument, to disable subtype checking.
      const exactMatch = _IsStrict(args, /*default*/false)

      // Remaining args must be unnamed strings, identifying isa schema
      // types.
      const queryTypes: TfType[] = []
      for (const arg of args) {
        if (arg.argName === '' && arg.value.type === 'string') {
          const schemaType = _TfTypeFromSchemaTypeName(arg.value.value)
          if (schemaType) {
            queryTypes.push(schemaType)
          }
        }
      }

      return (obj: UsdObject) => {
        const prim = _AsPrim(obj)
        if (prim) {
          const primType = prim.getPrimTypeInfo().getSchemaType()
          for (const queryType of queryTypes) {
            if (exactMatch ? primType === queryType : primType.isA(queryType)) {
              return PredResult.makeVarying(true)
            }
          }
          return PredResult.makeVarying(false)
        }
        return PredResult.makeConstant(false)
      }
    })

    .defineBinder('hasAPI', (args: FnArgs): PredicateFunction | null => {
      // 'hasAPI' accepts an optional 'instanceName' argument which must
      // be named and be a string.
      let instanceName = ''
      for (const arg of args) {
        if (arg.argName === 'instanceName') {
          if (arg.value.type === 'string') {
            instanceName = arg.value.value
            break
          }
          return null
        }
      }

      // Remaining args must be unnamed strings, identifying applied API
      // schema types.
      const queryTypes: TfType[] = []
      for (const arg of args) {
        if (arg.argName === '' && arg.value.type === 'string') {
          const schemaType = _TfTypeFromSchemaTypeName(arg.value.value)
          if (schemaType) {
            queryTypes.push(schemaType)
          }
        }
      }

      return (obj: UsdObject) => {
        const prim = _AsPrim(obj)
        if (prim) {
          if (instanceName === '') {
            for (const queryType of queryTypes) {
              if (prim.hasAPI(queryType)) {
                return PredResult.makeVarying(true)
              }
            }
          } else {
            for (const queryType of queryTypes) {
              if (prim.hasAPI(queryType, instanceName)) {
                return PredResult.makeVarying(true)
              }
            }
          }
          return PredResult.makeVarying(false)
        }
        return PredResult.makeConstant(false)
      }
    })

    .defineBinder('variant', (args: FnArgs): PredicateFunction | null => {
      // 'variant' accepts only named arguments of the form,
      // setName=selGlob where setName is a variant set name and selGlob
      // is a glob pattern to match the selection for variant set setName
      // against.
      const exactSels: [string, string][] = []
      const globSels: [string, ArchRegex][] = []

      for (const arg of args) {
        if (arg.argName === '' || arg.value.type !== 'string') {
          // Invalid arg.
          return null
        }
        const selStr = arg.value.value
        // XXX: This should check against truly valid sel names.
        if (TfIsValidIdentifier(selStr)) {
          exactSels.push([arg.argName, selStr])
        } else {
          const regex = new ArchRegex(selStr, ArchRegex.GLOB)
          if (!regex.isValid()) {
            // Invalid argument
            return null
          }
          globSels.push([arg.argName, regex])
        }
      }

      return (obj: UsdObject) => {
        // Check exacts first, then globs.
        const prim = _AsPrim(obj)
        if (prim) {
          const vsets = prim.getVariantSets()
          const selection = (set: string) =>
            vsets.hasVariantSet(set) ? vsets.getVariantSet(set).getVariantSelection() : ''
          for (const [set, sel] of exactSels) {
            if (selection(set) !== sel) {
              return PredResult.makeVarying(false)
            }
          }
          for (const [set, glob] of globSels) {
            if (!glob.match(selection(set))) {
              return PredResult.makeVarying(false)
            }
          }
          return PredResult.makeVarying(true)
        }
        return PredResult.makeConstant(false)
      }
    })

  return lib
}

let _theLibrary: UsdObjectPredicateLibrary | undefined

/** collectionPredicateLibrary.cpp:319-325 */
export function UsdGetCollectionPredicateLibrary(): UsdObjectPredicateLibrary {
  return (_theLibrary ??= _MakeCollectionPredicateLibrary())
}

/** collectionMembershipQuery.h:40-130 / collectionMembershipQuery.cpp:267-306:
 *  evaluates SdfPathExpressions against objects on a UsdStage, with the
 *  UsdGetCollectionPredicateLibrary() predicates. */
export class UsdObjectCollectionExpressionEvaluator {
  private readonly _stage: Stage | undefined
  private readonly _evaluator: SdfPathExpressionEval<UsdObject>

  /** collectionMembershipQuery.cpp:267-274 */
  constructor(stage?: Stage, expr?: SdfPathExpression) {
    this._stage = stage
    this._evaluator = expr
      ? SdfMakePathExpressionEval(expr, UsdGetCollectionPredicateLibrary())
      : new SdfPathExpressionEval<UsdObject>()
  }

  /** collectionMembershipQuery.h: true if this evaluator has an invalid
   *  stage or an empty underlying SdfPathExpressionEval object. */
  IsEmpty(): boolean {
    return !this._stage || this._evaluator.IsEmpty()
  }

  getStage(): Stage | undefined {
    return this._stage
  }

  /** collectionMembershipQuery.cpp:276-286 */
  match(path: SdfPath): SdfPredicateFunctionResult {
    const stage = this._stage
    if (stage) {
      if (stage.getObjectAtPath(path.pathString)) {
        return this._evaluator.match(path, p => stage.getObjectAtPath(p.pathString))
      }
    }
    return SdfPredicateFunctionResult.makeConstant(false)
  }
}

/** The expression branch of _ComputeIncludedImpl
 *  (collectionMembershipQuery.cpp:187-262) for a membership query holding
 *  `evaluator` with top expansion rule `expansionRule`: the paths of the
 *  objects on `stage` the expression includes, traversing with `pred`
 *  (UsdComputeIncludedPathsFromCollection, collectionMembershipQuery.cpp:
 *  320-328). Returned in SdfPath order (SdfPathSet). Matching uses
 *  Match() per object, which gives the IncrementalSearcher::Next results. */
export function UsdComputeIncludedPathsFromCollectionExpression(
  evaluator: UsdObjectCollectionExpressionEvaluator,
  stage: Stage,
  pred: UsdPrimFlagsPredicate = TraverseInstanceProxies(PrimDefaultPredicate),
  expansionRule: 'explicitOnly' | 'expandPrims' | 'expandPrimsAndProperties' = 'expandPrims',
): SdfPath[] {
  const included = new Map<string, SdfPath>()
  const append = (path: string) => {
    if (!included.has(path)) included.set(path, SdfPath.fromString(path))
  }
  const sorted = () => [...included.values()].sort(SdfPath.compare)

  // Check that we're matching objects on the same stage.
  if (evaluator.getStage() !== stage) {
    return sorted()
  }

  const searchProperties = expansionRule === 'expandPrimsAndProperties'

  const iter = UsdPrimRange.stage(stage, pred)[Symbol.iterator]()
  for (let e = iter.next(); !e.done; e = iter.next()) {
    const prim = e.value
    const r = evaluator.match(SdfPath.fromString(prim.path))
    let didProps = false
    if (r.GetValue()) {
      // With a positive result that's constant over descendants,
      // we can copy everything until the next sibling.
      if (r.isConstant()) {
        for (const sub of UsdPrimRange.fromPrim(prim, pred)) {
          append(sub.path)
          if (searchProperties) {
            didProps = true
            for (const name of sub.getPropertyNames()) append(`${sub.path}.${name}`)
          }
        }
      } else {
        // We have a positive result on this object, but we have to
        // keep searching descendants, since results may vary.
        append(prim.path)
      }
    }

    // If we're searching properties and didn't already do
    // properties above, do them here.
    if (searchProperties && !didProps && !(r.GetValue() && !r.isConstant())) {
      for (const name of prim.getPropertyNames()) {
        const propPath = `${prim.path}.${name}`
        if (evaluator.match(SdfPath.fromString(propPath)).GetValue()) {
          append(propPath)
        }
      }
    }

    // If we have a constant result (either positive or negative),
    // we can skip the subtree.
    if (r.isConstant()) {
      iter.pruneChildren()
    }
  }
  return sorted()
}
