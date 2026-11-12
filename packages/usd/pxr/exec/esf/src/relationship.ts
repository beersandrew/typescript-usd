// Ported from OpenUSD 26.11.1: pxr/exec/esf/relationship.cpp,
//  pxr/exec/esf/relationship.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/relationship.h and relationship.cpp.
//
// Relationship abstraction for scene adapter implementations
// (relationship.h:20-29). The abstraction closely resembles the read-only
// interface of UsdRelationship.

import type { SdfPath } from 'typescript-usd/sdf/path'
import { EsfEditReason } from './editReason.ts'
import { EsfFixedSizePolymorphicHolder } from './fixedSizePolymorphicHolder.ts'
import type { EsfJournal } from './journal.ts'
import { EsfPropertyInterface } from './property.ts'
import type { EsfStageInterface } from './stage.ts'

export abstract class EsfRelationshipInterface extends EsfPropertyInterface {
  /** This constructor may only be called by the scene adapter implementation
   *  (relationship.h:41-42). */
  protected constructor(path: SdfPath) {
    super(path)
  }

  /** \see UsdRelationship::GetTargets (relationship.cpp:18-28). */
  getTargets(journal: EsfJournal | null): SdfPath[] {
    if (journal) {
      journal.add(
        this._getPath(),
        EsfEditReason.ResyncedObject.or(EsfEditReason.ChangedTargetPaths))
    }
    return this._getTargets()
  }

  /** \see UsdRelationship::GetForwardedTargets (relationship.cpp:74-88). */
  getForwardedTargets(journal: EsfJournal | null): SdfPath[] {
    const targets: SdfPath[] = []
    // SdfPathSet visitedRels, uniqueTargets, keyed by SdfPath.pathString.
    const visitedRels = new Set<string>()
    const uniqueTargets = new Set<string>()
    _GetForwardedTargetsImpl(
      this,
      this._getStage().Get(),
      visitedRels,
      uniqueTargets,
      targets,
      journal)
    return targets
  }

  // These methods must be implemented by the scene adapter implementation
  // (relationship.h:44-46).
  protected abstract _getTargets(): SdfPath[]
}

// relationship.cpp:30-72
function _GetForwardedTargetsImpl(
  relationship: EsfRelationshipInterface,
  stage: EsfStageInterface,
  visitedRels: Set<string>,
  uniqueTargets: Set<string>,
  result: SdfPath[],
  journal: EsfJournal | null,
): void {
  const targets = relationship.getTargets(journal)
  if (targets.length === 0) {
    return
  }
  for (const target of targets) {
    if (target.isPrimPropertyPath()) {
      // Resolve forwarding if this target points at a relationship.
      const rel = stage.getRelationshipAtPath(target, journal)
      if (rel.Get().isValid(journal)) {
        // Skip if we already saw this relationship.
        const relPath = rel.Get().getPath(journal).pathString
        const inserted = !visitedRels.has(relPath)
        if (inserted) {
          visitedRels.add(relPath)
          _GetForwardedTargetsImpl(
            rel.Get(), stage,
            visitedRels, uniqueTargets, result,
            journal)
        }
        // We don't include relationships in the forwarded targeted objects.
        continue
      }
    }
    const inserted = !uniqueTargets.has(target.pathString)
    if (inserted) {
      uniqueTargets.add(target.pathString)
      result.push(target)
    }
  }
}

/**
 * Holds an implementation of EsfRelationshipInterface
 * (relationship.h:49-62). Upstream reserves a 48-byte buffer, large enough
 * for an implementation that wraps a UsdRelationship.
 */
export class EsfRelationship
  extends EsfFixedSizePolymorphicHolder<EsfRelationshipInterface> {}
