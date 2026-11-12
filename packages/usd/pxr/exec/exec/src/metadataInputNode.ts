// Ported from OpenUSD 26.11.1: pxr/exec/exec/metadataInputNode.cpp,
//  pxr/exec/exec/metadataInputNode.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/metadataInputNode.h and
// metadataInputNode.cpp.

import type { Type as TfType } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import type { EsfObject } from 'typescript-usd/esf'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfInputSpecs, VdfOutputSpecs } from 'typescript-usd/vdf'
import { VdfMask } from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import { VdfRawValueAccessor } from 'typescript-usd/vdf'
import { VdfTokens } from 'typescript-usd/vdf'
import { ExecTypeRegistry } from './typeRegistry.ts'

/**
 * A node that computes the value of scene object metadata
 * (metadataInputNode.h:21-57).
 */
export class Exec_MetadataInputNode extends VdfNode {
  // TODO: Once we stop treating namespace edits as resyncs, we will need to
  // update _object in response to edits like rename and reparent.
  readonly #object: EsfObject
  readonly #metadataKey: string

  /**
   * Create a node that provides the value of the metadata indicated by
   * `metadataKey` for `object` (metadataInputNode.cpp:19-34).
   */
  constructor(
    network: VdfNetwork,
    object: EsfObject,
    metadataKey: string,
    valueType: TfType,
  ) {
    super(
      network,
      new VdfInputSpecs(),
      new VdfOutputSpecs().connector(
        valueType,
        VdfTokens.out))
    this.#object = object
    this.#metadataKey = metadataKey
  }

  /** metadataInputNode.cpp:38-49 */
  override compute(context: VdfContext): void {
    const value = this.#object.Get().getMetadata(this.#metadataKey)

    new VdfRawValueAccessor(context).setOutputVector(
      this.GetOutput(VdfTokens.out) as VdfOutput,
      VdfMask.allOnes(1),
      ExecTypeRegistry.GetInstance().createVector(value))
  }

  /**
   * Returns the scene path to the object that the metadata value is sourced
   * from.
   */
  getObjectPath(): SdfPath {
    return this.#object.Get().getPath(null)
  }

  /**
   * Returns the key for the metadata field whose value is provided by this
   * node.
   */
  getMetadataKey(): string {
    return this.#metadataKey
  }
}
