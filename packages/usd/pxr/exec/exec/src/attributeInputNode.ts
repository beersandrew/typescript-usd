// Ported from OpenUSD 26.11.1: pxr/exec/exec/attributeInputNode.cpp,
//  pxr/exec/exec/attributeInputNode.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/attributeInputNode.h and
// attributeInputNode.cpp.

import { TF_VERIFY, type TfCompressedBits, type Type as TfType } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { type EfTime, EfTimeType } from 'typescript-usd/ef'
import type {
  EsfAttributeQuery, EsfAttributeQueryInterface,
} from 'typescript-usd/esf'
import type { VdfConnection } from 'typescript-usd/vdf'
import type { VdfContext } from 'typescript-usd/vdf'
import { VdfInputSpecs, VdfOutputSpecs } from 'typescript-usd/vdf'
import { VdfMask } from 'typescript-usd/vdf'
import type { VdfMaskedOutput } from 'typescript-usd/vdf'
import type { VdfNetwork } from 'typescript-usd/vdf'
import { VdfNode } from 'typescript-usd/vdf'
import type { VdfOutput } from 'typescript-usd/vdf'
import { VdfRawValueAccessor } from 'typescript-usd/vdf'
import { VdfTokens } from 'typescript-usd/vdf'
import { ExecTypeRegistry } from './typeRegistry.ts'

/** EXEC_ATTRIBUTE_INPUT_NODE_TOKENS (attributeInputNode.h:25-29). */
export const Exec_AttributeInputNodeTokens = {
  time: 'time',
} as const

/** Node that computes attribute resolved values (attributeInputNode.h:31-104). */
export class Exec_AttributeInputNode extends VdfNode {
  // TODO: Once we stop treating namespace edits as resyncs, we will need to
  // re-initialize the attribute query in response to edits like rename and
  // reparent.
  readonly #attributeQuery: EsfAttributeQuery
  #mightBeTimeDependent: boolean

  /**
   * Create a node that provides the resolved value through `attributeQuery`
   * at the current evaluation time (attributeInputNode.cpp:23-40).
   */
  constructor(
    network: VdfNetwork,
    attributeQuery: EsfAttributeQuery,
    valueType: TfType,
  ) {
    super(
      network,
      new VdfInputSpecs().readConnector(
        EfTimeType,
        Exec_AttributeInputNodeTokens.time),
      new VdfOutputSpecs().connector(
        valueType,
        VdfTokens.out))
    this.#attributeQuery = attributeQuery
    this.#mightBeTimeDependent = false
    this.updateTimeDependence()
  }

  /**
   * Update the internal state to ensure that resolved values are sourced
   * correctly (attributeInputNode.cpp:44-49).
   */
  updateValueResolutionState(): void {
    this.#attributeQuery.Get().initialize()
    TF_VERIFY(this.#attributeQuery.Get().isValid(), '_attributeQuery->IsValid()')
  }

  /**
   * Returns the scene path to the attribute that the input value is sourced
   * from.
   */
  getAttributePath(): SdfPath {
    return this.#attributeQuery.Get().getPath()
  }

  /**
   * Updates the input's time dependence, returning `true` if there was a
   * change in time dependence (attributeInputNode.cpp:51-57).
   */
  updateTimeDependence(): boolean {
    const wasTimeDependent = this.#mightBeTimeDependent
    this.#mightBeTimeDependent = this.#attributeQuery.Get().valueSourceMightBeTimeVarying()
    return wasTimeDependent !== this.#mightBeTimeDependent
  }

  /** Returns `true` if the input might be time dependent. */
  mightBeTimeDependent(): boolean {
    return this.#mightBeTimeDependent
  }

  /**
   * Returns `true` if the resolved input value at time `from` is different
   * from the value at time `to` (attributeInputNode.cpp:59-64).
   */
  isTimeVarying(from: EfTime, to: EfTime): boolean {
    return this.#attributeQuery.Get().isTimeVarying(from.getTimeCode(), to.getTimeCode())
  }

  /**
   * Returns the corresponding attribute's spline, if the strongest opinion
   * resolves to a spline (attributeInputNode.h:78-84).
   */
  getSpline(): ReturnType<EsfAttributeQueryInterface['getSpline']> {
    return this.#attributeQuery.Get().getSpline()
  }

  /** attributeInputNode.cpp:66-78 */
  override compute(context: VdfContext): void {
    const time = context.getInputValue<EfTime>(
      EfTimeType, Exec_AttributeInputNodeTokens.time).getTimeCode()
    // EsfAttributeQuery::Get(VtValue *value, UsdTimeCode time) returns the
    // bool and the value as a tuple (port convention 6).
    const [ok, resolvedValue] = this.#attributeQuery.Get().Get(time)
    if (ok) {
      new VdfRawValueAccessor(context).setOutputVector(
        this.GetOutput(VdfTokens.out) as VdfOutput,
        VdfMask.allOnes(1),
        ExecTypeRegistry.GetInstance().createVector(resolvedValue))
    }
  }

  /**
   * Computes dependencies in the output-to-input traversal direction
   * (attributeInputNode.cpp:80-98).
   */
  protected override _computeInputDependencyMask(
    _maskedOutput: VdfMaskedOutput,
    inputConnection: VdfConnection,
  ): TfCompressedBits {
    // This node has one output, and it depends on the time input, which is the
    // only input on the node, so the logic here is a straight forward
    // one-to-one dependency.
    //
    // Note, that we do not check whether the node is time-dependent when
    // traversing in the input direction, and always report the time dependency
    // as encoded in the network. This is to ensure that cached traversals in
    // the input direction - primarily the schedules - do not go invalid when
    // time dependencies on input nodes change. The trade-off then is that the
    // time node is typically included in schedules, but this comes at very
    // little cost.

    return inputConnection.GetMask().getBits()
  }

  /**
   * Computes dependencies in the input-to-output traversal direction
   * (attributeInputNode.cpp:100-117).
   */
  protected override _computeOutputDependencyMask(
    _inputConnection: VdfConnection,
    _inputDependencyMask: VdfMask,
    _output: VdfOutput,
  ): VdfMask {
    // There is only one input, and one output on this node, so we do not need
    // to look at output names for dependency computation: We can assume that
    // the dependency being computed is always from the 'value' output to the
    // 'time' input.

    // If the node is potentially time-varying, there is a dependency.
    // Otherwise, there is not.
    return this.mightBeTimeDependent() ? VdfMask.allOnes(1) : new VdfMask()
  }
}
