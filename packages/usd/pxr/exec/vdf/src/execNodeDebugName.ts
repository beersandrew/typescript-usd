// Ported from OpenUSD 26.11.1: pxr/exec/vdf/execNodeDebugName.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/execNodeDebugName.h.
//
// Stores what is needed to construct a node debug name lazily: the node and
// a callback. The name is "<C++ type name> <callback()>"
// (execNodeDebugName.h:48-55); see node.ts for _GetDemangledTypeName().

import { TF_VERIFY } from 'typescript-usd/tf'

import type { VdfNode } from './node.ts'

export class Vdf_ExecNodeDebugName {
  private readonly _node: VdfNode
  private readonly _callback: (() => string) | null
  private _debugName = ''

  /** Vdf_ExecNodeDebugName(node, callback) (execNodeDebugName.h:31-41). */
  constructor(node: VdfNode, callback: (() => string) | null) {
    this._node = node
    this._callback = callback
    TF_VERIFY(
      this._callback,
      '_callback',
      `Null callback for node: ${node._getDemangledTypeName()}`)
  }

  // _InitializeDebugName (execNodeDebugName.h:48-55): a null callback is
  // handled silently since the constructor reported it.
  private _initializeDebugName(): void {
    this._debugName = this._callback
      ? this._node._getDemangledTypeName() + ' ' + this._callback()
      : this._node._getDemangledTypeName()
  }

  /** _GetDebugName (execNodeDebugName.h:60-66). Only VdfNetwork calls this. */
  _getDebugName(): string {
    if (this._debugName === '') this._initializeDebugName()
    return this._debugName
  }
}
