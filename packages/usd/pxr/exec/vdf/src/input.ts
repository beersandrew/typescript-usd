// Ported from OpenUSD 26.11.1: pxr/exec/vdf/input.cpp, pxr/exec/vdf/input.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/input.h and input.cpp.
//
// A VdfInput is an input connector on a VdfNode. It owns the connections
// that target it (input.cpp:19-23). Members that upstream reserves for its
// friends VdfNetwork, VdfIsolatedSubnetwork and VdfOutput (input.h:107-143)
// keep their _names and are public here.

import { TF_CODING_ERROR, TF_VERIFY } from 'typescript-usd/tf'

// Relative import: TfBits is not in the tf barrel yet.
import { TfBits } from 'typescript-usd/tf'

import { VdfConnection } from './connection.ts'
import type { VdfInputSpec } from './inputSpec.ts'
import type { VdfMask } from './mask.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'

// TfToken is a string (docs/openexec-x1.md 4, rule 3).
type TfToken = string

// VdfNetwork::AppendConnection (network.h:66). Repeated here to avoid an
// import cycle between input.ts and network.ts.
const _AppendConnection = -1

export class VdfInput {
  private readonly _owner: VdfNode
  private readonly _associatedOutput: VdfOutput | null
  private _connections: VdfConnection[] = []
  private readonly _specIndex: number

  /** VdfInput(VdfNode &owner, int specIndex, const VdfOutput *output) (input.h:48). */
  constructor(owner: VdfNode, specIndex: number, output: VdfOutput | null = null) {
    this._owner = owner
    this._associatedOutput = output
    this._specIndex = specIndex
  }

  /** GetConnections (input.h:54). */
  getConnections(): readonly VdfConnection[] {
    return this._connections
  }

  /** GetNumConnections (input.h:58). */
  getNumConnections(): number {
    return this._connections.length
  }

  /** operator[] (input.h:64). */
  Get(index: number): VdfConnection {
    return this._connections[index]!
  }

  /** GetNonConstConnection (input.h:70). */
  getNonConstConnection(index: number): VdfConnection {
    return this._connections[index]!
  }

  /** GetSpec (input.cpp:25). */
  getSpec(): VdfInputSpec {
    return this._owner.getInputSpecs().getInputSpec(this._specIndex)!
  }

  /** GetAssociatedOutput (input.h:82). */
  getAssociatedOutput(): VdfOutput | null {
    return this._associatedOutput
  }

  /** GetNode (input.h:86-90). */
  getNode(): VdfNode {
    return this._owner
  }

  /** GetName (input.h:94). */
  getName(): TfToken {
    return this.getSpec().getName()
  }

  /** GetDebugName (input.cpp:109). */
  getDebugName(): string {
    return '[' + this.getName() + ']' + this.getNode().getDebugName()
  }

  /** _GetSpecIndex (input.h:116). */
  _getSpecIndex(): number {
    return this._specIndex
  }

  /**
   * _AddConnection (input.cpp:31-54): creates a connection from output with
   * mask, appended or inserted at atIndex.
   */
  _addConnection(output: VdfOutput, mask: VdfMask, atIndex: number): VdfConnection {
    const c = new VdfConnection(output, mask, this)

    if (atIndex === _AppendConnection) {
      this._connections.push(c)
    } else {
      if (!TF_VERIFY(atIndex >= 0 && atIndex <= this._connections.length,
        'atIndex >= 0 && static_cast<unsigned int>(atIndex) <= _connections.size()')) {
        atIndex = this._connections.length
      }
      this._connections.splice(atIndex, 0, c)
    }

    return c
  }

  /** _RemoveConnection (input.cpp:56-66): order-preserving erase. */
  _removeConnection(connection: VdfConnection): void {
    const i = this._connections.indexOf(connection)
    if (TF_VERIFY(i >= 0, 'iter != _connections.end()')) {
      this._connections.splice(i, 1)
    }
  }

  /**
   * _ReorderInputConnections (input.cpp:68-107): for each new index i,
   * newToOldIndices[i] is the old connection index.
   */
  _reorderInputConnections(newToOldIndices: readonly number[]): void {
    const numConnections = this._connections.length

    if (newToOldIndices.length !== numConnections) {
      TF_CODING_ERROR(
        `Mismatch between the number of input connections (${numConnections}) ` +
        `and the number of indices given to reorder them (${newToOldIndices.length}).`)
      return
    }

    const oldIndices = new TfBits(numConnections)

    const newConnections: VdfConnection[] = []
    for (const oldIndex of newToOldIndices) {
      if (oldIndex >= numConnections) {
        TF_CODING_ERROR(
          'The indices given for reordering include out-of-range old ' +
          `indices (including, at least, ${oldIndex}).`)
        return
      }

      if (oldIndices.isSet(oldIndex)) {
        TF_CODING_ERROR(
          'The indices given for reordering contains duplicate old ' +
          `indices (including, at least, ${oldIndex}).`)
        return
      }
      oldIndices.Set(oldIndex)

      newConnections.push(this._connections[oldIndex]!)
    }

    this._connections = newConnections
  }
}
