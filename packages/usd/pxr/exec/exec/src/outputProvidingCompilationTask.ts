// Ported from OpenUSD 26.11.1:
//  pxr/exec/exec/outputProvidingCompilationTask.cpp,
//  pxr/exec/exec/outputProvidingCompilationTask.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/outputProvidingCompilationTask.h and
// outputProvidingCompilationTask.cpp.
//
// The out-parameter `VdfMaskedOutput *resultOutput` points into the creator's
// result array; here it is the array and the element index.

import { TF_VERIFY } from 'typescript-usd/tf'

import { EsfEditReason } from 'typescript-usd/esf'
import { EsfJournal } from 'typescript-usd/esf'
import { VdfMask } from 'typescript-usd/vdf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'

import type { Exec_CompilationState } from './compilationState.ts'
import { Exec_CompilationTask } from './compilationTask.ts'
import { Exec_InputKeyVector } from './inputKey.ts'
import { Exec_InputResolvingCompilationTask } from './inputResolvingCompilationTask.ts'
import type { Exec_OutputKey } from './outputKey.ts'

/**
 * Compilation task that returns a VdfMaskedOutput for the provided output key
 * (outputProvidingCompilationTask.h:26-82).
 *
 * If there is no compiled output for the given output key, this task creates
 * a new node with the relevant VdfMaskedOutput, and connects all its inputs by
 * kicking off Exec_InputResolvingCompilationTasks for each input.
 */
export class Exec_OutputProvidingCompilationTask extends Exec_CompilationTask {
  // The output key indicating which output and node must be compiled.
  private readonly _outputKey: Exec_OutputKey

  // The input keys, which are recorded during the first stage of this task,
  // and queried during the second stage.
  private _inputKeys: Exec_InputKeyVector = Exec_InputKeyVector.getEmptyVector()

  // If we end up compiling a new node, these are the source outputs
  // populated from the input resolving tasks. Each entry corresponds to one
  // input on the new node, and each input can source data from any number of
  // source outputs, each resulting in one input connection.
  private readonly _inputSources: VdfMaskedOutput[][] = []

  // Input resolving tasks created by this task record their resolution
  // traversals into these journals. One journal is created for each input.
  private readonly _inputJournals: EsfJournal[] = []

  // This journal records the changes that should cause uncompilation of the
  // node.
  private readonly _nodeJournal = new EsfJournal()

  // The resulting masked output to be populated by this task.
  private readonly _resultOutputs: VdfMaskedOutput[]
  private readonly _resultIndex: number

  constructor(
    compilationState: Exec_CompilationState,
    outputKey: Exec_OutputKey,
    resultOutputs: VdfMaskedOutput[],
    resultIndex: number,
  ) {
    super(compilationState)
    this._outputKey = outputKey
    this._resultOutputs = resultOutputs
    this._resultIndex = resultIndex
  }

  // outputProvidingCompilationTask.cpp:24-115
  protected _compile(
    compilationState: Exec_CompilationState,
    taskPhases: Exec_CompilationTask.TaskPhases,
  ): void {
    const computationDefinition = this._outputKey.getComputationDefinition()

    taskPhases.invoke(
      // Make sure input dependencies are fulfilled
      (deps) => {
        // The node to be compiled by this task should be uncompiled when the
        // provider object is resynced. This dependency is explicitly added to
        // the node's journal.
        this._nodeJournal.add(
          this._outputKey.getProviderObject().Get().getPath(null),
          EsfEditReason.ResyncedObject)

        this._inputKeys = computationDefinition.getInputKeys(
          this._outputKey.getProviderObject().Get(),
          this._nodeJournal)

        const numInputKeys = this._inputKeys.Get().length
        while (this._inputSources.length < numInputKeys) {
          this._inputSources.push([])
        }
        this._inputSources.length = numInputKeys
        while (this._inputJournals.length < numInputKeys) {
          this._inputJournals.push(new EsfJournal())
        }
        this._inputJournals.length = numInputKeys
        for (let i = 0; i < numInputKeys; ++i) {
          deps.newSubtask(
            compilationState,
            Exec_InputResolvingCompilationTask,
            this._inputKeys.Get()[i]!,
            this._outputKey.getProviderObject(),
            this._outputKey.getDispatchingSchemaKey(),
            this._inputSources[i]!,
            this._inputJournals[i]!)
        }
      },

      // Compile and connect the node
      (deps) => {
        const node = computationDefinition.compileNode(
          this._outputKey.getProviderObject().Get(),
          this._outputKey.getDisambiguatingId(),
          this._nodeJournal,
          compilationState.getProgram())

        if (!TF_VERIFY(node, 'node')) {
          return
        }

        const keyIdentity = this._outputKey.makeIdentity()
        node!.setDebugNameCallback(() => keyIdentity.getDebugName())

        compilationState.getProgram().setNodeRecompilationInfo(
          node!,
          this._outputKey.getProviderObject(),
          this._outputKey.getDispatchingSchemaKey(),
          this._inputKeys)

        for (let i = 0; i < this._inputSources.length; ++i) {
          compilationState.getProgram().connect(
            this._inputJournals[i]!,
            this._inputSources[i]!,
            node!,
            this._inputKeys.Get()[i]!.inputName)
        }

        // Return the compiled output to the calling task.
        const compiledOutput = new VdfMaskedOutput(node!.GetOutput(), VdfMask.allOnes(1))
        this._resultOutputs[this._resultIndex] = compiledOutput

        // Then publish it to the compiled outputs cache.
        TF_VERIFY(compilationState.getProgram().setCompiledOutput(
          this._outputKey.makeIdentity(), compiledOutput),
        'compilationState.GetProgram()->SetCompiledOutput(...)')

        // Then indicate that the task identified by _outputKey is done. This
        // notifies all other tasks with a dependency on this _outputKey.
        deps.markDoneOutputProvidingTask(this._outputKey.makeIdentity())
      },
    )
  }

  // outputProvidingCompilationTask.cpp:117-131
  protected _interrupt(compilationState: Exec_CompilationState): void {
    // The upstream nodes that would have connected to this node are now
    // potentially isolated.
    for (const sourceOutputs of this._inputSources) {
      for (const maskedOutput of sourceOutputs) {
        const output = maskedOutput.GetOutput()
        if (output) {
          compilationState.getInterruptState()
            .addPotentiallyIsolatedNode(output.getNode())
        }
      }
    }
  }
}
