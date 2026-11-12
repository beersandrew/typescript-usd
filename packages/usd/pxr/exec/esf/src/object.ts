// Ported from OpenUSD 26.11.1: pxr/exec/esf/object.cpp, pxr/exec/esf/object.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/object.h and object.cpp.
//
// Scene object abstraction for scene adapter implementations
// (object.h:29-41). The abstraction closely resembles the read-only interface
// of UsdObject. The public methods are called by the exec network compiler;
// each takes an EsfJournal (or null) which captures the conditions for
// recompilation.
//
// Upstream's private pure virtuals (_IsValid, _GetName, ...; object.h:147-155)
// are protected abstract methods that the scene adapter implementation
// overrides. EsfObject is the EsfFixedSizePolymorphicHolder of an
// EsfObjectInterface implementation (object.h:158-170).

import type { Type as TfType } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import type { Value as VtValue } from 'typescript-usd/vt'
import { EsfEditReason } from './editReason.ts'
import {
  EsfFixedSizePolymorphicBase, EsfFixedSizePolymorphicHolder,
} from './fixedSizePolymorphicHolder.ts'
import type { EsfJournal } from './journal.ts'
import { EsfSchemaConfigKey } from './schemaConfigKey.ts'
import type { EsfAttribute } from './attribute.ts'
import type { EsfPrim } from './prim.ts'
import type { EsfRelationship } from './relationship.ts'
import type { EsfStage } from './stage.ts'

export abstract class EsfObjectInterface extends EsfFixedSizePolymorphicBase {
  // Object path that will be added to EsfJournals (object.h:144).
  private readonly _path: SdfPath

  /** This constructor may only be called by the scene adapter implementation
   *  (object.h:130-131). */
  protected constructor(path: SdfPath) {
    super()
    this._path = path
  }

  /**
   * Returns true if the object is valid, active, loaded, defined, and
   * non-abstract (object.cpp:24-38).
   * \see UsdObject::IsValid, UsdPrimDefaultPredicate
   */
  isValid(journal: EsfJournal | null): boolean {
    // If the path is empty, the object is invalid, but we don't want to
    // journal for the empty path;
    const path = this._getPath()
    if (path.isEmpty()) {
      return false
    }

    if (journal) {
      journal.add(path, EsfEditReason.ResyncedObject)
    }
    return this._isValid()
  }

  /** \see UsdObject::GetPath (object.cpp:40-47). */
  getPath(journal: EsfJournal | null): SdfPath {
    if (journal) {
      journal.add(this._getPath(), EsfEditReason.ResyncedObject)
    }
    return this._path
  }

  /** \see UsdObject::GetName (object.cpp:49-56). */
  getName(journal: EsfJournal | null): string {
    if (journal) {
      journal.add(this._getPath(), EsfEditReason.ResyncedObject)
    }
    return this._getName()
  }

  /** \see UsdObject::GetPrim (object.cpp:58-65). */
  getPrim(journal: EsfJournal | null): EsfPrim {
    if (journal) {
      journal.add(this._getPath().getPrimPath(), EsfEditReason.ResyncedObject)
    }
    return this._getPrim()
  }

  /** Returns the paths of all attributes that have connections that target
   *  the object (object.cpp:67-77). */
  getIncomingConnections(journal: EsfJournal | null): SdfPath[] {
    if (journal) {
      journal.add(
        this._getPath(),
        EsfEditReason.ResyncedObject.or(
          EsfEditReason.ChangedIncomingConnections))
    }
    return this._getIncomingConnections()
  }

  /** \see UsdObject::GetStage (object.h:69-72). */
  getStage(): EsfStage {
    return this._getStage()
  }

  /**
   * Returns an opaque value that is guaranteed to be unique and stable. Any
   * prims that have the same typed schema and the same list of applied
   * schemas will have the same schema config key (object.cpp:79-93).
   */
  getSchemaConfigKey(journal: EsfJournal | null): EsfSchemaConfigKey {
    // We need to handle the pseudo-root specially, to avoid journaling for
    // the empty path.
    if (this._getPath().isAbsoluteRootPath()) {
      return new EsfSchemaConfigKey()
    }

    if (journal) {
      journal.add(this._getPath().getPrimPath(), EsfEditReason.ResyncedObject)
    }
    return this._getSchemaConfigKey()
  }

  /// \name Metadata

  /** Returns the value of the metadata field indicated by \p key. Emits an
   *  error if \p key is not a valid metadata key (object.cpp:95-100). */
  getMetadata(key: string): VtValue {
    return this._getMetadata(key)
  }

  /** Returns true if the field indicated by \p key is a valid metadata field
   *  for this object (object.cpp:102-107). */
  isValidMetadataKey(key: string): boolean {
    return this._isValidMetadataKey(key)
  }

  /** Returns the value type for the indicated \p key. Emits an error if
   *  \p key is not a valid metadata key (object.cpp:109-114). */
  getMetadataValueType(key: string): TfType {
    return this._getMetadataValueType(key)
  }

  /** \see UsdObject::Is */
  abstract isPrim(): boolean

  /** \see UsdObject::Is */
  abstract isAttribute(): boolean

  /** \see UsdObject::Is */
  abstract isRelationship(): boolean

  /** \see UsdObject::As */
  abstract asObject(): EsfObject

  /** \see UsdObject::As */
  abstract asAttribute(): EsfAttribute

  /** \see UsdObject::As */
  abstract asRelationship(): EsfRelationship

  /** \see UsdObject::As */
  abstract asPrim(): EsfPrim

  /** Gets the path to this object used for journaling (object.h:133-134). */
  protected _getPath(): SdfPath {
    return this._path
  }

  protected abstract _getStage(): EsfStage

  /** object.h:138-140 */
  protected static createSchemaConfigKey(id: object | null): EsfSchemaConfigKey {
    return EsfSchemaConfigKey._create(id)
  }

  // These methods must be implemented by the scene adapter implementation
  // (object.h:146-155).
  protected abstract _isValid(): boolean
  protected abstract _getName(): string
  protected abstract _getPrim(): EsfPrim
  protected abstract _getIncomingConnections(): SdfPath[]
  protected abstract _getSchemaConfigKey(): EsfSchemaConfigKey
  protected abstract _getMetadata(key: string): VtValue
  protected abstract _isValidMetadataKey(key: string): boolean
  protected abstract _getMetadataValueType(key: string): TfType
}

/**
 * Holds an implementation of EsfObjectInterface (object.h:158-170). Upstream
 * reserves a 48-byte buffer, large enough for an implementation that wraps a
 * UsdObject.
 */
export class EsfObject extends EsfFixedSizePolymorphicHolder<EsfObjectInterface> {}
