// Ported from OpenUSD 26.11.1: pxr/exec/exec/constantValueNode.cpp,
//  pxr/exec/exec/constantValueNode.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/constantValueNode.h and
// constantValueNode.cpp.

import type { Value as VtValue } from 'typescript-usd/vt'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfInputSpecs, VdfOutputSpecs } from 'typescript-usd/vdf'
import { VdfMask } from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import { VdfRawValueAccessor } from 'typescript-usd/vdf'
import { VdfTokens } from 'typescript-usd/vdf'
import { ExecTypeRegistry } from './typeRegistry.ts'

/** A node that computes a constant value (constantValueNode.h:20-36). */
export class Exec_ConstantValueNode extends VdfNode {
  readonly #value: VtValue

  /** Create a node that provides the constant `value` (constantValueNode.cpp:17-29). */
  constructor(network: VdfNetwork, value: VtValue) {
    super(
      network,
      new VdfInputSpecs(),
      new VdfOutputSpecs().connector(
        value.getType(),
        VdfTokens.out))
    this.#value = value
  }

  /** constantValueNode.cpp:33-40 */
  override compute(context: VdfContext): void {
    new VdfRawValueAccessor(context).setOutputVector(
      this.GetOutput(VdfTokens.out) as VdfOutput,
      VdfMask.allOnes(1),
      ExecTypeRegistry.GetInstance().createVector(this.#value))
  }
}
