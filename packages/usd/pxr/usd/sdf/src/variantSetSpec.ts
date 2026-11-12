// Ported from OpenUSD 26.11.1: pxr/usd/sdf/variantSetSpec.cpp,
//  pxr/usd/sdf/variantSetSpec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/variantSetSpec.{h,cpp}.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { sdfChangeBlock } from './changeManager.ts'
import { Sdf_VariantChildPolicy, Sdf_VariantSetChildPolicy } from './childrenPolicies.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import { SdfChildrenView } from './childrenView.ts'
import type { SdfPrimSpec } from './primSpec.ts'
import { SdfSpec } from './spec.ts'
import type { SdfVariantSpec } from './variantSpec.ts'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

export class SdfVariantSetSpec extends SdfSpec {
  // SdfVariantSetSpec::New (variantSetSpec.cpp:22-83): a variant set of a
  // prim or of a variant.
  static new(owner: SdfPrimSpec | SdfVariantSpec | undefined, name: string): SdfVariantSetSpec | undefined {
    if (!owner) codingError('NULL owner prim')
    if (!Sdf_ChildrenUtils.isValidName(Sdf_VariantSetChildPolicy, name)) {
      codingError(`Cannot create variant set spec with invalid identifier: '${name}'`)
    }
    return sdfChangeBlock(() => {
      const layer = owner.getLayer()
      const path = owner.getPath().appendVariantSelection(name, '')
      if (!path.isPrimVariantSelectionPath()) {
        codingError(`Cannot create variant set spec at invalid path <${owner.getPath().pathString}{${name}=}>`)
      }
      if (!Sdf_ChildrenUtils.createSpec(Sdf_VariantSetChildPolicy, layer, path, 'variantSet')) return undefined
      return layer.getObjectAtPath(path) as SdfVariantSetSpec
    })
  }

  getName(): string { return this.getPath().getVariantSelection()[0] }
  getNameToken(): string { return this.getName() }

  getOwner(): SdfSpec | undefined { return this.getLayer().getObjectAtPath(this.getPath().getParentPath()) }

  getVariants(): SdfChildrenView<SdfVariantSpec> {
    return new SdfChildrenView(this.getLayer(), this.getPath(), Sdf_VariantChildPolicy,
      (spec): spec is SdfVariantSpec => spec.getSpecType() === 'variant')
  }

  getVariantList(): SdfVariantSpec[] { return this.getVariants().values() }

  // SdfVariantSetSpec::RemoveVariant (variantSetSpec.cpp:131-154).
  removeVariant(variant: SdfVariantSpec): void {
    const layer = this.getLayer()
    const parentPath = Sdf_VariantChildPolicy.getParentPath(variant.getPath())
    if (variant.getLayer() !== layer || !parentPath.equals(this.getPath())) {
      codingError('Cannot remove a variant that does not belong to this variant set.')
    }
    if (!Sdf_ChildrenUtils.removeChild(Sdf_VariantChildPolicy, layer, this.getPath(), variant.getNameToken())) {
      codingError(`Unable to remove child: ${variant.getName()}`)
    }
  }
}
