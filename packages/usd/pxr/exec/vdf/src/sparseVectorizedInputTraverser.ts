// Ported from OpenUSD 26.11.1:
//  pxr/exec/vdf/sparseVectorizedInputTraverser.cpp,
//  pxr/exec/vdf/sparseVectorizedInputTraverser.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/sparseVectorizedInputTraverser.h and
// sparseVectorizedInputTraverser.cpp.
//
// Sparse traversal in the output-to-input direction, vectorized over the
// request: each traversed (output, mask) carries the bits of the request
// entries that lead to it. Pool outputs are processed in pool chain order,
// further down the chain first.
//
// Mapping choices:
// - _MaskToRequestBitsMap (TfDenseHashMap<VdfMask, TfBits>) is a Map keyed by
//   the mask's canonical key, in insertion order.
// - _Stack (std::unordered_map<const VdfOutput *, ...>, processed from
//   begin()) is an insertion-ordered Map keyed by output. Upstream's order
//   depends on pointer hashes; here outputs are processed in the order they
//   were first pushed.
// - _TraverseOutput iterates a snapshot of the masks being processed, since
//   the traversal may merge new masks into the same entry (upstream would
//   iterate a container being modified).
// - The _TRAVERSAL_TRACING blocks (compiled out upstream) are not ported.

import { TF_VERIFY } from 'typescript-usd/tf'

// Relative import: TfBits is not in the tf barrel yet.
import { TfBits } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import type { VdfMask } from './mask.ts'
import { VdfMaskedOutput } from './maskedOutput.ts'
import type { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'
import { Vdf_IsPoolOutput, type VdfPoolChainIndex } from './poolChainIndex.ts'

/** CallbackMode (sparseVectorizedInputTraverser.h:51-58). */
export enum VdfSparseVectorizedInputTraverser_CallbackMode {
  /** Invoke the node callback on all nodes. This is the default. */
  CallbackModeAllNodes,
  /** Invoke the node callback only on terminal nodes. */
  CallbackModeTerminalNodes,
}

/** NodeCallback (sparseVectorizedInputTraverser.h:72-73). */
export type VdfSparseVectorizedInputTraverser_NodeCallback =
  (node: VdfNode, requestBits: TfBits) => boolean

/** ConnectionCallback (sparseVectorizedInputTraverser.h:105-106). */
export type VdfSparseVectorizedInputTraverser_ConnectionCallback =
  (connection: VdfConnection, requestBits: TfBits) => boolean

// The canonical key of a VdfMask.
const _MaskKey = (mask: VdfMask): string => `${mask.getSize()}:${mask.getRLEString()}`

// _MasksToRequestsMap (sparseVectorizedInputTraverser.h:128-197).
class _MasksToRequestsMap implements Iterable<[VdfMask, TfBits]> {
  private readonly _numRequests: number
  private readonly _maskToRequestBitsMap = new Map<string, [VdfMask, TfBits]>()

  constructor(numRequests = 0, mask?: VdfMask, requestBits?: TfBits) {
    this._numRequests = numRequests
    if (mask && requestBits) {
      this._numRequests = requestBits.getSize()
      this._maskToRequestBitsMap.set(_MaskKey(mask), [mask, new TfBits(requestBits)])
    }
  }

  Clone(): _MasksToRequestsMap {
    const r = new _MasksToRequestsMap(this._numRequests)
    for (const [key, [mask, bits]] of this._maskToRequestBitsMap) {
      r._maskToRequestBitsMap.set(key, [mask, new TfBits(bits)])
    }
    return r
  }

  // AddMask(mask, requestIndex) (sparseVectorizedInputTraverser.h:148-162).
  addMaskIndex(mask: VdfMask, requestIndex: number): void {
    const key = _MaskKey(mask)
    let entry = this._maskToRequestBitsMap.get(key)
    if (!entry) {
      const bits = new TfBits(this._numRequests)
      entry = [mask, bits]
      this._maskToRequestBitsMap.set(key, entry)
    }
    TF_VERIFY(!entry[1].isSet(requestIndex), '!res.first->second.IsSet(requestIndex)')
    entry[1].Set(requestIndex)
  }

  // AddMask(mask, requestBits) (sparseVectorizedInputTraverser.h:165-175).
  addMask(mask: VdfMask, requestBits: TfBits): void {
    const key = _MaskKey(mask)
    const entry = this._maskToRequestBitsMap.get(key)
    if (!entry) {
      this._maskToRequestBitsMap.set(key, [mask, new TfBits(requestBits)])
    } else {
      entry[1].orAssign(requestBits)
    }
  }

  [Symbol.iterator](): Iterator<[VdfMask, TfBits]> {
    return this._maskToRequestBitsMap.values()
  }

  // GetRequestBits (sparseVectorizedInputTraverser.cpp:22-35): the bits of the
  // first mask containing mask.
  getRequestBits(mask: VdfMask): TfBits | null {
    for (const [m, bits] of this._maskToRequestBitsMap.values()) {
      if (m.contains(mask)) return bits
    }
    return null
  }
}

export class VdfSparseVectorizedInputTraverser {
  static readonly CallbackModeAllNodes =
    VdfSparseVectorizedInputTraverser_CallbackMode.CallbackModeAllNodes
  static readonly CallbackModeTerminalNodes =
    VdfSparseVectorizedInputTraverser_CallbackMode.CallbackModeTerminalNodes

  private _nodeCallback: VdfSparseVectorizedInputTraverser_NodeCallback | null = null
  private _connectionCallback: VdfSparseVectorizedInputTraverser_ConnectionCallback | null = null
  private _callbackMode = VdfSparseVectorizedInputTraverser_CallbackMode.CallbackModeAllNodes
  private _visitedConnections = new Map<VdfConnection, _MasksToRequestsMap>()
  private _stack = new Map<VdfOutput, _MasksToRequestsMap>()
  private _prioritizedOutputs =
    new Map<string, { index: VdfPoolChainIndex, value: [VdfOutput, _MasksToRequestsMap] }>()
  private _emptyRequestToMaskMap = new _MasksToRequestsMap()

  /** Traverse (sparseVectorizedInputTraverser.cpp:39-54). */
  traverse(
    maskedOutputs: readonly VdfMaskedOutput[],
    nodeCallback: VdfSparseVectorizedInputTraverser_NodeCallback | null,
    callbackMode: VdfSparseVectorizedInputTraverser_CallbackMode): void {
    this._nodeCallback = nodeCallback
    this._connectionCallback = null
    this._callbackMode = callbackMode
    this._traverse(maskedOutputs)
  }

  /** TraverseWithConnectionCallback (sparseVectorizedInputTraverser.cpp:56-70). */
  traverseWithConnectionCallback(
    maskedOutputs: readonly VdfMaskedOutput[],
    connectionCallback: VdfSparseVectorizedInputTraverser_ConnectionCallback | null): void {
    this._nodeCallback = null
    this._connectionCallback = connectionCallback
    this._callbackMode = VdfSparseVectorizedInputTraverser_CallbackMode.CallbackModeAllNodes
    this._traverse(maskedOutputs)
  }

  // _Traverse (sparseVectorizedInputTraverser.cpp:72-144).
  private _traverse(maskedOutputs: readonly VdfMaskedOutput[]): void {
    if (!maskedOutputs.length) return

    this._visitedConnections = new Map()
    this._stack = new Map()
    this._prioritizedOutputs = new Map()

    this._emptyRequestToMaskMap = new _MasksToRequestsMap(maskedOutputs.length)

    for (let i = 0; i < maskedOutputs.length; i++) {
      const maskedOutput = maskedOutputs[i]!
      const output = maskedOutput.GetOutput()!
      let entry = this._stack.get(output)
      if (!entry) {
        entry = this._emptyRequestToMaskMap.Clone()
        this._stack.set(output, entry)
      }
      entry.addMaskIndex(maskedOutput.GetMask(), i)
    }

    while (this._stack.size || this._prioritizedOutputs.size) {
      while (this._stack.size) {
        const [output, masks] = this._stack.entries().next().value!
        this._traverseOutput(output, masks)
        // Erase after processing so that the masks need not be copied.
        if (this._stack.get(output) === masks) this._stack.delete(output)
      }

      if (this._prioritizedOutputs.size) {
        // The greatest pool chain index first (std::greater).
        let topKey = ''
        let topIndex: VdfPoolChainIndex | null = null
        for (const [key, entry] of this._prioritizedOutputs) {
          if (!topIndex || entry.index.greaterThan(topIndex)) {
            topIndex = entry.index
            topKey = key
          }
        }
        const top = this._prioritizedOutputs.get(topKey)!
        this._traverseOutput(top.value[0], top.value[1])
        if (this._prioritizedOutputs.get(topKey) === top) {
          this._prioritizedOutputs.delete(topKey)
        }
      }
    }

    TF_VERIFY(this._stack.size === 0 && this._prioritizedOutputs.size === 0,
      '_stack.empty() && _prioritizedOutputs.empty()')
    this._visitedConnections = new Map()
  }

  // _TraverseOutput (sparseVectorizedInputTraverser.cpp:146-353).
  private _traverseOutput(output: VdfOutput, masks: _MasksToRequestsMap): void {
    const node = output.getNode()

    const invokeNodeCallback = !!this._nodeCallback &&
      (this._callbackMode !== VdfSparseVectorizedInputTraverser_CallbackMode.CallbackModeTerminalNodes ||
        !node.hasInputConnections())

    for (const [mask, requestBits] of [...masks]) {
      if (invokeNodeCallback) {
        let execute = true

        const affectsMask = output.getAffectsMask()
        if (affectsMask) execute = affectsMask.overlaps(mask)

        if (execute) {
          // Stops the traversal for the current unique mask only.
          if (!this._nodeCallback!(node, requestBits)) continue
        }
      }

      const maskedOutput = new VdfMaskedOutput(output, mask)

      const dependencies = node.computeInputDependencyMasks(
        maskedOutput, false /* skipAssociatedInputs */)

      for (const [connection, dependencyMask] of dependencies) {
        if (this._connectionCallback) {
          if (!this._connectionCallback(connection, requestBits)) continue
        }

        const vc = this._visitedConnections.get(connection)

        if (vc) {
          // Another path or a cycle leading to this connection.
          const seenRequests = vc.getRequestBits(dependencyMask)
          if (seenRequests) {
            if (seenRequests.contains(requestBits)) continue

            // New dependency bits or new request bits: re-traverse.
            vc.addMask(dependencyMask, requestBits)
          }
        } else {
          this._visitedConnections.set(
            connection, new _MasksToRequestsMap(0, dependencyMask, requestBits))
        }

        const sourceOutput = connection.getNonConstSourceOutput()

        if (Vdf_IsPoolOutput(sourceOutput)) {
          // Further down the pool chain first (std::greater).
          const poolIndex = node.getNetwork().getPoolChainIndex(sourceOutput)
          const key = poolIndex.getKey()
          const iter = this._prioritizedOutputs.get(key)

          if (iter) {
            TF_VERIFY(iter.value[0] === sourceOutput, 'iter->second.first == sourceOutput')
            iter.value[1].addMask(dependencyMask, requestBits)
          } else {
            this._prioritizedOutputs.set(key, {
              index: poolIndex,
              value: [sourceOutput, new _MasksToRequestsMap(0, dependencyMask, requestBits)],
            })
          }
        } else {
          // Merge with any pending traversal.
          let entry = this._stack.get(sourceOutput)
          if (!entry) {
            entry = this._emptyRequestToMaskMap.Clone()
            this._stack.set(sourceOutput, entry)
          }
          entry.addMask(dependencyMask, requestBits)
        }
      }
    }
  }
}

export declare namespace VdfSparseVectorizedInputTraverser {
  type CallbackMode = VdfSparseVectorizedInputTraverser_CallbackMode
  type NodeCallback = VdfSparseVectorizedInputTraverser_NodeCallback
  type ConnectionCallback = VdfSparseVectorizedInputTraverser_ConnectionCallback
}
