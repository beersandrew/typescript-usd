// Ported from OpenUSD 26.11.1: pxr/exec/vdf/testUtils.cpp,
//  pxr/exec/vdf/testUtils.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/testUtils.h and
// pxr/exec/vdf/testUtils.cpp: classes to facilitate network creation in
// unit tests.
//
// Mapping notes:
// - The VdfTestUtils namespace is a TS namespace.
// - Templates over the value type take a TfType first (doc section 4.1):
//   `AddInputVector<T>(name, size)` is `AddInputVector(type, name, size)`,
//   `Read<T>(name)` is `Read(type, name)`, and so on.
// - `Network::operator[]` is Get(name); `Node::operator>>` and
//   `_NodeOutput::operator>>` are ShiftRight(input); `operator VdfNode *()`
//   is GetVdfNode().
// - ExecutionStats, ExecutionStatsProcessor (openexec-stats) and
//   CreateSpeculationExecutor (openexec-speculation) fail loudly.
//
// Simple example of how to use these classes (testUtils.h:46-70):
//
//     const graph = new VdfTestUtils.Network()
//     const outType = new VdfTestUtils.CallbackNodeType(callback)
//     outType.ReadWrite(intType, 'moves', 'moves')
//     graph.AddInputVector(intType, 'input', 3)
//     graph.Add('consume', outType)
//     graph.Get('input').SetValue(0, 11).SetValue(1, 22).SetValue(2, 33)
//     graph.Get('input').ShiftRight(
//         graph.Get('consume').In('moves', VdfMask.AllOnes(3)))

import {
  TF_AXIOM,
  TF_CODING_ERROR,
  TF_FATAL_ERROR,
  TfStringTokenize,
  type TfCompressedBits,
  type Token as TfToken,
  type Type as TfType,
} from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { VdfInputSpecs, VdfOutputSpecs } from './connectorSpecs.ts'
import type { VdfContext } from './context.ts'
import type { VdfExecutorInterface } from './executorInterface.ts'
import { VdfInputVector } from './inputVector.ts'
import { VdfIterator } from './iterator.ts'
import type { VdfMask } from './mask.ts'
import type { VdfMaskedOutput } from './maskedOutput.ts'
import { VdfNetwork, VdfNetwork_EditMonitor } from './network.ts'
import { VdfNode } from './node.ts'
import type { VdfOutput } from './output.ts'

function _NotPorted(site: string, what: string, debt: string): never {
  const message = `VdfTestUtils (pxr/exec/vdf/${site}): ${what} is not ported (${debt})`
  TF_CODING_ERROR(message)
  throw new Error(message)
}

export namespace VdfTestUtils {
  /** CallbackNode::ValueFunction (testUtils.h:86). */
  export type ValueFunction = (context: VdfContext) => void

  /** CallbackNode (testUtils.h:82-111): a simple callback node. */
  export class CallbackNode extends VdfNode {
    private readonly _cb: ValueFunction

    constructor(
      network: VdfNetwork,
      inputSpecs: VdfInputSpecs,
      outputSpecs: VdfOutputSpecs,
      cb: ValueFunction) {
      super(network, inputSpecs, outputSpecs)
      this._cb = cb
    }

    /** testUtils.h:96-98. */
    override compute(context: VdfContext): void {
      this._cb(context)
    }

    /** testUtils.h:104-106. */
    protected override _isDerivedEqual(_rhs: VdfNode): boolean {
      return false
    }

    /** ArchGetDemangled(typeid(*this)), used for debug names. */
    override _getDemangledTypeName(): string {
      return 'VdfTestUtils::CallbackNode'
    }
  }

  /**
   * OutputAccessor (testUtils.h:118-130): enables access to a VdfOutput
   * from a VdfContext.
   */
  export class OutputAccessor extends VdfIterator {
    private readonly _context: VdfContext

    constructor(context: VdfContext) {
      super()
      this._context = context
    }

    GetOutput(): VdfOutput | null {
      return this._getNode(this._context).GetOutput()
    }
  }

  /** DependencyCallbackNode::InputDependencyFunction (testUtils.h:141-143). */
  export type InputDependencyFunction =
    (maskedOutput: VdfMaskedOutput, inputConnection: VdfConnection) => TfCompressedBits

  /** DependencyCallbackNode::OutputDependencyFunction (testUtils.h:145-148). */
  export type OutputDependencyFunction =
    (inputConnection: VdfConnection, inputDependencyMask: VdfMask, output: VdfOutput) => VdfMask

  /**
   * DependencyCallbackNode (testUtils.h:138-192): a CallbackNode with custom
   * input / output dependency callbacks.
   */
  export class DependencyCallbackNode extends CallbackNode {
    private readonly _inputDependencyFunction: InputDependencyFunction | null
    private readonly _outputDependencyFunction: OutputDependencyFunction | null

    constructor(
      network: VdfNetwork,
      inputSpecs: VdfInputSpecs,
      outputSpecs: VdfOutputSpecs,
      fn: ValueFunction,
      inputDependencyFunction: InputDependencyFunction | null,
      outputDependencyFunction: OutputDependencyFunction | null) {
      super(network, inputSpecs, outputSpecs, fn)
      this._inputDependencyFunction = inputDependencyFunction
      this._outputDependencyFunction = outputDependencyFunction
    }

    /** ArchGetDemangled(typeid(*this)), used for debug names. */
    override _getDemangledTypeName(): string {
      return 'VdfTestUtils::DependencyCallbackNode'
    }

    /** testUtils.h:163-173. */
    protected override _computeInputDependencyMask(
      maskedOutput: VdfMaskedOutput, inputConnection: VdfConnection): TfCompressedBits {
      if (this._inputDependencyFunction) {
        return this._inputDependencyFunction(maskedOutput, inputConnection)
      } else {
        return super._computeInputDependencyMask(maskedOutput, inputConnection)
      }
    }

    /** testUtils.h:175-186. */
    protected override _computeOutputDependencyMask(
      inputConnection: VdfConnection, inputDependencyMask: VdfMask, output: VdfOutput): VdfMask {
      if (this._outputDependencyFunction) {
        return this._outputDependencyFunction(inputConnection, inputDependencyMask, output)
      } else {
        return super._computeOutputDependencyMask(inputConnection, inputDependencyMask, output)
      }
    }
  }

  /** NodeType (testUtils.h:199-205): base class for kinds of nodes. */
  export abstract class NodeType {
    abstract newNode(net: VdfNetwork): VdfNode
  }

  /** InputNodeType (testUtils.h:213-230): a VdfInputVector of type T. */
  export class InputNodeType extends NodeType {
    private readonly _type: TfType
    private readonly _size: number

    constructor(type: TfType, size: number) {
      super()
      this._type = type
      this._size = size
    }

    /** Creates a VdfInputVector<T> (testUtils.h:221-224). */
    newNode(net: VdfNetwork): VdfNode {
      return new VdfInputVector(this._type, net, this._size)
    }
  }

  /** CallbackNodeType (testUtils.h:237-307). */
  export class CallbackNodeType extends NodeType {
    private readonly _inputSpecs = new VdfInputSpecs()
    private readonly _outputSpecs = new VdfOutputSpecs()
    private readonly _function: ValueFunction
    private _inputDependencyFunction: InputDependencyFunction | null = null
    private _outputDependencyFunction: OutputDependencyFunction | null = null

    /** testUtils.h:243-245. */
    constructor(fn: ValueFunction) {
      super()
      this._function = fn
    }

    /** testUtils.h:249-254. */
    newNode(net: VdfNetwork): VdfNode {
      return new DependencyCallbackNode(
        net, this._inputSpecs, this._outputSpecs,
        this._function, this._inputDependencyFunction, this._outputDependencyFunction)
    }

    /** Adds a ReadConnector (testUtils.h:258-262). */
    Read(type: TfType, name: TfToken): this {
      this._inputSpecs.readConnector(type, name)
      return this
    }

    /** Adds a ReadWrite input and an associated Output (testUtils.h:266-271). */
    readWrite(type: TfType, name: TfToken, outName: TfToken): this {
      this._inputSpecs.readWriteConnector(type, name, outName)
      this._outputSpecs.connector(type, outName)
      return this
    }

    /** Adds an output (testUtils.h:275-279). */
    out(type: TfType, name: TfToken): this {
      this._outputSpecs.connector(type, name)
      return this
    }

    /** testUtils.h:284-288. */
    computeInputDependencyMaskCallback(fn: InputDependencyFunction): this {
      this._inputDependencyFunction = fn
      return this
    }

    /** testUtils.h:293-297. */
    computeOutputDependencyMaskCallback(fn: OutputDependencyFunction): this {
      this._outputDependencyFunction = fn
      return this
    }
  }

  /** Node::_NodeInput (testUtils.h:323-329): a node's input. */
  export interface _NodeInput {
    readonly inputNode: VdfNode
    readonly inputName: TfToken
    readonly inputMask: VdfMask
  }

  /** Node::_NodeOutput (testUtils.h:332-341): a node's output. */
  export class _NodeOutput {
    readonly owner: Node
    readonly outputName: TfToken

    constructor(owner: Node, outputName: TfToken) {
      this.owner = owner
      this.outputName = outputName
    }

    /** operator>> (testUtils.cpp:31-37). */
    shiftRight(rhs: _NodeInput): Node {
      this.owner._connect(rhs, this.owner.getVdfNode().GetOutput(this.outputName))
      // XXX: I think this is wrong, it should return NodeInput's node.
      return this.owner
    }
  }

  /** Node (testUtils.h:316-396): a wrapper around a VdfNode. */
  export class Node {
    // testUtils.h:392: the network for connection purposes.
    private readonly _network: VdfNetwork

    // testUtils.h:395: the underlying VdfNode that we represent.
    private readonly _vdfNode: VdfNode

    constructor(network: VdfNetwork, vdfNode: VdfNode) {
      this._network = network
      this._vdfNode = vdfNode
    }

    /**
     * operator>> (testUtils.cpp:23-29): connects the default output of this
     * node to the input described by rhs.
     */
    shiftRight(rhs: _NodeInput): Node {
      this._connect(rhs, this._vdfNode.GetOutput())
      // XXX: I think this is wrong, it should return NodeInput's node.
      return this
    }

    /** In (testUtils.cpp:40-48). */
    in(inputName: TfToken, inputMask: VdfMask): _NodeInput {
      return { inputName, inputMask, inputNode: this._vdfNode }
    }

    /** Output (testUtils.cpp:50-57). */
    Output(outputName: TfToken): _NodeOutput {
      return new _NodeOutput(this, outputName)
    }

    /**
     * SetValue (testUtils.h:366-370): sets a value on this node, which must
     * be an input vector.
     */
    setValue(index: number, val: unknown): this {
      TF_AXIOM(this._vdfNode instanceof VdfInputVector,
        'dynamic_cast<VdfInputVector<T> *>(_vdfNode)')
      ;(this._vdfNode as VdfInputVector<unknown>).setValue(index, val)
      return this
    }

    /** GetVdfNode (testUtils.h:374-378), also `operator VdfNode *()`. */
    getVdfNode(): VdfNode {
      return this._vdfNode
    }

    /** GetOutput (testUtils.h:380). */
    GetOutput(): VdfOutput | null {
      return this._vdfNode.GetOutput()
    }

    /** _Connect (testUtils.cpp:59-65); called by _NodeOutput (a friend). */
    _connect(rhs: _NodeInput, output: VdfOutput | null): void {
      const connection = this._network.connect(
        output, rhs.inputNode, rhs.inputName, rhs.inputMask)
      TF_AXIOM(connection, 'connection')
    }
  }

  /**
   * Network::_EditMonitor (testUtils.h:416-453): keeps the Network in sync
   * when nodes are deleted.
   */
  class _EditMonitor extends VdfNetwork_EditMonitor {
    private readonly _network: Network

    constructor(network: Network) {
      super()
      this._network = network
    }

    /**
     * WillDelete (testUtils.cpp:71-86 for nodes; testUtils.h:447 for
     * connections, unimplemented).
     */
    willDelete(nodeOrConnection: VdfNode | VdfConnection): void {
      if (!(nodeOrConnection instanceof VdfNode)) {
        return
      }
      this._network._willDeleteNode(nodeOrConnection)
    }

    /** WillClear (testUtils.cpp:88-92). */
    willClear(): void {
      this._network._clearNodes()
    }

    /** testUtils.h:445-446: unimplemented events. */
    didConnect(_connection: VdfConnection): void {}
    didAddNode(_node: VdfNode): void {}
  }

  /**
   * Network (testUtils.h:405-543): a container that holds on to all the
   * nodes and facilitates their management.
   */
  export class Network {
    // testUtils.h:534-535: nodes that have been created, indexed by name.
    private readonly _nodes = new Map<string, Node>()

    // testUtils.h:538: the network that will contain the VdfNodes we create.
    private readonly _network = new VdfNetwork()

    // testUtils.h:542: keeps the Network in sync when Nodes are deleted.
    private readonly _editMonitor: _EditMonitor

    /**
     * testUtils.h:458-460. The destructor (testUtils.h:462-464) only
     * unregisters the edit monitor from the owned network and is not ported.
     */
    constructor() {
      this._editMonitor = new _EditMonitor(this)
      this._network.registerEditMonitor(this._editMonitor)
    }

    /**
     * Add (testUtils.cpp:96-124): creates a node named `nodeName` of
     * `nodeType`, or takes ownership of `customNode`, which must have been
     * created with this network's VdfNetwork.
     */
    add(nodeName: string, nodeTypeOrCustomNode: NodeType | VdfNode): void {
      const vdfNode = nodeTypeOrCustomNode instanceof NodeType
        ? nodeTypeOrCustomNode.newNode(this._network)
        : nodeTypeOrCustomNode
      const node = new Node(this._network, vdfNode)
      vdfNode.setDebugName(nodeName)

      // The internal mapping of nodes uses the explicitly supplied string
      // "nodeName", but the node debug name registered with the network is
      // prefixed with the node type name.
      this._nodes.set(nodeName, node)
    }

    /** AddInputVector (testUtils.h:486-489). */
    addInputVector(type: TfType, nodeName: string, size = 1): void {
      this.add(nodeName, new InputNodeType(type, size))
    }

    /** operator[] (testUtils.cpp:126-142). */
    Get(nodeName: string): Node {
      const node = this._nodes.get(nodeName)
      if (node) {
        return node
      }
      return TF_FATAL_ERROR("Node '" + nodeName + "' not found.")
    }

    /** GetNodeName (testUtils.cpp:151-160). */
    getNodeName(nodeId: number): string {
      for (const [name, node] of this._nodes) {
        if (node.getVdfNode().getId() === nodeId) {
          return name
        }
      }
      // testUtils.cpp:159 returns std::string(NULL), which is undefined
      // behavior; fail loudly instead.
      return TF_FATAL_ERROR(
        'VdfTestUtils::Network::GetNodeName (pxr/exec/vdf/testUtils.cpp:159): ' +
        `no node with id ${nodeId}`)
    }

    /**
     * GetConnection (testUtils.cpp:162-224). The syntax for connectionName
     * is "srcNode:connector -> tgtNode:connector", or "srcNode -> tgtNode:connector"
     * with exactly one output connector.
     */
    getConnection(connectionName: string): VdfConnection | null {
      const components = TfStringTokenize(connectionName, ' ')

      if (components.length === 3) {
        const src = TfStringTokenize(components[0]!, ':')
        const tgt = TfStringTokenize(components[2]!, ':')

        if (src.length < 1 || tgt.length < 1) {
          return null
        }

        // If the source or target have been deleted, this connection is no
        // longer valid and is treated as though it doesn't exist.
        if (!this._nodes.has(src[0]!) || !this._nodes.has(tgt[0]!)) {
          return null
        }

        const srcNode = this.Get(src[0]!).getVdfNode()
        const tgtNode = this.Get(tgt[0]!).getVdfNode()

        // If there is no connector name specified, use first available one.
        if (src.length === 1) {
          const specs = srcNode.getOutputSpecs()
          if (specs.getSize() >= 1) {
            src.push(specs.getOutputSpec(0)!.getName())
          }
        }

        if (src.length !== 2) {
          return null
        }

        // If there is no connector name specified, use first available one.
        // (testUtils.cpp:201 reads the *source* node's input specs.)
        if (tgt.length === 1) {
          const specs = srcNode.getInputSpecs()
          if (specs.getSize() >= 1) {
            tgt.push(specs.getInputSpec(0)!.getName())
          }
        }

        if (tgt.length !== 2) {
          return null
        }

        const tgtInput = tgtNode.getInput(tgt[1]! as TfToken)
        if (tgtInput) {
          for (let i = 0; i < tgtInput.getNumConnections(); i++) {
            const c = tgtInput.getNonConstConnection(i)
            if (c.getSourceNode() === srcNode) {
              if (c.getSourceOutput().getName() === src[1]) {
                return c
              }
            }
          }
        }
      }

      return null
    }

    /** GetNetwork (testUtils.h:522-526). */
    getNetwork(): VdfNetwork {
      return this._network
    }

    /** _EditMonitor::WillDelete(const VdfNode *) (testUtils.cpp:71-86). */
    _willDeleteNode(node: VdfNode): void {
      for (const [name, entry] of this._nodes) {
        if (node === entry.getVdfNode()) {
          this._nodes.delete(name)
          break
        }
      }
    }

    /** _EditMonitor::WillClear (testUtils.cpp:88-92). */
    _clearNodes(): void {
      this._nodes.clear()
    }
  }

  /**
   * ExecutionStatsProcessor (testUtils.h:555-588).
   * FAITHFULNESS-DEBT(openexec-stats): VdfExecutionStatsProcessor is not
   * ported -> port executionStatsProcessor.{h,cpp} and derive from it.
   */
  export class ExecutionStatsProcessor {
    constructor() {
      _NotPorted('testUtils.h:555-588', 'ExecutionStatsProcessor', 'openexec-stats')
    }
  }

  /**
   * ExecutionStats (testUtils.h:597-671).
   * FAITHFULNESS-DEBT(openexec-stats): VdfExecutionStats is not ported ->
   * port executionStats.{h,cpp} and wrap it here.
   */
  export class ExecutionStats {
    constructor() {
      _NotPorted('testUtils.h:597-671', 'ExecutionStats', 'openexec-stats')
    }
  }

  /**
   * CreateSpeculationExecutor (testUtils.h:677-696).
   * FAITHFULNESS-DEBT(openexec-speculation): VdfSpeculationExecutor is not
   * ported -> port speculationExecutor.h and construct it here.
   */
  export function CreateSpeculationExecutor(
    _speculationNode: VdfNode | null,
    _parentExecutor: VdfExecutorInterface | null): VdfExecutorInterface {
    return _NotPorted('testUtils.h:677-696', 'CreateSpeculationExecutor', 'openexec-speculation')
  }
}
