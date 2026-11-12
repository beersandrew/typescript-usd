// Ported from OpenUSD 26.11.1: pxr/exec/vdf/fixedSizePolymorphicHolder.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/fixedSizePolymorphicHolder.h.
//
// Vdf_FixedSizePolymorphicHolder<Base, BufferSize> places one polymorphic
// object into a fixed buffer (fixedSizePolymorphicHolder.h:20-35). The buffer
// is a C++ small-object storage trick with no TS counterpart; what is ported
// is the observable API, a holder of one polymorphic value with explicit
// New / Destroy / Get. `New<Derived>(args...)` constructs in place; TS passes
// the constructed instance. Destroy invokes the held object's destructor,
// which in TS is the optional `_Destruct()` method (used where destruction is
// observable, e.g. releasing a shared reference).

/** Something whose destruction may have observable effects. */
export interface Vdf_Destructible {
  _destruct?(): void
}

/** Vdf_FixedSizePolymorphicHolder (fixedSizePolymorphicHolder.h:36-117). */
export class Vdf_FixedSizePolymorphicHolder<Base extends Vdf_Destructible> {
  #held: Base | null = null

  /** Creates an instance (fixedSizePolymorphicHolder.h:52-77). */
  new(instance: Base): void {
    this.#held = instance
  }

  /** Destroys a held instance (fixedSizePolymorphicHolder.h:79-93). */
  destroy(): void {
    const held = this.#held
    this.#held = null
    held?._destruct?.()
  }

  /** Returns the held instance (fixedSizePolymorphicHolder.h:95-103). */
  Get(): Base {
    const held = this.#held
    if (held === null) {
      // Upstream dereferences uninitialized storage here (undefined
      // behavior); fail loudly instead.
      throw new Error('Vdf_FixedSizePolymorphicHolder: no instance is held')
    }
    return held
  }

  /** True if an instance is held. */
  _isHolding(): boolean {
    return this.#held !== null
  }
}
