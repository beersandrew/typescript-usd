// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/flattenedXformDataSourceProvider.cpp,
//  pxr/imaging/hd/flattenedXformDataSourceProvider.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/flattenedXformDataSourceProvider.{h,cpp}
// (OpenUSD 26.11.1).

import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import {
  HdGetMergedContributingSampleTimesForInterval,
  HdRetainedTypedSampledDataSource,
  HdTypedSampledDataSource,
  type HdContainerDataSource,
} from './dataSource.ts'
import { HdDataSourceLocatorSet } from './dataSourceLocator.ts'
import type { HdBoolDataSource, HdMatrixDataSource } from './dataSourceTypeDefs.ts'
import { HdFlattenedDataSourceProvider } from './flattenedDataSourceProvider.ts'
import { HdXformSchema } from './xformSchema.ts'

/** _MatrixCombinerDataSource, flattenedXformDataSourceProvider.cpp:14-66:
 *  local * parent (row-vector convention). */
class _MatrixCombinerDataSource extends HdTypedSampledDataSource<GfMatrix4d> {
  private readonly _cachedResultAt0: GfMatrix4d

  constructor(
    private readonly _parent: HdMatrixDataSource,
    private readonly _local: HdMatrixDataSource,
  ) {
    super()
    this._cachedResultAt0 = this._local.getTypedValue(0).getMultiply(this._parent.getTypedValue(0))
  }

  static new(parentMatrix: HdMatrixDataSource, localMatrix: HdMatrixDataSource) {
    return new _MatrixCombinerDataSource(parentMatrix, localMatrix)
  }

  GetContributingSampleTimesForInterval(startTime: number, endTime: number,
    outSampleTimes: number[]): boolean {
    return HdGetMergedContributingSampleTimesForInterval(
      [this._parent, this._local], startTime, endTime, outSampleTimes)
  }

  getTypedValue(shutterOffset: number): GfMatrix4d {
    if (shutterOffset === 0) {
      return this._cachedResultAt0
    }

    // XXX: Note that this preserves legacy behavior of only caching at
    // time 0, but it's probably worth caching on demand. We'd need to
    // evaluate the extra memory used, and also figure out a lightweight
    // storage mechanism (since GetTypedValue can be called concurrently,
    // but a whole concurrent_map<Time,Matrix> might be too heavy).
    return this._local.getTypedValue(shutterOffset).getMultiply(
      this._parent.getTypedValue(shutterOffset))
  }
}

let _identityXform: HdContainerDataSource | undefined
let _boolTrueDs: HdBoolDataSource | undefined

/** flattenedXformDataSourceProvider.h:16-27 */
export class HdFlattenedXformDataSourceProvider extends HdFlattenedDataSourceProvider {
  /** flattenedXformDataSourceProvider.cpp:70-135 */
  getFlattenedDataSource(ctx: HdFlattenedDataSourceProvider.Context):
    HdContainerDataSource | undefined {
    const identityXform = _identityXform ??= new HdXformSchema.Builder()
      .setMatrix(HdRetainedTypedSampledDataSource.new(new GfMatrix4d().setIdentity()))
      .setResetXformStack(HdRetainedTypedSampledDataSource.new(true))
      .build()
    const boolTrueDs = _boolTrueDs ??= HdRetainedTypedSampledDataSource.new(true)

    const inputXform = new HdXformSchema(ctx.getInputDataSource())

    // If the local xform is fully composed, early out.
    const resetXformStack = inputXform.getResetXformStack()
    if (resetXformStack) {
      if (resetXformStack.getTypedValue(0.0)) {
        // Only use the local transform, or identity if no matrix was
        // provided...
        if (inputXform.getMatrix()) {
          return inputXform.getContainer()
        } else {
          return identityXform
        }
      }
    }

    const inputMatrixDataSource = inputXform.getMatrix()

    const parentXform = new HdXformSchema(ctx.getFlattenedDataSourceFromParentPrim())
    const parentMatrixDataSource = parentXform.getMatrix()

    if (!inputMatrixDataSource && !parentMatrixDataSource) {
      // If there's no local or parent matrix, return the identity. In
      // practice, this means we're resolving the root prim and it doesn't
      // have an authored transform.
      return identityXform
    } else if (!inputMatrixDataSource) {
      // If there's a parent matrix, but not a local matrix, just return
      // the parent matrix. Note that parentXform (if it exists) is flattened,
      // so it will have the composed bit set.
      return parentXform.getContainer()
    } else if (!parentMatrixDataSource) {
      // If there's no parent (e.g. because we're at the root), use the local
      // transform.
      return new HdXformSchema.Builder()
        .setMatrix(inputMatrixDataSource)
        .setResetXformStack(boolTrueDs)
        .build()
    } else {
      // Otherwise, concatenate the matrices. The return value is marked as
      // fully composed, so that it doesn't get double-flattened by accident.
      return new HdXformSchema.Builder()
        .setMatrix(_MatrixCombinerDataSource.new(
          parentMatrixDataSource, inputMatrixDataSource))
        .setResetXformStack(boolTrueDs)
        .build()
    }
  }

  /** flattenedXformDataSourceProvider.cpp:137-142 */
  computeDirtyLocatorsForDescendants(_locators: HdDataSourceLocatorSet): HdDataSourceLocatorSet {
    return HdDataSourceLocatorSet.UniversalSet
  }
}
