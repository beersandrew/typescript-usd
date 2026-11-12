// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdSkelImaging/xformResolver.cpp,
//  pxr/usdImaging/usdSkelImaging/xformResolver.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdSkelImaging/xformResolver.{h,cpp}
// (OpenUSD 26.11.1).

import { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import {
  GetMergedContributingSampleTimesForInterval as HdGetMergedContributingSampleTimesForInterval,
  InstancedBySchema as HdInstancedBySchema, InstancerTokens as HdInstancerTokens,
  PrimvarsSchema as HdPrimvarsSchema, SampledDataSource as HdSampledDataSource,
  TypedSampledDataSource as HdTypedSampledDataSource, XformSchema as HdXformSchema,
  type ContainerDataSource as HdContainerDataSource, type DataSourceLocator as HdDataSourceLocator,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { Tokens as UsdSkelTokens } from 'typescript-usd/usdSkel'
import { UsdSkelImagingBindingSchema } from './bindingSchema.ts'
import { _UsdSkelImagingGetArray } from './dataSourceUtils.ts'

type HdMatrixDataSource = HdTypedSampledDataSource<GfMatrix4d>

/** xformResolver.cpp:28-65. First matrix from an HdMatrixArrayDataSource. */
class _FirstMatrixDataSource extends HdTypedSampledDataSource<GfMatrix4d> {
  private constructor(private readonly _inputSrc: HdSampledDataSource) { super() }

  static new(inputSrc: HdSampledDataSource): _FirstMatrixDataSource {
    return new _FirstMatrixDataSource(inputSrc)
  }

  /** xformResolver.cpp:38-48 */
  getTypedValue(shutterOffset: number): GfMatrix4d {
    const matrices = _UsdSkelImagingGetArray<GfMatrix4d>(this._inputSrc, shutterOffset)
    if (matrices.length === 0) {
      return new GfMatrix4d(1.0)
    }
    return matrices[0]!
  }

  /** xformResolver.cpp:50-56 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    return this._inputSrc.GetContributingSampleTimesForInterval(
      startTime, endTime, outSampleTimes)
  }
}

/** xformResolver.cpp:67-115 */
class _MatrixProductDataSource extends HdTypedSampledDataSource<GfMatrix4d> {
  private constructor(private readonly _inputSrcs: HdMatrixDataSource[]) { super() }

  static new(inputSrcs: HdMatrixDataSource[]): _MatrixProductDataSource {
    return new _MatrixProductDataSource(inputSrcs)
  }

  /** xformResolver.cpp:77-91 */
  getTypedValue(shutterOffset: number): GfMatrix4d {
    if (this._inputSrcs.length === 0) {
      return new GfMatrix4d(1.0)
    }
    let result = this._inputSrcs[0]!.getTypedValue(shutterOffset)

    for (let i = 1; i < this._inputSrcs.length; ++i) {
      result = result.getMultiply(this._inputSrcs[i]!.getTypedValue(shutterOffset))
    }

    return result
  }

  /** xformResolver.cpp:93-106 */
  GetContributingSampleTimesForInterval(
    startTime: number, endTime: number, outSampleTimes: number[],
  ): boolean {
    return HdGetMergedContributingSampleTimesForInterval(
      this._inputSrcs, startTime, endTime, outSampleTimes)
  }
}

/** xformResolver.cpp:117-169. Follows the instancedBy schema to find
 *  instancers. If the prototype has no skel root (as in the
 *  UsdSkelImagingBindingSchema), we stop. */
function _ComputeInstancerPaths(
  sceneIndex: HdSceneIndexBase,
  primSource: HdContainerDataSource | undefined,
): string[] {
  const result: string[] = []

  while (true) {
    const instancedBySchema = HdInstancedBySchema.getFromParent(primSource)
    if (!instancedBySchema.isDefined()) {
      break
    }
    const prototypeRoots = _UsdSkelImagingGetArray<string>(
      instancedBySchema.getPrototypeRoots())
    if (prototypeRoots.length === 0) {
      break
    }
    const prototypeRoot = prototypeRoots[0]!
    const hasSkelRootDs = UsdSkelImagingBindingSchema.getFromParent(
      sceneIndex.getPrim(prototypeRoot).dataSource).getHasSkelRoot()
    if (!(hasSkelRootDs && hasSkelRootDs.getTypedValue(0.0))) {
      break
    }
    const paths = _UsdSkelImagingGetArray<string>(instancedBySchema.getPaths())
    if (paths.length === 0) {
      break
    }
    const instancerPath = paths[0]!
    primSource = sceneIndex.getPrim(instancerPath).dataSource
    result.push(instancerPath)
  }

  return result
}

let _instanceXformLocator: HdDataSourceLocator | undefined
let _instanceAnimationSourceLocator: HdDataSourceLocator | undefined

/** xformResolver.h:41-80. Given a prim, computes transform from prim local
 *  space to a space common to all descendants of a skel root.
 *
 *  Without instancing, the common space is simply world. But if the skel
 *  root is inside a ni or pi prototype, the common space is that of the
 *  prototype.
 *
 *  This class takes the instanceTransforms of instancers created for
 *  instanceable prims inside the skel root into account. It does not
 *  consider instancers instancing the skel root and assumes that an
 *  instancer has only instance. */
export class UsdSkelImagingDataSourceXformResolver {
  private readonly _instancerPaths: string[]

  /** xformResolver.cpp:203-210 */
  constructor(
    private readonly _sceneIndex: HdSceneIndexBase,
    private readonly _primSource: HdContainerDataSource | undefined,
  ) {
    this._instancerPaths = _ComputeInstancerPaths(_sceneIndex, _primSource)
  }

  /** xformResolver.cpp:212-254. Data source for the transform. */
  getPrimLocalToCommonSpace(): HdMatrixDataSource | undefined {
    // Transform on prim itself.
    const primXformSrc = HdXformSchema.getFromParent(this._primSource).getMatrix() as
      HdMatrixDataSource | undefined

    if (this._instancerPaths.length === 0) {
      return primXformSrc
    }

    const xformSrcs: HdMatrixDataSource[] = []
    if (primXformSrc) {
      xformSrcs.push(primXformSrc)
    }

    for (const instancerPath of this._instancerPaths) {
      const primDs = this._sceneIndex.getPrim(instancerPath).dataSource
      const instanceXformSrc = HdPrimvarsSchema.getFromParent(primDs)
        .getPrimvar(HdInstancerTokens.instanceTransforms)
        .getPrimvarValue()
      if (instanceXformSrc instanceof HdSampledDataSource) {
        // Add instance transform.
        xformSrcs.push(_FirstMatrixDataSource.new(instanceXformSrc))
      }
      const xformSrc = HdXformSchema.getFromParent(primDs).getMatrix() as
        HdMatrixDataSource | undefined
      if (xformSrc) {
        // Add instancer's transform.
        xformSrcs.push(xformSrc)
      }
    }

    switch (xformSrcs.length) {
      case 0: return undefined
      case 1: return xformSrcs[0]
      default: return _MatrixProductDataSource.new(xformSrcs)
    }
  }

  /** xformResolver.cpp:256-273. Get skel:animationSource instance primvar
   *  value from the immediate instancer. */
  getInstanceAnimationSource(): string[] {
    // For nested instances we traverse the chain up and return the first
    // aggregated animation source instance primvar.
    for (const instancerPath of this._instancerPaths) {
      const primvars = HdPrimvarsSchema.getFromParent(
        this._sceneIndex.getPrim(instancerPath).dataSource)
      const instanceAnimSource = _UsdSkelImagingGetArray<string>(
        primvars.getPrimvar(UsdSkelTokens.skelAnimationSource).getPrimvarValue())
      if (instanceAnimSource.length > 0) {
        return instanceAnimSource
      }
    }
    return []
  }

  /** xformResolver.h:56-60. Paths of instancer contributing to the
   *  transform. They need to be observed for invalidation. */
  getInstancerPaths(): readonly string[] {
    return this._instancerPaths
  }

  /** xformResolver.cpp:173-177. If a dirty message for this prim or any
   *  instancer includes this locator, we need to reconstruct
   *  UsdSkelImagingDataSourceXformResolver. */
  static getInstancedByLocator(): HdDataSourceLocator {
    return HdInstancedBySchema.getDefaultLocator()
  }

  /** xformResolver.cpp:179-183. If a dirty message for this prim or any
   *  instancer includes this locator, we need to refetch the transform data
   *  source. */
  static getXformLocator(): HdDataSourceLocator {
    return HdXformSchema.getDefaultLocator()
  }

  /** xformResolver.cpp:185-192. If a dirty message for any instancer
   *  includes this locator, we need to refetch the transform data source. */
  static getInstanceXformLocator(): HdDataSourceLocator {
    return _instanceXformLocator ??= HdPrimvarsSchema.getDefaultLocator()
      .append(HdInstancerTokens.instanceTransforms)
  }

  /** xformResolver.cpp:194-201 */
  static getInstanceAnimationSourceLocator(): HdDataSourceLocator {
    return _instanceAnimationSourceLocator ??= HdPrimvarsSchema.getDefaultLocator()
      .append(UsdSkelTokens.skelAnimationSource)
  }
}
