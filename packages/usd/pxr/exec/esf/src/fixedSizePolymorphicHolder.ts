// Ported from OpenUSD 26.11.1: pxr/exec/esf/fixedSizePolymorphicHolder.cpp,
//  pxr/exec/esf/fixedSizePolymorphicHolder.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/fixedSizePolymorphicHolder.h and
// fixedSizePolymorphicHolder.cpp.
//
// EsfFixedSizePolymorphicHolder holds an instance of a class derived from
// Base, a polymorphic value with copy and move semantics. Upstream it is a
// storage trick: the derived instance is placement-new'ed into a fixed-size
// byte buffer inside the holder, so that scene objects (EsfPrim, EsfAttribute,
// ...) can be returned by value without heap allocation.
//
// This port keeps the holder's observable API (construction emplacing a
// Derived instance, copy and move construction and assignment, Get(), and the
// DERIVES_FROM_BASE compatibility check) and drops the storage layout: the
// holder references the held instance. Not ported, because they describe C++
// object layout and have no JS counterpart: the BufferSize template argument,
// Compatibility::FITS_IN_BUFFER, Compatibility::HAS_ALIGNMENT and
// Compatibility::HasBaseAtSameAddress (fixedSizePolymorphicHolder.h:154-177),
// and the destruction of the held instance (~EsfFixedSizePolymorphicHolder,
// :93-95, and the destroy step of the assignment operators): held instances
// are reclaimed by the garbage collector.
//
// Copy and move: upstream's _Holder<Derived> (fixedSizePolymorphicHolder.h:
// 211-240) implements the private virtuals _CopyTo and _MoveTo by invoking
// Derived's copy and move constructors. TypeScript cannot synthesize those
// constructors, so each concrete held type overrides _CopyTo and _MoveTo
// itself and returns the new instance that its copy or move constructor would
// have placed in the destination storage. The defaults keep upstream's
// verification failure (fixedSizePolymorphicHolder.cpp:15-30) and then throw:
// upstream would leave the destination storage uninitialized.
//
// Construction: `std::in_place_type<Derived>, args...` is
// `new Holder(Derived, ...args)`. Copy construction is `new Holder(other)`,
// move construction `Holder.MoveConstruct(other)`, copy assignment
// `Assign(other)` and move assignment `MoveAssign(other)`. `operator->` and
// `operator*` are Get().

import { TF_VERIFY } from 'typescript-usd/tf'

/** Base class of the types an EsfFixedSizePolymorphicHolder can hold
 *  (fixedSizePolymorphicHolder.h:26-55). */
export abstract class EsfFixedSizePolymorphicBase {
  /**
   * Copies this object to the storage of another holder: returns the copy
   * (fixedSizePolymorphicHolder.h:36-44, .cpp:15-22). Concrete held types
   * override this with their copy constructor.
   */
  _copyTo(): EsfFixedSizePolymorphicBase {
    TF_VERIFY(false, 'false',
      'Must not call default implementation of ' +
      'EsfFixedSizePolymorphicBase::_CopyTo')
    // Upstream leaves the destination storage uninitialized here.
    throw new Error(
      'EsfFixedSizePolymorphicBase::_CopyTo (fixedSizePolymorphicHolder.cpp:15)')
  }

  /**
   * Moves this object to the storage of another holder: returns the moved-to
   * instance (fixedSizePolymorphicHolder.h:46-54, .cpp:24-30). Concrete held
   * types override this with their move constructor; the moved-from object
   * stays in its holder.
   */
  _moveTo(): EsfFixedSizePolymorphicBase {
    TF_VERIFY(false, 'false',
      'Must not call default implementation of ' +
      'EsfFixedSizePolymorphicBase::_MoveTo')
    // Upstream leaves the destination storage uninitialized here.
    throw new Error(
      'EsfFixedSizePolymorphicBase::_MoveTo (fixedSizePolymorphicHolder.cpp:24)')
  }
}

/** A constructor of a type derived from Base (std::in_place_type<Derived>). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EsfDerivedTypeHint<Base> = new (...args: any[]) => Base

/** An abstract or concrete Base class, for the DERIVES_FROM_BASE check. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type _AnyClass = abstract new (...args: any[]) => unknown

export class EsfFixedSizePolymorphicHolder<
  Base extends EsfFixedSizePolymorphicBase,
> {
  // The held instance; upstream's _storage byte array
  // (fixedSizePolymorphicHolder.h:242-243).
  private _storage: Base

  /**
   * Construct a holder emplaced with a new \p Derived instance, forwarding
   * \p args to Derived's constructor (fixedSizePolymorphicHolder.h:64-75,
   * 246-265); or, given another holder, a holder containing a derived type
   * instance that is copy-constructed from the other holder's
   * (fixedSizePolymorphicHolder.h:77-82). The default constructor is deleted
   * because instances must always contain a derived object.
   */
  constructor(other: EsfFixedSizePolymorphicHolder<Base>)
  constructor(derivedTypeHint: EsfDerivedTypeHint<Base>, ...args: unknown[])
  constructor(
    derivedTypeHintOrOther:
      EsfDerivedTypeHint<Base> | EsfFixedSizePolymorphicHolder<Base>,
    ...args: unknown[]
  ) {
    if (derivedTypeHintOrOther instanceof EsfFixedSizePolymorphicHolder) {
      this._storage = derivedTypeHintOrOther.Get()._copyTo() as Base
    } else {
      this._storage = new derivedTypeHintOrOther(...args)
    }
  }

  /**
   * Construct a holder containing a derived type that is move-constructed
   * from another holder (fixedSizePolymorphicHolder.h:84-91). The moved-from
   * holder continues to hold an object, but that object is moved-from.
   */
  static moveConstruct<H extends EsfFixedSizePolymorphicHolder<EsfFixedSizePolymorphicBase>>(
    this: abstract new (...args: never[]) => H,
    other: H,
  ): H {
    const holder = Object.create(this.prototype) as H
    holder._storage = other.Get()._moveTo()
    return holder
  }

  /**
   * Copy assignment (fixedSizePolymorphicHolder.h:97-109): replaces the held
   * instance with one copy-constructed from \p other's.
   */
  assign(other: EsfFixedSizePolymorphicHolder<Base>): this {
    if (this !== other) {
      this._storage = other.Get()._copyTo() as Base
    }
    return this
  }

  /**
   * Move assignment (fixedSizePolymorphicHolder.h:111-124): replaces the
   * held instance with one move-constructed from \p other's. The moved-from
   * holder continues to hold an object, but that object is moved-from.
   */
  moveAssign(other: EsfFixedSizePolymorphicHolder<Base>): this {
    if (this !== other) {
      this._storage = other.Get()._moveTo() as Base
    }
    return this
  }

  /** Returns the held Base instance: Get(), operator-> and operator*
   *  (fixedSizePolymorphicHolder.h:126-157). */
  Get(): Base {
    return this._storage
  }

  /**
   * Checks if instances of \p Derived can be stored in a holder of \p Base
   * (fixedSizePolymorphicHolder.h:159-177). Only DERIVES_FROM_BASE is
   * meaningful without a byte buffer (see the file header).
   */
  static readonly Compatibility = {
    DERIVES_FROM_BASE(base: _AnyClass, derived: _AnyClass): boolean {
      return derived === base || derived.prototype instanceof base
    },
  }
}
