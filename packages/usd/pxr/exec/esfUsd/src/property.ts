// Ported from OpenUSD 26.11.1: pxr/exec/esfUsd/property.cpp,
//  pxr/exec/esfUsd/property.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/property.h and property.cpp.
//
// EsfUsd_PropertyImpl<InterfaceType, UsdPropertyType> (property.h:20-53) is
// the common implementation of EsfPropertyInterface over a wrapped USD
// property. As for EsfUsd_ObjectImpl (object.ts), its method bodies are the
// functions of EsfUsd_PropertyImpl, which EsfUsd_Property, EsfUsd_Attribute
// and EsfUsd_Relationship forward to.

import type { Type as TfType } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import type { Value as VtValue } from 'typescript-usd/vt'
import type { EsfAttribute } from 'typescript-usd/esf'
import type { EsfObject } from 'typescript-usd/esf'
import type { EsfPrim } from 'typescript-usd/esf'
import type { EsfRelationship } from 'typescript-usd/esf'
import type { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfStage } from 'typescript-usd/esf'
import { EsfPropertyInterface } from 'typescript-usd/esf'
import { EsfUsd_ObjectImpl, _EsfUsdGetPath, type EsfUsd_UsdProperty } from './object.ts'

/** The template class EsfUsd_PropertyImpl (property.h:20-53,
 *  property.cpp:19-40). */
export const EsfUsd_PropertyImpl = {
  // property.cpp:23-28: UsdProperty::GetBaseName.
  _getBaseName(property: EsfUsd_UsdProperty): string {
    return property === undefined ? '' : property.getBaseName()
  },

  // property.cpp:30-35: UsdProperty::GetNamespace.
  _getNamespace(property: EsfUsd_UsdProperty): string {
    return property === undefined ? '' : property.getNamespace()
  },
}

/** Implementation of EsfPropertyInterface that wraps a UsdProperty
 *  (property.h:55-57: EsfUsd_PropertyImpl<EsfPropertyInterface,
 *  UsdProperty>). */
export class EsfUsd_Property extends EsfPropertyInterface {
  // The wrapped native usd object (object.h:96-97).
  private readonly _object: EsfUsd_UsdProperty

  /** Copies the provided property into this instance (property.h:31-37). */
  constructor(object: EsfUsd_UsdProperty) {
    super(_EsfUsdGetPath(object))
    this._object = object
  }

  /** Accessor to the wrapped object (object.h:81-87). */
  _getWrapped(): EsfUsd_UsdProperty {
    return this._object
  }

  // Copy and move construction (fixedSizePolymorphicHolder.h:226-238).
  override _copyTo(): EsfUsd_Property {
    return new EsfUsd_Property(this._object)
  }

  override _moveTo(): EsfUsd_Property {
    return new EsfUsd_Property(this._object)
  }

  // EsfObjectInterface implementation (EsfUsd_ObjectImpl, object.ts).
  protected _isValid(): boolean { return EsfUsd_ObjectImpl._isValid(this._object) }
  protected _getName(): string { return EsfUsd_ObjectImpl._getName(this._object) }
  protected _getPrim(): EsfPrim { return EsfUsd_ObjectImpl._getPrim(this._object) }
  protected _getStage(): EsfStage { return EsfUsd_ObjectImpl._getStage(this._object) }
  protected _getSchemaConfigKey(): EsfSchemaConfigKey {
    return EsfUsd_ObjectImpl._getSchemaConfigKey(this._object)
  }
  protected _isValidMetadataKey(key: string): boolean {
    return EsfUsd_ObjectImpl._isValidMetadataKey(this._object, key)
  }
  protected _getMetadata(key: string): VtValue {
    return EsfUsd_ObjectImpl._getMetadata(this._object, key)
  }
  protected _getMetadataValueType(key: string): TfType {
    return EsfUsd_ObjectImpl._getMetadataValueType(this._object, key)
  }
  protected _getIncomingConnections(): SdfPath[] {
    return EsfUsd_ObjectImpl._getIncomingConnections(this._object)
  }
  isPrim(): boolean { return EsfUsd_ObjectImpl.isPrim(this._object) }
  isAttribute(): boolean { return EsfUsd_ObjectImpl.isAttribute(this._object) }
  isRelationship(): boolean { return EsfUsd_ObjectImpl.isRelationship(this._object) }
  asObject(): EsfObject { return EsfUsd_ObjectImpl.asObject(this._object) }
  asPrim(): EsfPrim { return EsfUsd_ObjectImpl.asPrim(this._object) }
  asAttribute(): EsfAttribute { return EsfUsd_ObjectImpl.asAttribute(this._object) }
  asRelationship(): EsfRelationship { return EsfUsd_ObjectImpl.asRelationship(this._object) }

  // EsfPropertyInterface implementation (EsfUsd_PropertyImpl, property.ts).
  protected _getBaseName(): string { return EsfUsd_PropertyImpl._getBaseName(this._object) }
  protected _getNamespace(): string { return EsfUsd_PropertyImpl._getNamespace(this._object) }
}
