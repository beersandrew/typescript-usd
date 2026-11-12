// Ported from OpenUSD 26.11.1: pxr/usd/sdf/variantSpec.cpp,
//  pxr/usd/sdf/variantSpec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/variantSpec.{h,cpp}.

import { Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import { Sdf_VariantChildPolicy, Sdf_VariantSetChildPolicy } from './childrenPolicies.ts'
import { Sdf_ChildrenUtils } from './childrenUtils.ts'
import { SdfChildrenProxy, SdfChildrenProxyPermission } from './childrenView.ts'
import type { Layer } from './layer.ts'
import { SdfPath } from './path.ts'
import { _sdfRegisterVariantSpecConstructors, sdfCreatePrimInLayer, type SdfPrimSpec } from './primSpec.ts'
import { SdfSchema } from './schema.ts'
import { SdfSpec } from './spec.ts'
import { SdfVariantSetSpec } from './variantSetSpec.ts'

function codingError(message: string): never {
  throw new TfError(message, TfDiagnosticType.CodingError)
}

export class SdfVariantSpec extends SdfSpec {
  // SdfVariantSpec::New (variantSpec.cpp:24-55).
  static new(owner: SdfVariantSetSpec | undefined, name: string): SdfVariantSpec | undefined {
    if (!owner) codingError('NULL owner variant set')
    if (!SdfSchema.isValidVariantIdentifier(name).isAllowed()) codingError(`Invalid variant name: ${name}`)
    const childPath = Sdf_VariantChildPolicy.getChildPath(owner.getPath(), name)
    const layer = owner.getLayer()
    if (!Sdf_ChildrenUtils.createSpec(Sdf_VariantChildPolicy, layer, childPath, 'variant')) return undefined
    layer.setField(childPath.pathString, 'specifier', 'over')
    return layer.getObjectAtPath(childPath) as SdfVariantSpec
  }

  getName(): string { return this.getPath().getVariantSelection()[1] }
  getNameToken(): string { return this.getName() }

  getOwner(): SdfVariantSetSpec | undefined {
    return this.getLayer().getObjectAtPath(Sdf_VariantChildPolicy.getParentPath(this.getPath())) as
      SdfVariantSetSpec | undefined
  }

  // The prim spec of the variant's contents.
  getPrimSpec(): SdfPrimSpec | undefined { return this.getLayer().getPrimAtPath(this.getPath()) }

  getVariantSets(): SdfChildrenProxy<SdfVariantSetSpec> {
    return new SdfChildrenProxy(this.getLayer(), this.getPath(), Sdf_VariantSetChildPolicy, 'variant sets',
      SdfChildrenProxyPermission.CanErase,
      (spec): spec is SdfVariantSetSpec => spec.getSpecType() === 'variantSet')
  }

  getVariantNames(name: string): string[] {
    const variants = this.getLayer().getField(
      this.getPath().appendVariantSelection(name, '').pathString, 'variantChildren')
    return Array.isArray(variants) ? variants.map(String) : []
  }
}

// SdfCreateVariantInLayer (variantSpec.cpp:118-133).
export function sdfCreateVariantInLayer(
  layer: Layer, primPath: string | SdfPath, variantSetName: string, variantName: string,
): SdfVariantSpec | undefined {
  const path = typeof primPath === 'string' ? SdfPath.fromString(primPath) : primPath
  const variantPath = path.appendVariantSelection(variantSetName, variantName)
  // Create the ancestor prim and variant specs.
  sdfCreatePrimInLayer(layer, variantPath)
  return layer.getObjectAtPath(variantPath) as SdfVariantSpec | undefined
}

_sdfRegisterVariantSpecConstructors(
  (owner, name) => SdfVariantSetSpec.new(owner, name),
  (owner, name) => SdfVariantSpec.new(owner, name))
