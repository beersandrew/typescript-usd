// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImaging/dataSourceMapped.cpp,
//  pxr/usdImaging/usdImaging/dataSourceMapped.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/dataSourceMapped.{h,cpp}
// (OpenUSD 26.11.1).
//
// Divergence: upstream's PropertyMapping is a
// std::variant<AttributeMapping, RelationshipMapping> of aggregate structs;
// here AttributeMapping and RelationshipMapping are classes (constructed as
// `new UsdImagingDataSourceMapped.AttributeMapping(usdName, hdLocator)`) and
// the variant is told apart with instanceof.

import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
  type DataSourceLocator as HdDataSourceLocator,
  type SampledDataSource as HdSampledDataSource,
} from 'typescript-usd/hd'
import { Type as TfType } from 'typescript-usd/tf'
import type { Attribute as UsdAttribute, Prim as UsdPrim, Rel as UsdRelationship } from 'typescript-usd/usd'
import { Array as VtArray } from 'typescript-usd/vt'
import { UsdImagingDataSourceAttributeNew } from './dataSourceAttribute.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

const _SdfPathType = TfType.declare('SdfPath')

// UsdImagingDataSourceMapped_Impl (dataSourceMapped.cpp:16-87)

/** dataSourceMapped.cpp:26-34: for a given location within
 *  UsdImagingDataSourceMapped, information what data source to create.
 *
 *  Such a data source is either an HdSampledDataSource giving the value of
 *  an Usd attribute. Or a container data source. */
type _DataSourceInfo =
  | UsdImagingDataSourceMapped.AttributeMapping
  | UsdImagingDataSourceMapped.RelationshipMapping
  | _ContainerMappings

/** dataSourceMapped.cpp:36-48: data for a container data source. */
class _ContainerMappings {
  // Names within the container data source - sorted lexicographically.
  readonly hdNames: string[] = []
  // What data source should be returned for the above name.
  // This vector runs in parallel with hdNames.
  //
  // _DataSourceInfo can store another _ContainerMappings so this
  // data structure is a tree mirroring the tree of given data source
  // locators.
  readonly dataSourceInfos: _DataSourceInfo[] = []
}

/** std::lower_bound over the lexicographically sorted names (TfToken
 *  operator<, which compares the strings). */
function _LowerBound(names: readonly string[], name: string): number {
  let lo = 0
  let hi = names.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (names[mid]! < name) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** dataSourceMapped.cpp:50-63 */
function _PathFromRelationshipFactory(
  rel: UsdRelationship,
  _stageGlobals: UsdImagingDataSourceStageGlobals,
  _sceneIndexPath: string,
  _locator: HdDataSourceLocator,
): HdDataSourceBase | undefined {
  const result = rel.getForwardedTargets()
  if (result.length === 0) {
    return undefined
  }
  return new HdRetainedTypedSampledDataSource<string>(result[0]!, _SdfPathType)
}

/** dataSourceMapped.cpp:73-85 */
function _PathArrayFromRelationshipFactory(
  rel: UsdRelationship,
  _stageGlobals: UsdImagingDataSourceStageGlobals,
  _sceneIndexPath: string,
  _locator: HdDataSourceLocator,
): HdDataSourceBase | undefined {
  const result = rel.getForwardedTargets()
  return HdRetainedTypedSampledDataSource.new<VtArray<string>>(
    new VtArray<string>(result, _SdfPathType))
}

/** dataSourceMapped.h:24-186: a data source that is a (potentially nested)
 *  container for the values of the attributes of a given UsdPrim.
 *
 *  That is, this container data source contains `HdSampledDataSource`s
 *  giving the value of an attribute, either directly or in a nested fashion
 *  by containing container data sources itself.
 *
 *  The mapping of attributes to locations in the (nested) container data
 *  source can be specified through AttributeMapping. These locations are
 *  relative to the UsdImagingDataSourceMapped itself. To compute the correct
 *  data source locators for invalidation purposes, the location of the
 *  UsdImagingDataSourceMapped needs to be given to AttributeMappings so that
 *  absolute locators (that is relative to the prim data source) can be
 *  computed. */
export class UsdImagingDataSourceMapped extends HdContainerDataSource {
  /** dataSourceMapped.cpp:109-132 */
  private constructor(
    private readonly _usdPrim: UsdPrim,
    private readonly _sceneIndexPath: string,
    private readonly _containerMappings: _ContainerMappings,
    private readonly _stageGlobals: UsdImagingDataSourceStageGlobals,
  ) { super() }

  /** dataSourceMapped.cpp:109-120 */
  static new(
    usdPrim: UsdPrim,
    sceneIndexPath: string,
    mappings: UsdImagingDataSourceMapped.PropertyMappings,
    stageGlobals: UsdImagingDataSourceStageGlobals,
  ): UsdImagingDataSourceMapped {
    return new UsdImagingDataSourceMapped(
      usdPrim, sceneIndexPath, mappings._containerMappings, stageGlobals)
  }

  /** dataSourceMapped.cpp:91-98 */
  static getPathFromRelationshipDataSourceFactory(): UsdImagingDataSourceMapped.DataSourceRelationshipFactoryFn {
    return _PathFromRelationshipFactory
  }

  /** dataSourceMapped.cpp:100-107 */
  static getPathArrayFromRelationshipDataSourceFactory(): UsdImagingDataSourceMapped.DataSourceRelationshipFactoryFn {
    return _PathArrayFromRelationshipFactory
  }

  /** dataSourceMapped.cpp:136-140 */
  getNames(): string[] {
    return this._containerMappings.hdNames
  }

  /** dataSourceMapped.cpp:142-221 */
  Get(name: string): HdDataSourceBase | undefined {
    if (!this._usdPrim.isValid()) {
      return undefined
    }

    // Look for name in hdNames.

    const hdNames = this._containerMappings.hdNames
    const itName = _LowerBound(hdNames, name)

    if (!(itName !== hdNames.length && hdNames[itName] === name)) {
      return undefined
    }

    const info = this._containerMappings.dataSourceInfos[itName]!
    if (info instanceof UsdImagingDataSourceMapped.AttributeMapping) {
      const attrMapping = info
      // We create a data source from the UsdAttribute.
      const attr = this._usdPrim.getAttr(attrMapping.usdName)
      if (!attr?.isValid()) {
        TF_CODING_ERROR(
          `Expected usd attribute '${attrMapping.usdName}' on prim ` +
          `'${this._usdPrim.path}' to serve ` +
          `data source at locator '${attrMapping.hdLocator.GetString()}'.`)
        return undefined
      }
      if (!attrMapping.factory) {
        TF_CODING_ERROR(
          `No factory given to convert usd attribute '${attrMapping.usdName}' ` +
          `on prim '${this._usdPrim.path}' ` +
          `to serve data source at locator '${attrMapping.hdLocator.GetString()}'.`)
        return undefined
      }
      return attrMapping.factory(
        attr, this._stageGlobals, this._sceneIndexPath, attrMapping.hdLocator)
    } else if (info instanceof UsdImagingDataSourceMapped.RelationshipMapping) {
      const relMapping = info
      const rel = this._usdPrim.getRelationshipAtPath(
        `${this._usdPrim.path}.${relMapping.usdName}`)
      if (!rel) {
        TF_CODING_ERROR(
          `Expected usd relationship '${relMapping.usdName}' on prim ` +
          `'${this._usdPrim.path}' to serve ` +
          `data source at locator '${relMapping.hdLocator.GetString()}'.`)
        return undefined
      }
      if (!relMapping.factory) {
        TF_CODING_ERROR(
          `No factory given to convert usd relationship '${relMapping.usdName}' ` +
          `on prim '${this._usdPrim.path}' ` +
          `to serve data source at locator '${relMapping.hdLocator.GetString()}'.`)
        return undefined
      }
      return relMapping.factory(
        rel, this._stageGlobals, this._sceneIndexPath, relMapping.hdLocator)
    } else {
      // We are in the nested case.
      return new UsdImagingDataSourceMapped(
        this._usdPrim,
        this._sceneIndexPath,
        info,
        this._stageGlobals)
    }
  }

  /** dataSourceMapped.cpp:223-238 */
  static invalidate(
    usdNames: readonly string[],
    mappings: UsdImagingDataSourceMapped.PropertyMappings,
  ): HdDataSourceLocatorSet {
    const locators = new HdDataSourceLocatorSet()

    for (const usdName of usdNames) {
      for (const mapping of mappings._absoluteMappings) {
        if (mapping.usdName === usdName) {
          locators.insert(mapping.hdLocator)
        }
      }
    }

    return locators
  }
}

/** dataSourceMapped.cpp:240-251 */
function _GetUsdName(info: _DataSourceInfo): string {
  if (info instanceof UsdImagingDataSourceMapped.AttributeMapping) {
    return info.usdName
  }
  if (info instanceof UsdImagingDataSourceMapped.RelationshipMapping) {
    return info.usdName
  }
  return '<UNKNOWN>'
}

/** dataSourceMapped.cpp:253-288: find or add name as key to given
 *  containerMappings - returning the _ContainerMappings at that key. */
function _FindOrCreateChild(
  name: string, containerMappings: _ContainerMappings,
): _ContainerMappings | undefined {
  const itName = _LowerBound(containerMappings.hdNames, name)

  if (itName !== containerMappings.hdNames.length && containerMappings.hdNames[itName] === name) {
    const info = containerMappings.dataSourceInfos[itName]!
    if (!(info instanceof _ContainerMappings)) {
      TF_CODING_ERROR(
        'Adding data source locator when there was already an ' +
        `ascendant locator added for a Usd attribute with name '${_GetUsdName(info)}'.`)
      return undefined
    }
    return info
  }

  // Create new item.
  const child = new _ContainerMappings()

  containerMappings.hdNames.splice(itName, 0, name)
  containerMappings.dataSourceInfos.splice(itName, 0, child)

  return child
}

/** dataSourceMapped.cpp:290-326: add mapping to containerMappins at given
 *  locator. */
function _Add(
  locator: HdDataSourceLocator,
  info: _DataSourceInfo,
  containerMappings: _ContainerMappings | undefined,
): void {
  const n = locator.getElementCount()
  if (n === 0) {
    TF_CODING_ERROR('Expected non-trivial data source locator for ' +
      `attribute ${_GetUsdName(info)}.`)
    return
  }

  // Find or create the nested container data sources.
  for (let i = 0; i < n - 1; ++i) {
    const hdName = locator.getElement(i)
    containerMappings = _FindOrCreateChild(hdName, containerMappings!)
    if (!containerMappings) {
      return
    }
  }

  const name = locator.getLastElement()

  // And add the AttributeMapping as leaf.
  const itName = _LowerBound(containerMappings!.hdNames, name)

  containerMappings!.hdNames.splice(itName, 0, name)
  containerMappings!.dataSourceInfos.splice(itName, 0, info)
}

export namespace UsdImagingDataSourceMapped {
  /** dataSourceMapped.h:55-74: base class to specify how a property on the
   *  given Usd prim maps to a data source in this (nested) container data
   *  source. */
  export interface PropertyMappingBase {
    /** Name of attribute on Usd Prim. */
    readonly usdName: string
    /** Corresponding location in this data source.
     *
     *  Has to be non-empty. If length is greater than one, nested container
     *  data sources will be created. */
    readonly hdLocator: HdDataSourceLocator
  }

  /** dataSourceMapped.h:76-89: signature of function to compute data source
   *  from attribute.
   *
   *  This could be generalized to HdDataSourceBaseHandle but we use
   *  HdSampledDataSourceHandle as result instead so that we can use the
   *  UsdImagingDataSourceAttributeNew function pointer. */
  export type DataSourceAttributeFactoryFn = (
    attr: UsdAttribute,
    stageGlobals: UsdImagingDataSourceStageGlobals,
    sceneIndexPath: string,
    timeVaryingFlagLocator: HdDataSourceLocator,
  ) => HdSampledDataSource | undefined

  /** dataSourceMapped.h:91-108: specify how an attribute on the given Usd
   *  prim maps to a data source in this (nested) container data source. */
  export class AttributeMapping implements PropertyMappingBase {
    constructor(
      readonly usdName: string,
      readonly hdLocator: HdDataSourceLocator,
      /** Function to compute data source from UsdAttribute.
       *
       *  Defaults to the appropriate overload of
       *  UsdImagingDataSourceAttributeNew.
       *
       *  Clients can implement custom behavior. For example, following the
       *  connection of a UsdShadeOutput and return the path of the connected
       *  prim. */
      readonly factory: DataSourceAttributeFactoryFn | undefined =
        UsdImagingDataSourceAttributeNew,
    ) {}
  }

  /** dataSourceMapped.h:110-122 */
  export type DataSourceRelationshipFactoryFn = (
    rel: UsdRelationship,
    stageGlobals: UsdImagingDataSourceStageGlobals,
    sceneIndexPath: string,
    timeVaryingFlagLocator: HdDataSourceLocator,
  ) => HdDataSourceBase | undefined

  /** dataSourceMapped.h:134-141: specify how a relationship on the given Usd
   *  prim maps to a data source in this (nested) container data source. */
  export class RelationshipMapping implements PropertyMappingBase {
    constructor(
      readonly usdName: string,
      readonly hdLocator: HdDataSourceLocator,
      /** Function to compute data source from UsdRelationship. */
      readonly factory: DataSourceRelationshipFactoryFn | undefined,
    ) {}
  }

  /** dataSourceMapped.h:143-144 */
  export type PropertyMapping = AttributeMapping | RelationshipMapping

  /** dataSourceMapped.h:146-170: specify how attributes on given Usd prim
   *  maps to data sources in this (nested) container data source. */
  export class PropertyMappings {
    // Flat list with absolute locators for invalidation.
    /** @internal */
    readonly _absoluteMappings: PropertyMappingBase[] = []
    // Nested list to implement HdContainerDataSource::Get.
    /** @internal */
    readonly _containerMappings: _ContainerMappings = new _ContainerMappings()

    /** dataSourceMapped.cpp:328-363. dataSourcePrefix is the location of
     *  this UsdImagingDataSourceMapped within a prim data source. */
    constructor(
      mappings: readonly PropertyMapping[],
      dataSourcePrefix: HdDataSourceLocator,
    ) {
      for (const mapping of mappings) {
        if (mapping instanceof AttributeMapping) {
          // Making locator absolute.
          const locator = dataSourcePrefix.append(mapping.hdLocator)
          this._absoluteMappings.push({ usdName: mapping.usdName, hdLocator: locator })
          _Add(
            mapping.hdLocator,
            new AttributeMapping(mapping.usdName, locator, mapping.factory),
            this._containerMappings)
        } else if (mapping instanceof RelationshipMapping) {
          // Making locator absolute.
          const locator = dataSourcePrefix.append(mapping.hdLocator)
          this._absoluteMappings.push({ usdName: mapping.usdName, hdLocator: locator })
          _Add(
            mapping.hdLocator,
            new RelationshipMapping(mapping.usdName, locator, mapping.factory),
            this._containerMappings)
        }
      }
    }
  }
}
