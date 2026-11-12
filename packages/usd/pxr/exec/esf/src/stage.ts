// Ported from OpenUSD 26.11.1: pxr/exec/esf/stage.cpp, pxr/exec/esf/stage.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/stage.h and stage.cpp.
//
// Stage abstraction for scene adapter implementations (stage.h:31-42). The
// abstraction closely resembles the read-only interface of UsdStage. The
// public methods are called by the exec network compiler; each takes an
// EsfJournal (or null) which captures the conditions for recompilation.
//
// EsfStage is the EsfFixedSizePolymorphicHolder of an EsfStageInterface
// implementation (stage.h:101-112).

import type { Type as TfType } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { EsfEditReason } from './editReason.ts'
import {
  EsfFixedSizePolymorphicBase, EsfFixedSizePolymorphicHolder,
} from './fixedSizePolymorphicHolder.ts'
import type { EsfJournal } from './journal.ts'
import type { EsfAttribute } from './attribute.ts'
import type { EsfObject } from './object.ts'
import type { EsfPrim } from './prim.ts'
import type { EsfProperty } from './property.ts'
import type { EsfRelationship } from './relationship.ts'

export abstract class EsfStageInterface extends EsfFixedSizePolymorphicBase {
  /** \see UsdStage::GetAttributeAtPath (stage.cpp:21-30). */
  getAttributeAtPath(path: SdfPath, journal: EsfJournal | null): EsfAttribute {
    if (journal) {
      journal.add(path, EsfEditReason.ResyncedObject)
    }
    return this._getAttributeAtPath(path)
  }

  /** \see UsdStage::GetObjectAtPath (stage.cpp:32-41). */
  getObjectAtPath(path: SdfPath, journal: EsfJournal | null): EsfObject {
    if (journal) {
      journal.add(path, EsfEditReason.ResyncedObject)
    }
    return this._getObjectAtPath(path)
  }

  /** \see UsdStage::GetPrimAtPath (stage.cpp:43-52). */
  getPrimAtPath(path: SdfPath, journal: EsfJournal | null): EsfPrim {
    if (journal) {
      journal.add(path, EsfEditReason.ResyncedObject)
    }
    return this._getPrimAtPath(path)
  }

  /** \see UsdStage::GetPropertyAtPath (stage.cpp:54-63). */
  getPropertyAtPath(path: SdfPath, journal: EsfJournal | null): EsfProperty {
    if (journal) {
      journal.add(path, EsfEditReason.ResyncedObject)
    }
    return this._getPropertyAtPath(path)
  }

  /** \see UsdStage::GetRelationshipAtPath (stage.cpp:65-74). */
  getRelationshipAtPath(path: SdfPath, journal: EsfJournal | null): EsfRelationship {
    if (journal) {
      journal.add(path, EsfEditReason.ResyncedObject)
    }
    return this._getRelationshipAtPath(path)
  }

  /** \see UsdSchemaRegistry::GetTypeNameAndInstance (stage.h:71-75):
   *  std::pair<TfToken, TfToken> is a [typeName, instanceName] tuple. */
  getTypeNameAndInstance(apiSchemaName: string): [string, string] {
    return this._getTypeNameAndInstance(apiSchemaName)
  }

  /** \see UsdSchemaRegistry::GetAPITypeFromSchemaTypeName (stage.h:77-81). */
  getAPITypeFromSchemaTypeName(schemaTypeName: string): TfType {
    return this._getAPITypeFromSchemaTypeName(schemaTypeName)
  }

  // These methods must be implemented by the scene adapter implementation
  // (stage.h:84-98).
  protected abstract _getAttributeAtPath(path: SdfPath): EsfAttribute
  protected abstract _getObjectAtPath(path: SdfPath): EsfObject
  protected abstract _getPrimAtPath(path: SdfPath): EsfPrim
  protected abstract _getPropertyAtPath(path: SdfPath): EsfProperty
  protected abstract _getRelationshipAtPath(path: SdfPath): EsfRelationship
  protected abstract _getTypeNameAndInstance(apiSchemaName: string): [string, string]
  protected abstract _getAPITypeFromSchemaTypeName(schemaTypeName: string): TfType
}

/**
 * Holds an implementation of EsfStageInterface (stage.h:101-112). Upstream
 * reserves a 16-byte buffer, large enough for an implementation that wraps a
 * UsdStageConstRefPtr.
 */
export class EsfStage extends EsfFixedSizePolymorphicHolder<EsfStageInterface> {}
