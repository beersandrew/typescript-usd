// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdExecImaging/valueKey.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdExecImaging/valueKey.h (OpenUSD 26.11.1).
//
// SdfPath is a path string here, as in hd and usdImaging: the value key is
// formed from the paths HdSceneIndexBase.GetPrim receives.

/**
 * Identifies a value that is computed by exec (valueKey.h:17-50).
 *
 * UsdExecImaging uses its own value key type distinct from ExecUsdValueKey
 * in order to prevent a public dependency on exec. This value key type
 * identifies providers by their SdfPath so the value key can be formed
 * in response to HdSceneIndexBase::GetPrim, which only provides an SdfPath.
 */
export class UsdExecImagingValueKey {
  /** Path to the object that provides the named computation.
   *
   *  The path may refer to a prim or a property. */
  readonly providerPath: string

  /** The name of the computation.
   *
   *  This can the name of a plugin-defined computation, or may be one of
   *  the pre-defined ExecBuiltinComputations. */
  readonly computationName: string

  constructor(providerPath: string, computationName: string) {
    this.providerPath = providerPath
    this.computationName = computationName
  }

  /** operator== (valueKey.h:43-46) */
  Equals(other: UsdExecImagingValueKey): boolean {
    return this.providerPath === other.providerPath &&
      this.computationName === other.computationName
  }
}

/** The canonical key string of a value key, for JS Maps keyed by value keys
 *  (TfHashAppend, valueKey.h:52-55, hashes the same two members). Property
 *  paths contain '.', never '\0'. */
export function UsdExecImaging_ValueKeyMapKey(valueKey: UsdExecImagingValueKey): string {
  return `${valueKey.providerPath}\0${valueKey.computationName}`
}
