// Ported from OpenUSD 26.11.1: pxr/exec/vdf/object.cpp, pxr/exec/vdf/object.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/object.h and object.cpp.
//
// VdfObjectPtr is a universal handle to a node, connection, input or output
// (object.h:39-408). Upstream stores a union of pointers plus a constness
// flag; here the referenced object is stored directly and constness is a
// flag, as upstream observes it through IsConst() and the non-const getters.

import { TF_AXIOM } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import type { VdfInput } from './input.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'

type _Object = VdfNode | VdfConnection | VdfInput | VdfOutput

/** VdfObjectPtr::Type (object.h:44-52). */
export enum VdfObjectPtrType {
  Undefined = -1,
  Node = 0,
  Connection = 1,
  Input = 2,
  Output = 3,
}

export class VdfObjectPtr {
  static readonly Undefined = VdfObjectPtrType.Undefined
  static readonly Node = VdfObjectPtrType.Node
  static readonly Connection = VdfObjectPtrType.Connection
  static readonly Input = VdfObjectPtrType.Input
  static readonly Output = VdfObjectPtrType.Output

  private _object: _Object | null
  private _type: VdfObjectPtrType
  private _isConst: boolean

  /**
   * VdfObjectPtr() (object.h:56) creates the NULL object. The typed
   * constructors (object.h:63-115) take the object, its type and whether it
   * is held const; the factories below spell those overloads.
   */
  constructor()
  constructor(object: _Object, type: VdfObjectPtrType, isConst: boolean)
  constructor(
    object: _Object | null = null,
    type: VdfObjectPtrType = VdfObjectPtrType.Undefined,
    isConst = false) {
    this._object = object
    this._type = object ? type : VdfObjectPtrType.Undefined
    this._isConst = isConst
  }

  /** VdfObjectPtr(VdfNode *) / (const VdfNode *) (object.h:63-73). */
  static fromNode(node: VdfNode, isConst = false): VdfObjectPtr {
    return new VdfObjectPtr(node, VdfObjectPtrType.Node, isConst)
  }

  /** VdfObjectPtr(VdfConnection *) / (const VdfConnection *) (object.h:77-87). */
  static fromConnection(connection: VdfConnection, isConst = false): VdfObjectPtr {
    return new VdfObjectPtr(connection, VdfObjectPtrType.Connection, isConst)
  }

  /** VdfObjectPtr(VdfInput *) / (const VdfInput *) (object.h:91-101). */
  static fromInput(input: VdfInput, isConst = false): VdfObjectPtr {
    return new VdfObjectPtr(input, VdfObjectPtrType.Input, isConst)
  }

  /** VdfObjectPtr(VdfOutput *) / (const VdfOutput *) (object.h:105-115). */
  static fromOutput(output: VdfOutput, isConst = false): VdfObjectPtr {
    return new VdfObjectPtr(output, VdfObjectPtrType.Output, isConst)
  }

  /** operator= (object.h:119). */
  assign(rhs: VdfObjectPtr): this {
    this._object = rhs._object
    this._type = rhs._type
    this._isConst = rhs._isConst
    return this
  }

  /** Copy. */
  Clone(): VdfObjectPtr {
    return new VdfObjectPtr().assign(this)
  }

  /** operator== (object.h:154): constness does not matter. */
  Equals(rhs: VdfObjectPtr): boolean {
    return this._type === rhs._type && this._object === rhs._object
  }

  /** operator!= (object.h:162). */
  notEquals(rhs: VdfObjectPtr): boolean {
    return !this.Equals(rhs)
  }

  /** operator bool (object.h:179): false for the NULL object. */
  asBool(): boolean {
    return this._object !== null
  }

  /** GetType (object.h:186). */
  getType(): VdfObjectPtrType {
    return this._type
  }

  /** IsConst (object.h:193). */
  isConst(): boolean {
    return this._isConst
  }

  /** IsNode (object.h:200). */
  isNode(): boolean {
    return this._type === VdfObjectPtrType.Node
  }

  /** IsConnection (object.h:207). */
  isConnection(): boolean {
    return this._type === VdfObjectPtrType.Connection
  }

  /** IsInput (object.h:214). */
  isInput(): boolean {
    return this._type === VdfObjectPtrType.Input
  }

  /** IsOutput (object.h:221). */
  isOutput(): boolean {
    return this._type === VdfObjectPtrType.Output
  }

  /** GetNonConstNode (object.h:229). */
  getNonConstNode(): VdfNode {
    TF_AXIOM(this.isNode(), 'IsNode()')
    TF_AXIOM(!this.isConst(), '!IsConst()')
    return this._object as VdfNode
  }

  /** GetNonConstConnection (object.h:239). */
  getNonConstConnection(): VdfConnection {
    TF_AXIOM(this.isConnection(), 'IsConnection()')
    TF_AXIOM(!this.isConst(), '!IsConst()')
    return this._object as VdfConnection
  }

  /** GetNonConstInput (object.h:249). */
  getNonConstInput(): VdfInput {
    TF_AXIOM(this.isInput(), 'IsInput()')
    TF_AXIOM(!this.isConst(), '!IsConst()')
    return this._object as VdfInput
  }

  /** GetNonConstOutput (object.h:259). */
  getNonConstOutput(): VdfOutput {
    TF_AXIOM(this.isOutput(), 'IsOutput()')
    TF_AXIOM(!this.isConst(), '!IsConst()')
    return this._object as VdfOutput
  }

  /** GetNode (object.h:268). */
  getNode(): VdfNode {
    TF_AXIOM(this.isNode(), 'IsNode()')
    return this._object as VdfNode
  }

  /** GetConnection (object.h:277). */
  getConnection(): VdfConnection {
    TF_AXIOM(this.isConnection(), 'IsConnection()')
    return this._object as VdfConnection
  }

  /** GetInput (object.h:285). */
  getInput(): VdfInput {
    TF_AXIOM(this.isInput(), 'IsInput()')
    return this._object as VdfInput
  }

  /** GetOutput (object.h:294). */
  GetOutput(): VdfOutput {
    TF_AXIOM(this.isOutput(), 'IsOutput()')
    return this._object as VdfOutput
  }

  /** GetIfNode (object.h:303). */
  getIfNode(): VdfNode | null {
    return this.isNode() ? this._object as VdfNode : null
  }

  /** GetIfConnection (object.h:311). */
  getIfConnection(): VdfConnection | null {
    return this.isConnection() ? this._object as VdfConnection : null
  }

  /** GetIfInput (object.h:319). */
  getIfInput(): VdfInput | null {
    return this.isInput() ? this._object as VdfInput : null
  }

  /** GetIfOutput (object.h:327). */
  getIfOutput(): VdfOutput | null {
    return this.isOutput() ? this._object as VdfOutput : null
  }

  /** GetIfNonConstNode (object.h:335). */
  getIfNonConstNode(): VdfNode | null {
    return (!this.isConst() && this.isNode()) ? this._object as VdfNode : null
  }

  /** GetIfNonConstConnection (object.h:343). */
  getIfNonConstConnection(): VdfConnection | null {
    return (!this.isConst() && this.isConnection())
      ? this._object as VdfConnection : null
  }

  /** GetIfNonConstInput (object.h:351). */
  getIfNonConstInput(): VdfInput | null {
    return (!this.isConst() && this.isInput()) ? this._object as VdfInput : null
  }

  /** GetIfNonConstOutput (object.h:359). */
  getIfNonConstOutput(): VdfOutput | null {
    return (!this.isConst() && this.isOutput()) ? this._object as VdfOutput : null
  }

  /**
   * GetOwningNode (object.cpp:16-34): the owning node of an input or output,
   * the node itself for a node, and null for a connection.
   */
  getOwningNode(): VdfNode | null {
    switch (this.getType()) {
      case VdfObjectPtrType.Node:
        return this.getNode()
      case VdfObjectPtrType.Input:
        return this.getInput().getNode()
      case VdfObjectPtrType.Output:
        return this.GetOutput().getNode()
      default:
        break
    }
    return null
  }

  /** GetDebugName (object.cpp:36-71). */
  getDebugName(): string {
    let name = ''
    if (this.asBool()) {
      const type = this.getType()
      if (type === VdfObjectPtrType.Node) {
        name = "NODE: '" + this.getNode().getDebugName() + "'"
      } else if (type === VdfObjectPtrType.Connection) {
        name = "CONN: '" + this.getConnection().getDebugName() + "'"
      } else if (type === VdfObjectPtrType.Input) {
        name = "INPT: '" + this.getInput().getNode().getDebugName() +
          ' [' + this.getInput().getName() + "]'"
      } else if (type === VdfObjectPtrType.Output) {
        name = "OUTP: '" + this.GetOutput().getNode().getDebugName() +
          ' [' + this.GetOutput().getName() + "]'"
      }
      if (this.isConst()) name += ' (const)'
    } else {
      name = '<NULL>'
    }
    return name
  }

  /**
   * GetIdentity (object.h:378): the identity of the referenced object, for
   * use as a JS Map or Set key (HashFunctor, object.h:169).
   */
  getIdentity(): object | null {
    return this._object
  }
}

/** VdfObjectPtrVector (object.h:412). */
export type VdfObjectPtrVector = VdfObjectPtr[]
