// The Stagehand imaging adapter: hands OpenExec's computed robe (points and
// topology) to Hydra, so a viewer draws the recipe live. Written as upstream's
// usdExecImaging adapters are (geomXformablePrimAdapter.cpp), and registered
// through the interim API-schema adapter hook
// (FAITHFULNESS-DEBT(usdexecimaging-plugin-adapters) in adapterRegistry.ts).

import {
  DataSourceLocator as HdDataSourceLocator, MeshSchema as HdMeshSchema,
  MeshTopologySchema as HdMeshTopologySchema, PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens, PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens, RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  TypedSampledDataSource as HdTypedSampledDataSource, MeshSchemaTokens as HdMeshSchemaTokens,
  type ContainerDataSource as HdContainerDataSource, type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import type { Type as TfType } from 'typescript-usd/tf'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { Array as VtArray, Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import {
  UsdExecImagingPrimAdapterInterface, UsdExecImagingValueKey,
  type UsdExecImagingRequestAccessorInterfaceSharedPtr, type UsdExecImagingRequestBuilderInterface,
} from 'typescript-usd/usdExecImaging'
import { _interim_UsdExecImagingRegisterApiSchemaAdapter } from 'typescript-usd/usdExecImaging/_internal'
import { StagehandTokens } from './revolve.ts'

/** A computed list (std::vector in the computation) served to Hydra as the
 *  VtArray it expects for points and topology. */
class _ComputedArrayDataSource<T> extends HdTypedSampledDataSource<VtArray<T>> {
  constructor(
    private readonly _accessor: UsdExecImagingRequestAccessorInterfaceSharedPtr,
    private readonly _key: UsdExecImagingValueKey,
    private readonly _elementType: TfType,
  ) { super() }

  getTypedValue(_shutterOffset: number): VtArray<T> {
    const v = this._accessor!.getComputedValue(this._key)
    return new VtArray<T>(v.IsEmpty() ? [] : v.Get<T[]>(), this._elementType)
  }

  override GetValue(shutterOffset: number): VtValue {
    return VtValue.createArray(this.getTypedValue(shutterOffset) as VtArray<unknown>)
  }

  GetContributingSampleTimesForInterval(_s: number, _e: number, _out: number[]): boolean {
    return false
  }
}

const _keys = (primPath: string) => ({
  points: new UsdExecImagingValueKey(primPath, StagehandTokens.computePoints),
  counts: new UsdExecImagingValueKey(primPath, StagehandTokens.computeFaceVertexCounts),
  indices: new UsdExecImagingValueKey(primPath, StagehandTokens.computeFaceVertexIndices),
})

export class StagehandRevolvePrimAdapter extends UsdExecImagingPrimAdapterInterface {
  buildRequest(prim: UsdPrim, requestBuilder: UsdExecImagingRequestBuilderInterface): void {
    requestBuilder.addValueKey(prim, StagehandTokens.computePoints)
    requestBuilder.addValueKey(prim, StagehandTokens.computeFaceVertexCounts)
    requestBuilder.addValueKey(prim, StagehandTokens.computeFaceVertexIndices)
  }

  getPrimData(
    primPath: string, requestAccessor: UsdExecImagingRequestAccessorInterfaceSharedPtr,
  ): HdContainerDataSource {
    const k = _keys(primPath)
    const points = HdPrimvarSchema.buildRetained(
      new _ComputedArrayDataSource(requestAccessor, k.points, VtValueTypes.GfVec3f),
      undefined, undefined,
      HdPrimvarSchema.buildInterpolationDataSource(HdPrimvarSchemaTokens.vertex),
      HdRetainedTypedSampledDataSource.new(HdPrimvarSchemaTokens.point))
    const topology = HdMeshTopologySchema.buildRetained(
      new _ComputedArrayDataSource(requestAccessor, k.counts, VtValueTypes.int) as never,
      new _ComputedArrayDataSource(requestAccessor, k.indices, VtValueTypes.int) as never)
    return HdRetainedContainerDataSource.new(
      [HdPrimvarsSchema.getSchemaToken(), HdMeshSchema.getSchemaToken()],
      [HdRetainedContainerDataSource.new([HdPrimvarsSchemaTokens.points], [points]),
        HdRetainedContainerDataSource.new([HdMeshSchemaTokens.topology], [topology])])
  }

  invalidatePrimData(
    primPath: string, valueKey: UsdExecImagingValueKey, invalidLocators: HdDataSourceLocatorSet,
  ): void {
    const k = _keys(primPath)
    if (valueKey.Equals(k.points)) {
      invalidLocators.append(HdPrimvarsSchema.getPointsLocator())
    } else if (valueKey.Equals(k.counts) || valueKey.Equals(k.indices)) {
      invalidLocators.append(HdMeshSchema.getTopologyLocator())
    }
  }
}

_interim_UsdExecImagingRegisterApiSchemaAdapter('StagehandRevolveAPI', new StagehandRevolvePrimAdapter())
export { HdDataSourceLocator }
