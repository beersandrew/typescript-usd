// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/flattenedPrimvarsDataSourceProvider.cpp,
//  pxr/imaging/hd/flattenedPrimvarsDataSourceProvider.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/flattenedPrimvarsDataSourceProvider.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: the shared_ptr/atomic caching of the constant primvar map is a
// plain field (no threads); "unique" maps are copied on write as upstream.

import { HdContainerDataSource, type HdDataSourceBase } from './dataSource.ts'
import { HdDataSourceLocatorSet, type HdDataSourceLocator } from './dataSourceLocator.ts'
import { HdFlattenedDataSourceProvider } from './flattenedDataSourceProvider.ts'
import { HdInvalidatableContainerDataSource } from './invalidatableContainerDataSource.ts'
import { HdPrimvarSchema, HdPrimvarSchemaTokens } from './primvarSchema.ts'

/** flattenedPrimvarsDataSourceProvider.cpp:15-28 */
function _IsConstantPrimvar(primvarDataSource: HdContainerDataSource | undefined): boolean {
  const primvarSchema = new HdPrimvarSchema(primvarDataSource)
  const interpolationSource = primvarSchema.getInterpolation()
  if (!interpolationSource) {
    return false
  }

  const interpolation = interpolationSource.getTypedValue(0.0)

  return interpolation === HdPrimvarSchemaTokens.constant
}

/** flattenedPrimvarsDataSourceProvider.cpp:30-35 */
function _DoesLocatorIntersectInterpolation(locator: HdDataSourceLocator): boolean {
  return locator.getElementCount() < 2 ||
    locator.getElement(1) === HdPrimvarSchemaTokens.interpolation
}

type _PrimvarDsMap = Map<string, HdContainerDataSource | undefined>

/**
 * flattenedPrimvarsDataSourceProvider.cpp:37-213.
 *
 * A container data source that inherits constant primvars
 * from a parent data source.
 *
 * It is instantiated from a data source containing the
 * primvars of the prim in question (conforming to
 * HdPrimvarsSchema) and a flattened primvars data source
 * for the parent prim.
 *
 * If we query a primvar and the prim does not have the prim var,
 * the flattened primvars data source for the parent prim is
 * querried for the primvar and it is used when it is constant.
 */
class _PrimvarsDataSource extends HdInvalidatableContainerDataSource {
  // Cached constant primvars, including those from parent
  private _constantPrimvars: _PrimvarDsMap | undefined

  private constructor(
    private readonly _primvarsDataSource: HdContainerDataSource | undefined,
    private readonly _parentDataSource: _PrimvarsDataSource | undefined,
  ) { super() }

  static new(primvarsDataSource: HdContainerDataSource | undefined,
    parentDataSource: _PrimvarsDataSource | undefined): _PrimvarsDataSource {
    return new _PrimvarsDataSource(primvarsDataSource, parentDataSource)
  }

  /** Get the the constant primvars (including inherited ones).
   *  flattenedPrimvarsDataSourceProvider.cpp:93-136 */
  private _getConstantPrimvars(): _PrimvarDsMap {
    let result = this._constantPrimvars

    if (!result) {
      // Cache miss

      // Get constant primvars from flattened primvars data source from
      // parent prim.
      let primvarMapIsUnique = false
      if (this._parentDataSource) {
        result = this._parentDataSource._getConstantPrimvars()
      } else {
        result = new Map()
        primvarMapIsUnique = true
      }

      // Add constant primvars from this prim.
      if (this._primvarsDataSource) {
        for (const name of this._primvarsDataSource.getNames()) {
          const ds = this._primvarsDataSource.Get(name)
          const primvarDs = ds instanceof HdContainerDataSource ? ds : undefined
          if (_IsConstantPrimvar(primvarDs)) {
            // We can no longer share result with the parent.
            if (!primvarMapIsUnique) {
              result = new Map(result)
              primvarMapIsUnique = true
            }
            // Add (or replace inherited) data source for this key.
            result.set(name, primvarDs)
          }
        }
      }

      this._constantPrimvars = result
    }

    return result
  }

  /** Adds names of constant primvars from parent flattened
   *  primvars data source to this prim's primvars.
   *  flattenedPrimvarsDataSourceProvider.cpp:138-164 */
  getNames(): string[] {
    let result: string[] = []
    // First get primvars from this prim.
    if (this._primvarsDataSource) {
      result = [...this._primvarsDataSource.getNames()]
    }

    // Get constant primvars from parent prim's flattened
    // primvar source.
    if (this._parentDataSource) {
      const parentConstantPrimvars = this._parentDataSource._getConstantPrimvars()
      for (const name of parentConstantPrimvars.keys()) {
        // Add primvar name if not already in result.
        // O(N^2) but we expect small N.
        if (!result.includes(name)) {
          result.push(name)
        }
      }
    }

    return result
  }

  /** Queries prim's primvar source for primvar. If not found,
   *  asks parent's flattened primvars data source and uses
   *  it if it has constant interpolation.
   *  flattenedPrimvarsDataSourceProvider.cpp:166-188 */
  Get(name: string): HdDataSourceBase | undefined {
    // Check whether this prim has this primvar.
    if (this._primvarsDataSource) {
      const result = this._primvarsDataSource.Get(name)
      if (result instanceof HdContainerDataSource) {
        return result
      }
    }

    // Otherwise, check inherited constant primvars.
    if (this._parentDataSource) {
      const parentConstantPrimvars = this._parentDataSource._getConstantPrimvars()
      if (parentConstantPrimvars.has(name)) {
        return parentConstantPrimvars.get(name)
      }
    }

    return undefined
  }

  /** Invalidate specific cached primvars.
   *  flattenedPrimvarsDataSourceProvider.cpp:190-211 */
  invalidate(locators: HdDataSourceLocatorSet): boolean {
    let anyDirtied = false

    for (const locator of locators) {
      if (_DoesLocatorIntersectInterpolation(locator)) {
        // This path should not be hit because
        // ComputeDirtyLocatorsForDescendants would return
        // the UniversalSet if the locators intersect
        // with interpolation.
        //
        // The HdFlatteningSceneIndex is then supposed to
        // drop the data source rather than invalidate it.
        this._constantPrimvars = undefined
        anyDirtied = true
        break
      }
    }

    return anyDirtied
  }
}

/** flattenedPrimvarsDataSourceProvider.h:16-28 */
export class HdFlattenedPrimvarsDataSourceProvider extends HdFlattenedDataSourceProvider {
  /** flattenedPrimvarsDataSourceProvider.cpp:215-230 */
  getFlattenedDataSource(ctx: HdFlattenedDataSourceProvider.Context):
    HdContainerDataSource | undefined {
    // Unlike other flattened data source providers, we cannot use
    // the parent's flattened data source in the case where this
    // prim provides no additional input data source.  The reason
    // is that only interpolation=constant primvars inherit, and
    // _PrimvarsDataSource() is what provides this filtering.
    const parent = ctx.getFlattenedDataSourceFromParentPrim()
    return _PrimvarsDataSource.new(
      ctx.getInputDataSource(),
      parent instanceof _PrimvarsDataSource ? parent : undefined)
  }

  /** flattenedPrimvarsDataSourceProvider.cpp:232-247 */
  computeDirtyLocatorsForDescendants(locators: HdDataSourceLocatorSet): HdDataSourceLocatorSet {
    for (const locator of locators) {
      if (_DoesLocatorIntersectInterpolation(locator)) {
        // Since interpolation could have changed, it is also changing
        // whether this primvar is inherited.
        // Thus, the set of primvars is changing. We need to blow all
        // primvars.
        return HdDataSourceLocatorSet.UniversalSet
      }
    }
    return locators
  }
}
