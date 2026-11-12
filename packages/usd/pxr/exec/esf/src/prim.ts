// Ported from OpenUSD 26.11.1: pxr/exec/esf/prim.cpp, pxr/exec/esf/prim.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/prim.h and prim.cpp.
//
// Prim abstraction for scene adapter implementations (prim.h:24-33). The
// abstraction closely resembles the read-only interface of UsdPrim. The
// public methods are called by the exec network compiler; each takes an
// EsfJournal (or null) which captures the conditions for recompilation.

import type { Type as TfType } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { EsfEditReason } from './editReason.ts'
import { EsfFixedSizePolymorphicHolder } from './fixedSizePolymorphicHolder.ts'
import type { EsfJournal } from './journal.ts'
import { EsfObjectInterface } from './object.ts'
import type { EsfAttribute } from './attribute.ts'
import type { EsfRelationship } from './relationship.ts'

export abstract class EsfPrimInterface extends EsfObjectInterface {
  /** This constructor may only be called by the scene adapter implementation
   *  (prim.h:61-62). */
  protected constructor(path: SdfPath) {
    super(path)
  }

  /** \see UsdPrim::GetAppliedSchemas (prim.cpp:19-26). */
  getAppliedSchemas(journal: EsfJournal | null): readonly string[] {
    if (journal) {
      journal.add(this._getPath(), EsfEditReason.ResyncedObject)
    }
    return this._getAppliedSchemas()
  }

  /** \see UsdPrim::GetAttribute (prim.cpp:28-39). */
  getAttribute(attributeName: string, journal: EsfJournal | null): EsfAttribute {
    if (journal) {
      journal.add(
        this._getPath().appendProperty(attributeName),
        EsfEditReason.ResyncedObject)
    }
    return this._getAttribute(attributeName)
  }

  /** \see UsdPrim::GetRelationship (prim.cpp:41-52). */
  getRelationship(relationshipName: string, journal: EsfJournal | null): EsfRelationship {
    if (journal) {
      journal.add(
        this._getPath().appendProperty(relationshipName),
        EsfEditReason.ResyncedObject)
    }
    return this._getRelationship(relationshipName)
  }

  /** \see UsdPrim::GetParent (prim.cpp:54-61). */
  getParent(journal: EsfJournal | null): EsfPrim {
    if (journal) {
      journal.add(this._getPath(), EsfEditReason.ResyncedObject)
    }
    return this._getParent()
  }

  /** \see UsdPrim::GetPrimTypeInfo and UsdPrimTypeInfo::GetSchemaType
   *  (prim.cpp:63-70). */
  getType(journal: EsfJournal | null): TfType {
    if (journal) {
      journal.add(this._getPath(), EsfEditReason.ResyncedObject)
    }
    return this._getType()
  }

  /** \see UsdPrim::IsPseudoRoot */
  abstract isPseudoRoot(): boolean

  // These methods must be implemented by the scene adapter implementation
  // (prim.h:64-72).
  protected abstract _getAppliedSchemas(): readonly string[]
  protected abstract _getAttribute(attributeName: string): EsfAttribute
  protected abstract _getParent(): EsfPrim
  protected abstract _getRelationship(relationshipName: string): EsfRelationship
  protected abstract _getType(): TfType
}

/**
 * Holds an implementation of EsfPrimInterface (prim.h:75-87). Upstream
 * reserves a 48-byte buffer, large enough for an implementation that wraps a
 * UsdPrim.
 */
export class EsfPrim extends EsfFixedSizePolymorphicHolder<EsfPrimInterface> {}
