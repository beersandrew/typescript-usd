// Ported from OpenUSD 26.11.1: pxr/exec/vdf/network.cpp,
//  pxr/exec/vdf/network.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/network.h and network.cpp.
//
// A VdfNetwork owns a collection of VdfNodes and their connections. It
// assigns node and output ids (docs/openexec-x1.md 4.1 "Ids":
// id = version * 2**32 + index), keeps an edit version, the pool chain
// indexer, the shared specs registry, the schedule invalidator, and notifies
// registered edit monitors.
//
// Mapping choices:
// - Members that upstream reserves for its friends VdfNode, VdfOutput,
//   VdfIsolatedSubnetwork and VdfSchedule (network.h:290-384) keep their
//   _names and are public here.
// - Destruction: ~VdfNetwork (network.cpp:62-65) is _Destruct(), which calls
//   Clear(); deleting a node calls VdfNode._Destruct().
// - The free id queues (tbb::concurrent_queue) are FIFO arrays.
// - DumpStats writes to any object with a write(string) method (std::ostream).

import {
  TF_CODING_ERROR,
  TF_VERIFY,
} from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { Vdf_ExecNodeDebugName } from './execNodeDebugName.ts'
import { VdfExecutionTypeRegistry } from './executionTypeRegistry.ts'
import type { VdfInput } from './input.ts'
import { Vdf_InputAndOutputSpecsRegistry } from './inputAndOutputSpecsRegistry.ts'
import type { VdfMask } from './mask.ts'
import { VdfMaskedOutput } from './maskedOutput.ts'
import { VdfNetworkStats, type VdfNetworkStats_NodeTypeStats } from './networkStats.ts'
import { VdfNode } from './node.ts'
import { VdfOutput } from './output.ts'
import type { VdfPoolChainIndex } from './poolChainIndex.ts'
import { VdfPoolChainIndexer } from './poolChainIndexer.ts'
import type { VdfSchedule } from './schedule.ts'
import { Vdf_ScheduleInvalidator } from './scheduleInvalidator.ts'
import type { VdfId } from './types.ts'

// TfToken is a string (docs/openexec-x1.md 4, rule 3).
type TfToken = string

/** A std::ostream for DumpStats. */
export interface VdfOStream {
  write(s: string): unknown
}

/**
 * VdfNetwork::EditMonitor (network.h:138-167): an abstract monitor of network
 * edits. "Will" notification is sent before an edit, "Did" after it.
 */
export abstract class VdfNetwork_EditMonitor {
  /** Called before the network is cleared out (network.h:150). */
  abstract willClear(): void

  /** Called after a connection has been made (network.h:154). */
  abstract didConnect(connection: VdfConnection): void

  /** Called after a node has been added (network.h:158). */
  abstract didAddNode(node: VdfNode): void

  /**
   * WillDelete(const VdfNode *) and WillDelete(const VdfConnection *)
   * (network.h:162-166): called before a node or connection is deleted.
   */
  abstract willDelete(node: VdfNode): void
  abstract willDelete(connection: VdfConnection): void
}

export class VdfNetwork {
  /** AppendConnection (network.h:66). */
  static readonly AppendConnection = -1

  /** VdfNetwork::EditMonitor (network.h:138). */
  static readonly EditMonitor = VdfNetwork_EditMonitor

  // _nodes (network.h:387).
  private _nodes: Array<VdfNode | null> = []

  // _freeNodeIds (network.h:390).
  private _freeNodeIds: VdfId[] = []

  // _initialNodeVersion (network.h:393).
  private _initialNodeVersion = 0

  // _outputCapacity (network.h:396).
  private _outputCapacity = 0

  // _freeOutputIds (network.h:399).
  private _freeOutputIds: VdfId[] = []

  // _monitors (network.h:402-403).
  private _monitors: VdfNetwork_EditMonitor[] = []

  // _scheduleInvalidator (network.h:406).
  private readonly _scheduleInvalidator = new Vdf_ScheduleInvalidator()

  // _poolChainIndexer (network.h:409).
  private readonly _poolChainIndexer = new VdfPoolChainIndexer()

  // _specsRegistry (network.h:412).
  private readonly _specsRegistry = new Vdf_InputAndOutputSpecsRegistry()

  // _version (network.h:415).
  private _version = 0

  // _nodeDebugNames (network.h:418-423): index -> debug name, null when
  // tombstoned.
  private _nodeDebugNames = new Map<number, Vdf_ExecNodeDebugName | null>()

  /** VdfNetwork() (network.cpp:42-60). */
  constructor() {
    // Force registration of all execution types in Vdf as soon as the first
    // network is constructed (network.cpp:50-59).
    VdfExecutionTypeRegistry.GetInstance()
  }

  /** ~VdfNetwork (network.cpp:62-65). */
  _destruct(): void {
    this.clear()
    this._scheduleInvalidator._destruct()
  }

  /**
   * GetNodeDebugName (network.cpp:67-81): the registered debug name, or the
   * node's C++ type name.
   */
  getNodeDebugName(node: VdfNode): string {
    const index = VdfNode.getIndexFromId(node.getId())
    const entry = this._nodeDebugNames.get(index)

    // A tombstoned entry may belong to a previous node with this index.
    if (entry) return entry._getDebugName()

    return node._getDemangledTypeName()
  }

  /** GetOutputCapacity (network.h:87): the high-water mark of output indices. */
  getOutputCapacity(): number {
    return this._outputCapacity
  }

  /** GetNodeCapacity (network.h:95). */
  getNodeCapacity(): number {
    return this._nodes.length
  }

  /** GetNumOwnedNodes (network.h:99). */
  getNumOwnedNodes(): number {
    return this._nodes.length - this._freeNodeIds.length
  }

  /** GetNode (network.h:105-113): null when out of range or deleted. */
  getNode(i: number): VdfNode | null {
    return i < this._nodes.length ? this._nodes[i] ?? null : null
  }

  /** GetNodeById (network.cpp:112-124). */
  getNodeById(nodeId: VdfId): VdfNode | null {
    const node = this.getNode(VdfNode.getIndexFromId(nodeId))
    return node && node.getId() === nodeId ? node : null
  }

  /** Clear (network.cpp:126-160): deletes all nodes. */
  clear(): void {
    this._incrementVersion()

    for (const monitor of [...this._monitors]) {
      monitor.willClear()
    }

    // New nodes get a version above every deleted node's version.
    let maxVersion = 0
    for (const node of this._nodes) {
      if (node) {
        maxVersion = Math.max(maxVersion, VdfNode.getVersionFromId(node.getId()))
        node._destruct()
      }
    }
    this._nodes = []
    this._freeNodeIds = []
    this._initialNodeVersion = maxVersion + 1

    // Debug names were unregistered along with node deletion.
    this._nodeDebugNames.clear()

    this._scheduleInvalidator.invalidateAll()
    this._poolChainIndexer.clear()
  }

  /**
   * Connect (network.cpp:197-276): connects output (or maskedOutput) to
   * inputNode's input inputName, appended or at atIndex.
   */
  connect(
    output: VdfOutput | null,
    inputNode: VdfNode | null,
    inputName: TfToken,
    mask: VdfMask,
    atIndex?: number): VdfConnection | null
  connect(
    maskedOutput: VdfMaskedOutput,
    inputNode: VdfNode | null,
    inputName: TfToken,
    atIndex?: number): VdfConnection | null
  connect(
    outputOrMasked: VdfOutput | VdfMaskedOutput | null,
    inputNode: VdfNode | null,
    inputName: TfToken,
    maskOrIndex?: VdfMask | number,
    atIndex: number = VdfNetwork.AppendConnection): VdfConnection | null {
    if (outputOrMasked instanceof VdfMaskedOutput) {
      // network.cpp:263-276
      return this.connect(
        outputOrMasked.GetOutput(),
        inputNode,
        inputName,
        outputOrMasked.GetMask(),
        typeof maskOrIndex === 'number' ? maskOrIndex : VdfNetwork.AppendConnection)
    }

    const output = outputOrMasked
    const mask = maskOrIndex as VdfMask

    if (!TF_VERIFY(output, 'output') || !TF_VERIFY(inputNode, 'inputNode')) {
      return null
    }

    // Don't connect a node's output directly to its own input.
    if (!TF_VERIFY(
      inputNode!.isSpeculationNode() || output!.getNode() !== inputNode,
      'inputNode->IsSpeculationNode() || &output->GetNode() != inputNode',
      `Can't connect '${output!.getDebugName()}' to node ` +
      `'${inputNode!.getDebugName()} [${inputName}]': creates cycle.`)) {
      return null
    }

    // The data flowing into a read/write output's associated input must
    // contain the data flowing across the new connection (network.cpp:219-232).
    const associated = output!.getAssociatedInput()
    if (associated) {
      const connection = associated.getNumConnections() === 1
        ? associated.Get(0)
        : null
      if (connection && connection.GetMask().getSize() === mask.getSize()) {
        TF_VERIFY(connection.GetMask().contains(mask), 'connection->GetMask().Contains(mask)')
      }
    }

    const connection = output!._connect(inputNode!, inputName, mask, atIndex)

    if (connection) {
      this._poolChainIndexer.insert(connection)

      inputNode!._didAddInputConnection(connection, atIndex)

      this._incrementVersion()

      for (const monitor of [...this._monitors]) {
        monitor.didConnect(connection)
      }

      this._scheduleInvalidator.updateForConnectionChange(connection)
    }

    return connection
  }

  /** DisconnectAndDelete (network.cpp:278-305). */
  disconnectAndDelete(node: VdfNode): boolean {
    // Copy the connections, since Disconnect() modifies them.
    const connections: VdfConnection[] = []

    for (const [, output] of node.getOutputsIterator()) {
      for (const connection of output.getConnections()) connections.push(connection)
    }

    for (const [, input] of node.getInputsIterator()) {
      for (const connection of input.getConnections()) connections.push(connection)
    }

    for (const connection of connections) {
      this.disconnect(connection)
    }

    return this.Delete(node)
  }

  /** _DeleteNode (network.cpp:307-317). */
  _deleteNode(node: VdfNode): void {
    if (!TF_VERIFY(
      node && !node.hasInputConnections() && !node.hasOutputConnections(),
      'node && !node->HasInputConnections() && !node->HasOutputConnections()')) {
      return
    }
    node._destruct()
  }

  /** Delete (network.cpp:319-345): the node must have no connections. */
  Delete(node: VdfNode): boolean {
    if (node.hasInputConnections()) {
      TF_CODING_ERROR(
        `Attempt to delete a VdfNode that has input connections: ${node.getDebugName()}`)
      return false
    }

    if (node.hasOutputConnections()) {
      TF_CODING_ERROR(
        `Attempt to delete a VdfNode that has output connections: ${node.getDebugName()}`)
      return false
    }

    this._removeNode(node)
    this._deleteNode(node)
    return true
  }

  /** _RemoveNode (network.cpp:347-376): removes node without deleting it. */
  _removeNode(node: VdfNode): void {
    TF_VERIFY(node, 'node')

    const nodeId = node.getId()
    const index = VdfNode.getIndexFromId(nodeId)

    TF_VERIFY(index < this._nodes.length, 'index < _nodes.size()')
    TF_VERIFY(this._nodes[index] === node, '_nodes[index] == node')

    this._scheduleInvalidator.invalidateContainingNode(node)

    this._incrementVersion()

    for (const m of [...this._monitors]) {
      m.willDelete(node)
    }

    this._nodes[index] = null

    this._freeNodeIds.push(nodeId)
  }

  /** _DidChangeAffectsMask (network.cpp:378-382). */
  _didChangeAffectsMask(output: VdfOutput): void {
    this._scheduleInvalidator.updateForAffectsMaskChange(output)
  }

  /** Disconnect (network.cpp:384-392): removes and deletes connection. */
  disconnect(connection: VdfConnection): void {
    this._removeConnection(connection)
    this._deleteConnection(connection)
  }

  /**
   * _RemoveConnection (network.cpp:394-419): notifies, updates dependent
   * state, and unlinks the connection from its endpoints.
   */
  _removeConnection(connection: VdfConnection): void {
    this._incrementVersion()

    for (const m of [...this._monitors]) {
      m.willDelete(connection)
    }

    this._poolChainIndexer.remove(connection)

    this._scheduleInvalidator.updateForConnectionChange(connection)

    connection.getTargetNode()._willRemoveInputConnection(connection)

    connection.getTargetInput()._removeConnection(connection)
    connection.getSourceOutput()._removeConnection(connection)
  }

  /** _DeleteConnection (network.cpp:421-425): no observable effect. */
  _deleteConnection(_connection: VdfConnection): void {}

  /** ReorderInputConnections (network.cpp:427-434). */
  reorderInputConnections(input: VdfInput, newToOldIndices: readonly number[]): void {
    input._reorderInputConnections(newToOldIndices)
  }

  /** RegisterEditMonitor (network.cpp:436-446). */
  registerEditMonitor(monitor: VdfNetwork_EditMonitor): void {
    if (this._monitors.includes(monitor)) {
      TF_CODING_ERROR('EditMonitor registered multiple times.')
      return
    }
    this._monitors.push(monitor)
  }

  /** UnregisterEditMonitor (network.cpp:448-460). */
  unregisterEditMonitor(monitor: VdfNetwork_EditMonitor): void {
    const i = this._monitors.indexOf(monitor)
    if (i < 0) {
      TF_CODING_ERROR('EditMonitor not registered.')
      return
    }
    this._monitors.splice(i, 1)
  }

  /** GetVersion (network.h:259): changes with every topological edit. */
  getVersion(): number {
    return this._version
  }

  /**
   * DumpStats (network.cpp:543-589): prints statistics to os and returns
   * the number of owned nodes.
   */
  dumpStats(os: VdfOStream): number {
    const stats = new VdfNetworkStats(this)

    const longestType = Math.min(stats.getMaxTypeNameLength(), 50)

    let numOutputs = 0
    for (const node of this._nodes) {
      if (node) numOutputs += node.getOutputSpecs().getSize()
    }

    os.write('Network containing ' +
      `${this.getNumOwnedNodes()} nodes (with room for ` +
      `${this._freeNodeIds.length} more), ` +
      `${numOutputs} outputs and ` +
      '\n')

    os.write('----------------------------------------\n')

    for (const [typeName, values] of stats.getStatsMap()) {
      _PrintLabeledStats(os, typeName, values, longestType)
    }

    os.write('----------------------------------------\n')

    _PrintLabeledValue(os, 'Maximum Fan In', stats.getMaxFanIn(), longestType)
    _PrintLabeledValue(os, 'Maximum Fan In Node', stats.getMaxFanInNodeName(), longestType)
    _PrintLabeledValue(os, 'Maximum Fan Out', stats.getMaxFanOut(), longestType)
    _PrintLabeledValue(os, 'Maximum Fan Out Node', stats.getMaxFanOutNodeName(), longestType)

    os.write('----------------------------------------\n\n')

    return this.getNumOwnedNodes()
  }

  /** GetPoolChainIndex (network.cpp:591-594). */
  getPoolChainIndex(output: VdfOutput): VdfPoolChainIndex {
    return this._poolChainIndexer.getIndex(output)
  }

  /** _RegisterNodeDebugName (network.cpp:83-94). */
  _registerNodeDebugName(node: VdfNode, callback: (() => string) | null): void {
    if (TF_VERIFY(callback, 'callback',
      `Null callback for node: ${node._getDemangledTypeName()}`)) {
      const index = VdfNode.getIndexFromId(node.getId())
      this._nodeDebugNames.set(index, new Vdf_ExecNodeDebugName(node, callback))
    }
  }

  /** _UnregisterNodeDebugName (network.cpp:96-110): tombstones the entry. */
  _unregisterNodeDebugName(node: VdfNode): void {
    const index = VdfNode.getIndexFromId(node.getId())
    if (this._nodeDebugNames.has(index)) {
      this._nodeDebugNames.set(index, null)
    }
  }

  /**
   * _AddNode (network.cpp:162-195): assigns the node an id, reusing a free
   * index with an incremented version if there is one.
   */
  _addNode(node: VdfNode): void {
    const freeId = this._freeNodeIds.shift()
    if (freeId !== undefined) {
      const version = VdfNode.getVersionFromId(freeId) + 1
      const index = VdfNode.getIndexFromId(freeId)

      TF_VERIFY(!this._nodes[index], '!_nodes[index]')
      this._nodes[index] = node

      node._setId(version, index)
    } else {
      this._nodes.push(node)
      node._setId(this._initialNodeVersion, this._nodes.length - 1)
    }

    this._incrementVersion()

    for (const monitor of [...this._monitors]) {
      monitor.didAddNode(node)
    }
  }

  /**
   * _AcquireOutputId (network.cpp:462-480): a new index, or a free index
   * with an incremented version.
   */
  _acquireOutputId(): VdfId {
    const freeId = this._freeOutputIds.shift()
    if (freeId === undefined) {
      return this._outputCapacity++
    }

    const version = VdfOutput.getVersionFromId(freeId) + 1
    const index = VdfOutput.getIndexFromId(freeId)
    return version * 4294967296 + index
  }

  /** _ReleaseOutputId (network.cpp:482-486). */
  _releaseOutputId(id: VdfId): void {
    this._freeOutputIds.push(id)
  }

  /** _IncrementVersion (network.cpp:488-492). */
  _incrementVersion(): void {
    ++this._version
  }

  /** _RegisterSchedule (network.cpp:494-498). */
  _registerSchedule(schedule: VdfSchedule): void {
    this._scheduleInvalidator.Register(schedule)
  }

  /** _UnregisterSchedule (network.cpp:500-504). */
  _unregisterSchedule(schedule: VdfSchedule): void {
    this._scheduleInvalidator.unregister(schedule)
  }

  /** _GetScheduleInvalidator (network.h:374). */
  _getScheduleInvalidator(): Vdf_ScheduleInvalidator {
    return this._scheduleInvalidator
  }

  /** _GetInputOutputSpecsRegistry (network.h:382). */
  _getInputOutputSpecsRegistry(): Vdf_InputAndOutputSpecsRegistry {
    return this._specsRegistry
  }
}

export declare namespace VdfNetwork {
  /** VdfNetwork::EditMonitor (network.h:138). */
  type EditMonitor = VdfNetwork_EditMonitor
}

// _PrintLabeledValue (network.cpp:506-519): "label:  " followed by value
// right-justified in (width - label.length() + 10) columns.
function _PrintLabeledValue(
  os: VdfOStream, label: string, value: number | string, width: number): void {
  const extraWidth = width - label.length
  os.write(`${label}:  ` + _RightJustify(String(value), extraWidth + 10) + '\n')
}

// _PrintLabeledValue for NodeTypeStats (network.cpp:521-541): truncates long
// labels with "...", prints the count right-justified and the memory in kb.
function _PrintLabeledStats(
  os: VdfOStream,
  inLabel: string,
  value: VdfNetworkStats_NodeTypeStats,
  width: number): void {
  let label = inLabel
  let extraWidth = width - label.length
  if (extraWidth < 0) {
    label = label.slice(0, width - 3) + '...'
    extraWidth = 0
  }
  os.write(`${label}:  ` + _RightJustify(String(value.count), extraWidth + 10) +
    ` (${Math.floor(value.memUsage / 1024)} kb)` + '\n')
}

// std::ostream width + std::ios::right.
function _RightJustify(s: string, width: number): string {
  return s.length >= width ? s : ' '.repeat(width - s.length) + s
}
