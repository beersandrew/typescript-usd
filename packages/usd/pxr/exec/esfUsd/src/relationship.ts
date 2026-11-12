// Ported from OpenUSD 26.11.1: pxr/exec/esfUsd/relationship.cpp,
//  pxr/exec/esfUsd/relationship.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esfUsd/relationship.h and
// relationship.cpp.
//
// Implementation of EsfRelationshipInterface that wraps a UsdRelationship
// (relationship.h:20-40; EsfUsd_PropertyImpl<EsfRelationshipInterface,
// UsdRelationship>, see object.ts and property.ts).

import type { Type as TfType } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'
import type { Value as VtValue } from 'typescript-usd/vt'
import type { EsfAttribute } from 'typescript-usd/esf'
import type { EsfObject } from 'typescript-usd/esf'
import type { EsfPrim } from 'typescript-usd/esf'
import type { EsfRelationship } from 'typescript-usd/esf'
import type { EsfSchemaConfigKey } from 'typescript-usd/esf'
import type { EsfStage } from 'typescript-usd/esf'
import type { Rel as UsdRelationship } from 'typescript-usd/usd'
import { EsfRelationshipInterface } from 'typescript-usd/esf'
import { EsfUsd_ObjectImpl, _EsfUsdGetPath } from './object.ts'
import { EsfUsd_PropertyImpl } from './property.ts'

export class EsfUsd_Relationship extends EsfRelationshipInterface {
  // The wrapped native usd object (object.h:96-97).
  private readonly _object: UsdRelationship | undefined

  /** Copies the provided \p relationship into this instance (relationship.h:26-35). */
  constructor(object: UsdRelationship | undefined) {
    super(_EsfUsdGetPath(object))
    this._object = object
  }

  /** Accessor to the wrapped object (object.h:81-87). */
  _getWrapped(): UsdRelationship | undefined {
    return this._object
  }

  // Copy and move construction (fixedSizePolymorphicHolder.h:226-238).
  override _copyTo(): EsfUsd_Relationship {
    return new EsfUsd_Relationship(this._object)
  }

  override _moveTo(): EsfUsd_Relationship {
    return new EsfUsd_Relationship(this._object)
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

  // EsfRelationshipInterface implementation.

  // relationship.cpp:19-25: UsdRelationship::GetTargets. An invalid
  // relationship has no targets.
  protected _getTargets(): SdfPath[] {
    const relationship = this._object
    if (relationship === undefined) {
      return []
    }
    return relationship.getTargets().map(target => SdfPath.fromString(target))
  }
}
