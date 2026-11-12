// Ported from OpenUSD 26.11.1: pxr/exec/esfUsd/prim.cpp,
//  pxr/exec/esfUsd/prim.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/prim.h and prim.cpp.
//
// Implementation of EsfPrimInterface that wraps a UsdPrim (prim.h:20-41;
// EsfUsd_ObjectImpl<EsfPrimInterface, UsdPrim>, see object.ts).

import { TF_FATAL_ERROR, type Type as TfType } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import type { Value as VtValue } from 'typescript-usd/vt'
import { EsfAttribute } from 'typescript-usd/esf'
import type { EsfObject } from 'typescript-usd/esf'
import { EsfPrim, EsfPrimInterface } from 'typescript-usd/esf'
import { EsfRelationship } from 'typescript-usd/esf'
import type { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfStage } from 'typescript-usd/esf'
import type { Prim as UsdPrim } from 'typescript-usd/usd'
import { EsfUsd_Attribute } from './attribute.ts'
import { EsfUsd_ObjectImpl, _EsfUsdGetPath } from './object.ts'
import { EsfUsd_Relationship } from './relationship.ts'

// UsdPrim methods that dereference the prim data (an invalid prim has none).
function _ValidPrim(prim: UsdPrim | undefined, method: string): UsdPrim {
  if (prim === undefined) {
    TF_FATAL_ERROR(`UsdPrim::${method} called on an invalid prim`)
  }
  return prim
}

export class EsfUsd_Prim extends EsfPrimInterface {
  // The wrapped native usd object (object.h:96-97).
  private readonly _object: UsdPrim | undefined

  /** Copies the provided \p prim into this instance (prim.h:26-32). */
  constructor(object: UsdPrim | undefined) {
    super(_EsfUsdGetPath(object))
    this._object = object
  }

  /** Accessor to the wrapped object (object.h:81-87). */
  _getWrapped(): UsdPrim | undefined {
    return this._object
  }

  // Copy and move construction (fixedSizePolymorphicHolder.h:226-238).
  override _copyTo(): EsfUsd_Prim {
    return new EsfUsd_Prim(this._object)
  }

  override _moveTo(): EsfUsd_Prim {
    return new EsfUsd_Prim(this._object)
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

  // EsfPrimInterface implementation.

  // prim.cpp:23-27: UsdPrim::GetAppliedSchemas.
  protected _getAppliedSchemas(): readonly string[] {
    return _ValidPrim(this._object, 'GetAppliedSchemas').getAppliedSchemas()
  }

  // prim.cpp:29-36: UsdPrim::GetAttribute (typescript-usd's Prim.getAttr).
  protected _getAttribute(attributeName: string): EsfAttribute {
    return new EsfAttribute(EsfUsd_Attribute, this._object?.getAttr(attributeName))
  }

  // prim.cpp:38-42: UsdPrim::GetParent.
  protected _getParent(): EsfPrim {
    return new EsfPrim(EsfUsd_Prim, this._object?.getParent())
  }

  // prim.cpp:44-51: UsdPrim::GetRelationship (typescript-usd's Prim.rel).
  protected _getRelationship(relationshipName: string): EsfRelationship {
    return new EsfRelationship(EsfUsd_Relationship, this._object?.rel(relationshipName))
  }

  // prim.cpp:53-57: UsdPrim::GetPrimTypeInfo().GetSchemaType().
  protected _getType(): TfType {
    return _ValidPrim(this._object, 'GetPrimTypeInfo').getPrimTypeInfo().getSchemaType()
  }

  // prim.cpp:59-63: UsdPrim::IsPseudoRoot.
  isPseudoRoot(): boolean {
    return this._object !== undefined && this._object.isPseudoRoot()
  }
}
