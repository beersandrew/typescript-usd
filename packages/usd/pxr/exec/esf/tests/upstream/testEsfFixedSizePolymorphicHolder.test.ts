// Ported from OpenUSD 26.11.1:
//  pxr/exec/esf/testenv/testEsfFixedSizePolymorphicHolder.cpp,
//  pxr/exec/esf/fixedSizePolymorphicHolder.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/testenv/testEsfFixedSizePolymorphicHolder.cpp
//
// The port keeps the observable behaviour of the holder (see
// pxr/exec/esf/src/fixedSizePolymorphicHolder.ts). Out of scope, because
// they check C++ object layout or lifetime that has no JS counterpart:
//  * the BufferSize parameter and the FITS_IN_BUFFER, HAS_ALIGNMENT and
//    HasBaseAtSameAddress checks of TestCompatibility (and the over-aligned
//    and multiply-derived classes, whose only purpose is layout: TS has no
//    alignment and no multiple inheritance, so MultiplyDerived derives from
//    Base alone, and OverAlignedBase is a plain base class);
//  * the destructor counts (Stats::numDtors) of TestDestructor,
//    TestCopyAssignment and TestMoveAssignment: held instances are reclaimed
//    by the garbage collector, so TestDestructor checks only the
//    construction count;
//  * std::vector growth (reserve) in TestVectorUsage; copying, erasing and
//    iterating a vector of holders are kept.
//
// The test classes' copy and move constructors are their _CopyTo and _MoveTo
// overrides (what _Holder<Derived> generates, fixedSizePolymorphicHolder.h:
// 226-238); TF_AXIOM is expect.
import { describe, expect, it } from 'vitest'
import {
  EsfFixedSizePolymorphicBase, EsfFixedSizePolymorphicHolder,
} from '../../src/fixedSizePolymorphicHolder.ts'

// Tracks the number of invocations to Base's special member functions.
class Stats {
  numCtors = 0
  numCopys = 0
  numMoves = 0
  numDtors = 0

  Reset(): void {
    this.numCtors = 0
    this.numCopys = 0
    this.numMoves = 0
    this.numDtors = 0
  }
}

// Example class that derives from EsfFixedSizePolymorphicBase
abstract class Base extends EsfFixedSizePolymorphicBase {
  private _stats: Stats | null = null

  constructor(stats?: Stats) {
    super()
    if (stats) {
      this._stats = stats
      this._stats.numCtors++
    }
  }

  abstract getDescription(): string

  // Base(const Base &other) and Base(Base &&other).
  private _construct(other: Base, kind: 'copy' | 'move'): this {
    const result = Object.create(Object.getPrototypeOf(other) as object) as this
    result._stats = other._stats
    if (result._stats) {
      if (kind === 'copy') {
        result._stats.numCopys++
      } else {
        result._stats.numMoves++
      }
    }
    return result
  }

  override _copyTo(): Base {
    return this._construct(this, 'copy')
  }

  override _moveTo(): Base {
    return this._construct(this, 'move')
  }
}

class Derived1 extends Base {
  getDescription(): string { return 'Derived1' }
}

class Derived2 extends Base {
  getDescription(): string { return 'Derived2' }
}

// This derived class is larger than Base.
class BigDerived extends Base {
  private readonly _flag = false
  getDescription(): string { return 'BigDerived' }
  getFlag(): boolean { return this._flag }
}

// Another base class compatible with EsfFixedSizePolymorphicHolder.
class OtherBase extends EsfFixedSizePolymorphicBase {}

// This derived class inherits from Base (and, upstream, from OtherBase).
class MultiplyDerived extends Base {
  getDescription(): string { return 'MultiplyDerived' }
}

// Another base class (upstream: with a greater alignment requirement).
class OverAlignedBase extends EsfFixedSizePolymorphicBase {
  override _copyTo(): OverAlignedBase {
    return new (this.constructor as new () => OverAlignedBase)()
  }

  override _moveTo(): OverAlignedBase {
    return new (this.constructor as new () => OverAlignedBase)()
  }
}

// Classes derived from OverAlignedBase.
class OverAlignedBaseImpl1 extends OverAlignedBase {}
class OverAlignedBaseImpl2 extends OverAlignedBase {}

class BaseHolder extends EsfFixedSizePolymorphicHolder<Base> {}
class BigBaseHolder extends EsfFixedSizePolymorphicHolder<Base> {}
class OverAlignedBaseHolder extends EsfFixedSizePolymorphicHolder<OverAlignedBase> {}

describe('testEsfFixedSizePolymorphicHolder', () => {
  // Tests that EsfFixedSizePolymorphicHolder can be constructed from
  // different derived classes.
  it('TestConstructor', () => {
    const h1 = new BaseHolder(Derived1)
    const h2 = new BaseHolder(Derived2)
    expect(h1.Get().getDescription()).toBe('Derived1')
    expect(h2.Get().getDescription()).toBe('Derived2')
  })

  // Tests that EsfFixedSizePolymorphicHolder properly destroys the held
  // instance when it is destroyed (the destructor count is out of scope).
  it('TestDestructor', () => {
    const stats = new Stats()
    {
      const h = new BaseHolder(Derived1, stats)
      expect(h.Get()).toBeInstanceOf(Derived1)
    }
    expect(stats.numCtors).toBe(1)
  })

  // Tests that EsfFixedSizePolymorphicHolder copys the held instance in the
  // copy constructor.
  it('TestCopyConstructor', () => {
    const stats = new Stats()
    const h1 = new BaseHolder(Derived2, stats)
    const h2 = new BaseHolder(h1)
    expect(h2.Get().getDescription()).toBe('Derived2')
    expect(stats.numCtors).toBe(1)
    expect(stats.numCopys).toBe(1)
    expect(stats.numMoves).toBe(0)
  })

  // Tests that EsfFixedSizePolymorphicHolder moves the held instance in the
  // move constructor.
  it('TestMoveConstructor', () => {
    const stats = new Stats()
    const h1 = new BaseHolder(Derived1, stats)
    const h2 = BaseHolder.moveConstruct(h1)
    expect(h2).toBeInstanceOf(BaseHolder)
    expect(h2.Get().getDescription()).toBe('Derived1')
    expect(stats.numCtors).toBe(1)
    expect(stats.numCopys).toBe(0)
    expect(stats.numMoves).toBe(1)
  })

  // Tests that EsfFixedSizePolymorphicHolder copies the held instance in the
  // copy-assignment operator (the destroyed-instance count is out of scope).
  it('TestCopyAssignment', () => {
    const stats = new Stats()
    const h1 = new BaseHolder(Derived1, stats)
    const h2 = new BaseHolder(Derived2, stats)
    stats.Reset()
    h1.assign(h2)
    expect(stats.numCopys).toBe(1)
    expect(h1.Get().getDescription()).toBe('Derived2')
  })

  // Tests that EsfFixedSizePolymorphicHolder moves the held instance in the
  // move-assignment operator (the destroyed-instance count is out of scope).
  it('TestMoveAssignment', () => {
    const stats = new Stats()
    const h1 = new BaseHolder(Derived1, stats)
    const h2 = new BaseHolder(Derived2, stats)
    stats.Reset()
    h2.moveAssign(h1)
    expect(stats.numCopys).toBe(0)
    expect(stats.numMoves).toBe(1)
    expect(h2.Get().getDescription()).toBe('Derived1')
  })

  // Tests that EsfFixedSizePolymorphicHolder can hold derived types of
  // different sizes if the BufferSize parameter is large enough.
  it('TestBigBuffer', () => {
    const h1 = new BigBaseHolder(Derived1)
    const h2 = new BigBaseHolder(Derived2)
    const h3 = new BigBaseHolder(BigDerived)
    expect(h1.Get().getDescription()).toBe('Derived1')
    expect(h2.Get().getDescription()).toBe('Derived2')
    expect(h3.Get().getDescription()).toBe('BigDerived')
  })

  // Tests that EsfFixedSizePolymorphicHolder works with base classes that
  // are overaligned.
  it('TestOverAlignedBase', () => {
    const h1 = new OverAlignedBaseHolder(OverAlignedBaseImpl1)
    const h2 = new OverAlignedBaseHolder(OverAlignedBaseImpl2)
    h1.assign(h2)
    expect(h1.Get()).toBeInstanceOf(OverAlignedBaseImpl2)
    h1.moveAssign(h2)
    expect(h1.Get()).toBeInstanceOf(OverAlignedBaseImpl2)
  })

  // Tests that certain derived instances are detected as not compatible
  // with a given EsfFixedSizePolymorphicHolder specialization (only
  // DERIVES_FROM_BASE; the layout checks are out of scope).
  it('TestCompatibility', () => {
    const compatibility = EsfFixedSizePolymorphicHolder.Compatibility
    expect(!compatibility.DERIVES_FROM_BASE(Base, OtherBase)).toBe(true)
    expect(!compatibility.DERIVES_FROM_BASE(OtherBase, Derived1)).toBe(true)
    expect(compatibility.DERIVES_FROM_BASE(Base, MultiplyDerived)).toBe(true)
  })

  // Tests that multiple-inherited derived classes work, so long as the
  // derived instance shares its address with its base instance.
  it('TestMultipleInheritance', () => {
    const h1 = new BigBaseHolder(MultiplyDerived)
    expect(h1.Get().getDescription()).toBe('MultiplyDerived')
  })

  // Tests that the copy constructor and assignment enable use of
  // EsfFixedSizePolymorphicHolder in a vector.
  it('TestVectorUsage', () => {
    const holders: BigBaseHolder[] = []
    holders.push(new BigBaseHolder(Derived1))
    holders.push(new BigBaseHolder(Derived2))
    holders.push(new BigBaseHolder(BigDerived))
    holders.push(new BigBaseHolder(MultiplyDerived))

    // Vectors can be copied
    const holders2 = holders.map(h => new BigBaseHolder(h))

    // Vector elements can be erased.
    holders2.splice(0, 1)

    // Can iterate over all objects of the vector.
    let actual = ''
    for (const h of holders2) {
      actual += h.Get().getDescription()
      actual += ','
    }
    const expected = 'Derived2,BigDerived,MultiplyDerived,'
    expect(actual).toBe(expected)
  })
})
