// Ported from OpenUSD 26.11.1: pxr/exec/exec/inputRecompilationTask.cpp,
//  pxr/exec/exec/inputRecompilationTask.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/inputRecompilationTask.h and
// inputRecompilationTask.cpp.

import { TF_VERIFY } from 'typescript-usd/tf'

import { EfLeafNode } from 'typescript-usd/ef'
import { EsfJournal } from 'typescript-usd/esf'
import type { VdfInput } from 'typescript-usd/vdf'
import type { VdfMaskedOutput } from 'typescript-usd/vdf'

import type { Exec_CompilationState } from './compilationState.ts'
import { Exec_CompilationTask } from './compilationTask.ts'
import { Exec_CycleDetectingTask } from './cycleDetectingTask.ts'
import { Exec_InputResolvingCompilationTask } from './inputResolvingCompilationTask.ts'

/**
 * Task that begins compilation from a VdfInput that was disconnected by
 * uncompilation (inputRecompilationTask.h:22-57).
 *
 * The task re-resolves the input, compiles its source outputs, then
 * reconnects those outputs to the input. The input may be for a leaf node, or
 * any other intermediate node in the network.
 */
export class Exec_InputRecompilationTask extends Exec_CompilationTask {
  // The input to be recompiled.
  private readonly _input: VdfInput

  // The task uses these journals to resolve the input, one for each input key.
  private readonly _journalPerInputKey: EsfJournal[] = []

  // The new source outputs for the input, one set for each input key.
  private readonly _resultOutputsPerInputKey: VdfMaskedOutput[][] = []

  constructor(compilationState: Exec_CompilationState, input: VdfInput) {
    super(compilationState)
    this._input = input
  }

  // inputRecompilationTask.cpp:21-131
  protected _compile(
    compilationState: Exec_CompilationState,
    taskPhases: Exec_CompilationTask.TaskPhases,
  ): void {
    taskPhases.invoke(
      (deps) => {
        // Fetch recompilation info for the input's node.
        const nodeRecompilationInfo =
          compilationState.getProgram().getNodeRecompilationInfo(this._input.getNode())
        if (!TF_VERIFY(
          nodeRecompilationInfo,
          'nodeRecompilationInfo',
          `Unable to recompile input '${this._input.getDebugName()}' because ` +
          'no recompilation info was found for the node.')) {
          return
        }

        // Fetch recompilation info specific to this input.
        const originObject = nodeRecompilationInfo!.getProvider()
        const inputKeys = nodeRecompilationInfo!.getInputKeys(this._input)
        if (!TF_VERIFY(
          inputKeys.length !== 0,
          '!inputKeys.empty()',
          `Unable to recompile input '${this._input.getDebugName()}' because ` +
          'no input keys were found.')) {
          return
        }

        // Each input key needs its own output vector and journal for input
        // resolution.
        const numInputKeys = inputKeys.length
        while (this._resultOutputsPerInputKey.length < numInputKeys) {
          this._resultOutputsPerInputKey.push([])
        }
        this._resultOutputsPerInputKey.length = numInputKeys
        while (this._journalPerInputKey.length < numInputKeys) {
          this._journalPerInputKey.push(new EsfJournal())
        }
        this._journalPerInputKey.length = numInputKeys

        // Re-resolve and recompile the input's dependencies.
        for (let i = 0; i < numInputKeys; ++i) {
          deps.newSubtask(
            compilationState,
            Exec_InputResolvingCompilationTask,
            inputKeys[i]!,
            originObject,
            nodeRecompilationInfo!.getDispatchingSchemaKey(),
            this._resultOutputsPerInputKey[i]!,
            this._journalPerInputKey[i]!)
        }
      },

      (deps) => {
        // Spawn Exec_CycleDetectingTasks for each new node upstream of the
        // recompiled input. If any of these nodes are also downstream of this
        // input, then one of the Exec_CycleDetectingTasks spawned here will
        // ultimately be blocked by the current Exec_InputRecompilationTask,
        // which introduces a task cycle to be caught by the
        // Exec_TaskCycleDetector.
        for (const resultOutputs of this._resultOutputsPerInputKey) {
          for (const maskedOutput of resultOutputs) {
            // Upstream dereferences the output without a null check
            // (inputRecompilationTask.cpp:81-82).
            const sourceNode = maskedOutput.GetOutput()!.getNode()
            if (deps.claimCycleDetectingTask(sourceNode)) {
              deps.newSubtask(compilationState, Exec_CycleDetectingTask, sourceNode)
            }
          }
        }
      },

      (deps) => {
        let totalOutputs = 0
        for (const sourceOutputs of this._resultOutputsPerInputKey) {
          totalOutputs += sourceOutputs.length
        }

        // If the input belonged to a leaf node, then we require exactly one
        // source output.
        if (!TF_VERIFY(
          (this._resultOutputsPerInputKey.length === 1 &&
            this._resultOutputsPerInputKey[0]!.length === 1) ||
          !EfLeafNode.isALeafNode(this._input.getNode()),
          '(_resultOutputsPerInputKey.size() == 1 && ' +
          '_resultOutputsPerInputKey[0].size() == 1) || ' +
          '!EfLeafNode::IsALeafNode(_input->GetNode())',
          `Recompilation of leaf node input '${this._input.getDebugName()}' ` +
          `expected exactly 1 output from 1 input key; got ${totalOutputs} ` +
          `outputs from ${this._resultOutputsPerInputKey.length} input keys.`)) {
          // It is ok to return here without marking the input done, because
          // this only applies to leaf nodes. It's impossible for a cycle
          // detecting task to wait on a leaf node input.
          return
        }

        // Connect the recompiled outputs to this input.
        const numInputKeys = this._resultOutputsPerInputKey.length
        for (let i = 0; i < numInputKeys; ++i) {
          compilationState.getProgram().connect(
            this._journalPerInputKey[i]!,
            this._resultOutputsPerInputKey[i]!,
            this._input.getNode(),
            this._input.getName())
        }

        // Recompilation of this input is now done!
        deps.markDoneInputRecompilationTask(this._input)
      },
    )
  }

  // inputRecompilationTask.cpp:133-150
  protected _interrupt(compilationState: Exec_CompilationState): void {
    // Any outputs that we would have connected to the recompiled input are
    // now potentially isolated.
    for (const sourceOutputs of this._resultOutputsPerInputKey) {
      for (const maskedOutput of sourceOutputs) {
        const output = maskedOutput.GetOutput()
        if (output) {
          compilationState.getInterruptState()
            .addPotentiallyIsolatedNode(output.getNode())
        }
      }
    }

    // Since this input never finished recompilation, it should be recompiled
    // in the next round of compilation.
    compilationState.getInterruptState().addInputRequiringRecompilation(this._input)
  }
}
