// Ported from OpenUSD 26.11.1: pxr/exec/vdf/output.cpp, pxr/exec/vdf/output.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/output.h and output.cpp.
//
// A VdfOutput is an output connector on a VdfNode. Outputs are created and
// owned by their node; their ids are assigned by the network
// (VdfNetwork::_AcquireOutputId). Members that upstream reserves for its
// friends VdfNetwork and VdfIsolatedSubnetwork (output.h:148-162) keep their
// _names and are public here.

import { TF_AXIOM, TF_CODING_ERROR, TF_VERIFY } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import type { VdfInput } from './input.ts'
import { VdfInputSpec } from './inputSpec.ts'
import { VdfMask } from './mask.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutputSpec } from './outputSpec.ts'
import type { VdfId, VdfIndex, VdfVersion } from './types.ts'

// TfToken is a string (docs/openexec-x1.md 4, rule 3).
type TfToken = string

export class VdfOutput {
  private readonly _owner: VdfNode
  private readonly _id: VdfId
  private _associatedInput: VdfInput | null
  private readonly _connections: VdfConnection[] = []
  private _affectsMask: VdfMask = new VdfMask()
  private readonly _specIndex: number

  /** VdfOutput(VdfNode &owner, int specIndex) (output.cpp:23). */
  constructor(owner: VdfNode, specIndex: number) {
    this._owner = owner
    this._id = owner.getNetwork()._acquireOutputId()
    this._associatedInput = null
    this._specIndex = specIndex
  }

  /** ~VdfOutput (output.cpp:31): releases the output id to the network. */
  _destruct(): void {
    this._owner.getNetwork()._releaseOutputId(this._id)
  }

  /** GetConnections (output.h:47). */
  getConnections(): readonly VdfConnection[] {
    return this._connections
  }

  /** GetNumConnections (output.h:51). */
  getNumConnections(): number {
    return this._connections.length
  }

  /** GetNode (output.h:57-61). */
  getNode(): VdfNode {
    return this._owner
  }

  /** GetName (output.cpp:36). */
  getName(): TfToken {
    return this.getSpec().getName()
  }

  /** SetAssociatedInput (output.cpp:42-51). */
  setAssociatedInput(input: VdfInput | null): void {
    if (input && this._associatedInput) {
      TF_CODING_ERROR('Cannot associate more than one input to a single output.')
      return
    }
    this._associatedInput = input
  }

  /** GetAssociatedInput (output.h:76). */
  getAssociatedInput(): VdfInput | null {
    return this._associatedInput
  }

  /** GetAffectsMask (output.h:85): null if no affects mask is set. */
  getAffectsMask(): VdfMask | null {
    return this._affectsMask.IsEmpty() ? null : this._affectsMask
  }

  /** SetAffectsMask (output.cpp:53-70): only outputs with an associated input. */
  setAffectsMask(mask: VdfMask): void {
    if (this._associatedInput) {
      if (this._affectsMask.notEquals(mask)) {
        this._affectsMask = mask
        this.getNode().getNetwork()._didChangeAffectsMask(this)
      }
    } else {
      TF_CODING_ERROR("Can't set the affects mask on output '" +
        this.getDebugName() +
        "', it doesn't have a corresponding input.")
    }
  }

  /** GetId (output.h:100). */
  getId(): VdfId {
    return this._id
  }

  /** GetIndexFromId (output.h:109): the low 32 bits of the id. */
  static getIndexFromId(id: VdfId): VdfIndex {
    return id >>> 0
  }

  /** GetVersionFromId (output.h:118): the high 32 bits of the id. */
  static getVersionFromId(id: VdfId): VdfVersion {
    return Math.floor(id / 4294967296)
  }

  /** GetSpec (output.cpp:72). */
  getSpec(): VdfOutputSpec {
    return this._owner.getOutputSpecs().getOutputSpec(this._specIndex)!
  }

  /**
   * _Connect (output.cpp:78-152): connects this output to node's input
   * inputName with mask, at atIndex. Only VdfNetwork calls this.
   */
  _connect(
    node: VdfNode,
    inputName: TfToken,
    mask: VdfMask,
    atIndex: number): VdfConnection | null {
    TF_AXIOM(node, 'node')

    const input = node.getInput(inputName)
    if (!input) {
      TF_CODING_ERROR("Couldn't find input '" +
        inputName +
        "' on node '" +
        node.getDebugName() +
        "' to connect to.")
      return null
    }

    const inputSpec = input.getSpec()
    const spec = this.getSpec()

    // output.cpp:113-124
    if (!TF_VERIFY(
      inputSpec.typeMatches(spec),
      'inputSpec->TypeMatches(spec)',
      `Input and output types don't match.  Trying to connect ${this.getDebugName()} ` +
      `(${spec.getTypeName()}) to [${inputName}]${node.getDebugName()} ` +
      `(${inputSpec.getTypeName()})`)) {
      return null
    }

    // output.cpp:128-135
    if (inputSpec.getAccess() !== VdfInputSpec.READ &&
      input.getNumConnections() > 0) {
      TF_CODING_ERROR('The current execution system does not support more ' +
        'than one connection to a ReadWrite connector.')
      return null
    }

    const connection = input._addConnection(this, mask, atIndex)
    this._connections.push(connection)
    return connection
  }

  /**
   * _RemoveConnection (output.cpp:154-172): swaps the connection with the
   * last one and pops it, as upstream does (connection order changes).
   */
  _removeConnection(connection: VdfConnection): void {
    const i = this._connections.indexOf(connection)
    if (!TF_VERIFY(i >= 0, 'iter != _connections.end()')) return
    this._connections[i] = this._connections[this._connections.length - 1]!
    this._connections.pop()
  }

  /** GetDebugName (output.cpp:174). */
  getDebugName(): string {
    return this.getNode().getDebugName() + '[' + this.getName() + ']'
  }

  /**
   * GetNumDataEntries (output.cpp:180-205): the affects mask size, else the
   * first connection's mask size, else the associated input's first
   * connection mask size, else 1.
   */
  getNumDataEntries(): number {
    const affectsMask = this.getAffectsMask()
    if (affectsMask) return affectsMask.getSize()

    if (this._connections.length) {
      return this._connections[0]!.GetMask().getSize()
    }

    if (this._associatedInput &&
      this._associatedInput.getNumConnections() > 0) {
      return this._associatedInput.Get(0).GetMask().getSize()
    }

    return 1
  }
}
