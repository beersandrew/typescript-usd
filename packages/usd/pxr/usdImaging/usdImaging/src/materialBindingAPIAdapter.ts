// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/materialBindingAPIAdapter.cpp,
//  pxr/usdImaging/usdImaging/materialBindingAPIAdapter.h,
//  pxr/usd/usdShade/materialBindingAPI.cpp,
//  pxr/usd/usdShade/materialBindingAPI.h
// Copyright 2016, 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImaging/materialBindingAPIAdapter.{h,cpp}
// (OpenUSD 26.11.1): the scene index API.
//
// Divergence: the TypeScript usdShade MaterialBindingAPI has no
// GetDirectBindingRel / DirectBinding / GetCollectionBindings /
// CollectionBinding / GetMaterialBindingStrength / GetMaterialPurposes; the
// _UsdShade* helpers below port those from
// pxr/usd/usdShade/materialBindingAPI.{h,cpp} (cited at each) over the
// relationship reads of the TypeScript USD API. Relationships are read
// through UsdPrim.getAttr (the TypeScript property handle) and
// UsdRel.getForwardedTargets.

import {
  DataSourceLocatorSet as HdDataSourceLocatorSet,
  ContainerDataSource as HdContainerDataSource,
  RetainedContainerDataSource as HdRetainedContainerDataSource,
  RetainedSmallVectorDataSource as HdRetainedSmallVectorDataSource,
  RetainedTypedSampledDataSource as HdRetainedTypedSampledDataSource,
  type DataSourceBase as HdDataSourceBase,
  type VectorDataSource as HdVectorDataSource,
} from 'typescript-usd/hd'
import { SdfPath } from 'typescript-usd/sdf/path'
import { Type as TfType } from 'typescript-usd/tf'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { UsdImagingAPISchemaAdapter } from './apiSchemaAdapter.ts'
import { UsdImagingCollectionMaterialBindingSchema } from './collectionMaterialBindingSchema.ts'
import type { UsdImagingDataSourceStageGlobals } from './dataSourceStageGlobals.ts'
import { UsdImagingDirectMaterialBindingSchema } from './directMaterialBindingSchema.ts'
import { UsdImagingMaterialBindingSchemaTokens } from './materialBindingSchema.ts'
import { UsdImagingMaterialBindingsSchema } from './materialBindingsSchema.ts'
import type { UsdImagingPropertyInvalidationType } from './types.ts'

const _SdfPathType = TfType.declare('SdfPath')

// UsdShadeTokens / UsdTokens used below.
const _materialBinding = 'material:binding'
const _materialBindingCollection = 'material:binding:collection'
const _collection = 'collection'
const _weakerThanDescendants = 'weakerThanDescendants'

// ---------------------------------------------------------------------------
// UsdShadeMaterialBindingAPI helpers (see the header)

/** SdfPath::IsPrimPath */
function _IsPrimPath(path: string): boolean {
  return path !== '' && SdfPath.fromString(path).isPrimPath()
}

/** A relationship of the prim: UsdPrim::GetRelationship(name), undefined
 *  when the prim has no such relationship. Returns its forwarded targets
 *  and metadata accessor. */
interface _Rel {
  name: string
  getForwardedTargets(): string[]
  getMetadata(field: string): unknown
}

/** UsdPrim::GetRelationship */
function _GetRelationship(prim: UsdPrim, name: string): _Rel | undefined {
  // (The TypeScript property handle's isValid() is true only for
  // attributes; UsdPrim.hasProperty covers relationships.)
  const prop = prim.getAttr(name)
  if (!prop || !prim.hasProperty(name) || !prop.isRelationship) {
    return undefined
  }
  const rel = prim.rel(name)
  return {
    name,
    getForwardedTargets: () => rel.getForwardedTargets(),
    getMetadata: (field: string) => prop.getMetadata(field),
  }
}

/** materialBindingAPI.cpp:139-153 _GetDirectBindingRelName */
function _GetDirectBindingRelName(materialPurpose: string): string {
  return materialPurpose === '' ? _materialBinding : `${_materialBinding}:${materialPurpose}`
}

/** materialBindingAPI.cpp:155-175 _GetCollectionBindingRelName
 *  (SdfPath::JoinIdentifier skips empty identifiers). */
function _GetCollectionBindingRelName(bindingName: string, materialPurpose: string): string {
  return [_materialBindingCollection, materialPurpose, bindingName].filter(s => s !== '').join(':')
}

/** materialBindingAPI.cpp:194-206 _GetMaterialPurpose: the material purpose
 *  associated with the given binding relationship; allPurpose if it does not
 *  apply to a specific material purpose. */
function _GetMaterialPurpose(bindingRelName: string): string {
  const nameTokens = SdfPath.tokenizeIdentifier(bindingRelName)
  if (nameTokens.length === 5) {
    return nameTokens[3]!
  } else if (nameTokens.length === 3) {
    return nameTokens[2]!
  }
  return ''
}

/** materialBindingAPI.cpp:176-181 GetDirectBindingRel */
function _GetDirectBindingRel(prim: UsdPrim, materialPurpose: string): _Rel | undefined {
  return _GetRelationship(prim, _GetDirectBindingRelName(materialPurpose))
}

/** materialBindingAPI.h DirectBinding, materialBindingAPI.cpp:209-222 */
class _DirectBinding {
  private _materialPath = ''
  private _isBound = false
  constructor(directBindingRel: _Rel | undefined) {
    const targetPaths = directBindingRel?.getForwardedTargets() ?? []
    if (targetPaths.length === 1 && _IsPrimPath(targetPaths[0]!)) {
      this._materialPath = targetPaths[0]!
      this._isBound = true
    }
  }
  getMaterialPath(): string { return this._materialPath }
  isBound(): boolean { return this._isBound }
}

/** materialBindingAPI.cpp:233-240 GetDirectBinding */
function _GetDirectBinding(prim: UsdPrim, materialPurpose: string): _DirectBinding {
  return new _DirectBinding(_GetDirectBindingRel(prim, materialPurpose))
}

/** materialBindingAPI.h CollectionBinding, materialBindingAPI.cpp:262-311 */
class _CollectionBinding {
  private _materialPath = ''
  private _collectionPath = ''
  constructor(private readonly _bindingRel: _Rel) {
    const targetPaths = _bindingRel.getForwardedTargets()
    // A collection binding relationship must have exactly two targets
    // One of them should target a property path (i.e. the collection path)
    // and the other must target a prim (the bound material).
    if (targetPaths.length === 2) {
      const firstTargetPathIsPrimPath = _IsPrimPath(targetPaths[0]!)
      const secondTargetPathIsPrimPath = _IsPrimPath(targetPaths[1]!)

      if (firstTargetPathIsPrimPath !== secondTargetPathIsPrimPath) {
        this._materialPath = targetPaths[firstTargetPathIsPrimPath ? 0 : 1]!
        this._collectionPath = targetPaths[firstTargetPathIsPrimPath ? 1 : 0]!
      }
    }
  }
  getMaterialPath(): string { return this._materialPath }
  getCollectionPath(): string { return this._collectionPath }
  getBindingRel(): _Rel { return this._bindingRel }
  /** materialBindingAPI.h:383-386 */
  isValid(): boolean {
    return _IsCollectionBindingRel(this._bindingRel) && this._materialPath !== ''
  }
}

/** materialBindingAPI.cpp:303-311 IsCollectionBindingRel */
function _IsCollectionBindingRel(bindingRel: _Rel): boolean {
  return bindingRel.name.startsWith(`${_materialBinding}:${_collection}`)
}

/** materialBindingAPI.cpp:242-260 GetCollectionBindingRels */
function _GetCollectionBindingRels(prim: UsdPrim, materialPurpose: string): _Rel[] {
  // UsdPrim::GetAuthoredPropertiesInNamespace
  const ns = _GetCollectionBindingRelName('', materialPurpose)
  const collectionBindingProperties = prim.getAuthoredPropertyNames(
    name => name.length > ns.length && name.startsWith(ns) && name[ns.length] === ':')

  const result: _Rel[] = []
  for (const propName of collectionBindingProperties) {
    const rel = _GetRelationship(prim, propName)
    if (rel) {
      if (_GetMaterialPurpose(rel.name) === materialPurpose) {
        result.push(rel)
      }
    }
  }
  return result
}

/** materialBindingAPI.cpp:313-335 GetCollectionBindings */
function _GetCollectionBindings(prim: UsdPrim, materialPurpose: string): _CollectionBinding[] {
  const collectionBindingRels = _GetCollectionBindingRels(prim, materialPurpose)

  const result: _CollectionBinding[] = []
  for (const collBindingRel of collectionBindingRels) {
    const binding = new _CollectionBinding(collBindingRel)
    // If both the collection and the material are valid, keep them in
    // the result.
    if (binding.isValid()) {
      result.push(binding)
    }
  }
  return result
}

/** materialBindingAPI.cpp:359-374 GetMaterialBindingStrength */
function _GetMaterialBindingStrength(bindingRel: _Rel): string {
  const bindingStrength = bindingRel.getMetadata('bindMaterialAs')
  // Default binding strength is weakerThanDescendants, as bindings authored
  // on a prim are considered to be stronger than those authored on an
  // ancestor, unless the ancestor binding overrides the binding strength to
  // strongerThanDescendants.
  return typeof bindingStrength === 'string' && bindingStrength !== ''
    ? bindingStrength : _weakerThanDescendants
}

/** materialBindingAPI.cpp:676-681 GetMaterialPurposes */
function _GetMaterialPurposes(): string[] {
  return ['', 'preview', 'full']
}

// ----------------------------------------------------------------------------

/** HdRetainedTypedSampledDataSource<SdfPath>::New */
function _PathDs(path: string): HdRetainedTypedSampledDataSource<string> {
  return new HdRetainedTypedSampledDataSource(path, _SdfPathType)
}

/** HdRetainedTypedSampledDataSource<TfToken>::New */
function _TokenDs(token: string): HdRetainedTypedSampledDataSource<string> {
  return new HdRetainedTypedSampledDataSource(token, VtValueTypes.token)
}

/** materialBindingAPIAdapter.cpp:36-80 */
function _BuildCollectionBindingsVectorDataSource(
  prim: UsdPrim, purpose: string,
): HdDataSourceBase | undefined {
  const bindings = _GetCollectionBindings(prim, purpose)
  if (bindings.length === 0) {
    return undefined
  }

  const bindingsDs: HdDataSourceBase[] = []
  for (const binding of bindings) {
    if (binding.isValid()) {
      const b = binding
      const collectionPath = SdfPath.fromString(b.getCollectionPath())
      const collectionName = SdfPath.stripPrefixNamespace(
        collectionPath.name, _collection)[0]

      bindingsDs.push(
        new UsdImagingCollectionMaterialBindingSchema.Builder()
          .setCollectionPrimPath(_PathDs(collectionPath.getPrimPath().pathString))
          .setCollectionName(_TokenDs(collectionName))
          .setMaterialPath(_PathDs(b.getMaterialPath()))
          .setBindingStrength(_TokenDs(_GetMaterialBindingStrength(b.getBindingRel())))
          .build())
    }
  }

  return HdRetainedSmallVectorDataSource.new(bindingsDs)
}

/** materialBindingAPIAdapter.cpp:82-104 */
function _BuildDirectMaterialBindingDataSource(
  prim: UsdPrim, purpose: string,
): HdDataSourceBase | undefined {
  const bindingRel = _GetDirectBindingRel(prim, purpose)
  if (!bindingRel) {
    return undefined
  }
  const db = new _DirectBinding(bindingRel)
  if (!db.isBound()) {
    return undefined
  }

  return new UsdImagingDirectMaterialBindingSchema.Builder()
    .setMaterialPath(_PathDs(db.getMaterialPath()))
    .setBindingStrength(_TokenDs(_GetMaterialBindingStrength(bindingRel)))
    .build()
}

/** materialBindingAPIAdapter.cpp:106-140 */
class _MaterialBindingContainerDataSource extends HdContainerDataSource {
  constructor(private readonly _mbApi: UsdPrim, private readonly _purpose: string) { super() }

  static new(mbApi: UsdPrim, purpose: string): _MaterialBindingContainerDataSource {
    return new _MaterialBindingContainerDataSource(mbApi, purpose)
  }

  getNames(): string[] {
    return [
      UsdImagingMaterialBindingSchemaTokens.directMaterialBinding,
      UsdImagingMaterialBindingSchemaTokens.collectionMaterialBindings,
    ]
  }

  Get(name: string): HdDataSourceBase | undefined {
    if (name === UsdImagingMaterialBindingSchemaTokens.directMaterialBinding) {
      return _BuildDirectMaterialBindingDataSource(this._mbApi, this._purpose)
    }
    if (name === UsdImagingMaterialBindingSchemaTokens.collectionMaterialBindings) {
      return _BuildCollectionBindingsVectorDataSource(this._mbApi, this._purpose)
    }
    return undefined
  }
}

/** materialBindingAPIAdapter.cpp:142-158 */
function _BuildMaterialBindingVectorDataSource(
  mbApi: UsdPrim, purpose: string,
): HdVectorDataSource | undefined {
  if (!_GetDirectBinding(mbApi, purpose).isBound() &&
      _GetCollectionBindings(mbApi, purpose).length === 0) {
    return undefined
  }

  const srcs: HdDataSourceBase[] = [
    _MaterialBindingContainerDataSource.new(mbApi, purpose),
  ]

  return HdRetainedSmallVectorDataSource.new(srcs)
}

/** materialBindingAPIAdapter.cpp:160-184 */
class _MaterialBindingsContainerDataSource extends HdContainerDataSource {
  constructor(private readonly _mbApi: UsdPrim) { super() }

  static new(mbApi: UsdPrim): _MaterialBindingsContainerDataSource {
    return new _MaterialBindingsContainerDataSource(mbApi)
  }

  getNames(): string[] {
    // XXX This returns all the possible values for material purpose
    //     instead of just the ones for which material bindings are
    //     authored on the prim.
    return _GetMaterialPurposes()
  }

  Get(name: string): HdDataSourceBase | undefined {
    const purpose = name
    return _BuildMaterialBindingVectorDataSource(this._mbApi, purpose)
  }
}

// ----------------------------------------------------------------------------

/** materialBindingAPIAdapter.h:16-34 */
export class UsdImagingMaterialBindingAPIAdapter extends UsdImagingAPISchemaAdapter {
  /** materialBindingAPIAdapter.cpp:190-204 */
  override getImagingSubprimData(
    prim: UsdPrim, subprim: string, appliedInstanceName: string,
    _stageGlobals: UsdImagingDataSourceStageGlobals,
  ): HdContainerDataSource | undefined {
    if (subprim !== '' || appliedInstanceName !== '') {
      return undefined
    }

    return HdRetainedContainerDataSource.new(
      [UsdImagingMaterialBindingsSchema.getSchemaToken()],
      [_MaterialBindingsContainerDataSource.new(prim)])
  }

  /** materialBindingAPIAdapter.cpp:206-259 */
  override invalidateImagingSubprim(
    _prim: UsdPrim, subprim: string, appliedInstanceName: string,
    properties: readonly string[], _invalidationType: UsdImagingPropertyInvalidationType,
  ): HdDataSourceLocatorSet {
    // QUESTION: We aren't ourselves creating any subprims but do we need to
    //           contribute to them?
    if (subprim !== '' || appliedInstanceName !== '') {
      return new HdDataSourceLocatorSet()
    }

    const usdMatBindingsLocator = UsdImagingMaterialBindingsSchema.getDefaultLocator()

    for (const propertyName of properties) {
      // Edits to the binding path or strength or collection requires
      // reevaluation of the resolved binding.
      // We could be more specific here by checking if the binding is
      // for a purpose. For now, conservatively invalidate bindings for
      // all purposes.
      //
      if (propertyName.startsWith(_materialBindingCollection)) {
        return new HdDataSourceLocatorSet(usdMatBindingsLocator)
      }

      if (propertyName.startsWith(_materialBinding)) {
        return new HdDataSourceLocatorSet(usdMatBindingsLocator)
      }

      // Edits to a collection authored on the prim may require reevaluation
      // of the resolved binding because the membership may have changed.
      // Conservatively invalidate the material bindings data
      // source on this prim triggering invalidation for all purposes on
      // the prim and its descendants due to flattening.
      // We can certainly improve this by moving invalidation
      // to a scene index and tracking collections referenced by material
      // bindings if this simple approach becomes a bottleneck.
      //
      if (propertyName.startsWith(_collection)) {
        return new HdDataSourceLocatorSet(usdMatBindingsLocator)
      }
    }

    return new HdDataSourceLocatorSet()
  }
}
