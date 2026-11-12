// Ported from OpenUSD 26.11.1: pxr/exec/esf/attribute.cpp,
//  pxr/exec/esf/attribute.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/attribute.h and attribute.cpp.
//
// Attribute abstraction for scene adapter implementations
// (attribute.h:23-32). The abstraction closely resembles the read-only
// interface of UsdAttribute.
//
// SdfValueTypeName is the typescript-usd/sdf ValueTypeName record; upstream's
// empty SdfValueTypeName() (an invalid attribute's type) is `undefined`.

import type { SdfPath } from 'typescript-usd/sdf/path'
import type { ValueTypeName as SdfValueTypeName } from 'typescript-usd/sdf'
import { EsfEditReason } from './editReason.ts'
import { EsfFixedSizePolymorphicHolder } from './fixedSizePolymorphicHolder.ts'
import type { EsfAttributeQuery } from './attributeQuery.ts'
import type { EsfJournal } from './journal.ts'
import { EsfPropertyInterface } from './property.ts'

export abstract class EsfAttributeInterface extends EsfPropertyInterface {
  /** This constructor may only be called by the scene adapter implementation
   *  (attribute.h:49-50). */
  protected constructor(path: SdfPath) {
    super(path)
  }

  /** \see UsdAttribute::GetValueTypeName (attribute.cpp:17-24). */
  GetValueTypeName(journal: EsfJournal | null): SdfValueTypeName | undefined {
    if (journal) {
      journal.add(this._getPath(), EsfEditReason.ResyncedObject)
    }
    return this._getValueTypeName()
  }

  /** Returns an object for caching and querying value resolution
   *  information (attribute.cpp:26-30). \see UsdAttributeQuery */
  getQuery(): EsfAttributeQuery {
    return this._getQuery()
  }

  /** \see UsdAttribute::GetConnections (attribute.cpp:32-41). */
  getConnections(journal: EsfJournal | null): SdfPath[] {
    if (journal) {
      journal.add(
        this._getPath(),
        EsfEditReason.ResyncedObject.or(EsfEditReason.ChangedConnectionPaths))
    }
    return this._getConnections()
  }

  // These methods must be implemented by the scene adapter implementation
  // (attribute.h:52-56).
  protected abstract _getValueTypeName(): SdfValueTypeName | undefined
  protected abstract _getQuery(): EsfAttributeQuery
  protected abstract _getConnections(): SdfPath[]
}

/**
 * Holds an implementation of EsfAttributeInterface (attribute.h:59-71).
 * Upstream reserves a 48-byte buffer, large enough for an implementation that
 * wraps a UsdAttribute.
 */
export class EsfAttribute extends EsfFixedSizePolymorphicHolder<EsfAttributeInterface> {}
