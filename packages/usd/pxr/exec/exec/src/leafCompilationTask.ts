// Ported from OpenUSD 26.11.1: pxr/exec/exec/leafCompilationTask.cpp,
//  pxr/exec/exec/leafCompilationTask.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/leafCompilationTask.h and
// leafCompilationTask.cpp.
//
// The out-parameters `VdfMaskedOutput *leafOutput` and
// `const EfLeafNode **leafNode` point into the compiler's result vectors;
// here they are those arrays and the value key's index.

import { Type as TfType, TF_VERIFY } from 'typescript-usd/tf'
import { SdfPath } from 'typescript-usd/sdf/path'

import { EfLeafNode, EfLeafTokens } from 'typescript-usd/ef'
import { EsfEditReason } from 'typescript-usd/esf'
import { EsfJournal } from 'typescript-usd/esf'
import { EsfObject } from 'typescript-usd/esf'
import { EsfSchemaConfigKey } from 'typescript-usd/esf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'

import type { Exec_CompilationState } from './compilationState.ts'
import { Exec_CompilationTask } from './compilationTask.ts'
import { Exec_InputKeyVector } from './inputKey.ts'
import { Exec_InputResolvingCompilationTask } from './inputResolvingCompilationTask.ts'
import { ExecProviderResolution } from './providerResolution.ts'
import type { ExecValueKey } from './valueKey.ts'

/**
 * Leaf compilation task for compiling requested outputs
 * (leafCompilationTask.h:29-80).
 *
 * This is the main entry point into the compilation task graph for outputs
 * that have been requested via an ExecRequest and therefore need leaf nodes
 * compiled and connected to them.
 */
export class Exec_LeafCompilationTask extends Exec_CompilationTask {
  // The value key for the requested output.
  private readonly _valueKey: ExecValueKey

  // The origin object on which input resolution is performed. Construction
  // is deferred until _Compile (a std::optional upstream).
  private _originObject: EsfObject | null = null

  // The input keys that resolve to the leaf outputs. This only contains a
  // single input key.
  private _inputKeys: Exec_InputKeyVector = Exec_InputKeyVector.getEmptyVector()

  // The array of outputs populated by the input resolving task.
  private readonly _resultOutputs: VdfMaskedOutput[] = []

  // The journal used while resolving the input to the leaf node.
  private readonly _journal = new EsfJournal()

  // The leaf output and leaf node to be populated by this task, at
  // `_index`.
  private readonly _leafOutputs: VdfMaskedOutput[]
  private readonly _leafNodes: Array<EfLeafNode | null>
  private readonly _index: number

  constructor(
    compilationState: Exec_CompilationState,
    valueKey: ExecValueKey,
    leafOutputs: VdfMaskedOutput[],
    leafNodes: Array<EfLeafNode | null>,
    index: number,
  ) {
    super(compilationState)
    this._valueKey = valueKey
    this._leafOutputs = leafOutputs
    this._leafNodes = leafNodes
    this._index = index
  }

  // leafCompilationTask.cpp:32-139
  protected _compile(
    compilationState: Exec_CompilationState,
    taskPhases: Exec_CompilationTask.TaskPhases,
  ): void {
    taskPhases.invoke(
      // Turn the value key into an input key and create an input resolving
      // subtask to compile the source output to later connect to the leaf
      // node.
      (deps) => {
        // Get the provider object from the value key
        this._originObject = new EsfObject(this._valueKey.getProvider())

        // Make an input key from the value key
        this._inputKeys = _MakeInputKeyVector(this._valueKey)

        // Run a new subtask to compile the input
        deps.newSubtask(
          compilationState,
          Exec_InputResolvingCompilationTask,
          this._inputKeys.Get()[0]!,
          this._originObject,
          new EsfSchemaConfigKey(),
          this._resultOutputs,
          this._journal)
      },

      // Compile and connect the leaf node.
      (_deps) => {
        if (!TF_VERIFY(this._resultOutputs.length === 1,
          '_resultOutputs.size() == 1',
          `Expected exactly one output for value key ` +
          `'${this._valueKey.getDebugName()}'; got '${this._resultOutputs.length}'`)) {
          return
        }

        const sourceOutput = this._resultOutputs[0]!
        if (!TF_VERIFY(sourceOutput.asBool(), 'sourceOutput')) {
          return
        }

        // Return the compiled source output as the requested leaf output
        this._leafOutputs[this._index] = sourceOutput

        // If a leaf node is already compiled for this value key, then
        // compilation is done. This happens when requests are recompiled, in
        // which case the only purpose of LeafCompilationTask is to resolve the
        // new leaf output and return the leaf node.
        const compiledLeafNode =
          compilationState.getProgram().getCompiledLeafNode(this._valueKey)
        if (compiledLeafNode) {
          this._leafNodes[this._index] = compiledLeafNode
          return
        }

        // Leaf nodes should be uncompiled when a resync occurs on the value
        // key's provider.
        const nodeJournal = new EsfJournal()
        nodeJournal.add(
          this._valueKey.getProvider().Get().getPath(null),
          EsfEditReason.ResyncedObject)

        const outputType = sourceOutput.GetOutput()!.getSpec().getType()
        const leafNode = compilationState.getProgram().createNode(
          nodeJournal, EfLeafNode, outputType)

        // Value keys are not durable across scene changes so their debug name
        // must be collected eagerly.
        leafNode.setDebugName(this._valueKey.getDebugName())

        // Return the compiled leaf node.
        this._leafNodes[this._index] = leafNode

        // Make a copy of the stored input key to inform input recompilation
        // along with the resolved result type.
        const inputKey = this._inputKeys.Get()[0]!
        const inputKeys = Exec_InputKeyVector.makeConstShared([{
          inputName: inputKey.inputName,
          computationName: inputKey.computationName,
          disambiguatingId: inputKey.disambiguatingId,
          resultType: outputType,
          providerResolution: inputKey.providerResolution,
          // leafCompilationTask.cpp:116-122: the remaining bit-fields are
          // value-initialized.
          fallsBackToDispatched: false,
          optional: false,
        }])

        compilationState.getProgram().setNodeRecompilationInfo(
          leafNode,
          this._valueKey.getProvider(),
          new EsfSchemaConfigKey(),
          inputKeys)

        compilationState.getProgram().setCompiledLeafNode(this._valueKey, leafNode)

        compilationState.getProgram().connect(
          this._journal,
          [sourceOutput],
          leafNode,
          EfLeafTokens.in)
      },
    )
  }

  // leafCompilationTask.cpp:141-148
  protected _interrupt(_compilationState: Exec_CompilationState): void {
    // We were not able to resolve the leaf output. By setting the leaf output
    // to an empty output, clients will extract an empty VtValue for the
    // corresponding value key.
    this._leafOutputs[this._index] = new VdfMaskedOutput()
  }
}

// leafCompilationTask.cpp:150-169
function _MakeInputKeyVector(valueKey: ExecValueKey): Exec_InputKeyVector {
  return Exec_InputKeyVector.makeConstShared([{
    inputName: EfLeafTokens.in,
    computationName: valueKey.getComputationName(),
    disambiguatingId: '',
    resultType: TfType.getUnknownType(),
    providerResolution: {
      localTraversal: SdfPath.reflexiveRelativePath,
      dynamicTraversal: ExecProviderResolution.DynamicTraversal.Local,
    },
    fallsBackToDispatched: false,
    optional: false,
  }])
}
