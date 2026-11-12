// Ported from OpenUSD 26.11.1: pxr/exec/vdf/sparseInputTraverser.cpp,
//  pxr/exec/vdf/sparseInputTraverser.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/sparseInputTraverser.h and
// sparseInputTraverser.cpp.
//
// Sparse traversal in the output-to-input direction: affects masks are taken
// into account, and nodes that do not affect the requested outputs are not
// traversed. Pool outputs are deferred to a priority queue processed in pool
// chain order, further down the pool chain first, unless paths are produced.
//
// Mapping choices:
// - std::map<VdfPoolChainIndex, _PrioritizedOutput, std::greater> is a Map
//   keyed by VdfPoolChainIndex.GetKey(); the top entry is the greatest index.
// - TfHashMap<const VdfConnection *, VdfMask::Bits> is a Map keyed by the
//   connection.
// - The _TRAVERSAL_TRACING blocks (compiled out upstream) are not ported.

import { TF_AXIOM, TF_DEV_AXIOM, TF_VERIFY, type TfCompressedBits } from 'typescript-usd/tf'

// Relative import: TfBits is not in the tf barrel yet.
import { TfBits } from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { VdfMask } from './mask.ts'
import { VdfMaskedOutput } from './maskedOutput.ts'
import { VdfNode } from './node.ts'
import { VdfObjectPtr, type VdfObjectPtrVector } from './object.ts'
import type { VdfOutput } from './output.ts'
import { Vdf_IsPoolOutput, type VdfPoolChainIndex } from './poolChainIndex.ts'

/** VdfSparseInputTraverser::CallbackMode (sparseInputTraverser.h:47-54). */
export enum VdfSparseInputTraverser_CallbackMode {
  /** Invoke the node callback on all nodes. This is the default. */
  CallbackModeAllNodes,
  /** Invoke the node callback only on terminal nodes. */
  CallbackModeTerminalNodes,
}

/** NodeCallback (sparseInputTraverser.h:68). */
export type VdfSparseInputTraverser_NodeCallback = (node: VdfNode) => boolean

/** ConnectionCallback (sparseInputTraverser.h:96-97). */
export type VdfSparseInputTraverser_ConnectionCallback =
  (connection: VdfConnection, mask: VdfMask) => boolean

/** NodePathCallback (sparseInputTraverser.h:128-129). */
export type VdfSparseInputTraverser_NodePathCallback =
  (node: VdfNode, path: VdfObjectPtrVector) => boolean

/** ConnectionPathCallback (sparseInputTraverser.h:137-139). */
export type VdfSparseInputTraverser_ConnectionPathCallback =
  (connection: VdfConnection, mask: VdfMask, path: VdfObjectPtrVector) => boolean

// _PrioritizedOutput (sparseInputTraverser.cpp:31-93).
class _PrioritizedOutput {
  private readonly _output: VdfOutput
  private _dependencyBits: TfCompressedBits
  private readonly _path: VdfObjectPtrVector | null

  constructor(
    output: VdfOutput,
    dependencyMask: VdfMask,
    basePath?: VdfObjectPtrVector,
    pathElement?: VdfConnection | null) {
    this._output = output
    this._dependencyBits = dependencyMask.getBits()
    this._path = null
    if (basePath) {
      this._path = [...basePath]
      if (pathElement) this._path.push(VdfObjectPtr.fromConnection(pathElement, true))
    }
  }

  GetOutput(): VdfOutput {
    return this._output
  }

  getDependencyBits(): TfCompressedBits {
    return this._dependencyBits
  }

  // Extend (sparseInputTraverser.cpp:70-72): bits |= mask bits (a new value).
  extend(dependencyMask: VdfMask): void {
    this._dependencyBits = this._dependencyBits.or(dependencyMask.getBits())
  }

  getPath(): VdfObjectPtrVector {
    return this._path ?? []
  }
}

// _StackFrame (sparseInputTraverser.cpp:95-141).
class _StackFrame {
  private readonly _maskedOutput: VdfMaskedOutput
  private readonly _path: VdfObjectPtrVector | null

  constructor(
    maskedOutput: VdfMaskedOutput,
    basePath?: VdfObjectPtrVector,
    pathElement?: VdfConnection | null) {
    this._maskedOutput = maskedOutput
    this._path = null
    if (basePath) {
      this._path = [...basePath]
      if (pathElement) this._path.push(VdfObjectPtr.fromConnection(pathElement, true))
    }
  }

  getMaskedOutput(): VdfMaskedOutput {
    return this._maskedOutput
  }

  getPath(): VdfObjectPtrVector {
    return this._path ?? []
  }
}

// _TraversalState (sparseInputTraverser.cpp:143-181).
class _TraversalState {
  readonly visitedConnections = new Map<VdfConnection, TfCompressedBits>()
  readonly stack: _StackFrame[] = []
  readonly prioritizedOutputs =
    new Map<string, { index: VdfPoolChainIndex, value: _PrioritizedOutput }>()
  readonly nodeCallbackInvocations: TfBits
  readonly nodeIsSkippable: TfBits

  constructor(
    readonly nodePathCallback: VdfSparseInputTraverser_NodePathCallback | null,
    readonly connectionPathCallback: VdfSparseInputTraverser_ConnectionPathCallback | null,
    readonly producePath: boolean,
    numNodes = 0) {
    this.nodeCallbackInvocations = new TfBits(numNodes)
    this.nodeIsSkippable = new TfBits(numNodes)
  }

  // prioritizedOutputs.begin() with std::greater: the greatest index.
  topPrioritizedKey(): string {
    let topKey = ''
    let top: VdfPoolChainIndex | null = null
    for (const [key, entry] of this.prioritizedOutputs) {
      if (!top || entry.index.greaterThan(top)) {
        top = entry.index
        topKey = key
      }
    }
    return topKey
  }
}

// _GetNumNodesInNetwork (sparseInputTraverser.cpp:184-198).
function _GetNumNodesInNetwork(request: readonly VdfMaskedOutput[]): number {
  if (!request.length || !TF_VERIFY(request[0]!.GetOutput(), 'request.front().GetOutput()')) {
    return 0
  }
  return request[0]!.GetOutput()!.getNode().getNetwork().getNodeCapacity()
}

export class VdfSparseInputTraverser {
  static readonly CallbackModeAllNodes =
    VdfSparseInputTraverser_CallbackMode.CallbackModeAllNodes
  static readonly CallbackModeTerminalNodes =
    VdfSparseInputTraverser_CallbackMode.CallbackModeTerminalNodes

  /**
   * Traverse (sparseInputTraverser.cpp:200-216): calls nodeCallback for each
   * node visited; a false return halts traversal locally.
   */
  static traverse(
    request: readonly VdfMaskedOutput[],
    nodeCallback: VdfSparseInputTraverser_NodeCallback | null,
    callbackMode = VdfSparseInputTraverser_CallbackMode.CallbackModeAllNodes): void {
    const state = new _TraversalState(
      nodeCallback
        ? (node, _path) => VdfSparseInputTraverser._nodePathCallbackAdapter(nodeCallback, node)
        : null,
      null /* connectionCallback */, false /* producePath */,
      nodeCallback ? _GetNumNodesInNetwork(request) : 0)

    VdfSparseInputTraverser._initTraversal(request, state, callbackMode)
  }

  /**
   * TraverseWithConnectionCallback (sparseInputTraverser.cpp:218-237): calls
   * connectionCallback for each connection visited.
   */
  static traverseWithConnectionCallback(
    request: readonly VdfMaskedOutput[],
    connectionCallback: VdfSparseInputTraverser_ConnectionCallback | null): void {
    const state = new _TraversalState(
      null /* nodePathCallback */,
      connectionCallback
        ? (connection, mask, _path) =>
          VdfSparseInputTraverser._connectionPathCallbackAdapter(
            connectionCallback, connection, mask)
        : null,
      false /* producePath */)

    VdfSparseInputTraverser._initTraversal(request, state)
  }

  /**
   * TraverseWithPath (sparseInputTraverser.cpp:239-254): as Traverse, with
   * the path from the start passed to the callbacks.
   */
  static traverseWithPath(
    request: readonly VdfMaskedOutput[],
    nodePathCallback: VdfSparseInputTraverser_NodePathCallback | null,
    connectionPathCallback: VdfSparseInputTraverser_ConnectionPathCallback | null,
    callbackMode = VdfSparseInputTraverser_CallbackMode.CallbackModeAllNodes): void {
    const state = new _TraversalState(
      nodePathCallback, connectionPathCallback, true /* producePath */,
      nodePathCallback ? _GetNumNodesInNetwork(request) : 0)

    VdfSparseInputTraverser._initTraversal(request, state, callbackMode)
  }

  // _InitTraversal (sparseInputTraverser.cpp:256-345).
  private static _initTraversal(
    request: readonly VdfMaskedOutput[],
    state: _TraversalState,
    callbackMode = VdfSparseInputTraverser_CallbackMode.CallbackModeAllNodes): void {
    TF_AXIOM(state, 'state')

    if (!request.length) return

    // Push the initial masked outputs onto the stack.
    for (const i of request) {
      if (state.producePath) state.stack.push(new _StackFrame(i, [], null))
      else state.stack.push(new _StackFrame(i))
    }

    while (state.stack.length || state.prioritizedOutputs.size) {
      while (state.stack.length) {
        const frame = state.stack.pop()!
        VdfSparseInputTraverser._traverseOutput(state, frame, callbackMode)
      }

      if (state.prioritizedOutputs.size) {
        const topKey = state.topPrioritizedKey()
        const top = state.prioritizedOutputs.get(topKey)!.value

        const dependencyMask = new VdfMask(top.getDependencyBits())

        const f = new _StackFrame(
          new VdfMaskedOutput(top.GetOutput(), dependencyMask),
          top.getPath(), null)

        VdfSparseInputTraverser._traverseOutput(state, f, callbackMode)

        // The traversal must not have extended the entry being processed.
        TF_VERIFY(dependencyMask.getBits().Equals(top.getDependencyBits()),
          'dependencyMask.GetBits() == top.GetDependencyBits()')

        state.prioritizedOutputs.delete(topKey)
      }
    }
  }

  // _TraverseOutput (sparseInputTraverser.cpp:347-531).
  private static _traverseOutput(
    state: _TraversalState,
    frame: _StackFrame,
    callbackMode: VdfSparseInputTraverser_CallbackMode): void {
    const maskedOutput = frame.getMaskedOutput()
    const output = maskedOutput.GetOutput()
    TF_DEV_AXIOM(output, 'output')

    const node = output.getNode()

    // In terminal node mode, only invoke the callback on nodes without input
    // connections.
    const shouldInvokeCallback =
      callbackMode !== VdfSparseInputTraverser_CallbackMode.CallbackModeTerminalNodes ||
      !node.hasInputConnections()

    if (shouldInvokeCallback && state.nodePathCallback) {
      const nodeIndex = VdfNode.getIndexFromId(node.getId())

      if (state.nodeIsSkippable.isSet(nodeIndex)) return

      if (!state.nodeCallbackInvocations.isSet(nodeIndex)) {
        let execute = true

        const affectsMask = output.getAffectsMask()
        if (affectsMask) execute = affectsMask.overlaps(maskedOutput.GetMask())

        if (execute) {
          state.nodeCallbackInvocations.Set(nodeIndex)

          if (!state.nodePathCallback(node, frame.getPath())) {
            state.nodeIsSkippable.Set(nodeIndex)
            return
          }
        }
      } else if (callbackMode === VdfSparseInputTraverser_CallbackMode.CallbackModeTerminalNodes) {
        // Only in terminal node mode can we skip a node whose callback was
        // already invoked.
        return
      }
    }

    // Ask the node for the dependencies.
    const dependencies = node.computeInputDependencyMasks(
      maskedOutput, false /* skipAssociatedInputs */)

    for (const [connection, dependencyMask] of dependencies) {
      TF_DEV_AXIOM(connection, 'connection')

      if (state.connectionPathCallback) {
        if (!state.connectionPathCallback(connection, dependencyMask, frame.getPath())) {
          continue
        }
      }

      // Skip this connection if its accumulated mask contains the current
      // dependency mask (another path, or a cycle).
      const visited = state.visitedConnections.get(connection)
      if (visited && visited.contains(dependencyMask.getBits())) continue

      if (visited) {
        state.visitedConnections.set(connection, visited.or(dependencyMask.getBits()))
      } else {
        state.visitedConnections.set(connection, dependencyMask.getBits())
      }

      const sourceOutput = connection.getNonConstSourceOutput()

      // Without paths, pool outputs are deferred and processed in pool chain
      // order (further down the chain first).
      if (!state.producePath && Vdf_IsPoolOutput(sourceOutput)) {
        const poolIndex = node.getNetwork().getPoolChainIndex(sourceOutput)
        const key = poolIndex.getKey()
        const iter = state.prioritizedOutputs.get(key)

        if (iter) {
          TF_VERIFY(iter.value.GetOutput() === sourceOutput,
            'iter->second.GetOutput() == &sourceOutput')
          iter.value.extend(dependencyMask)
        } else {
          state.prioritizedOutputs.set(key, {
            index: poolIndex,
            value: state.producePath
              ? new _PrioritizedOutput(sourceOutput, dependencyMask, frame.getPath(), connection)
              : new _PrioritizedOutput(sourceOutput, dependencyMask),
          })
        }
      } else {
        const mo = new VdfMaskedOutput(sourceOutput, dependencyMask)
        if (state.producePath) {
          state.stack.push(new _StackFrame(mo, frame.getPath(), connection))
        } else {
          state.stack.push(new _StackFrame(mo))
        }
      }
    }
  }

  // _NodePathCallbackAdapter (sparseInputTraverser.h:213-219).
  private static _nodePathCallbackAdapter(
    nodeCallback: VdfSparseInputTraverser_NodeCallback,
    node: VdfNode): boolean {
    return nodeCallback(node)
  }

  // _ConnectionPathCallbackAdapter (sparseInputTraverser.h:224-231).
  private static _connectionPathCallbackAdapter(
    connectionCallback: VdfSparseInputTraverser_ConnectionCallback,
    connection: VdfConnection,
    dependencyMask: VdfMask): boolean {
    return connectionCallback(connection, dependencyMask)
  }
}

export declare namespace VdfSparseInputTraverser {
  type CallbackMode = VdfSparseInputTraverser_CallbackMode
  type NodeCallback = VdfSparseInputTraverser_NodeCallback
  type ConnectionCallback = VdfSparseInputTraverser_ConnectionCallback
  type NodePathCallback = VdfSparseInputTraverser_NodePathCallback
  type ConnectionPathCallback = VdfSparseInputTraverser_ConnectionPathCallback
}
