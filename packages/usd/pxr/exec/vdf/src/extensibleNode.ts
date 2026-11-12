// Ported from OpenUSD 26.11.1: pxr/exec/vdf/extensibleNode.cpp,
//  pxr/exec/vdf/extensibleNode.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/extensibleNode.h and extensibleNode.cpp.
//
// Base class for nodes that create input and output connectors dynamically.
// The node owns its specs instead of sharing them through the network's
// registry.

import { TF_VERIFY } from 'typescript-usd/tf'

import type { VdfInputSpecs, VdfOutputSpecs } from './connectorSpecs.ts'
import type { VdfInput } from './input.ts'
import { VdfInputAndOutputSpecs } from './inputAndOutputSpecs.ts'
import type { VdfNetwork } from './network.ts'
import { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'

export abstract class VdfExtensibleNode extends VdfNode {
  // _inputAndOutputSpecs (extensibleNode.h:84).
  private _inputAndOutputSpecs: VdfInputAndOutputSpecs

  /** VdfExtensibleNode(network, inputSpecs, outputSpecs) (extensibleNode.cpp:14-22). */
  constructor(
    network: VdfNetwork,
    inputSpecs: VdfInputSpecs,
    outputSpecs: VdfOutputSpecs) {
    super(network)
    this._inputAndOutputSpecs = new VdfInputAndOutputSpecs(inputSpecs, outputSpecs)
    this._initializeInputAndOutputSpecs(this._inputAndOutputSpecs)
  }

  /**
   * ~VdfExtensibleNode (extensibleNode.cpp:24-32): clears the specs pointer
   * so the base destructor does not release it.
   */
  override _destruct(): void {
    this._clearInputAndOutputSpecsPointer()
    super._destruct()
  }

  /** AddOutputSpecs (extensibleNode.cpp:34-45). */
  addOutputSpecs(specs: VdfOutputSpecs, resultOutputs: VdfOutput[] | null): void {
    this._inputAndOutputSpecs.appendOutputSpecs(specs)
    this._appendOutputs(specs, resultOutputs)
  }

  /** AddInputSpecs (extensibleNode.cpp:47-58). */
  addInputSpecs(newSpecs: VdfInputSpecs, resultInputs: VdfInput[] | null): void {
    this._inputAndOutputSpecs.appendInputSpecs(newSpecs)
    this._appendInputs(newSpecs, resultInputs)
  }

  /**
   * _AcquireInputAndOutputSpecsPointer (extensibleNode.cpp:60-67): the node's
   * own specs, replaced by (inputSpecs, outputSpecs).
   */
  protected override _acquireInputAndOutputSpecsPointer(
    inputSpecs: VdfInputSpecs,
    outputSpecs: VdfOutputSpecs): VdfInputAndOutputSpecs {
    this._inputAndOutputSpecs.moveAssign(
      new VdfInputAndOutputSpecs(inputSpecs, outputSpecs))
    return this._inputAndOutputSpecs
  }

  /** _ReleaseInputAndOutputSpecsPointer (extensibleNode.cpp:69-75): a no-op. */
  protected override _releaseInputAndOutputSpecsPointer(
    specs: VdfInputAndOutputSpecs | null): void {
    TF_VERIFY(specs === this._inputAndOutputSpecs, 'specs == &_inputAndOutputSpecs')
  }
}
