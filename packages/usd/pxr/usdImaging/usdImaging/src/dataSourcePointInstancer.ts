// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourcePointInstancer.cpp,
//  pxr/usdImaging/usdImaging/dataSourcePointInstancer.h,
//  pxr/usd/usdGeom/pointInstancer.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourcePointInstancer.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergences:
// - The TS UsdGeomPointInstancer (typescript-usd/usdGeom) has no
//   ComputeMaskAtTime / UsesOrientationsf / GetPrototypesRel matching
//   upstream, so the attributes and metadata are read directly by their
//   UsdGeomTokens names and the two computations are ported here from
//   pxr/usd/usdGeom/pointInstancer.cpp (see _ComputeMaskAtTime and
//   _UsesOrientationsf).
// - UsdObject::HasMetadata(inactiveIds) is UsdPrim.hasAuthoredMetadata:
//   inactiveIds has no fallback, so both answer whether an opinion exists.
// - Typed array values are VtArray. SdfPath is a string; VtArray<SdfPath>
//   is a VtArray of strings carrying the SdfPath TfType, as
//   UsdImagingDataSourceRelationship's.

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  InstancerTokens as HdInstancerTokens,
  InstancerTopologySchema as HdInstancerTopologySchema,
  InstancerTopologySchemaTokens as HdInstancerTopologySchemaTokens,
  MapContainerDataSource as HdMapContainerDataSource,
  OverlayContainerDataSource as HdOverlayContainerDataSource,
  PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  Tokens as HdTokens,
  TypedSampledDataSource as HdTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocatorSet as HdDataSourceLocatorSet,
} from 'typescript-usd/hd'
import {
  AttributeQuery as UsdAttributeQuery, TimeCode as UsdTimeCode,
  type Attribute as UsdAttribute, type Prim as UsdPrim,
} from 'typescript-usd/usd'
import { Type as TfType } from 'typescript-usd/tf'
import { Array as VtArray, ValueTypes as VtValueTypes, Value as VtValue } from 'typescript-usd/vt'
import { UsdImagingDataSourcePrim } from './dataSourcePrim.ts'
import { UsdImagingDataSourceCustomPrimvars } from './dataSourcePrimvars.ts'
import { UsdImagingDataSourceRelationship } from './dataSourceRelationship.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

// UsdGeomTokens used below (pxr/usd/usdGeom/tokens.h).
const _UsdGeomTokens = {
  accelerations: 'accelerations',
  angularVelocities: 'angularVelocities',
  ids: 'ids',
  inactiveIds: 'inactiveIds',
  invisibleIds: 'invisibleIds',
  orientations: 'orientations',
  orientationsf: 'orientationsf',
  positions: 'positions',
  protoIndices: 'protoIndices',
  prototypes: 'prototypes',
  scales: 'scales',
  velocities: 'velocities',
} as const

const _SdfPathType = TfType.declare('SdfPath')

type _Mappings = UsdImagingDataSourceCustomPrimvars.Mappings

// ----------------------------------------------------------------------------
// UsdGeomPointInstancer helpers.

/** VtArray values may come back as VtArray or plain arrays. */
function _ToArray<T>(value: unknown): T[] {
  if (value === undefined || value === null) return []
  if (value instanceof VtValue) return _ToArray<T>(value.IsEmpty() ? undefined : value.Get<unknown>())
  if (Array.isArray(value)) return value as T[]
  const a = value as { toArray?: () => T[] }
  return typeof a.toArray === 'function' ? a.toArray() : []
}

/** UsdAttribute::Get(&value, time); undefined when the attribute is invalid
 *  or has no value. */
function _GetAttrValue(attr: UsdAttribute | undefined, time: UsdTimeCode): unknown {
  if (!attr?.isValid()) return undefined
  return new UsdAttributeQuery(attr).get(time)
}

function _GetAttr(prim: UsdPrim, name: string): UsdAttribute | undefined {
  const attr = prim.getAttr(name)
  return attr?.isValid() ? attr : undefined
}

/** SdfInt64ListOp::GetExplicitItems of the prim's inactiveIds metadata. */
function _GetInactiveIdsExplicitItems(prim: UsdPrim): number[] {
  const raw = prim.getMetadata(_UsdGeomTokens.inactiveIds) as
    { explicitItems?: readonly unknown[] } | readonly unknown[] | undefined | null
  if (!raw) return []
  const items = Array.isArray(raw) ? raw : (raw as { explicitItems?: readonly unknown[] }).explicitItems ?? []
  return items.map(Number)
}

/** UsdObject::HasMetadata(UsdGeomTokens->inactiveIds). */
function _HasInactiveIdsMetadata(prim: UsdPrim): boolean {
  return prim.hasAuthoredMetadata(_UsdGeomTokens.inactiveIds)
}

/** pxr/usd/usdGeom/pointInstancer.cpp:597-647
 *  UsdGeomPointInstancer::ComputeMaskAtTime (ids = nullptr). */
function _ComputeMaskAtTime(prim: UsdPrim, time: UsdTimeCode): boolean[] {
  const mask: boolean[] = []
  // XXX Note we could be doing all three fetches in parallel
  const inactiveIds = _GetInactiveIdsExplicitItems(prim)
  const invisedIds = _ToArray<number | bigint>(
    _GetAttrValue(_GetAttr(prim, _UsdGeomTokens.invisibleIds), time)).map(Number)
  if (inactiveIds.length > 0 || invisedIds.length > 0) {
    let anyPruned = false
    const maskedIds = new Set<number>(inactiveIds)
    for (const id of invisedIds) maskedIds.add(id)
    let ids: number[] | undefined
    const idVals = _GetAttrValue(_GetAttr(prim, _UsdGeomTokens.ids), time)
    if (idVals !== undefined) {
      ids = _ToArray<number | bigint>(idVals).map(Number)
    }
    if (!ids) {
      const protoIndices = _GetAttrValue(_GetAttr(prim, _UsdGeomTokens.protoIndices), time)
      if (protoIndices === undefined) {
        // not a functional PointInstancer... just return
        // trivial pass
        return mask
      }
      const numInstances = _ToArray<number>(protoIndices).length
      ids = []
      for (let i = 0; i < numInstances; ++i) {
        ids.push(i)
      }
    }

    for (const id of ids) {
      const pruned = maskedIds.has(id)
      anyPruned = anyPruned || pruned
      mask.push(!pruned)
    }

    if (!anyPruned) {
      mask.length = 0
    }
  }

  return mask
}

/** pxr/usd/usdGeom/pointInstancer.cpp:386-402
 *  UsdGeomPointInstancer::UsesOrientationsf(TfToken *rotationToken). */
function _UsesOrientationsf(prim: UsdPrim): boolean {
  const orientationsfTimeSamples = _ToArray<unknown>(_GetAttrValue(
    _GetAttr(prim, _UsdGeomTokens.orientationsf), UsdTimeCode.EarliestTime()))
  return orientationsfTimeSamples.length !== 0
}

// ----------------------------------------------------------------------------

/** dataSourcePointInstancer.cpp:32-42 */
function _IsConstantOrUniformPrimvar(schema: HdPrimvarSchema): boolean {
  const ds = schema.getInterpolation()
  if (ds) {
    const interpolation = ds.getTypedValue(0.0)
    return interpolation === HdPrimvarSchemaTokens.constant ||
      interpolation === HdPrimvarSchemaTokens.uniform
  }
  return false
}

const _constantInterpolationDs = HdRetainedTypedSampledDataSource.new<string>(HdPrimvarSchemaTokens.constant)
const _instanceInterpolationDs = HdRetainedTypedSampledDataSource.new<string>(HdPrimvarSchemaTokens.instance)

/** dataSourcePointInstancer.cpp:44-85
 *
 * Usd does not have "instance" as interpolation for primvars but that is
 * what is needed for hydra. The USD spec also treats both constant and uniform
 * as constant.
 *
 * The following data source is for locator primvars:FOO and forces the
 * interpolation to be instanced unless it is uniform or constant. */
class _PrimvarDataSource extends HdContainerDataSource {
  private constructor(private readonly _inputPrimvarDs: HdContainerDataSource) { super() }

  static new(inputPrimvarDs: HdContainerDataSource): _PrimvarDataSource {
    return new _PrimvarDataSource(inputPrimvarDs)
  }

  getNames(): string[] {
    return this._inputPrimvarDs.getNames()
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdPrimvarSchemaTokens.interpolation) {
      if (_IsConstantOrUniformPrimvar(new HdPrimvarSchema(this._inputPrimvarDs))) {
        return _constantInterpolationDs
      } else {
        return _instanceInterpolationDs
      }
    }

    return this._inputPrimvarDs.Get(name)
  }
}

/** dataSourcePointInstancer.cpp:87-96 */
function _GetPrimvarDataSource(ds: HdDataSourceBase): HdDataSourceBase | undefined {
  if (ds instanceof HdContainerDataSource) {
    return _PrimvarDataSource.new(ds)
  } else {
    return undefined
  }
}

/** dataSourcePointInstancer.cpp:98-159
 *
 * Helper used to prune the prototypes list for prototypes where all instances
 * are inactive.  Returns a mask where mask[i] is true if all instances of
 * prototype i have their IDs in the inactiveIds metadata. Returns an empty
 * vector when no prototypes are fully inactive (i.e., no filtering needed). */
function _ComputeFullyInactiveProtoMask(
  usdPI: UsdPrim,
  protoIndices: readonly number[],
  numProtos: number,
  stageGlobals: UsdImagingDataSourceStageGlobals,
): boolean[] {
  if (!_HasInactiveIdsMetadata(usdPI)) {
    return []
  }

  // inactiveIds is metadata on UsdGeomPointInstancer that is used to
  // deactivate specific instances.  Unlike visibility, it cannot vary
  // over time.
  const inactiveIdsList = _GetInactiveIdsExplicitItems(usdPI)
  if (inactiveIdsList.length === 0) {
    return []
  }

  const inactiveIds = new Set<number>(inactiveIdsList)

  // If ids attribute is present it maps array index -> instance ID;
  // otherwise the array index is the instance ID.
  const instanceIds = _ToArray<number | bigint>(
    _GetAttrValue(_GetAttr(usdPI, _UsdGeomTokens.ids), stageGlobals.getTime())).map(Number)

  const totalCount: number[] = new Array<number>(numProtos).fill(0)
  const inactiveCount: number[] = new Array<number>(numProtos).fill(0)
  for (let i = 0; i < protoIndices.length; ++i) {
    const protoIdx = protoIndices[i]!
    if (protoIdx < 0 || protoIdx >= numProtos) {
      continue
    }
    ++totalCount[protoIdx]!
    const id = instanceIds.length === 0 ? i : instanceIds[i]!
    if (inactiveIds.has(id)) {
      ++inactiveCount[protoIdx]!
    }
  }

  const mask: boolean[] = new Array<boolean>(numProtos).fill(false)
  let anyInactive = false
  for (let i = 0; i < numProtos; ++i) {
    if (totalCount[i]! > 0 && totalCount[i] === inactiveCount[i]) {
      mask[i] = true
      anyInactive = true
    }
  }

  return anyInactive ? mask : []
}

// ----------------------------------------------------------------------------

/** dataSourcePointInstancer.h:21-51
 *
 * A data source representing a point instancer's instance mask. It stores,
 * per instance, whether an instance is deactivated.  If it has zero length,
 * all instances are active. */
export class UsdImagingDataSourcePointInstancerMask extends HdTypedSampledDataSource<VtArray<boolean>> {
  /** dataSourcePointInstancer.cpp:165-180 */
  private constructor(
    sceneIndexPath: string,
    private readonly _usdPI: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super()
    const attr = _GetAttr(_usdPI, _UsdGeomTokens.invisibleIds)
    if (attr) {
      if (attr.valueMightBeTimeVarying()) {
        const locator = HdInstancerTopologySchema.getDefaultLocator()
          .append(HdInstancerTopologySchemaTokens.mask)
        this._stageGlobals.flagAsTimeVarying(sceneIndexPath, locator)
      }
    }
  }

  static new(
    sceneIndexPath: string, usdPI: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourcePointInstancerMask {
    return new UsdImagingDataSourcePointInstancerMask(sceneIndexPath, usdPI, stageGlobals)
  }

  /** dataSourcePointInstancer.cpp:182-187 */
  override GetValue(shutterOffset: number): VtValue {
    return VtValue.createArray(this.getTypedValue(shutterOffset))
  }

  /** dataSourcePointInstancer.cpp:189-200 */
  getTypedValue(_shutterOffset: number): VtArray<boolean> {
    // XXX: Add PI visibility here: if the PI is invisible, treat it as
    // everything masked.

    const mask = _ComputeMaskAtTime(this._usdPI, this._stageGlobals.getTime())
    const result = new VtArray<boolean>(mask, VtValueTypes.bool)
    return result
  }

  /** dataSourcePointInstancer.cpp:203-210 */
  GetContributingSampleTimesForInterval(
    _startTime: number, _endTime: number, _outSampleTimes: number[],
  ): boolean {
    return false
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePointInstancer.h:55-83
 *
 * A data source representing a point instancer's instance topology. This
 * is made up of "prototypes", "protoIndices", and "mask", which is enough
 * to define the right number of instances with the right assigned prototype
 * and primvar index. */
export class UsdImagingDataSourcePointInstancerTopology extends HdContainerDataSource {
  /** dataSourcePointInstancer.cpp:214-222. Private constructor, use static
   *  New() instead. */
  private constructor(
    private readonly _sceneIndexPath: string,
    private readonly _usdPI: UsdPrim,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdPI: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourcePointInstancerTopology {
    return new UsdImagingDataSourcePointInstancerTopology(sceneIndexPath, usdPI, stageGlobals)
  }

  /** dataSourcePointInstancer.cpp:224-232 */
  getNames(): string[] {
    return [
      HdInstancerTopologySchemaTokens.prototypes,
      HdInstancerTopologySchemaTokens.instanceIndices,
      HdInstancerTopologySchemaTokens.mask,
    ]
  }

  /** UsdGeomPointInstancer::GetPrototypesRel() */
  private _getPrototypesRel() {
    return this._usdPI.getRelationshipAtPath(`${this._usdPI.path}.${_UsdGeomTokens.prototypes}`)
  }

  /** dataSourcePointInstancer.cpp:304-386 */
  Get(name: string): HdDataSourceBase | undefined {
    if (name === HdInstancerTopologySchemaTokens.prototypes) {
      if (!_HasInactiveIdsMetadata(this._usdPI)) {
        // No inactiveIds in use.
        return UsdImagingDataSourceRelationship.new(
          this._getPrototypesRel()!, this._stageGlobals)
      } else {
        // Filter prototypes based on inactiveIds.
        const protoPaths: string[] = this._getPrototypesRel()?.getTargets() ?? []

        const protoIndices = _ToArray<number>(_GetAttrValue(
          _GetAttr(this._usdPI, _UsdGeomTokens.protoIndices), this._stageGlobals.getTime()))

        const inactiveMask = _ComputeFullyInactiveProtoMask(
          this._usdPI, protoIndices, protoPaths.length, this._stageGlobals)

        if (inactiveMask.length === 0) {
          return UsdImagingDataSourceRelationship.new(
            this._getPrototypesRel()!, this._stageGlobals)
        }

        const filteredPaths: string[] = []
        for (let i = 0; i < protoPaths.length; ++i) {
          if (!inactiveMask[i]) {
            filteredPaths.push(protoPaths[i]!)
          }
        }
        return HdRetainedTypedSampledDataSource.new<VtArray<string>>(
          new VtArray<string>(filteredPaths, _SdfPathType))
      }
    } else if (name === HdInstancerTopologySchemaTokens.instanceIndices) {
      const attr = _GetAttr(this._usdPI, _UsdGeomTokens.protoIndices)
      if (!attr) {
        return undefined
      }

      if (attr.valueMightBeTimeVarying()) {
        const locator = HdInstancerTopologySchema.getDefaultLocator()
          .append(HdInstancerTopologySchemaTokens.instanceIndices)
        this._stageGlobals.flagAsTimeVarying(this._sceneIndexPath, locator)
      }

      const protoIndices = _ToArray<number>(_GetAttrValue(attr, this._stageGlobals.getTime()))

      // We need to flip the protoIndices: [0,1,0] -> 0: [0,2], 1: [1].
      const instanceIndices: number[][] = []
      for (let i = 0; i < protoIndices.length; ++i) {
        const protoIndex = protoIndices[i]!
        // Divergence: size_t(protoIndex) wraps a negative index to a huge
        // value (resize would fail upstream); a negative index is skipped.
        if (protoIndex < 0) {
          continue
        }
        while (protoIndex >= instanceIndices.length) {
          instanceIndices.push([])
        }
        instanceIndices[protoIndex]!.push(i)
      }

      // Remove entries for fully-inactive prototypes to keep this array
      // in sync with the filtered prototypes path array.
      const inactiveMask = _ComputeFullyInactiveProtoMask(
        this._usdPI, protoIndices, instanceIndices.length, this._stageGlobals)

      const indicesVec: HdDataSourceBase[] = []
      for (let i = 0; i < instanceIndices.length; ++i) {
        if (inactiveMask.length === 0 || !inactiveMask[i]) {
          indicesVec.push(
            new HdRetainedTypedSampledDataSource<VtArray<number>>(
              new VtArray<number>(instanceIndices[i]!, VtValueTypes.int), VtValueTypes.int))
        }
      }
      return HdRetainedSmallVectorDataSource.new(indicesVec)
    } else if (name === HdInstancerTopologySchemaTokens.mask) {
      return UsdImagingDataSourcePointInstancerMask.new(
        this._sceneIndexPath, this._usdPI, this._stageGlobals)
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePointInstancer.cpp:234-244 */
function _Merge(a: _Mappings, b: _Mappings): _Mappings {
  const result: UsdImagingDataSourceCustomPrimvars.Mapping[] = [...a]
  for (const mapping of b) {
    result.push(mapping)
  }
  return result
}

/** dataSourcePointInstancer.cpp:249-275 */
const _baseMappings: _Mappings = [
  {
    primvarName: HdInstancerTokens.instanceTranslations,
    usdAttrName: _UsdGeomTokens.positions,
    interpolation: HdPrimvarSchemaTokens.instance,
  },
  {
    primvarName: HdInstancerTokens.instanceScales,
    usdAttrName: _UsdGeomTokens.scales,
    interpolation: HdPrimvarSchemaTokens.instance,
  },
  {
    primvarName: HdTokens.velocities,
    usdAttrName: _UsdGeomTokens.velocities,
    interpolation: HdPrimvarSchemaTokens.instance,
  },
  {
    primvarName: HdTokens.accelerations,
    usdAttrName: _UsdGeomTokens.accelerations,
    interpolation: HdPrimvarSchemaTokens.instance,
  },
  {
    primvarName: HdTokens.angularVelocities,
    usdAttrName: _UsdGeomTokens.angularVelocities,
    interpolation: HdPrimvarSchemaTokens.instance,
  },
]

/** dataSourcePointInstancer.cpp:280-288 */
const _mappingsOrientationsf: _Mappings = _Merge(_baseMappings, [
  {
    primvarName: HdInstancerTokens.instanceRotations,
    usdAttrName: _UsdGeomTokens.orientationsf,
    interpolation: HdPrimvarSchemaTokens.instance,
  },
])

/** dataSourcePointInstancer.cpp:291-299 */
const _mappingsOrientations: _Mappings = _Merge(_baseMappings, [
  {
    primvarName: HdInstancerTokens.instanceRotations,
    usdAttrName: _UsdGeomTokens.orientations,
    interpolation: HdPrimvarSchemaTokens.instance,
  },
])

/** dataSourcePointInstancer.cpp:246-302 */
function _GetCustomPrimvarMappings(usdPrim: UsdPrim): _Mappings {
  if (_UsesOrientationsf(usdPrim)) {
    return _mappingsOrientationsf
  } else {
    return _mappingsOrientations
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePointInstancer.h:87-119
 *
 * A data source representing the UsdGeom PointInstancer prim. */
export class UsdImagingDataSourcePointInstancerPrim extends UsdImagingDataSourcePrim {
  /** dataSourcePointInstancer.cpp:390-396. Private constructor, use static
   *  New() instead. */
  protected constructor(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ) {
    super(sceneIndexPath, usdPrim, stageGlobals)
  }

  static override new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourcePointInstancerPrim {
    return new UsdImagingDataSourcePointInstancerPrim(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourcePointInstancer.cpp:398-405 */
  override getNames(): string[] {
    const result = super.getNames()
    result.push(HdInstancerTopologySchema.getSchemaToken())
    result.push(HdPrimvarsSchema.getSchemaToken())
    return result
  }

  /** dataSourcePointInstancer.cpp:407-432 */
  override Get(name: string): HdDataSourceBase | undefined {
    if (name === HdInstancerTopologySchema.getSchemaToken()) {
      return UsdImagingDataSourcePointInstancerTopology.new(
        this._getSceneIndexPath(),
        this._getUsdPrim(),
        this._getStageGlobals())
    } else if (name === HdPrimvarsSchema.getSchemaToken()) {
      // Note that we are not yet handling velocities, accelerations
      // and angularVelocities.
      const basePrimvars = super.Get(name)
      return HdOverlayContainerDataSource.new(
        HdMapContainerDataSource.new(
          _GetPrimvarDataSource,
          basePrimvars instanceof HdContainerDataSource ? basePrimvars : undefined),
        UsdImagingDataSourceCustomPrimvars.new(
          this._getSceneIndexPath(),
          this._getUsdPrim(),
          _GetCustomPrimvarMappings(this._getUsdPrim()),
          this._getStageGlobals()))
    } else {
      return super.Get(name)
    }
  }

  /** dataSourcePointInstancer.cpp:434-485. Returns the hydra attribute set
   *  we should invalidate if the value of the USD properties in
   *  `properties` change. */
  static override invalidate(
    prim: UsdPrim,
    subprim: string,
    properties: readonly string[],
    invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    const locators = UsdImagingDataSourcePrim.invalidate(
      prim, subprim, properties, invalidationType)

    if (subprim === '') {
      for (const propertyName of properties) {
        if (propertyName === _UsdGeomTokens.prototypes) {
          locators.insert(
            HdInstancerTopologySchema.getDefaultLocator())
        }
        if (propertyName === _UsdGeomTokens.protoIndices) {
          const locator: HdDataSourceLocator = HdInstancerTopologySchema.getDefaultLocator()
            .append(HdInstancerTopologySchemaTokens.instanceIndices)
          locators.insert(locator)
        }
        // inactiveIds are metadata - changing those will cause a resync
        // of the prim, that is prim remove and add to the stage scene index.
        // So we do not need to deal with them here.
        if (propertyName === _UsdGeomTokens.invisibleIds) {
          const locator = HdInstancerTopologySchema.getDefaultLocator()
            .append(HdInstancerTopologySchemaTokens.mask)
          locators.insert(locator)
        }
        // Need to invalidate both orientations tokens. One will be
        // invalidated via the call to Invalidate() for custom primvars
        // and the other is explicitly invalidated here.
        if (propertyName === _UsdGeomTokens.orientations ||
            propertyName === _UsdGeomTokens.orientationsf) {
          locators.insert(HdPrimvarsSchema.getDefaultLocator().append(
            HdInstancerTokens.instanceRotations))
        }
      }

      locators.insert(
        UsdImagingDataSourceCustomPrimvars.invalidate(
          properties, _GetCustomPrimvarMappings(prim)))
    }

    return locators
  }
}
