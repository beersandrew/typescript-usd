// Ported from OpenUSD 26.11.1: pxr/exec/esfUsd/attribute.cpp,
//  pxr/exec/esfUsd/attribute.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/attribute.h and attribute.cpp.
//
// Implementation of EsfAttributeInterface that wraps a UsdAttribute
// (attribute.h:22-46; EsfUsd_PropertyImpl<EsfAttributeInterface,
// UsdAttribute>, see object.ts and property.ts).

import type { Type as TfType } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import type { Value as VtValue } from 'typescript-usd/vt'
import type { EsfAttribute } from 'typescript-usd/esf'
import type { EsfObject } from 'typescript-usd/esf'
import type { EsfPrim } from 'typescript-usd/esf'
import type { EsfRelationship } from 'typescript-usd/esf'
import type { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfStage } from 'typescript-usd/esf'
import { findValueTypeName, type ValueTypeName as SdfValueTypeName } from 'typescript-usd/sdf'
import { AttributeQuery as UsdAttributeQuery, type Attribute as UsdAttribute } from 'typescript-usd/usd'
import { EsfAttributeInterface } from 'typescript-usd/esf'
import { EsfAttributeQuery } from 'typescript-usd/esf'
import { EsfUsd_AttributeQuery } from './attributeQuery.ts'
import { EsfUsd_ObjectImpl, _EsfUsdGetPath, _EsfUsdGetStage } from './object.ts'
import { EsfUsd_PropertyImpl } from './property.ts'
import { EsfUsdStageData } from './stageData.ts'

export class EsfUsd_Attribute extends EsfAttributeInterface {
  // The wrapped native usd object (object.h:96-97).
  private readonly _object: UsdAttribute | undefined

  /** Copies the provided \p attribute into this instance (attribute.h:28-37). */
  constructor(object: UsdAttribute | undefined) {
    super(_EsfUsdGetPath(object))
    this._object = object
  }

  /** Accessor to the wrapped object (object.h:81-87). */
  _getWrapped(): UsdAttribute | undefined {
    return this._object
  }

  // Copy and move construction (fixedSizePolymorphicHolder.h:226-238).
  override _copyTo(): EsfUsd_Attribute {
    return new EsfUsd_Attribute(this._object)
  }

  override _moveTo(): EsfUsd_Attribute {
    return new EsfUsd_Attribute(this._object)
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

  // EsfAttributeInterface implementation.

  // attribute.cpp:24-28: UsdAttribute::GetTypeName. An attribute without a
  // type has the empty SdfValueTypeName (undefined).
  protected _getValueTypeName(): SdfValueTypeName | undefined {
    const attribute = this._object
    return attribute === undefined ? undefined : findValueTypeName(attribute.typeName)
  }

  // attribute.cpp:30-37
  protected _getQuery(): EsfAttributeQuery {
    return new EsfAttributeQuery(
      EsfUsd_AttributeQuery,
      new UsdAttributeQuery(this._object))
  }

  // attribute.cpp:39-44
  protected _getConnections(): SdfPath[] {
    return EsfUsdStageData.getOutgoingConnections(
      _EsfUsdGetStage(this._object), _EsfUsdGetPath(this._object))
  }
}
