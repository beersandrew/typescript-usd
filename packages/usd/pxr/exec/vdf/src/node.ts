// Ported from OpenUSD 26.11.1: pxr/exec/vdf/node.cpp, pxr/exec/vdf/node.h,
//  pxr/exec/vdf/execNodeDebugName.h, pxr/exec/vdf/network.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/node.h and node.cpp.
//
// VdfNode is the abstract base class of all nodes in a VdfNetwork. A node is
// added to its network on construction (node.cpp:21-53); only the network
// deletes nodes.
//
// Mapping choices:
// - Destruction: the network "deletes" a node by calling _Destruct(), the
//   port of ~VdfNode (node.cpp:55-64), which unregisters the debug name,
//   destroys inputs and outputs (releasing output ids) and releases the
//   shared specs. Derived classes that override _Destruct() call
//   super._Destruct() last, as C++ runs the base destructor last.
// - ArchGetDemangled(typeid(*this)) (network.cpp:80, execNodeDebugName.h:53)
//   is _GetDemangledTypeName(): the C++ class name that debug names start
//   with. The default is the JS class name; classes whose C++ name differs
//   (templates, nested classes) override it, e.g. "VdfInputVector<GfVec3d>".
// - The input and output maps are VdfConnectorMap objects; GetInputsIterator()
//   and GetOutputsIterator() return them (iterables of (name, connector)).
// - VdfMask::Bits is TfCompressedBits.

import {
  TF_AXIOM,
  TF_CODING_ERROR,
  TF_DEV_AXIOM,
  TF_VERIFY,
  TfCompressedBits,
} from 'typescript-usd/tf'

import type { VdfConnection } from './connection.ts'
import { VdfConnectorMap } from './connectorMap.ts'
import type { VdfInputSpecs, VdfOutputSpecs } from './connectorSpecs.ts'
import type { VdfContext } from './context.ts'
import { VdfInput } from './input.ts'
import type { VdfInputAndOutputSpecs } from './inputAndOutputSpecs.ts'
import { VdfInputSpec } from './inputSpec.ts'
import { VdfMask } from './mask.ts'
import { VdfMaskedOutput } from './maskedOutput.ts'
import type { VdfNetwork } from './network.ts'
import { VdfOutput } from './output.ts'
import { VdfRequiredInputsPredicate } from './requiredInputsPredicate.ts'
import type { VdfId, VdfIndex, VdfVersion } from './types.ts'

// TfToken is a string (docs/openexec-x1.md 4, rule 3).
type TfToken = string

/** VdfNode::InputMapIterator (node.h:71-84): the input map. */
export type VdfNodeInputMap = VdfConnectorMap<VdfInput, [VdfNode, number, VdfOutput | null]>

/** VdfNode::OutputMapIterator (node.h:89-102): the output map. */
export type VdfNodeOutputMap = VdfConnectorMap<VdfOutput, [VdfNode, number]>

export abstract class VdfNode {
  private readonly _network: VdfNetwork
  private _id: VdfId = 0
  private _specs: VdfInputAndOutputSpecs | null = null
  private _inputs: VdfNodeInputMap
  private _outputs: VdfNodeOutputMap

  /**
   * VdfNode(network, inputSpecs, outputSpecs) (node.cpp:21-39). Without specs
   * this is the protected VdfNode(network) (node.cpp:41-53): the derived
   * constructor must call _InitializeInputAndOutputSpecs.
   */
  constructor(network: VdfNetwork, inputSpecs?: VdfInputSpecs, outputSpecs?: VdfOutputSpecs) {
    TF_AXIOM(network, 'network')
    this._network = network
    this._inputs = new VdfConnectorMap(VdfInput, inputSpecs?.getSize())
    this._outputs = new VdfConnectorMap(VdfOutput, outputSpecs?.getSize())

    // Add us to the network.
    network._addNode(this)

    if (inputSpecs && outputSpecs) {
      // Initialize specs that we acquire directly from the registry.
      this._initializeInputAndOutputSpecs(
        network._getInputOutputSpecsRegistry().acquireSharedSpecs(
          inputSpecs, outputSpecs))
    }
  }

  /** ~VdfNode (node.cpp:55-64); see file header. */
  _destruct(): void {
    this._network._unregisterNodeDebugName(this)

    // Delete all inputs and outputs.
    this._inputs.clear()
    this._outputs.clear()

    this._network._getInputOutputSpecsRegistry().releaseSharedSpecs(this._specs)
  }

  /** ArchGetDemangled(typeid(*this)); see file header. */
  _getDemangledTypeName(): string {
    return this.constructor.name
  }

  /** GetId (node.h:116). */
  getId(): VdfId {
    return this._id
  }

  /** GetIndexFromId (node.h:123): the low 32 bits of the id. */
  static getIndexFromId(id: VdfId): VdfIndex {
    return id >>> 0
  }

  /** GetVersionFromId (node.h:132): the high 32 bits of the id. */
  static getVersionFromId(id: VdfId): VdfVersion {
    return Math.floor(id / 4294967296)
  }

  /** GetNetwork (node.h:138-142). */
  getNetwork(): VdfNetwork {
    return this._network
  }

  /** GetInputSpecs (node.h:157). */
  getInputSpecs(): VdfInputSpecs {
    return this._specs!.getInputSpecs()
  }

  /** GetInput (node.cpp:66-76): null if there is no input of that name. */
  getInput(inputName: TfToken): VdfInput | null {
    return this._inputs.find(inputName)?.[1] ?? null
  }

  /** GetInputsIterator (node.h:177). */
  getInputsIterator(): VdfNodeInputMap {
    return this._inputs
  }

  /** HasInputConnections (node.h:183). */
  hasInputConnections(): boolean {
    for (const [, input] of this._inputs) {
      if (input.getNumConnections()) return true
    }
    return false
  }

  /** HasOutputConnections (node.h:193). */
  hasOutputConnections(): boolean {
    for (const [, output] of this._outputs) {
      if (output.getConnections().length) return true
    }
    return false
  }

  /** GetInputConnections (node.cpp:414-426). */
  getInputConnections(): VdfConnection[] {
    const connections: VdfConnection[] = []
    for (const [, input] of this.getInputsIterator()) {
      for (const c of input.getConnections()) connections.push(c)
    }
    return connections
  }

  /** GetOutputConnections (node.cpp:428-440). */
  getOutputConnections(): VdfConnection[] {
    const connections: VdfConnection[] = []
    for (const [, output] of this.getOutputsIterator()) {
      for (const c of output.getConnections()) connections.push(c)
    }
    return connections
  }

  /** GetOutputSpecs (node.h:219). */
  getOutputSpecs(): VdfOutputSpecs {
    return this._specs!.getOutputSpecs()
  }

  /**
   * GetOutput(name) (node.cpp:78-89) posts a coding error if there is no such
   * output; GetOutput() (node.cpp:103-118) returns the only output.
   */
  GetOutput(name?: TfToken): VdfOutput | null {
    if (name !== undefined) {
      const output = this.getOptionalOutput(name)
      if (!output) {
        TF_CODING_ERROR("Output connector '" + name + "' does not exist.")
      }
      return output
    }

    if (this._outputs.empty()) {
      TF_CODING_ERROR('GetOutput() called on node with no outputs.')
      return null
    }

    if (this._outputs.size() !== 1) {
      TF_CODING_ERROR('GetOutput() can only be called on nodes with a single output.')
    }

    return this._outputs[Symbol.iterator]().next().value![1]
  }

  /** GetOptionalOutput (node.cpp:91-101): null, without errors, if absent. */
  getOptionalOutput(name: TfToken): VdfOutput | null {
    return this._outputs.find(name)?.[1] ?? null
  }

  /** GetOutputsIterator (node.h:277). */
  getOutputsIterator(): VdfNodeOutputMap {
    return this._outputs
  }

  /** GetNumOutputs (node.h:283). */
  getNumOutputs(): number {
    return this._outputs.size()
  }

  /** GetNumInputs (node.h:289). */
  getNumInputs(): number {
    return this._inputs.size()
  }

  /** SetDebugName (node.cpp:120-125). */
  setDebugName(name: string): void {
    this.setDebugNameCallback(() => name)
  }

  /** SetDebugNameCallback (node.cpp:127-136). */
  setDebugNameCallback(callback: (() => string) | null): void {
    if (!callback) {
      TF_CODING_ERROR(`Null callback for node: ${this._getDemangledTypeName()}`)
    } else {
      this._network._registerNodeDebugName(this, callback)
    }
  }

  /** GetDebugName (node.cpp:138-142). */
  getDebugName(): string {
    return this._network.getNodeDebugName(this)
  }

  /**
   * GetMemoryUsage (node.cpp:144-148): sizeof(*this).
   * PLATFORM-DIVERGENCE(openexec-memory-usage): JavaScript has no sizeof and
   * does not expose an object's size, so a node reports only the memory of
   * the data it holds that can be measured (an input vector's values); the
   * fixed size of the node itself counts as 0. Totals in DumpStats
   * (network.cpp:543-589) are therefore lower than native; no ported test
   * reads the numbers.
   */
  getMemoryUsage(): number {
    return VdfNode._getMemoryUsage(this, 0)
  }

  /** Compute (node.h:353). */
  abstract compute(context: VdfContext): void

  /** IsSpeculationNode (node.cpp:150-154). */
  isSpeculationNode(): boolean {
    return false
  }

  /** GetRequiredInputsPredicate (node.cpp:156-161): all reads are required. */
  getRequiredInputsPredicate(_context: VdfContext): VdfRequiredInputsPredicate {
    return VdfRequiredInputsPredicate.allReads(this)
  }

  /**
   * ComputeOutputDependencyMask (node.cpp:163-191): the mask of output's
   * elements that depend on inputDependencyMask flowing in via
   * inputConnection.
   */
  computeOutputDependencyMask(
    inputConnection: VdfConnection,
    inputDependencyMask: VdfMask,
    output: VdfOutput): VdfMask {
    const input = inputConnection.getTargetInput()
    TF_AXIOM(input.getNode() === this, '&input.GetNode() == this')
    TF_AXIOM(output.getNode() === this, '&output.GetNode() == this')

    const associatedOutput = input.getAssociatedOutput()
    if (!associatedOutput) {
      return this._computeOutputDependencyMask(
        inputConnection, inputDependencyMask, output)
    }

    if (associatedOutput === output) {
      return inputDependencyMask
    }

    // Dependency doesn't propagate from associated inputs to non-associated
    // outputs.
    return new VdfMask()
  }

  /** ComputeOutputDependencyMasks (node.cpp:193-229). */
  computeOutputDependencyMasks(
    inputConnection: VdfConnection,
    inputDependencyMask: VdfMask,
    outputDependencies: VdfMaskedOutput[]): void {
    if (!TF_VERIFY(outputDependencies, 'outputDependencies')) return

    if (this._computeOutputDependencyMasks(
      inputConnection, inputDependencyMask, outputDependencies)) {
      return
    }

    for (const [, output] of this.getOutputsIterator()) {
      const dependencyMask = this.computeOutputDependencyMask(
        inputConnection, inputDependencyMask, output)

      // An empty mask indicates all zeros, too.
      if (dependencyMask.isAllZeros()) continue

      outputDependencies.push(new VdfMaskedOutput(output, dependencyMask))
    }
  }

  /**
   * ComputeInputDependencyMask (node.cpp:276-298): the bits of the data
   * flowing along inputConnection needed to compute maskedOutput.
   */
  computeInputDependencyMask(
    maskedOutput: VdfMaskedOutput,
    inputConnection: VdfConnection): TfCompressedBits {
    const input = inputConnection.getTargetInput()
    TF_DEV_AXIOM(input.getNode() === this, '&input.GetNode() == this')

    const output = maskedOutput.GetOutput()
    TF_DEV_AXIOM(output, 'output')
    TF_DEV_AXIOM(output.getNode() === this, '&output->GetNode() == this')

    const associatedOutput = input.getAssociatedOutput()
    if (associatedOutput && associatedOutput === output) {
      return maskedOutput.GetMask().getBits()
    }

    return this._computeInputDependencyMask(maskedOutput, inputConnection)
  }

  /** ComputeInputDependencyMasks (node.cpp:300-307). */
  computeInputDependencyMasks(
    maskedOutput: VdfMaskedOutput,
    skipAssociatedInputs: boolean): Array<[VdfConnection, VdfMask]> {
    return this._computeInputDependencyMasks(maskedOutput, skipAssociatedInputs)
  }

  /** ComputeInputDependencyRequest (node.cpp:348-353). */
  computeInputDependencyRequest(
    request: readonly VdfMaskedOutput[]): Array<[VdfConnection, VdfMask]> {
    return this._computeInputDependencyRequest(request)
  }

  /** IsEqual (node.cpp:442-462). */
  isEqual(rhs: VdfNode): boolean {
    if (this === rhs) return true

    // Specs acquired through the shared registry compare by identity.
    if (this._specs !== rhs._specs) return false

    if (this._network !== rhs._network) return false

    if (!this._isDerivedEqual(rhs)) return false

    return true
  }

  /**
   * _AppendInputs (node.cpp:507-578): builds inputs from inputSpecs and
   * appends them; the new inputs are appended to resultingInputs if given.
   */
  protected _appendInputs(
    newInputSpecs: VdfInputSpecs,
    resultingInputs: VdfInput[] | null = null): void {
    const numExistingInputs = this._inputs.size()
    const numNewInputs = newInputSpecs.getSize()

    for (let i = 0; i < numNewInputs; ++i) {
      const spec = newInputSpecs.getInputSpec(i)!
      const outputName = spec.getAssociatedOutputName()
      const newIndex = numExistingInputs + i

      let output: VdfOutput | null = null
      if (outputName !== '') {
        // Look up our corresponding output; a failure issues an error.
        output = this.GetOutput(outputName)
        if (!output) continue
      } else if (spec.getAccess() !== VdfInputSpec.READ) {
        TF_CODING_ERROR('Writable input connectors must specify valid output.')
        continue
      }

      // Input names may repeat, to aggregate connections.
      const [it, inserted] = this._inputs.try_emplace(
        spec.getName(), this, newIndex, output)
      if (inserted) {
        const newInput = it[1]
        if (output) output.setAssociatedInput(newInput)
        if (resultingInputs) resultingInputs.push(newInput)
      } else {
        // Associated inputs, however, must have unique names.
        TF_VERIFY(
          outputName === '',
          'outputName.IsEmpty()',
          `Input name '${spec.getName()}' is repeated, but has an associated output ` +
          `'${outputName}'`)
        // Repeated input specs must have the same value type.
        TF_VERIFY(
          spec.getType() === it[1].getSpec().getType(),
          'spec->GetType() == it->second->GetSpec().GetType()',
          `Input name '${spec.getName()}' is repeated, but the spec type ` +
          `${spec.getType().getTypeName()} doesn't match the previous type ` +
          `${it[1].getSpec().getType().getTypeName()}`)
      }
    }
  }

  /**
   * _AppendOutputs (node.cpp:580-616): builds outputs from outputSpecs and
   * appends them; the new outputs are appended to resultingOutputs if given.
   */
  protected _appendOutputs(
    newOutputSpecs: VdfOutputSpecs,
    resultingOutputs: VdfOutput[] | null = null): void {
    const numExistingOutputs = this._outputs.size()
    const numNewOutputs = newOutputSpecs.getSize()

    for (let i = 0; i < numNewOutputs; ++i) {
      const newIndex = numExistingOutputs + i
      const spec = newOutputSpecs.getOutputSpec(i)!
      const name = spec.getName()
      const [it, inserted] = this._outputs.try_emplace(name, this, newIndex)

      if (TF_VERIFY(inserted, 'inserted', `Can't add duplicate output '${name}'.`)) {
        if (resultingOutputs) resultingOutputs.push(it[1])
      }
    }

    // Schedules only need invalidation when the single-output optimization
    // applied before (node.cpp:610-615).
    if (resultingOutputs && numExistingOutputs <= 1) {
      this._network._getScheduleInvalidator().invalidateContainingNode(this)
    }
  }

  /** _IsDerivedEqual (node.cpp:464-470): never equal by default. */
  protected _isDerivedEqual(_rhs: VdfNode): boolean {
    return false
  }

  /** _DidAddInputConnection (node.cpp:472-475). */
  _didAddInputConnection(_c: VdfConnection, _atIndex: number): void {}

  /** _WillRemoveInputConnection (node.cpp:477-480). */
  _willRemoveInputConnection(_c: VdfConnection): void {}

  /** _SetId (node.h:526): id = (version << 32) | index. */
  _setId(version: VdfVersion, index: VdfIndex): void {
    this._id = version * 4294967296 + index
  }

  /** _AcquireInputAndOutputSpecsPointer (node.cpp:373-381): from the registry. */
  protected _acquireInputAndOutputSpecsPointer(
    inputSpecs: VdfInputSpecs,
    outputSpecs: VdfOutputSpecs): VdfInputAndOutputSpecs {
    return this._network._getInputOutputSpecsRegistry().acquireSharedSpecs(
      inputSpecs, outputSpecs)
  }

  /** _ReleaseInputAndOutputSpecsPointer (node.cpp:383-389). */
  protected _releaseInputAndOutputSpecsPointer(specs: VdfInputAndOutputSpecs | null): void {
    this._network._getInputOutputSpecsRegistry().releaseSharedSpecs(specs)
  }

  /** _InitializeInputAndOutputSpecs (node.cpp:391-406). */
  protected _initializeInputAndOutputSpecs(specs: VdfInputAndOutputSpecs): void {
    if (!TF_VERIFY(!this._specs, '!_specs')) return

    this._specs = specs

    this._appendOutputs(specs.getOutputSpecs())
    this._appendInputs(specs.getInputSpecs())
  }

  /** _ClearInputAndOutputSpecsPointer (node.cpp:408-412). */
  protected _clearInputAndOutputSpecsPointer(): void {
    this._specs = null
  }

  /** _ReplaceInputSpecs (node.cpp:482-505): replaces the input specs and rebuilds inputs. */
  protected _replaceInputSpecs(inputSpecs: VdfInputSpecs): void {
    const oldSpecs = this._specs

    this._specs = this._acquireInputAndOutputSpecsPointer(inputSpecs, this.getOutputSpecs())

    this._releaseInputAndOutputSpecsPointer(oldSpecs)

    // Verify that inputs are disconnected.
    for (const [, input] of this._inputs) {
      TF_VERIFY(input.getNumConnections() === 0, 'iter->second->GetNumConnections() == 0')
    }

    // Clear old associated inputs.
    for (const [, output] of this._outputs) {
      output.setAssociatedInput(null)
    }

    // Clear out inputs and re-populate.
    this._inputs.clear()
    this._inputs = new VdfConnectorMap(VdfInput, inputSpecs.getSize())
    this._appendInputs(inputSpecs)
  }

  /**
   * _GetMemoryUsage<BaseClassType, ClassType> (node.h:586-592): the base
   * class's usage minus sizeof(BaseClassType), plus sizeof(ClassType) and the
   * dynamic size. PLATFORM-DIVERGENCE(openexec-memory-usage): the sizeof terms
   * are 0, so this is the dynamic size alone.
   */
  protected static _getMemoryUsage(_c: VdfNode, dynamicSize: number): number {
    return dynamicSize
  }

  /**
   * _ComputeOutputDependencyMask (node.cpp:231-247): the affects mask if any,
   * else an all-ones mask the size of the output.
   */
  protected _computeOutputDependencyMask(
    _inputConnection: VdfConnection,
    _inputDependencyMask: VdfMask,
    output: VdfOutput): VdfMask {
    const affectsMask = output.getAffectsMask()
    if (affectsMask) return affectsMask
    return VdfMask.allOnes(output.getNumDataEntries())
  }

  /** _ComputeOutputDependencyMasks (node.cpp:249-257): not implemented at the base. */
  protected _computeOutputDependencyMasks(
    _inputConnection: VdfConnection,
    _inputDependencyMask: VdfMask,
    _outputDependencies: VdfMaskedOutput[]): boolean {
    return false
  }

  /** _ComputeInputDependencyRequest (node.cpp:259-274). */
  protected _computeInputDependencyRequest(
    request: readonly VdfMaskedOutput[]): Array<[VdfConnection, VdfMask]> {
    const inputDependencies: Array<[VdfConnection, VdfMask]> = []
    for (const maskedOutput of request) {
      const dependencies = this.computeInputDependencyMasks(
        maskedOutput, true /* skipAssociatedInputs */)
      inputDependencies.push(...dependencies)
    }
    return inputDependencies
  }

  /**
   * _ComputeInputDependencyMask (node.cpp:355-371): the connection mask,
   * unless the output's affects mask does not overlap the requested mask.
   */
  protected _computeInputDependencyMask(
    maskedOutput: VdfMaskedOutput,
    inputConnection: VdfConnection): TfCompressedBits {
    const affectsMask = maskedOutput.GetOutput()!.getAffectsMask()
    if (!affectsMask || affectsMask.overlaps(maskedOutput.GetMask())) {
      return inputConnection.GetMask().getBits()
    }
    // No dependency.
    return new TfCompressedBits()
  }

  /** _ComputeInputDependencyMasks (node.cpp:309-346). */
  protected _computeInputDependencyMasks(
    maskedOutput: VdfMaskedOutput,
    skipAssociatedInputs: boolean): Array<[VdfConnection, VdfMask]> {
    const inputDependencies: Array<[VdfConnection, VdfMask]> = []

    for (const [, input] of this.getInputsIterator()) {
      const isAssociated = input.getAssociatedOutput() === maskedOutput.GetOutput()

      if (skipAssociatedInputs && isAssociated) continue

      for (const connection of input.getConnections()) {
        TF_DEV_AXIOM(connection, 'connection')

        const dependencyMask = this.computeInputDependencyMask(maskedOutput, connection)

        if (dependencyMask.isAnySet()) {
          inputDependencies.push([connection, new VdfMask(dependencyMask)])
        }
      }
    }

    return inputDependencies
  }
}
