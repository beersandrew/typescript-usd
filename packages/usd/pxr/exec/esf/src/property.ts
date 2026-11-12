// Ported from OpenUSD 26.11.1: pxr/exec/esf/property.cpp,
//  pxr/exec/esf/property.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/property.h and property.cpp.
//
// Property abstraction for scene adapter implementations (property.h:20-29).
// The abstraction closely resembles the read-only interface of UsdProperty.

import type { SdfPath } from 'typescript-usd/sdf/path'
import { EsfEditReason } from './editReason.ts'
import { EsfFixedSizePolymorphicHolder } from './fixedSizePolymorphicHolder.ts'
import type { EsfJournal } from './journal.ts'
import { EsfObjectInterface } from './object.ts'

export abstract class EsfPropertyInterface extends EsfObjectInterface {
  /** This constructor may only be called by the scene adapter implementation
   *  (property.h:41-42). */
  protected constructor(path: SdfPath) {
    super(path)
  }

  /** \see UsdProperty::GetBaseName (property.cpp:16-23). */
  getBaseName(journal: EsfJournal | null): string {
    if (journal) {
      journal.add(this._getPath(), EsfEditReason.ResyncedObject)
    }
    return this._getBaseName()
  }

  /** \see UsdProperty::GetNamespace (property.cpp:25-32). */
  getNamespace(journal: EsfJournal | null): string {
    if (journal) {
      journal.add(this._getPath(), EsfEditReason.ResyncedObject)
    }
    return this._getNamespace()
  }

  // These methods must be implemented by the scene adapter implementation
  // (property.h:44-47).
  protected abstract _getBaseName(): string
  protected abstract _getNamespace(): string
}

/**
 * Holds an implementation of EsfPropertyInterface (property.h:50-63).
 * Upstream reserves a 48-byte buffer, large enough for an implementation that
 * wraps a UsdProperty.
 */
export class EsfProperty extends EsfFixedSizePolymorphicHolder<EsfPropertyInterface> {}
