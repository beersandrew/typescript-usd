// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/registeredVariantSet.cpp,
//  pxr/usd/usdUtils/registeredVariantSet.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/registeredVariantSet.{h,cpp} (OpenUSD 26.11.1).
//
// Information about a variantSet registered with the pipeline
// (registeredVariantSet.h:20-80); UsdUtilsGetRegisteredVariantSets in
// pipeline.ts collects them.

/**
 * How a variantSet selection is treated during export
 * (registeredVariantSet.h:37-57). In plugInfo.json the values are
 * lowerCamelCase: "never", "ifAuthored", "always".
 */
export enum UsdUtilsRegisteredVariantSetSelectionExportPolicy {
  /** `"never"`: the selection stays within an application. */
  Never = 0,
  /** `"ifAuthored"`: exported if there is an authored opinion. */
  IfAuthored = 1,
  /** `"always"`: always exported. */
  Always = 2,
}

// registeredVariantSet.cpp:13-19: the lowerCamelCase of the enums.
const _tokens = {
  never: 'never',
  ifAuthored: 'ifAuthored',
  always: 'always',
} as const

export class UsdUtilsRegisteredVariantSet {
  /** UsdUtilsRegisteredVariantSet::SelectionExportPolicy */
  static readonly SelectionExportPolicy = UsdUtilsRegisteredVariantSetSelectionExportPolicy

  /** The name of the variantSet. */
  readonly name: string
  /** Specifies how to export a variant selection. */
  readonly selectionExportPolicy: UsdUtilsRegisteredVariantSetSelectionExportPolicy

  // registeredVariantSet.h:62-68
  constructor(name: string, selectionExportPolicy: UsdUtilsRegisteredVariantSetSelectionExportPolicy) {
    this.name = name
    this.selectionExportPolicy = selectionExportPolicy
  }

  /**
   * Returns the export policy from the string, or undefined when the
   * string names none (registeredVariantSet.cpp:21-49; upstream returns
   * false and leaves its out parameter untouched).
   */
  static getSelectionExportPolicyFromString(
    selectionExportPolicyStr: string,
  ): UsdUtilsRegisteredVariantSetSelectionExportPolicy | undefined {
    if (selectionExportPolicyStr === _tokens.never) {
      return UsdUtilsRegisteredVariantSetSelectionExportPolicy.Never
    } else if (selectionExportPolicyStr === _tokens.ifAuthored) {
      return UsdUtilsRegisteredVariantSetSelectionExportPolicy.IfAuthored
    } else if (selectionExportPolicyStr === _tokens.always) {
      return UsdUtilsRegisteredVariantSetSelectionExportPolicy.Always
    }
    return undefined
  }

  /** operator< (registeredVariantSet.h:71-75): ordered by name, for std::set. */
  lessThan(other: UsdUtilsRegisteredVariantSet): boolean {
    return this.name < other.name
  }
}
