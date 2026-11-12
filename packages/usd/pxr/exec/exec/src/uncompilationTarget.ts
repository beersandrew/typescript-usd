// Ported from OpenUSD 26.11.1: pxr/exec/exec/uncompilationTarget.cpp,
//  pxr/exec/exec/uncompilationTarget.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/uncompilationTarget.h and
// uncompilationTarget.cpp.
//
// Exec_UncompilationTargets refer to compiled objects in the exec network that
// may need to be uncompiled in response to a scene change. The std::variant
// Exec_UncompilationTarget is a TypeScript union; std::visit is instanceof.
//
// Exec_InputUncompilationTarget holds a TfDelegatedCountPtr to a shared
// _Identity. Copies share the identity; in TypeScript the identity object is
// shared by reference, and Clone() is the copy constructor.

/**
 * Describes a VdfNode in the network that may later be uncompiled
 * (uncompilationTarget.h:32-55). The VdfId may refer to a node that no longer
 * exists in the network.
 */
export class Exec_NodeUncompilationTarget {
  private readonly _nodeId: number

  constructor(nodeId: number) {
    this._nodeId = nodeId
  }

  /** Returns the id of the targeted node. */
  getNodeId(): number {
    return this._nodeId
  }

  /** Returns a string describing the targeted node (uncompilationTarget.cpp:15-19). */
  getDescription(): string {
    return `Node(${this._nodeId})`
  }
}

// Identifies the input and stores the tombstone flag
// (uncompilationTarget.h:110-126).
interface _Identity {
  readonly nodeId: number
  readonly inputName: string
  isValid: boolean
}

/**
 * Describes a VdfInput in the network that should be uncompiled
 * (uncompilationTarget.h:57-143).
 *
 * VdfInputs are identified by the VdfId of their owning node, and a token for
 * the input name on that node. The target can be invalidated after it has
 * been uncompiled. This signals other rules for this target to skip
 * uncompiling the input, even if the input still exists in the network.
 */
export class Exec_InputUncompilationTarget {
  private _identity: _Identity | null

  constructor(nodeId: number, inputName: string)
  constructor(rhs: Exec_InputUncompilationTarget)
  constructor(arg: number | Exec_InputUncompilationTarget, inputName?: string) {
    this._identity = arg instanceof Exec_InputUncompilationTarget
      ? arg._identity
      : { nodeId: arg, inputName: inputName ?? '', isValid: true }
  }

  /** The copy constructor: the copy shares this target's identity. */
  Clone(): Exec_InputUncompilationTarget {
    return new Exec_InputUncompilationTarget(this)
  }

  /**
   * Returns the node's id, or null if this target has been moved-from
   * (uncompilationTarget.h:74-79).
   */
  getNodeId(): number | null {
    return this._identity ? this._identity.nodeId : null
  }

  /**
   * Returns the input's name, or null if this target has been moved-from
   * (uncompilationTarget.h:81-86).
   */
  getInputName(): string | null {
    return this._identity ? this._identity.inputName : null
  }

  /**
   * Returns true if the target is valid for uncompilation, or false if this
   * target has been invalidated due to an earlier scene change.
   */
  isValid(): boolean {
    return this._identity !== null && this._identity.isValid
  }

  /**
   * Mark this target as invalid, so other rules for the same target do not
   * attempt to uncompile the same input in a later round of change
   * processing.
   */
  invalidate(): void {
    if (this._identity) {
      this._identity.isValid = false
    }
  }

  /**
   * Returns a string describing the targeted input
   * (uncompilationTarget.cpp:21-32).
   */
  getDescription(): string {
    if (this._identity) {
      return `Input(${this._identity.nodeId}, ${this._identity.inputName})`
    }
    return 'Input(null)'
  }
}

/**
 * Describes a network object targeted by an uncompilation rule
 * (uncompilationTarget.h:145-148).
 */
export type Exec_UncompilationTarget =
  | Exec_NodeUncompilationTarget
  | Exec_InputUncompilationTarget
