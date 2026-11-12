// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/collectionPredicateLibrary.cpp,
//  pxr/usdImaging/usdImaging/collectionPredicateLibrary.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/collectionPredicateLibrary.{h,cpp}
// (OpenUSD 26.11.1): the USD collection predicates (abstract, defined, model,
// group, kind, specifier, isa, hasAPI, variant) evaluated against the
// __usdPrimInfo data source of Hydra scene index prims.

import { ArchRegex } from 'typescript-usd/arch'
import {
  CollectionPredicateLibrary as HdCollectionPredicateLibrary,
  type CollectionPredicateFn as HdCollectionPredicateFn,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import { Registry as KindRegistry, Tokens as KindTokens } from 'typescript-usd/kind'
import type { PathExprFnArg as SdfPathExprFnArg } from 'typescript-usd/sdf'
import { PredicateFunctionResult as SdfPredicateFunctionResult } from 'typescript-usd/sdf'
import { isValidIdentifier as TfIsValidIdentifier, type Type as TfType } from 'typescript-usd/tf'
import { SchemaRegistry as UsdSchemaRegistry } from 'typescript-usd/usd'
import { UsdImagingUsdPrimInfoSchema, UsdImagingUsdPrimInfoSchemaTokens } from './usdPrimInfoSchema.ts'

type FnArg = SdfPathExprFnArg
type FnArgs = readonly FnArg[]

/** collectionPredicateLibrary.cpp:28-53: true if `args` contain a named
 *  "strict" argument with a truthy value (bool true, non-zero int, or string
 *  beginning with '1', 'y', 'Y'). Returns `defaultStrict` if no "strict"
 *  argument is present. */
function _IsStrict(args: FnArgs, defaultStrict = false): boolean {
  for (const arg of args) {
    if (arg.argName === 'strict') {
      if (arg.value.type === 'bool') {
        return arg.value.value
      }
      // IsHolding<int>: the predicate parser stores integers as int64_t
      // (predicateExpressionParser.h:384-388), which is not an int.
      if (arg.value.type === 'string') {
        const s = arg.value.value
        if (s !== '') {
          const c = s[0]
          return c === '1' || c === 'y' || c === 'Y'
        }
      }
      return false
    }
  }
  return defaultStrict
}

function _TfTypeFromSchemaTypeName(name: string): TfType | undefined {
  const type = UsdSchemaRegistry.getTypeFromSchemaTypeName(name)
  return type.isUnknown() ? undefined : type
}

/** collectionPredicateLibrary.cpp:55-419: add the USD predicate functions to
 *  `lib`. This is the shared implementation used by both public overloads. */
function _AddUsdPredicates(lib: HdCollectionPredicateLibrary): void {
  const PredResult = SdfPredicateFunctionResult
  const primInfo = (p: HdSceneIndexPrim) => UsdImagingUsdPrimInfoSchema.getFromParent(p.dataSource)

  // Note: PredResult::MakeVarying is used throughout because USD prim
  // attributes (specifier, kind, type, API schemas) can vary from prim to
  // prim and cannot be assumed constant over a prim's descendants.

  // abstract(bool isAbstract = true)
  //
  // Since abstract prims are not transported to Hydra (see the traversal
  // predicate used by UsdImagingStageSceneIndex), this predicate will always
  // return false when isAbstract=true, and vice versa.
  lib.define('abstract',
    (_p: HdSceneIndexPrim, isAbstract: boolean) =>
      isAbstract ? PredResult.makeConstant(false) : PredResult.makeVarying(true),
    ['bool'], [{ name: 'isAbstract', val: true }])

  // defined(bool isDefined = true)
  //
  // Returns true when the prim's specifier is "def", corresponding to
  // UsdPrim::IsDefined().
  lib.define('defined',
    (p: HdSceneIndexPrim, isDefined: boolean) => {
      const specDs = primInfo(p).getSpecifier()
      const primIsDefined = specDs !== undefined &&
        specDs.getTypedValue(0.0) === UsdImagingUsdPrimInfoSchemaTokens.def
      return PredResult.makeVarying(primIsDefined === isDefined)
    },
    ['bool'], [{ name: 'isDefined', val: true }])

  // model(bool isModel = true)
  //
  // Returns true when the prim's kind metadata is in the "model" kind
  // hierarchy, corresponding to UsdPrim::IsModel().
  lib.define('model',
    (p: HdSceneIndexPrim, isModel: boolean) => {
      const kindDs = primInfo(p).getKind()
      const primIsModel = kindDs !== undefined &&
        KindRegistry.isA(kindDs.getTypedValue(0.0) as string, KindTokens.model)
      return PredResult.makeVarying(primIsModel === isModel)
    },
    ['bool'], [{ name: 'isModel', val: true }])

  // group(bool isGroup = true)
  //
  // Returns true when the prim's kind metadata is in the "group" kind
  // hierarchy, corresponding to UsdPrim::IsGroup().
  lib.define('group',
    (p: HdSceneIndexPrim, isGroup: boolean) => {
      const kindDs = primInfo(p).getKind()
      const primIsGroup = kindDs !== undefined &&
        KindRegistry.isA(kindDs.getTypedValue(0.0) as string, KindTokens.group)
      return PredResult.makeVarying(primIsGroup === isGroup)
    },
    ['bool'], [{ name: 'isGroup', val: true }])

  // kind(kind1, ... kindN, strict = false)
  //
  // Returns true when the prim's kind is one of kind1...kindN.
  // Sub-kinds are matched via KindRegistry::IsA() unless strict=true.
  lib.defineBinder('kind', (args: FnArgs): HdCollectionPredicateFn | null => {
    const checkSubKinds = !_IsStrict(args, /*default*/false)

    const queryKinds: string[] = []
    for (const arg of args) {
      if (arg.argName === '' && arg.value.type === 'string') {
        const k = arg.value.value
        if (KindRegistry.hasKind(k)) {
          queryKinds.push(k)
        }
      }
    }
    if (queryKinds.length === 0) {
      return null
    }

    return (p: HdSceneIndexPrim) => {
      const kindDs = primInfo(p).getKind()
      if (!kindDs) {
        return PredResult.makeVarying(false)
      }
      const primKind = kindDs.getTypedValue(0.0) as string
      for (const queryKind of queryKinds) {
        if (checkSubKinds
          ? KindRegistry.isA(primKind, queryKind)
          : primKind === queryKind) {
          return PredResult.makeVarying(true)
        }
      }
      return PredResult.makeVarying(false)
    }
  })

  // specifier(spec1, ... specN)
  //
  // Returns true when the prim's specifier is one of spec1...specN.
  // Arguments must be unnamed strings: "over", "class", or "def".
  lib.defineBinder('specifier', (args: FnArgs): HdCollectionPredicateFn | null => {
    const querySpecs: string[] = []
    for (const arg of args) {
      if (arg.argName !== '' || arg.value.type !== 'string') {
        return null
      }
      const v = arg.value.value
      if (v === 'over' || v === 'def' || v === 'class') {
        querySpecs.push(v)
      } else {
        return null
      }
    }
    if (querySpecs.length === 0) {
      return null
    }

    return (p: HdSceneIndexPrim) => {
      const specDs = primInfo(p).getSpecifier()
      if (!specDs) {
        return PredResult.makeVarying(false)
      }
      const spec = specDs.getTypedValue(0.0)
      for (const qs of querySpecs) {
        if (spec === qs) {
          return PredResult.makeVarying(true)
        }
      }
      return PredResult.makeVarying(false)
    }
  })

  // isa(schema1, ... schemaN, strict = false)
  //
  // Returns true when the prim's typeName resolves to a USD typed schema
  // that is one of schema1...schemaN (or a subtype thereof if strict=false).
  lib.defineBinder('isa', (args: FnArgs): HdCollectionPredicateFn => {
    const exactMatch = _IsStrict(args, /*default*/false)

    const queryTypes: TfType[] = []
    for (const arg of args) {
      if (arg.argName === '' && arg.value.type === 'string') {
        const schemaType = _TfTypeFromSchemaTypeName(arg.value.value)
        if (schemaType) {
          queryTypes.push(schemaType)
        }
      }
    }

    return (p: HdSceneIndexPrim) => {
      const typeNameDs = primInfo(p).getTypeName()
      if (!typeNameDs) {
        return PredResult.makeVarying(false)
      }
      const typeName = typeNameDs.getTypedValue(0.0) as string
      if (typeName === '') {
        return PredResult.makeVarying(false)
      }
      const primType = _TfTypeFromSchemaTypeName(typeName)
      if (!primType) {
        return PredResult.makeVarying(false)
      }
      for (const queryType of queryTypes) {
        if (exactMatch ? primType === queryType : primType.isA(queryType)) {
          return PredResult.makeVarying(true)
        }
      }
      return PredResult.makeVarying(false)
    }
  })

  // hasAPI(apiSchema1, ... apiSchemaN, [instanceName = name])
  //
  // Returns true when the prim's applied API schema list contains an entry
  // matching one of apiSchema1...apiSchemaN, matched directly against the
  // tokens in the apiSchemas array (as UsdPrim::GetAppliedSchemas()):
  //   - For single-apply schemas the entry equals the schema type name.
  //   - For multi-apply schemas the entry has the form "SchemaName:instance".
  //     Without instanceName, any instance is accepted; with it, only the
  //     exact instance.
  lib.defineBinder('hasAPI', (args: FnArgs): HdCollectionPredicateFn | null => {
    let instanceName = ''
    for (const arg of args) {
      if (arg.argName === 'instanceName') {
        if (arg.value.type !== 'string') {
          return null
        }
        instanceName = arg.value.value
        break
      }
    }

    // Collect the schema type names from unnamed string arguments.
    // We match them directly against the stored token strings rather
    // than going through UsdSchemaRegistry, so that the predicate
    // works without requiring plugins to be loaded.
    const querySchemaNames: string[] = []
    for (const arg of args) {
      if (arg.argName === '' && arg.value.type === 'string') {
        querySchemaNames.push(arg.value.value)
      }
    }

    return (p: HdSceneIndexPrim) => {
      const apiDs = primInfo(p).getApiSchemas()
      if (!apiDs) {
        return PredResult.makeVarying(false)
      }
      const schemas = [...(apiDs.getTypedValue(0.0) as Iterable<string>)]

      for (const queryName of querySchemaNames) {
        for (const schema of schemas) {
          if (instanceName === '') {
            // Accept exact match (single-apply) or any instance of a
            // multi-apply schema.
            if (schema === queryName) {
              return PredResult.makeVarying(true)
            }
            if (schema.startsWith(queryName + ':')) {
              return PredResult.makeVarying(true)
            }
          } else {
            // Accept only the exact multi-apply instance.
            if (schema === queryName + ':' + instanceName) {
              return PredResult.makeVarying(true)
            }
          }
        }
      }
      return PredResult.makeVarying(false)
    }
  })

  // variant(setName1=selGlob1, ... setNameN=selGlobN)
  //
  // Returns true when ALL of the given variant set selections match.
  // All arguments must be named: setName=selectionPattern. If
  // selectionPattern is a valid identifier it is matched exactly; otherwise
  // it is treated as a GLOB pattern (via ArchRegex).
  lib.defineBinder('variant', (args: FnArgs): HdCollectionPredicateFn | null => {
    const exactSels: [string, string][] = []
    const globSels: [string, ArchRegex][] = []

    for (const arg of args) {
      if (arg.argName === '' || arg.value.type !== 'string') {
        return null
      }
      const selStr = arg.value.value
      if (TfIsValidIdentifier(selStr)) {
        exactSels.push([arg.argName, selStr])
      } else {
        const regex = new ArchRegex(selStr, ArchRegex.GLOB)
        if (!regex.isValid()) {
          return null
        }
        globSels.push([arg.argName, regex])
      }
    }

    return (p: HdSceneIndexPrim) => {
      const varSelsSchema = primInfo(p).getVariantSelections()
      // Check exact matches first, then glob patterns.
      for (const [set, sel] of exactSels) {
        const tokenDs = varSelsSchema.Get(set)
        if (tokenDs) {
          if (tokenDs.getTypedValue(0.0) !== sel) {
            return PredResult.makeVarying(false)
          }
        } else {
          return PredResult.makeVarying(false)
        }
      }
      for (const [set, glob] of globSels) {
        const tokenDs = varSelsSchema.Get(set)
        if (tokenDs) {
          if (!glob.match(tokenDs.getTypedValue(0.0) as string)) {
            return PredResult.makeVarying(false)
          }
        } else {
          return PredResult.makeVarying(false)
        }
      }
      return PredResult.makeVarying(true)
    }
  })
}

let _library: HdCollectionPredicateLibrary | undefined

/** collectionPredicateLibrary.cpp:423-433 UsdImagingGetCollectionPredicateLibrary():
 *  a library of only the USD predicates. With `base`
 *  (collectionPredicateLibrary.cpp:435-443): a copy of `base` with the USD
 *  predicates added. */
export function UsdImagingGetCollectionPredicateLibrary(
  base?: HdCollectionPredicateLibrary,
): HdCollectionPredicateLibrary {
  if (base !== undefined) {
    const lib = HdCollectionPredicateLibrary.copy(base)
    _AddUsdPredicates(lib)
    return lib
  }
  if (_library === undefined) {
    const lib = new HdCollectionPredicateLibrary() // empty library
    _AddUsdPredicates(lib)
    _library = lib
  }
  return _library
}
