// Ported from OpenUSD 26.11.1: pxr/exec/exec/program.cpp,
//  pxr/exec/exec/program.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/program.h and program.cpp.
//
// Mapping choices:
// - `CreateNode<NodeType>(journal, args...)` takes the node class as its
//   second argument: `program.CreateNode(journal, EfLeafNode, outputType)`.
//   The node class's constructor takes the network first, as upstream's.
// - tbb concurrent maps are JS Maps: attribute input nodes are keyed by
//   SdfPath.pathString; metadata input nodes by _MetadataKey (path string and
//   metadata key joined by NUL).
// - std::unordered_set<VdfNode *> / <VdfInput *> are Sets of the objects.
// - TfSpan<const T> parameters are readonly arrays; TfBits is the base/tf
//   TfBits port; std::optional<TsSpline> is `TsSpline | null`.
// - The destructor (program.cpp:117-120) is Destroy().

import { TF_CODING_ERROR, TF_FATAL_ERROR, TF_VERIFY } from 'typescript-usd/tf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import type { TsSpline } from 'typescript-usd/ts'
import {
  WorkParallelForN, WorkWithScopedDispatcher, WorkWithScopedParallelism,
} from 'typescript-usd/work'

import { TfBits } from 'typescript-usd/tf'
import { EfLeafNode } from 'typescript-usd/ef'
import { EfLeafNodeCache } from 'typescript-usd/ef'
import type { EfTime } from 'typescript-usd/ef'
import { EfTimeInputNode } from 'typescript-usd/ef'
import { EfTimeInterval } from 'typescript-usd/ef'
import type { EsfJournal } from 'typescript-usd/esf'
import type { EsfObject } from 'typescript-usd/esf'
import type { EsfSchemaConfigKey } from 'typescript-usd/esf'
import { VdfConnection } from 'typescript-usd/vdf'
import { VdfGrapher } from 'typescript-usd/vdf'
import type { VdfGrapherOptions } from 'typescript-usd/vdf'
import type { VdfInput } from 'typescript-usd/vdf'
import { VdfIsolatedSubnetwork } from 'typescript-usd/vdf'
import { VdfMask } from 'typescript-usd/vdf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'
import { VdfNetwork, VdfNetwork_EditMonitor } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'

import { Exec_AttributeInputNode } from './attributeInputNode.ts'
import type { Exec_CompilationState } from './compilationState.ts'
import { Exec_CompiledLeafNodeCache } from './compiledLeafNodeCache.ts'
import { Exec_CompiledOutputCache } from './compiledOutputCache.ts'
import type { Exec_InputKeyVector } from './inputKey.ts'
import type {
  Exec_AttributeValueInvalidationResult,
  Exec_DisconnectedInputsInvalidationResult,
  Exec_MetadataInvalidationResult,
} from './invalidationResult.ts'
import { Exec_MetadataInputNode } from './metadataInputNode.ts'
import type { Exec_NodeRecompilationInfo } from './nodeRecompilationInfo.ts'
import { Exec_NodeRecompilationInfoTable } from './nodeRecompilationInfoTable.ts'
import type { Exec_OutputKey } from './outputKey.ts'
import type { Exec_TimeChangeInvalidationResult } from './timeChangeInvalidationResult.ts'
import { Exec_UncompilationTable } from './uncompilationTable.ts'
import type { ExecValueKey } from './valueKey.ts'

/** The constructor of a node class compiled into an Exec_Program's network. */
export type Exec_ProgramNodeType<T extends VdfNode, Args extends unknown[]> =
  new (network: VdfNetwork, ...args: Args) => T

// Canonical key of std::pair<SdfPath, TfToken> in _metadataInputNodes
// (program.h:413-418).
function _MetadataKey(path: SdfPath, key: string): string {
  return `${path.pathString}\u0000${key}`
}

// program.h:403-406
interface _AttributeInputNodeEntry {
  node: Exec_AttributeInputNode
  oldSpline: TsSpline | null
}

/**
 * On behalf of the program intercepts and responds to fine-grained network
 * edits (program.cpp:49-106). VdfNetwork::EditMonitor's two WillDelete
 * overloads are one WillDelete that dispatches on its argument.
 */
class _EditMonitor extends VdfNetwork_EditMonitor {
  private readonly _program: Exec_Program

  constructor(program: Exec_Program) {
    super()
    this._program = program
  }

  willClear(): void {
    this._program._leafNodeCache.clear()
  }

  didConnect(connection: VdfConnection): void {
    this._program._leafNodeCache.didConnect(connection)

    if (connection.getSourceNode() === this._program._timeInputNode) {
      this._program._changedTimeConnections(connection.getTargetNode())
    }
  }

  didAddNode(_node: VdfNode): void {}

  willDelete(object: VdfConnection | VdfNode): void {
    if (object instanceof VdfConnection) {
      this._willDeleteConnection(object)
    } else {
      this._willDeleteNode(object)
    }
  }

  // program.cpp:69-75
  private _willDeleteConnection(connection: VdfConnection): void {
    this._program._leafNodeCache.willDeleteConnection(connection)

    if (connection.getSourceNode() === this._program._timeInputNode) {
      this._program._changedTimeConnections(connection.getTargetNode())
    }
  }

  // program.cpp:77-102
  private _willDeleteNode(node: VdfNode): void {
    this._program._compiledOutputCache.eraseByNodeId(node.getId())

    // Update the CompiledLeafNodeCache if the deleted node is a leaf node.
    const leafNode = EfLeafNode.asALeafNode(node)
    if (leafNode) {
      this._program._compiledLeafNodeCache.willDeleteNode(leafNode)
    }

    // Unregister this node if it is an attribute input node or a metadata
    // input node. The edit monitor captures both node deletion through
    // DisconnectAndDeleteNode() as well as isolated sub-network deletion.
    else if (node instanceof Exec_AttributeInputNode) {
      this._program._unregisterAttributeInputNode(node)
    } else if (node instanceof Exec_MetadataInputNode) {
      this._program._unregisterMetadataInputNode(node)
    }

    this._program._nodeRecompilationInfoTable.willDeleteNode(node)
  }
}

/**
 * Owns a VdfNetwork and related data structures to access and modify the
 * network (program.h:59-446).
 *
 * The data structures contained by this class are those that must have
 * exactly one instance per-network: which VdfOutput provides the value of a
 * given Exec_OutputKey, when specific nodes and connections should be
 * deleted, the leaf nodes dependent on any output, which nodes may be
 * isolated due to uncompilation, and which inputs should later be recompiled.
 */
export class Exec_Program {
  // The compiled data flow network.
  private readonly _network: VdfNetwork

  // An integer value that increases with each round of compilation.
  private _compilationVersion: number

  /** @internal Every network always has a compiled time input node. */
  readonly _timeInputNode: EfTimeInputNode

  /** @internal A cache of compiled output keys and corresponding outputs. */
  readonly _compiledOutputCache = new Exec_CompiledOutputCache()

  /** @internal A cache of leaf nodes compiled for value keys. */
  readonly _compiledLeafNodeCache = new Exec_CompiledLeafNodeCache()

  // Maps scene paths to data flow network that must be uncompiled in response
  // to edits to those scene paths.
  private readonly _uncompilationTable = new Exec_UncompilationTable()

  /**
   * @internal Caches traversals to quickly determine which leaf nodes are
   * downstream of an arbitrary node or output in the network.
   */
  readonly _leafNodeCache = new EfLeafNodeCache()

  // Collection of compiled attribute input nodes, keyed by attribute path.
  private readonly _attributeInputNodes = new Map<string, _AttributeInputNodeEntry>()

  // Collection of compiled metadata input nodes, keyed by _MetadataKey.
  private readonly _metadataInputNodes = new Map<string, Exec_MetadataInputNode>()

  // Array of outputs connected to the time input node.
  private _timeDependentOutputs: VdfMaskedOutput[] = []

  // Flag indicating whether _timeDependentOutputs is up-to-date.
  private _timeDependentOutputsValid: boolean

  // Input nodes currently queued for invalidation.
  private _inputNodesRequiringInvalidation: number[] = []

  // On behalf of the program intercepts and responds to network edits.
  private readonly _editMonitor: _EditMonitor

  // Nodes that may be isolated due to prior uncompilation.
  private readonly _potentiallyIsolatedNodes = new Set<VdfNode>()

  // Inputs that were disconnected during uncompilation.
  private readonly _inputsRequiringRecompilation = new Set<VdfInput>()

  /** @internal Stores recompilation info for every node. */
  readonly _nodeRecompilationInfoTable = new Exec_NodeRecompilationInfoTable()

  // True if the most recent round of compilation was interrupted.
  private _wasInterrupted = false

  /** program.cpp:108-115 */
  constructor() {
    this._network = new VdfNetwork()
    this._compilationVersion = 0
    this._timeInputNode = new EfTimeInputNode(this._network)
    this._timeDependentOutputsValid = true
    this._editMonitor = new _EditMonitor(this)
    this._network.registerEditMonitor(this._editMonitor)
  }

  /** ~Exec_Program (program.cpp:117-120). */
  destroy(): void {
    this._network.unregisterEditMonitor(this._editMonitor)
  }

  /**
   * Gets the current compilation version. This version is incremented with
   * each new round of compilation.
   */
  getCompilationVersion(): number {
    return this._compilationVersion
  }

  /**
   * Declares that the program is about to begin a new round of compilation
   * (program.h:103-109).
   */
  beginCompilation(): void {
    // Increments the program's compilation version. We expect the version to
    // never wrap-around.
    TF_VERIFY(++this._compilationVersion !== 0, '++_compilationVersion != 0')
    this._wasInterrupted = false
  }

  /** Called after completing a round of compilation (program.cpp:122-149). */
  endCompilation(compilationState: Exec_CompilationState): void {
    const interruptState = compilationState.getInterruptState()
    if (!interruptState.wasInterrupted()) {
      // All inputs requiring recompilation have completed.
      this._inputsRequiringRecompilation.clear()
      return
    }

    // The latest round of compilation was interrupted. This will be cleared
    // in the next call to BeginCompilation.
    this._wasInterrupted = true

    // The old set of inputs requiring recompilation is out of date. The
    // interrupt state holds all inputs that never completed recompilation.
    // These will be recompiled in the next round.
    this._inputsRequiringRecompilation.clear()
    interruptState.getInputsRequiringRecompilation(this._inputsRequiringRecompilation)

    // In addition to nodes potentially isolated by uncompilation, we also
    // have nodes left potentially isolated because their downstream nodes
    // were never compiled.
    interruptState.getPotentiallyIsolatedNodes(this._potentiallyIsolatedNodes)
  }

  /**
   * Adds a new node in the VdfNetwork (program.h:449-472). Constructs a node
   * of class `NodeType` with the network followed by `nodeCtorArgs`, and adds
   * uncompilation rules for the new node from the `journal`.
   */
  createNode<T extends VdfNode, Args extends unknown[]>(
    journal: EsfJournal,
    NodeType: Exec_ProgramNodeType<T, Args>,
    ...nodeCtorArgs: Args
  ): T {
    // program.h:455-457 (a static_assert upstream).
    if ((NodeType as unknown) === EfTimeInputNode) {
      TF_FATAL_ERROR(
        'CreateNode may not construct additional EfTimeInputNodes. ' +
        'Use GetTimeInputNode() to access the time node.')
    }

    const node = new NodeType(this._network, ...nodeCtorArgs)
    this._addNode(journal, node)

    // Input nodes are tracked for authored value initialization.
    if ((NodeType as unknown) === Exec_AttributeInputNode) {
      this._registerAttributeInputNode(node as unknown as Exec_AttributeInputNode)
    } else if ((NodeType as unknown) === Exec_MetadataInputNode) {
      this._registerMetadataInputNode(node as unknown as Exec_MetadataInputNode)
    }

    return node
  }

  /**
   * Makes connections between nodes in the VdfNetwork
   * (program.cpp:151-173). All non-null outputs are connected to the input
   * named `inputName` on `inputNode`; null outputs are skipped. Even if
   * `outputs` lacks non-null outputs, this method should still be called in
   * order to add uncompilation rules from the `journal`.
   */
  connect(
    journal: EsfJournal,
    outputs: readonly VdfMaskedOutput[],
    inputNode: VdfNode,
    inputName: string,
  ): void {
    for (const output of outputs) {
      // It's possible for the source outputs to contain null outputs. This can
      // happen if the input depends on output keys that could not be compiled
      // (e.g. requesting a computation on a prim which does not have a
      // registered computation of that name).
      if (output.asBool()) {
        this._network.connect(output, inputNode, inputName)
      }
    }
    this._uncompilationTable.addRulesForInput(inputNode.getId(), inputName, journal)
  }

  /**
   * Gets the VdfMaskedOutput provided by `outputKeyIdentity`
   * (program.h:146-162), or null if there is no entry. The returned masked
   * output may contain a null VdfOutput: the output key is *already known*
   * to not have a corresponding output.
   */
  getCompiledOutput(
    outputKeyIdentity: Exec_OutputKey.Identity,
  ): Exec_CompiledOutputCache.MappedType | null {
    return this._compiledOutputCache.find(outputKeyIdentity)
  }

  /**
   * Establishes that `outputKeyIdentity` is provided by `maskedOutput`
   * (program.h:164-175). Returns false if a mapping already existed.
   */
  setCompiledOutput(
    outputKeyIdentity: Exec_OutputKey.Identity,
    maskedOutput: VdfMaskedOutput,
  ): boolean {
    return this._compiledOutputCache.insert(
      outputKeyIdentity, maskedOutput, this._compilationVersion)
  }

  /** Gets the leaf node compiled for the given `valueKey`. */
  getCompiledLeafNode(valueKey: ExecValueKey): EfLeafNode | null {
    return this._compiledLeafNodeCache.find(valueKey)
  }

  /**
   * Establishes that `leafNode` has been compiled for `valueKey`. If another
   * leaf node has already been compiled for `valueKey`, this has no effect.
   */
  setCompiledLeafNode(valueKey: ExecValueKey, leafNode: EfLeafNode): void {
    this._compiledLeafNodeCache.insert(valueKey, leafNode)
  }

  /** Returns the leaf node cache. */
  getLeafNodeCache(): EfLeafNodeCache {
    return this._leafNodeCache
  }

  /** Returns the current generational counter of the execution network. */
  getNetworkVersion(): number {
    return this._network.getVersion()
  }

  /**
   * Gathers the information required to invalidate the system and notify
   * requests after uncompilation (program.cpp:175-230).
   */
  invalidateDisconnectedInputs(): Exec_DisconnectedInputsInvalidationResult {
    const disconnectedLeafNodes: VdfNode[] = []
    const invalidationRequest: VdfMaskedOutput[] = []

    for (const input of this._inputsRequiringRecompilation) {
      const node = input.getNode()

      // Accumulate all disconnected leaf nodes. These nodes are no longer
      // reachable via the leaf node traversal below, and thus must be
      // recorded separately.
      if (EfLeafNode.isALeafNode(node)) {
        disconnectedLeafNodes.push(node)
      }

      // On speculation nodes, find the output corresponding to the input and
      // record it for the traversal.
      else if (node.isSpeculationNode()) {
        const correspondingOutput = node.GetOutput(input.getName())
        if (TF_VERIFY(correspondingOutput, 'correspondingOutput')) {
          invalidationRequest.push(new VdfMaskedOutput(
            correspondingOutput,
            VdfMask.allOnes(correspondingOutput!.getNumDataEntries())))
        }
      }

      // For all other types of nodes, collect all outputs for the traversal.
      else {
        for (const [, output] of node.getOutputsIterator()) {
          invalidationRequest.push(new VdfMaskedOutput(
            output, VdfMask.allOnes(output.getNumDataEntries())))
        }
      }
    }

    // Find all the leaf nodes reachable from the disconnected inputs. We won't
    // ask the leaf node cache to perform incremental updates on the resulting
    // cached traversal, because it is not guaranteed that we will repeatedly
    // see the exact same invalidation across rounds of structural change
    // processing (in contrast to time invalidation).
    const leafNodes = this._leafNodeCache.findNodes(
      invalidationRequest, /* updateIncrementally = */ false)

    return {
      invalidationRequest,
      invalidLeafNodes: leafNodes,
      disconnectedLeafNodes,
    }
  }

  /**
   * Gathers the information required to invalidate the system and notify
   * requests after attribute authored value invalidation
   * (program.cpp:232-318).
   */
  invalidateAttributeAuthoredValues(
    invalidAttributes: readonly SdfPath[],
  ): Exec_AttributeValueInvalidationResult {
    const numInvalidAttributes = invalidAttributes.length

    const leafInvalidationRequest: VdfMaskedOutput[] = []
    const compiledProperties = new TfBits(numInvalidAttributes)
    const totalInvalidInterval = new EfTimeInterval()
    let isTimeDependencyChange = false

    for (let i = 0; i < numInvalidAttributes; ++i) {
      const path = invalidAttributes[i]!
      const entry = this._attributeInputNodes.get(path.pathString)

      // Not every invalid property is also an input to the exec network. If
      // any of these properties have been included in an exec request,
      // clients still expect to receive invalidation notices, though. However,
      // we can skip including this property in the search for dependent leaf
      // nodes in that case.
      const isCompiled = entry !== undefined
      if (!isCompiled) {
        continue
      }

      // Indicate this property was compiled.
      compiledProperties.Set(i)

      // Get the input node from the network.
      const node = entry.node

      // Make sure that the input node's internal value resolution state is
      // updated after scene changes that could affect where resolved values
      // are sourced from.
      node.updateValueResolutionState()

      // Figure out if the input node's time dependence has changed based on
      // the authored value change.
      if (node.updateTimeDependence()) {
        this._invalidateTimeDependentOutputs()
        isTimeDependencyChange = true
      }

      // Since this is an input node to the exec network, we need to make sure
      // that executors are invalidated before the next round of evaluation.
      this._inputNodesRequiringInvalidation.push(node.getId())

      // Queue the input node's output(s) for leaf node invalidation.
      leafInvalidationRequest.push(
        new VdfMaskedOutput(node.GetOutput(), VdfMask.allOnes(1)))

      // Accumulate the invalid time interval, but only if the interval
      // accumulated so far isn't already the full interval.
      const newSpline = node.getSpline()
      if (!totalInvalidInterval.isFullInterval()) {
        totalInvalidInterval.orAssign(
          _ComputeInvalidInterval(entry.oldSpline, newSpline))
      }

      // Retain the new spline so we can compare it against future authored
      // value changes.
      entry.oldSpline = newSpline
    }

    // Find all the leaf nodes reachable from the input nodes.
    const leafNodes = this._leafNodeCache.findNodes(
      leafInvalidationRequest, /* updateIncrementally */ false)

    return {
      invalidationRequest: leafInvalidationRequest,
      invalidLeafNodes: leafNodes,
      invalidAttributes,
      compiledAttributes: compiledProperties,
      invalidInterval: totalInvalidInterval,
      isTimeDependencyChange,
    }
  }

  /**
   * Gathers the information required to invalidate the system and notify
   * requests after metadata authored value invalidation
   * (program.cpp:320-367).
   */
  invalidateMetadataValues(
    invalidFields: ReadonlyArray<readonly [SdfPath, string]>,
  ): Exec_MetadataInvalidationResult {
    const numInvalidFields = invalidFields.length

    const leafInvalidationRequest: VdfMaskedOutput[] = []
    // program.cpp:330: upstream also constructs a TfBits(numInvalidFields)
    // that it never reads; it is omitted here.

    for (let i = 0; i < numInvalidFields; ++i) {
      const [path, field] = invalidFields[i]!
      const node = this._metadataInputNodes.get(_MetadataKey(path, field))

      // The corresponding metadata input may not have been compiled.
      if (node === undefined) {
        continue
      }

      // Since this is an input node to the exec network, we need to make sure
      // that executors are invalidated before the next round of evaluation.
      this._inputNodesRequiringInvalidation.push(node.getId())

      // Queue the input node's output(s) for leaf node invalidation.
      leafInvalidationRequest.push(
        new VdfMaskedOutput(node.GetOutput(), VdfMask.allOnes(1)))
    }

    // Find all the leaf nodes reachable from the input nodes.
    const leafNodes = this._leafNodeCache.findNodes(
      leafInvalidationRequest, /* updateIncrementally */ false)

    return {
      invalidationRequest: leafInvalidationRequest,
      invalidLeafNodes: leafNodes,
    }
  }

  /**
   * Resets the accumulated set of input nodes that require invalidation, and
   * returns an executor invalidation request (program.cpp:415-444).
   */
  resetInputNodesRequiringInvalidation(): VdfMaskedOutput[] {
    if (this._inputNodesRequiringInvalidation.length === 0) {
      return []
    }

    // Collect the invalid outputs for all invalid input nodes accumulated
    // through previous rounds of authored value invalidation.
    const invalidationRequest: VdfMaskedOutput[] = []
    for (const nodeId of this._inputNodesRequiringInvalidation) {
      const node = this._network.getNodeById(nodeId)

      // Some nodes may have been uncompiled since they were marked as being
      // uninitialized. It's okay to simply skip these nodes.
      if (!node) {
        continue
      }

      invalidationRequest.push(new VdfMaskedOutput(node.GetOutput(), VdfMask.allOnes(1)))
    }

    this._inputNodesRequiringInvalidation = []

    return invalidationRequest
  }

  /**
   * Gathers the information required to invalidate the system and notify
   * requests after time has changed (program.cpp:369-413).
   */
  invalidateTime(oldTime: EfTime, newTime: EfTime): Exec_TimeChangeInvalidationResult {
    // Gather up the set of outputs that are currently time-dependent.
    const timeDependentOutputs = this._collectTimeDependentOutputs()

    // Construct a bit set that filters the array of time dependent outputs
    // down to the ones that actually changed going from oldTime to newTime.
    const filter = _FilterTimeDependentOutputs(timeDependentOutputs, oldTime, newTime)

    // Compute the executor invalidation request, and gather leaf nodes for
    // exec request notification.
    const invalidationRequest: VdfMaskedOutput[] = []
    let leafNodes: readonly VdfNode[] | null = null
    const leafNodeCache = this._leafNodeCache
    WorkWithScopedDispatcher(dispatcher => {
      // Turn the invalid time-dependent outputs into a request.
      dispatcher.run(() => {
        for (const i of filter.getAllSetView()) {
          invalidationRequest.push(timeDependentOutputs[i]!)
        }
      })

      // Find the leaf nodes that are dependent on the values that are
      // changing from oldTime to newTime.
      dispatcher.run(() => {
        leafNodes = leafNodeCache.findNodes(timeDependentOutputs, filter)
      })
    })

    TF_VERIFY(leafNodes, 'leafNodes')
    return {
      invalidationRequest,
      invalidLeafNodes: leafNodes ?? [],
      oldTime,
      newTime,
    }
  }

  /**
   * Returns the time input node. A program always has exactly one time input
   * node.
   */
  getTimeInputNode(): EfTimeInputNode {
    return this._timeInputNode
  }

  /** Returns the node with the given `nodeId`, or null if no such node exists. */
  getNodeById(nodeId: number): VdfNode | null {
    return this._network.getNodeById(nodeId)
  }

  /**
   * Deletes a `node` from the network (program.cpp:446-499). All incoming
   * and outgoing connections on `node` are deleted. Downstream inputs
   * previously connected to `node` require recompilation. Upstream nodes
   * previously feeding into `node` may be left isolated.
   */
  disconnectAndDeleteNode(node: VdfNode): void {
    // Track a set of connections to be deleted at the end of this function,
    // because it is not safe to remove connections while iterating over them.
    const connections: VdfConnection[] = []

    // Upstream nodes are potentially isolated.
    for (const [, input] of node.getInputsIterator()) {
      for (const connection of input.getConnections()) {
        this._potentiallyIsolatedNodes.add(connection.getSourceNode())
        connections.push(connection)
      }
    }

    // Downstream inputs require recompilation.
    for (const [, output] of node.getOutputsIterator()) {
      for (const connection of output.getConnections()) {
        this._inputsRequiringRecompilation.add(connection.getTargetInput())

        // We currently disconnect other connections incoming on the target
        // input, and we mark the nodes upstream of those connections as
        // potentially isolated, because recompilation of inputs expects those
        // inputs to be fully disconnected.
        for (const targetInputConnection of
          connection.getTargetInput().getConnections()) {
          this._potentiallyIsolatedNodes.add(targetInputConnection.getSourceNode())
          connections.push(targetInputConnection)
        }
      }
    }

    // This node cannot be isolated, and its inputs do not require
    // recompilation, because they are all about to be deleted.
    this._potentiallyIsolatedNodes.delete(node)
    for (const [, input] of node.getInputsIterator()) {
      this._inputsRequiringRecompilation.delete(input)
    }

    // Finally, delete the affected connections and the node.
    for (const connection of connections) {
      this._network.disconnect(connection)
    }
    this._network.Delete(node)
  }

  /**
   * Deletes all connections flowing into `input` (program.cpp:501-516). The
   * input is added to the set of inputs requiring recompilation. Upstream
   * nodes previously feeding into `input` may be left isolated.
   */
  disconnectInput(input: VdfInput): void {
    this._inputsRequiringRecompilation.add(input)

    // All source nodes of the input's connections are now potentially
    // isolated. Iterate over a copy of the connections, because the original
    // vector will be modified by VdfNetwork::Disconnect.
    const connections = [...input.getConnections()]
    for (const connection of connections) {
      this._potentiallyIsolatedNodes.add(connection.getSourceNode())
      this._network.disconnect(connection)
    }
  }

  /**
   * Gets the set of inputs that have been affected by uncompilation and need
   * to be recompiled.
   */
  getInputsRequiringRecompilation(): ReadonlySet<VdfInput> {
    return this._inputsRequiringRecompilation
  }

  /** Clears the set of inputs that were affected by uncompilation. */
  clearInputsRequiringRecompilation(): void {
    this._inputsRequiringRecompilation.clear()
  }

  /**
   * Returns Exec_UncompilationRuleSets for `resyncedPath` and descendants of
   * `resyncedPath`.
   */
  extractUncompilationRuleSetsForResync(resyncedPath: SdfPath): Exec_UncompilationTable.Entry[] {
    return this._uncompilationTable.updateForRecursiveResync(resyncedPath)
  }

  /** Returns the Exec_UncompilationRuleSet for `changedPath`. */
  getUncompilationRuleSetForPath(changedPath: SdfPath): Exec_UncompilationTable.Entry {
    return this._uncompilationTable.find(changedPath)
  }

  /**
   * Sets recompilation info for the given `node` after it has been compiled
   * (program.h:305-321).
   */
  setNodeRecompilationInfo(
    node: VdfNode,
    provider: EsfObject,
    dispatchingSchemaId: EsfSchemaConfigKey,
    inputKeys: Exec_InputKeyVector,
  ): void {
    this._nodeRecompilationInfoTable.setNodeRecompilationInfo(
      node, provider, dispatchingSchemaId, inputKeys)
  }

  /** Retrieves the recompilation information stored for `node`. */
  getNodeRecompilationInfo(node: VdfNode): Exec_NodeRecompilationInfo | null {
    return this._nodeRecompilationInfoTable.getNodeRecompilationInfo(node)
  }

  /** Returns true if the most recent round of compilation was interrupted. */
  wasInterrupted(): boolean {
    return this._wasInterrupted
  }

  /**
   * Starting from the set of potentially isolated nodes, creates a
   * subnetwork containing all isolated nodes and connections
   * (program.cpp:518-538). The objects are not yet removed from the network;
   * the caller calls RemoveIsolatedObjectsFromNetwork, or the subnetwork's
   * Destroy() removes them before deleting them.
   */
  createIsolatedSubnetwork(): VdfIsolatedSubnetwork {
    const timeInputNode = this._timeInputNode
    const editFilter = (node: VdfNode): boolean => node !== timeInputNode

    const subnetwork = VdfIsolatedSubnetwork.new(this._network)!

    for (const node of this._potentiallyIsolatedNodes) {
      subnetwork.addIsolatedBranch(node, editFilter)
    }

    this._potentiallyIsolatedNodes.clear()

    return subnetwork
  }

  /**
   * Writes the compiled network to a file at `filename`
   * (program.cpp:540-546).
   */
  graphNetwork(filename: string, grapherOptions: VdfGrapherOptions): void {
    VdfGrapher.graphToFile(this._network, filename, grapherOptions)
  }

  // Updates data structures for a newly-added node (program.cpp:548-552).
  private _addNode(journal: EsfJournal, node: VdfNode): void {
    this._uncompilationTable.addRulesForNode(node.getId(), journal)
  }

  // Registers an attribute input node for authored value initialization
  // (program.cpp:554-562).
  private _registerAttributeInputNode(inputNode: Exec_AttributeInputNode): void {
    const key = inputNode.getAttributePath().pathString
    const emplaced = !this._attributeInputNodes.has(key)
    if (emplaced) {
      this._attributeInputNodes.set(key, { node: inputNode, oldSpline: null })
    }
    TF_VERIFY(emplaced, 'emplaced')
  }

  /** @internal Unregisters an attribute input node (program.cpp:564-575). */
  _unregisterAttributeInputNode(inputNode: Exec_AttributeInputNode): void {
    const attributePath = inputNode.getAttributePath()
    const key = attributePath.pathString
    if (!TF_VERIFY(this._attributeInputNodes.has(key),
      'it != _attributeInputNodes.end()')) {
      return
    }

    this._attributeInputNodes.delete(key)
  }

  // Registers a metadata input node for authored value initialization
  // (program.cpp:577-588).
  private _registerMetadataInputNode(inputNode: Exec_MetadataInputNode): void {
    const key = _MetadataKey(inputNode.getObjectPath(), inputNode.getMetadataKey())
    const emplaced = !this._metadataInputNodes.has(key)
    if (emplaced) {
      this._metadataInputNodes.set(key, inputNode)
    }
    TF_VERIFY(emplaced, 'emplaced')
  }

  /** @internal Unregisters a metadata input node (program.cpp:590-602). */
  _unregisterMetadataInputNode(inputNode: Exec_MetadataInputNode): void {
    const key = _MetadataKey(inputNode.getObjectPath(), inputNode.getMetadataKey())
    if (!TF_VERIFY(this._metadataInputNodes.has(key),
      'it != _metadataInputNodes.end()')) {
      return
    }

    this._metadataInputNodes.delete(key)
  }

  /**
   * @internal Notifies the program of a new or deleted connection between the
   * time input node and the given target node (program.cpp:604-615).
   */
  _changedTimeConnections(targetNode: VdfNode): void {
    // If there was a change to a connection on a time-varying input node, or
    // a connection on a node that isn't an input node, we need to invalidate
    // the cached subset of time varying outputs.
    const inputNode = targetNode instanceof Exec_AttributeInputNode ? targetNode : null
    if (!inputNode || inputNode.mightBeTimeDependent()) {
      this._invalidateTimeDependentOutputs()
    }
  }

  // Flags the array of _timeDependentOutputs as invalid
  // (program.cpp:617-624).
  private _invalidateTimeDependentOutputs(): void {
    this._timeDependentOutputsValid = false
  }

  // Rebuilds the array of _timeDependentOutputs (program.cpp:626-676).
  private _collectTimeDependentOutputs(): VdfMaskedOutput[] {
    // If the cached array of time-dependent outputs is still valid, return it.
    if (this._timeDependentOutputsValid) {
      return this._timeDependentOutputs
    }

    // Get all outgoing connections on the time input node.
    const timeConnections = this._timeInputNode.GetOutput()!.getConnections()

    // Pessimally size the array to accommodate all outputs, and keep track of
    // how many entries have really been populated. We shrink the array later.
    let num = 0
    const result: VdfMaskedOutput[] = new Array<VdfMaskedOutput>(timeConnections.length)

    // Iterate over all the connections and select the target nodes that are
    // currently time dependent. This will include time-dependent input nodes,
    // as well as nodes that establish a direct input dependency on the
    // computeTime builtin.
    WorkParallelForN(timeConnections.length, (b, e) => {
      const outputs: VdfMaskedOutput[] = []

      for (let i = b; i !== e; ++i) {
        const connection = timeConnections[i]!
        const targetNode = connection.getTargetNode()
        if (TF_VERIFY(targetNode.getNumOutputs() <= 1,
          'targetNode.GetNumOutputs() <= 1')) {
          targetNode.computeOutputDependencyMasks(
            connection, VdfMask.allOnes(1), outputs)
        }
      }

      if (outputs.length !== 0) {
        const i = num
        num += outputs.length
        for (let j = 0; j < outputs.length; ++j) {
          result[i + j] = outputs[j]!
        }
      }
    })

    // Shrink the array to only contain the entries we just populated.
    result.length = num
    this._timeDependentOutputs = result

    // The array of time-dependent outputs is valid again. Return it.
    this._timeDependentOutputsValid = true
    return this._timeDependentOutputs
  }
}

// program.cpp:678-715
function _ComputeInvalidInterval(
  oldSpline: TsSpline | null,
  newSpline: TsSpline | null,
): EfTimeInterval {
  // If either the new- or old value (or both) resolve to anything but a
  // spline (fallback, default, or time samples) we invalidate the full
  // interval: Both fallback and default values apply over all time, and time
  // samples typically encode such dense data that we do not want to incur the
  // cost of detailed analysis of that data.
  if (!oldSpline || !newSpline) {
    return EfTimeInterval.getFullInterval()
  }

  // If we are going from an empty spline to a non-empty spline or vice-versa,
  // invalidate the full interval.
  if (oldSpline.IsEmpty() !== newSpline.IsEmpty()) {
    return EfTimeInterval.getFullInterval()
  }

  // If loop parameters changed, we invalidate the full interval.
  if (oldSpline.hasLoops() !== newSpline.hasLoops()) {
    return EfTimeInterval.getFullInterval()
  }

  // If both splines are empty, nothing is invalid.
  if (oldSpline.IsEmpty() && newSpline.IsEmpty()) {
    return new EfTimeInterval()
  }

  // TODO (upstream): Compute the change interval between oldSpline and
  // newSpline. For the time-being, over-invalidate the time range.
  return EfTimeInterval.getFullInterval()
}

// program.cpp:717-757. The per-thread bit sets are one bit set.
function _FilterTimeDependentOutputs(
  timeDependentInputNodeOutputs: readonly VdfMaskedOutput[],
  oldTime: EfTime,
  newTime: EfTime,
): TfBits {
  const numInputs = timeDependentInputNodeOutputs.length
  const bits = new TfBits(numInputs)

  // For each time-dependent output, figure out if the computed value actually
  // changes between oldTime and newTime. If so, set the corresponding bit in
  // the bit set.
  WorkWithScopedParallelism(() => {
    WorkParallelForN(numInputs, (b, e) => {
      for (let i = b; i !== e; ++i) {
        const node = timeDependentInputNodeOutputs[i]!.GetOutput()!.getNode()
        const inputNode = node instanceof Exec_AttributeInputNode ? node : null
        if (!inputNode || inputNode.isTimeVarying(oldTime, newTime)) {
          bits.Set(i)
        }
      }
    })
  })

  // Combine the thread-local bit sets into a single bit set and return it.
  const result = new TfBits(numInputs)
  result.orAssign(bits)
  return result
}
