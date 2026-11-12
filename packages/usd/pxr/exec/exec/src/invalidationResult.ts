// Ported from OpenUSD 26.11.1: pxr/exec/exec/invalidationResult.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/invalidationResult.h.
//
// The structs are interfaces. TfSpan<const SdfPath> is a readonly array and
// TfBits is the base/tf TfBits port.

import type { TfBits } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'

import type { EfTimeInterval } from 'typescript-usd/ef'
import type { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'

/** Communicates the results of invalidation (invalidationResult.h:24-32). */
export interface Exec_InvalidationResult {
  /** The invalidation request for executor invalidation. */
  invalidationRequest: VdfMaskedOutput[]

  /** The leaf nodes reachable from the invalidated nodes. */
  readonly invalidLeafNodes: readonly VdfNode[]
}

/**
 * Communicates the results of authored value invalidation for metadata
 * (invalidationResult.h:34-38).
 */
export interface Exec_MetadataInvalidationResult extends Exec_InvalidationResult {}

/**
 * Communicates the results of authored value invalidation for attributes
 * (invalidationResult.h:40-62).
 */
export interface Exec_AttributeValueInvalidationResult extends Exec_InvalidationResult {
  /** The array of invalid attributes. */
  invalidAttributes: readonly SdfPath[]

  /**
   * Bit set with the same size as invalidAttributes, denoting which of the
   * invalid attributes are compiled in the exec network.
   */
  compiledAttributes: TfBits

  /**
   * The combined time range over which the compiled leaf nodes are invalid as
   * a result of the authored value change.
   */
  invalidInterval: EfTimeInterval

  /**
   * This is true if the authoring of values resulted in time dependency of an
   * input (or connected leaf node) changing.
   */
  isTimeDependencyChange: boolean
}

/**
 * Communicates the results of invalidation from uncompilation
 * (invalidationResult.h:64-71).
 */
export interface Exec_DisconnectedInputsInvalidationResult extends Exec_InvalidationResult {
  /**
   * Additional leaf nodes that are now disconnected as a result of the
   * invalidation.
   */
  disconnectedLeafNodes: VdfNode[]
}
