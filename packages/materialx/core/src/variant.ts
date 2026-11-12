// Ported from MaterialX 1.39.5: source/MaterialXCore/Variant.h,
//  source/MaterialXCore/Variant.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXCore/Variant.h and Variant.cpp

import { Element, registerElementClass } from './element.ts'
import { InterfaceElement } from './interface.ts'
import { EMPTY_STRING } from './util.ts'

// A variant element within a VariantSet.
export class Variant extends InterfaceElement {
  static readonly CATEGORY = 'variant'

  constructor(parent: Element | null, name: string) {
    super(parent, Variant.CATEGORY, name)
  }
}

// A variant set element within a Document.
export class VariantSet extends Element {
  static readonly CATEGORY = 'variantset'

  constructor(parent: Element | null, name: string) {
    super(parent, VariantSet.CATEGORY, name)
  }

  // --- Variant Elements ---

  // Add a Variant to the variant set.
  addVariant(name = EMPTY_STRING): Variant {
    return this.addChild(Variant, name)
  }

  // Return the Variant, if any, with the given name.
  getVariant(name: string): Variant | null {
    return this.getChildOfType(Variant, name)
  }

  // Return a vector of all Variant elements in the variant set.
  getVariants(): Variant[] {
    return this.getChildrenOfType(Variant)
  }

  // Remove the Variant, if any, with the given name.
  removeVariant(name: string): void {
    this.removeChildOfType(Variant, name)
  }
}

// A variant assignment element within a Look.
export class VariantAssign extends Element {
  static readonly CATEGORY = 'variantassign'
  static readonly VARIANT_SET_ATTRIBUTE = 'variantset'
  static readonly VARIANT_ATTRIBUTE = 'variant'

  constructor(parent: Element | null, name: string) {
    super(parent, VariantAssign.CATEGORY, name)
  }

  // --- Variant Set String ---

  setVariantSetString(variantSet: string): void {
    this.setAttribute(VariantAssign.VARIANT_SET_ATTRIBUTE, variantSet)
  }

  hasVariantSetString(): boolean {
    return this.hasAttribute(VariantAssign.VARIANT_SET_ATTRIBUTE)
  }

  getVariantSetString(): string {
    return this.getAttribute(VariantAssign.VARIANT_SET_ATTRIBUTE)
  }

  // --- Variant String ---

  setVariantString(variant: string): void {
    this.setAttribute(VariantAssign.VARIANT_ATTRIBUTE, variant)
  }

  hasVariantString(): boolean {
    return this.hasAttribute(VariantAssign.VARIANT_ATTRIBUTE)
  }

  getVariantString(): string {
    return this.getAttribute(VariantAssign.VARIANT_ATTRIBUTE)
  }
}

registerElementClass(Variant)
registerElementClass(VariantSet)
registerElementClass(VariantAssign)
