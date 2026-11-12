// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourcePrimvars.cpp,
//  pxr/usdImaging/usdImaging/dataSourcePrimvars.h,
//  pxr/usd/usdGeom/primvar.cpp, pxr/usd/usdGeom/primvarsAPI.cpp
// Copyright 2016, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourcePrimvars.{h,cpp}
// (OpenUSD 26.11.1).
//
// UsdGeomPrimvar / UsdGeomPrimvarsAPI are reached through their attribute
// conventions (primvar.cpp, primvarsAPI.cpp), see the helpers below: the
// TypeScript usdGeom Primvar class keys primvars by name and does not expose
// the UsdAttribute-based API the upstream code uses.

import {
  DataSourceLocator as HdDataSourceLocator,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  ContainerDataSource as HdContainerDataSource,
  PrimvarRoleTokens as HdPrimvarRoleTokens,
  PrimvarSchema as HdPrimvarSchema,
  PrimvarSchemaTokens as HdPrimvarSchemaTokens,
  PrimvarsSchema as HdPrimvarsSchema,
  PrimvarsSchemaTokens as HdPrimvarsSchemaTokens,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
  type IntDataSource as HdIntDataSource,
  type TokenDataSource as HdTokenDataSource,
} from 'typescript-usd/hd'
import { Type as TfType } from 'typescript-usd/tf'
import {
  AttributeQuery as UsdAttributeQuery,
  ColorSpaceAPI as UsdColorSpaceAPI,
  type Attribute as UsdAttribute,
  type Prim as UsdPrim,
  type Rel as UsdRelationship,
} from 'typescript-usd/usd'
import { UsdImagingDataSourceAttributeNew } from './dataSourceAttribute.ts'
import { UsdImagingDataSourceRelationship } from './dataSourceRelationship.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingUsdToHdInterpolationToken, UsdImagingUsdToHdRole } from './primvarUtils.ts'

const _TfTokenType = TfType.declare('token')

// UsdGeomTokens used below.
const _UsdGeomTokens = {
  interpolation: 'interpolation',
  elementSize: 'elementSize',
  constant: 'constant',
  points: 'points',
  velocities: 'velocities',
  accelerations: 'accelerations',
} as const

// UsdGeomPrimvar's _tokens (primvar.cpp:24-28).
const _primvarsPrefix = 'primvars:'
const _indicesSuffix = ':indices'

/** UsdGeomPrimvar::IsValidPrimvarName (primvar.cpp:62-71). */
function _UsdGeomPrimvarIsValidPrimvarName(name: string): boolean {
  // All properly namespaced attributes are legal primvars, *except*
  // the "sidecar" attributes we create as part of the schema, like
  // "primvars:foo:indices".  We do not need to worry about the idFrom
  // suffix because it only appears on relationships.
  return name.startsWith(_primvarsPrefix) && !name.endsWith(_indicesSuffix)
}

/** UsdGeomPrimvar::StripPrimvarsName (primvar.cpp:73-83), which
 *  UsdGeomPrimvar::GetPrimvarName applies to the attribute name. */
function _UsdGeomPrimvarStripPrimvarsName(name: string): string {
  return name.startsWith(_primvarsPrefix) ? name.slice(_primvarsPrefix.length) : name
}

/** UsdGeomPrimvar::GetInterpolation (primvar.cpp:125-135). */
function _UsdGeomPrimvarGetInterpolation(attr: UsdAttribute): string {
  const interpolation = attr.getMetadata(_UsdGeomTokens.interpolation)
  if (typeof interpolation !== 'string' || interpolation === '') {
    return _UsdGeomTokens.constant
  }
  return interpolation
}

/** UsdGeomPrimvar::GetElementSize (primvar.cpp:166-173). */
function _UsdGeomPrimvarGetElementSize(attr: UsdAttribute): number {
  const eltSize = attr.getMetadata(_UsdGeomTokens.elementSize)
  return typeof eltSize === 'number' ? eltSize : 1
}

/** UsdGeomPrimvar::GetIndicesAttr (primvar.cpp:210-230). */
function _UsdGeomPrimvarGetIndicesAttr(attr: UsdAttribute, prim: UsdPrim): UsdAttribute | undefined {
  const indicesAttr = prim.getAttr(attr.name + _indicesSuffix)
  return indicesAttr?.isValid() ? indicesAttr : undefined
}

/** UsdGeomPrimvarsAPI::GetAuthoredPrimvars (primvarsAPI.cpp:220-233) through
 *  _MakePrimvars (primvarsAPI.cpp:186-202): the authored attributes in the
 *  "primvars:" namespace that are valid primvars (relationships and the
 *  ":indices" sidecar attributes are not). */
export function _UsdGeomPrimvarsAPIGetAuthoredPrimvars(prim: UsdPrim): UsdAttribute[] {
  if (!prim.isValid()) {
    return []
  }
  const result: UsdAttribute[] = []
  // UsdPrim::GetAuthoredPropertiesInNamespace("primvars:")
  // (prim.cpp:1412-1459).
  const names = prim.getAuthoredPropertyNames(name => name.startsWith(_primvarsPrefix))
  for (const name of names) {
    const attr = prim.getAttr(name)
    // UsdGeomPrimvar::IsPrimvar (primvar.cpp:52-60).
    if (attr?.isValid() && _UsdGeomPrimvarIsValidPrimvarName(attr.name)) {
      result.push(attr)
    }
  }
  return result
}

/** UsdGeomPrimvarsAPI::CanContainPropertyName (primvarsAPI.cpp:541-547). */
export function _UsdGeomPrimvarsAPICanContainPropertyName(name: string): boolean {
  return name.startsWith(_primvarsPrefix)
}

/** UsdPrim::GetRelationship: the relationship named `name`, if one is
 *  defined. */
function _GetRelationship(prim: UsdPrim, name: string): UsdRelationship | undefined {
  return prim.getRelationshipAtPath(`${prim.path}.${name}`)
}

/** dataSourcePrimvars.cpp:24-28 */
function _IsIndexed(indicesQuery: UsdAttributeQuery): boolean {
  return indicesQuery.isValid() && indicesQuery.hasValue()
}

/** dataSourcePrimvars.cpp:30-42 */
function _GetInterpolation(attr: UsdAttribute): string {
  // A reimplementation of UsdGeomPrimvar::GetInterpolation(),
  // but with "vertex" as the default instead of "constant"...
  const interpolation = attr.getMetadata(_UsdGeomTokens.interpolation)
  if (typeof interpolation === 'string' && interpolation !== '') {
    return UsdImagingUsdToHdInterpolationToken(interpolation)
  }

  return HdPrimvarSchemaTokens.vertex
}

/** dataSourcePrimvars.cpp:44-62. Reject primvars:points since we always want
 *  to get the value from the points attribute. Similar for velocities and
 *  accelerations. */
function _RejectPrimvar(name: string): boolean {
  if (name === _UsdGeomTokens.points) {
    return true
  }
  if (name === _UsdGeomTokens.velocities) {
    return true
  }
  if (name === _UsdGeomTokens.accelerations) {
    return true
  }

  return false
}

/** dataSourcePrimvars.cpp:109-119 */
function _ElementSizeToDataSource(n: number): HdIntDataSource | undefined {
  if (n === 1) {
    // elementSize = 1 is default.
    // Don't occur the cost of instantiating the data source and
    // passing it down when most clients ignore elementSize anyway.
    return undefined
  }
  return new HdRetainedTypedSampledDataSource<number>(n, TfType.declare('int'))
}

/** dataSourcePrimvars.h:20-52: data source representing USD primvars. This
 *  is a container for all primvars. */
export class UsdImagingDataSourcePrimvars extends HdContainerDataSource {
  /** dataSourcePrimvars.cpp:64-72 */
  private constructor(
    // Path of the owning prim.
    private readonly _sceneIndexPath: string,
    private readonly _usdPrim: UsdPrim,
    // Stage globals handle.
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string, usdPrim: UsdPrim, stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourcePrimvars {
    return new UsdImagingDataSourcePrimvars(sceneIndexPath, usdPrim, stageGlobals)
  }

  /** dataSourcePrimvars.cpp:75-80 */
  private static _getPrefixedName(name: string): string {
    return 'primvars:' + name
  }

  /** dataSourcePrimvars.cpp:82-107 */
  getNames(): string[] {
    const result: string[] = []

    if (!this._usdPrim.isValid()) {
      return result
    }

    // Enumerate primvar names using UsdGeomPrimvarsAPI.
    // This API filters out supporting attributes such as
    // "primvars:indexedPrimvar:indices".
    const primvars = _UsdGeomPrimvarsAPIGetAuthoredPrimvars(this._usdPrim)
    for (const primvar of primvars) {
      const name = _UsdGeomPrimvarStripPrimvarsName(primvar.name)
      if (!_RejectPrimvar(name)) {
        result.push(name)
      }
    }

    return result
  }

  /** dataSourcePrimvars.cpp:121-177 */
  Get(name: string): HdDataSourceBase | undefined {
    if (_RejectPrimvar(name)) {
      return undefined
    }

    if (!this._usdPrim.isValid()) {
      return undefined
    }

    const propName = UsdImagingDataSourcePrimvars._getPrefixedName(name)

    const attr = this._usdPrim.getAttr(propName)
    if (attr?.isValid()) {
      const valueQuery = new UsdAttributeQuery(attr)
      if (!valueQuery.hasAuthoredValue()) {
        return undefined
      }

      const primvarRole = UsdImagingUsdToHdRole(attr.getRoleName())

      let colorSpace = ''
      if (primvarRole === HdPrimvarRoleTokens.color) {
        colorSpace = UsdColorSpaceAPI.computeColorSpaceName(attr)
      }

      const indicesAttr = _UsdGeomPrimvarGetIndicesAttr(attr, this._usdPrim)
      return UsdImagingDataSourcePrimvar.new(
        this._sceneIndexPath, name, this._stageGlobals,
        /* value = */ valueQuery,
        /* indices = */ new UsdAttributeQuery(indicesAttr),
        HdPrimvarSchema.buildInterpolationDataSource(
          UsdImagingUsdToHdInterpolationToken(
            _UsdGeomPrimvarGetInterpolation(attr))),
        primvarRole === ''
          ? undefined
          : HdPrimvarSchema.buildRoleDataSource(primvarRole),
        colorSpace === ''
          ? undefined
          : new HdRetainedTypedSampledDataSource<string>(colorSpace, _TfTokenType),
        _ElementSizeToDataSource(_UsdGeomPrimvarGetElementSize(attr)))
    }

    const rel = _GetRelationship(this._usdPrim, propName)
    if (rel) {
      return new HdPrimvarSchema.Builder()
        .setPrimvarValue(UsdImagingDataSourceRelationship.new(
          rel, this._stageGlobals))
        .setInterpolation(HdPrimvarSchema.buildInterpolationDataSource(
          HdPrimvarSchemaTokens.constant))
        .build()
    }

    return undefined
  }
}

// ----------------------------------------------------------------------------

/** dataSourcePrimvars.h:56-114 */
export class UsdImagingDataSourceCustomPrimvars extends HdContainerDataSource {
  /** dataSourcePrimvars.cpp:181-191 */
  private constructor(
    // Path of the owning prim.
    private readonly _sceneIndexPath: string,
    private readonly _usdPrim: UsdPrim,
    private readonly _mappings: UsdImagingDataSourceCustomPrimvars.Mappings,
    // Stage globals handle.
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  static new(
    sceneIndexPath: string,
    usdPrim: UsdPrim,
    mappings: UsdImagingDataSourceCustomPrimvars.Mappings,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceCustomPrimvars {
    return new UsdImagingDataSourceCustomPrimvars(sceneIndexPath, usdPrim, mappings, stageGlobals)
  }

  /** dataSourcePrimvars.cpp:193-206 */
  getNames(): string[] {
    const result: string[] = []

    for (const mapping of this._mappings) {
      result.push(mapping.primvarName)
    }

    return result
  }

  /** dataSourcePrimvars.cpp:208-253 */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._usdPrim.isValid()) {
      return undefined
    }

    for (const mapping of this._mappings) {
      if (mapping.primvarName !== name) {
        continue
      }

      const attr = this._usdPrim.getAttr(mapping.usdAttrName)
      const valueQuery = new UsdAttributeQuery(attr?.isValid() ? attr : undefined)

      if (!valueQuery.hasAuthoredValue()) {
        return undefined
      }

      const primvarRole = UsdImagingUsdToHdRole(attr!.getRoleName())

      let colorSpace = ''
      if (primvarRole === HdPrimvarRoleTokens.color) {
        colorSpace = UsdColorSpaceAPI.computeColorSpaceName(attr!)
      }

      return UsdImagingDataSourcePrimvar.new(
        this._sceneIndexPath, name, this._stageGlobals,
        /* value = */ valueQuery,
        /* indices = */ new UsdAttributeQuery(),
        HdPrimvarSchema.buildInterpolationDataSource(
          !mapping.interpolation
            ? _GetInterpolation(attr!)
            : mapping.interpolation),
        HdPrimvarSchema.buildRoleDataSource(primvarRole),
        colorSpace === ''
          ? undefined
          : new HdRetainedTypedSampledDataSource<string>(colorSpace, _TfTokenType),

        /* elementSize = */ undefined)
    }

    return undefined
  }

  /** dataSourcePrimvars.cpp:257-280 */
  static invalidate(
    properties: readonly string[],
    mappings: UsdImagingDataSourceCustomPrimvars.Mappings,
  ): HdDataSourceLocatorSet {
    const result = new HdDataSourceLocatorSet()

    // TODO, decide how to handle this based on the size?
    const nameMappings = new Map<string, string>()
    for (const m of mappings) {
      nameMappings.set(m.usdAttrName, m.primvarName)
    }

    for (const propertyName of properties) {
      const primvarName = nameMappings.get(propertyName)
      if (primvarName !== undefined) {
        result.insert(HdPrimvarsSchema.getDefaultLocator().append(primvarName))
      }
    }

    return result
  }
}

export namespace UsdImagingDataSourceCustomPrimvars {
  /** dataSourcePrimvars.h:68-81 Mapping. An empty (or absent)
   *  interpolation means the interpolation is read from the attribute. */
  export interface Mapping {
    primvarName: string
    usdAttrName: string
    interpolation?: string
  }

  /** dataSourcePrimvars.h:83-86: this map is passed to the constructor to
   *  specify non-"primvars:" attributes to include as primvars (e.g.,
   *  "points" and "normals"). The first token is the datasource name, and
   *  the second the USD name. */
  export type Mappings = readonly Mapping[]
}

// ----------------------------------------------------------------------------

/** dataSourcePrimvars.h:118-154: a data source representing a primvar. A
 *  primvar contains data, interpolation, and role, but data can be a flat
 *  value or a value/index pair. We also take location information for
 *  variability tracking.
 *
 *  Note: the schema for this specifies that you can return "primvarValue"
 *  for a flattened value, or "indexedPrimvarValue" and "indices" for an
 *  un-flattened value. Since we don't want to duplicate the flattening
 *  logic, we check whether indices are present and then return only one of
 *  "primvarValue" or "indexedPrimvarValue" from the result of valueQuery. */
export class UsdImagingDataSourcePrimvar extends HdContainerDataSource {
  /** dataSourcePrimvars.cpp:285-328 */
  private constructor(
    sceneIndexPath: string,
    name: string,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
    private readonly _valueQuery: UsdAttributeQuery,
    private readonly _indicesQuery: UsdAttributeQuery,
    private readonly _interpolation: HdTokenDataSource | undefined,
    private readonly _role: HdTokenDataSource | undefined,
    private readonly _colorSpace: HdTokenDataSource | undefined = undefined,
    private readonly _elementSize: HdIntDataSource | undefined = undefined,
  ) {
    super()
    const indexed = _IsIndexed(this._indicesQuery)
    if (indexed) {
      if (this._valueQuery.valueMightBeTimeVarying()) {
        this._stageGlobals.flagAsTimeVarying(sceneIndexPath,
          new HdDataSourceLocator(
            HdPrimvarsSchemaTokens.primvars,
            name,
            HdPrimvarSchemaTokens.indexedPrimvarValue))
      }
      if (this._indicesQuery.valueMightBeTimeVarying()) {
        this._stageGlobals.flagAsTimeVarying(sceneIndexPath,
          new HdDataSourceLocator(
            HdPrimvarsSchemaTokens.primvars,
            name,
            HdPrimvarSchemaTokens.indices))
      }
    } else {
      if (this._valueQuery.valueMightBeTimeVarying()) {
        this._stageGlobals.flagAsTimeVarying(sceneIndexPath,
          new HdDataSourceLocator(
            HdPrimvarsSchemaTokens.primvars,
            name,
            HdPrimvarSchemaTokens.primvarValue))
      }
    }
  }

  static new(
    sceneIndexPath: string,
    name: string,
    stageGlobals: UsdImagingDataSourceStageGlobals,
    valueQuery: UsdAttributeQuery,
    indicesQuery: UsdAttributeQuery,
    interpolation: HdTokenDataSource | undefined,
    role: HdTokenDataSource | undefined,
    colorSpace?: HdTokenDataSource | undefined,
    elementSize?: HdIntDataSource | undefined,
  ): UsdImagingDataSourcePrimvar {
    return new UsdImagingDataSourcePrimvar(
      sceneIndexPath, name, stageGlobals, valueQuery, indicesQuery,
      interpolation, role, colorSpace, elementSize)
  }

  /** dataSourcePrimvars.cpp:330-356 */
  getNames(): string[] {
    const indexed = _IsIndexed(this._indicesQuery)

    const result: string[] = [
      HdPrimvarSchemaTokens.interpolation,
      HdPrimvarSchemaTokens.role,
    ]

    if (this._colorSpace) {
      result.push(HdPrimvarSchemaTokens.colorSpace)
    }

    if (indexed) {
      result.push(HdPrimvarSchemaTokens.indexedPrimvarValue)
      result.push(HdPrimvarSchemaTokens.indices)
    } else {
      result.push(HdPrimvarSchemaTokens.primvarValue)
    }

    if (this._elementSize) {
      result.push(HdPrimvarSchemaTokens.elementSize)
    }

    return result
  }

  /** dataSourcePrimvars.cpp:358-393 */
  Get(name: string): HdDataSourceBase | undefined {
    const indexed = _IsIndexed(this._indicesQuery)

    if (indexed) {
      if (name === HdPrimvarSchemaTokens.indexedPrimvarValue) {
        return UsdImagingDataSourceAttributeNew(
          this._valueQuery, this._stageGlobals)
      } else if (name === HdPrimvarSchemaTokens.indices) {
        return UsdImagingDataSourceAttributeNew(
          this._indicesQuery, this._stageGlobals)
      }
    } else {
      if (name === HdPrimvarSchemaTokens.primvarValue) {
        return UsdImagingDataSourceAttributeNew(
          this._valueQuery, this._stageGlobals)
      }
    }

    if (name === HdPrimvarSchemaTokens.interpolation) {
      return this._interpolation
    }
    if (name === HdPrimvarSchemaTokens.role) {
      return this._role
    }
    if (name === HdPrimvarSchemaTokens.colorSpace) {
      return this._colorSpace
    }
    if (name === HdPrimvarSchemaTokens.elementSize) {
      return this._elementSize
    }
    return undefined
  }
}
