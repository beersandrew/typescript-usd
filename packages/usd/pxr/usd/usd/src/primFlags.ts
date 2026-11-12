// Ported from OpenUSD 26.11.1: pxr/usd/usd/primFlags.cpp,
//  pxr/usd/usd/primFlags.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/usd/primFlags.h at OpenUSD v26.05.
//
// C++ overloads &, | and !. TypeScript exposes the same algebra as
// and(), or() and not(), since JavaScript operators are not overloadable.

import type { Prim } from './prim.ts'

export type UsdPrimPredicate = UsdPrimFlagsPredicate | ((prim: Prim) => boolean)

export class UsdPrimFlagsPredicate {
  constructor(
    private readonly _evaluate: (prim: Prim) => boolean = () => true,
    readonly includeInstanceProxies = false,
  ) {}

  evaluate(prim: Prim): boolean {
    if (!prim) throw new Error('Cannot evaluate a prim predicate on an invalid prim')
    return this._evaluate(prim)
  }

  and(other: UsdPrimPredicate): UsdPrimFlagsPredicate {
    const rhs = asPrimPredicate(other)
    return new UsdPrimFlagsPredicate(
      prim => this.evaluate(prim) && rhs.evaluate(prim),
      this.includeInstanceProxies || rhs.includeInstanceProxies,
    )
  }

  or(other: UsdPrimPredicate): UsdPrimFlagsPredicate {
    const rhs = asPrimPredicate(other)
    return new UsdPrimFlagsPredicate(
      prim => this.evaluate(prim) || rhs.evaluate(prim),
      this.includeInstanceProxies || rhs.includeInstanceProxies,
    )
  }

  not(): UsdPrimFlagsPredicate {
    return new UsdPrimFlagsPredicate(
      prim => !this.evaluate(prim), this.includeInstanceProxies)
  }

  traverseInstanceProxies(traverse = true): UsdPrimFlagsPredicate {
    return new UsdPrimFlagsPredicate(this._evaluate, traverse)
  }
}

export function asPrimPredicate(predicate: UsdPrimPredicate): UsdPrimFlagsPredicate {
  return predicate instanceof UsdPrimFlagsPredicate
    ? predicate
    : new UsdPrimFlagsPredicate(predicate)
}

const flag = (test: (prim: Prim) => boolean) => new UsdPrimFlagsPredicate(test)

export const PrimIsActive = flag(prim => prim.isActive)
export const PrimIsLoaded = flag(prim => prim.isLoaded)
export const PrimIsModel = flag(prim => prim.isModel())
export const PrimIsGroup = flag(prim => prim.isGroup())
export const PrimIsAbstract = flag(prim => prim.isAbstract)
export const PrimIsDefined = flag(prim => prim.isDefined)
export const PrimHasClassSpecifier = flag(prim => prim.hasClassSpecifier())
export const PrimHasDefiningSpecifier = flag(prim => prim.hasDefiningSpecifier())
export const PrimIsInstance = flag(prim => prim.isInstance())

export const PrimAllPrimsPredicate = new UsdPrimFlagsPredicate()
export const PrimDefaultPredicate = PrimIsActive
  .and(PrimIsDefined).and(PrimIsLoaded).and(PrimIsAbstract.not())

// Upstream spellings; the shorter aliases above predate this completed surface.
export const UsdPrimIsActive = PrimIsActive
export const UsdPrimIsLoaded = PrimIsLoaded
export const UsdPrimIsModel = PrimIsModel
export const UsdPrimIsGroup = PrimIsGroup
export const UsdPrimIsAbstract = PrimIsAbstract
export const UsdPrimIsDefined = PrimIsDefined
export const UsdPrimIsInstance = PrimIsInstance
export const UsdPrimHasClassSpecifier = PrimHasClassSpecifier
export const UsdPrimHasDefiningSpecifier = PrimHasDefiningSpecifier
export const UsdPrimAllPrimsPredicate = PrimAllPrimsPredicate
export const UsdPrimDefaultPredicate = PrimDefaultPredicate

export function TraverseInstanceProxies(
  predicate: UsdPrimPredicate = PrimDefaultPredicate,
): UsdPrimFlagsPredicate {
  return asPrimPredicate(predicate).traverseInstanceProxies()
}

export const UsdTraverseInstanceProxies = TraverseInstanceProxies
