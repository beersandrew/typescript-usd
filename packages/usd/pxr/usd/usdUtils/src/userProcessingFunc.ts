// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/userProcessingFunc.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/userProcessingFunc.h (OpenUSD 26.11.1).
//
// UsdUtilsDependencyInfo carries an asset path and its dependencies to a user
// processing function, and the function's changes back to the asset
// localization routine (userProcessingFunc.h:17-25).

import type { Layer } from 'typescript-usd/sdf'

const EMPTY_DICTIONARY: Readonly<Record<string, unknown>> = Object.freeze({})

/**
 * Class containing information from a processed dependency
 * (userProcessingFunc.h:26-121).
 *
 * The constructor that also takes the raw asset path and expression
 * variables is private upstream and used only by the asset localization
 * system (UsdUtils_LocalizationClient is its friend,
 * userProcessingFunc.h:37-49); here it is the internal static `_create`.
 */
export class UsdUtilsDependencyInfo {
  #assetPath: string
  #dependencies: readonly string[]
  #rawAssetPath = ''
  #expressionVariables: Readonly<Record<string, unknown>> | undefined

  /** userProcessingFunc.h:28-35. */
  constructor(assetPath?: string | UsdUtilsDependencyInfo, dependencies: readonly string[] = []) {
    if (assetPath instanceof UsdUtilsDependencyInfo) {
      // The copy constructor (wrapUserProcessingFunc.cpp:33).
      this.#assetPath = assetPath.#assetPath
      this.#dependencies = assetPath.#dependencies
      this.#rawAssetPath = assetPath.#rawAssetPath
      this.#expressionVariables = assetPath.#expressionVariables
      return
    }
    this.#assetPath = assetPath ?? ''
    this.#dependencies = [...dependencies]
  }

  /** @internal The private constructor (userProcessingFunc.h:37-49). */
  static _create(
    assetPath: string, dependencies: readonly string[], rawAssetPath: string,
    expressionVariables: Readonly<Record<string, unknown>> | undefined,
  ): UsdUtilsDependencyInfo {
    const info = new UsdUtilsDependencyInfo(assetPath, dependencies)
    info.#rawAssetPath = rawAssetPath
    info.#expressionVariables = expressionVariables
    return info
  }

  /**
   * The asset value path for the dependency, with any variable expressions
   * in it evaluated (userProcessingFunc.h:54-74). Returned from a processing
   * function, an empty path drops the dependency and a changed one is used
   * in its place.
   */
  getAssetPath(): string { return this.#assetPath }

  /** The raw asset path authored in the layer, without substitutions or
   *  evaluations; ignored when returned from a processing function
   *  (userProcessingFunc.h:76-82). */
  getRawAssetPath(): string { return this.#rawAssetPath }

  /** The variable expressions relevant to this dependency; ignored when
   *  returned from a processing function (userProcessingFunc.h:84-90). */
  getExpressionVariables(): Readonly<Record<string, unknown>> {
    return this.#expressionVariables ?? EMPTY_DICTIONARY
  }

  /** The dependencies of the asset path, relative to their containing layer:
   *  the UDIM tiles or clip files a template path resolved to
   *  (userProcessingFunc.h:92-104). */
  getDependencies(): readonly string[] { return this.#dependencies }

  /** Equality: asset path and dependencies are the same
   *  (userProcessingFunc.h:106-111). */
  equals(rhs: UsdUtilsDependencyInfo): boolean {
    return this.#assetPath === rhs.#assetPath &&
      this.#dependencies.length === rhs.#dependencies.length &&
      this.#dependencies.every((dependency, i) => dependency === rhs.#dependencies[i])
  }

  // The Python properties (wrapUserProcessingFunc.cpp:35-43).
  get assetPath(): string { return this.getAssetPath() }
  get dependencies(): string[] { return [...this.getDependencies()] }
  get rawAssetPath(): string { return this.getRawAssetPath() }
  get expressionVariables(): Readonly<Record<string, unknown>> { return this.getExpressionVariables() }
}

/**
 * Signature for a user supplied processing function
 * (userProcessingFunc.h:129-134): `layer` contains the dependency and
 * `dependencyInfo` its asset path information. The asset localization this
 * port runs is asynchronous, so the function may also return a Promise.
 */
export type UsdUtilsProcessingFunc = (
  layer: Layer, dependencyInfo: UsdUtilsDependencyInfo,
) => UsdUtilsDependencyInfo | Promise<UsdUtilsDependencyInfo>
