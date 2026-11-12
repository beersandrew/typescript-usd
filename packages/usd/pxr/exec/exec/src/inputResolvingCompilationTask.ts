// Ported from OpenUSD 26.11.1:
//  pxr/exec/exec/inputResolvingCompilationTask.cpp,
//  pxr/exec/exec/inputResolvingCompilationTask.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/inputResolvingCompilationTask.h and
// inputResolvingCompilationTask.cpp.
//
// The out-parameters `TfSmallVector<VdfMaskedOutput, 1> *resultOutputs` and
// `EsfJournal *journal` are the caller's array and journal, mutated in place.

import { TF_VERIFY } from 'typescript-usd/tf'

import type { EsfJournal } from 'typescript-usd/esf'
import type { EsfObject } from 'typescript-usd/esf'
import { EsfSchemaConfigKey } from 'typescript-usd/esf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'

import type { Exec_CompilationState } from './compilationState.ts'
import { Exec_CompilationTask } from './compilationTask.ts'
import type { Exec_InputKey } from './inputKey.ts'
import { Exec_ResolveInput } from './inputResolver.ts'
import type { Exec_OutputKey } from './outputKey.ts'
import { Exec_OutputProvidingCompilationTask } from './outputProvidingCompilationTask.ts'

/**
 * Resizes `array` to `size`, default-constructing new elements, as
 * TfSmallVector<VdfMaskedOutput, N>::resize does.
 */
function _ResizeMaskedOutputs(array: VdfMaskedOutput[], size: number): void {
  if (array.length > size) {
    array.length = size
  }
  while (array.length < size) {
    array.push(new VdfMaskedOutput())
  }
}

/**
 * Compilation task that resolves an input key to the source VdfMaskedOutput
 * where the input data is ultimately sourced from
 * (inputResolvingCompilationTask.h:28-89).
 *
 * The task traverses the scene to find the ultimate provider object of the
 * computation specified in the input key. The provider object; the
 * computation name; and, if the input requests dispatched computations, the
 * dispatching schema config key are used to construct output keys for
 * Exec_OutputProvidingCompilationTasks, which are then kicked off to populate
 * the source masked outputs.
 */
export class Exec_InputResolvingCompilationTask extends Exec_CompilationTask {
  // The input key to resolve to output keys providing said input value.
  private readonly _inputKey: Exec_InputKey

  // The scene object at which the scene traversal is started.
  private readonly _originObject: EsfObject

  // The schema config key of the dispatching prim, used if this input
  // requests dispatched computations.
  private readonly _dispatchingSchemaKey: EsfSchemaConfigKey

  // The journal that records the traversal performed by the resolution.
  private readonly _journal: EsfJournal | null

  // The output keys populated as a result of the scene traversal.
  private _outputKeys: Exec_OutputKey[] = []

  // The resulting masked outputs to be populated by this task.
  private readonly _resultOutputs: VdfMaskedOutput[]

  /**
   * Creates a new input resolving task (inputResolvingCompilationTask.h:
   * 42-61). The task obtains non-owning references to each object passed to
   * the constructor; the creator must keep them alive for the duration of
   * the task.
   */
  constructor(
    compilationState: Exec_CompilationState,
    inputKey: Exec_InputKey,
    originObject: EsfObject,
    dispatchingSchemaKey: EsfSchemaConfigKey,
    resultOutputs: VdfMaskedOutput[],
    journal: EsfJournal | null,
  ) {
    super(compilationState)
    this._inputKey = inputKey
    this._originObject = originObject
    this._dispatchingSchemaKey = dispatchingSchemaKey
    this._journal = journal
    this._resultOutputs = resultOutputs
  }

  // inputResolvingCompilationTask.cpp:21-104
  protected _compile(
    compilationState: Exec_CompilationState,
    taskPhases: Exec_CompilationTask.TaskPhases,
  ): void {
    taskPhases.invoke(
      // Generate the output key (or multiple output keys) to compile from the
      // input key, and create new subtasks for any outputs that still need to
      // be compiled.
      (deps) => {
        // Generate all the output keys for this input.
        this._outputKeys = Exec_ResolveInput(
          compilationState.getStage(),
          this._originObject,
          // We use the schema config key of the dispatching prim for
          // computation lookup if this input requests dispatched
          // computations.
          (this._inputKey.fallsBackToDispatched
            ? this._dispatchingSchemaKey : new EsfSchemaConfigKey()),
          this._inputKey,
          this._journal)
        _ResizeMaskedOutputs(this._resultOutputs, this._outputKeys.length)

        // For every output key, make sure it's either already available or a
        // task has been kicked off to produce it.
        for (let i = 0; i < this._outputKeys.length; ++i) {
          const outputKey = this._outputKeys[i]!

          const outputKeyIdentity = outputKey.makeIdentity()
          const cacheHit =
            compilationState.getProgram().getCompiledOutput(outputKeyIdentity)
          if (cacheHit) {
            this._resultOutputs[i] = cacheHit.output
            continue
          }

          // Claim the task for producing the missing output.
          if (deps.claimOutputProvidingTask(outputKeyIdentity)) {
            // Run the task that produces the output.
            deps.newSubtask(
              compilationState,
              Exec_OutputProvidingCompilationTask,
              outputKey,
              this._resultOutputs,
              i)
          }
        }
      },

      // Compiled outputs are now all available and can be retrieved from the
      // compiled output cache.
      (_deps) => {
        // For every output key, check if we have a result, and if so,
        // retrieve it from the compiled output cache. All the task
        // dependencies should have fulfilled at this point.
        for (let i = 0; i < this._outputKeys.length; ++i) {
          const outputKey = this._outputKeys[i]!

          if (this._resultOutputs[i]!.asBool()) {
            continue
          }

          const cacheHit = compilationState.getProgram().getCompiledOutput(
            outputKey.makeIdentity())
          if (!cacheHit) {
            TF_VERIFY(this._inputKey.optional, '_inputKey.optional')
            continue
          }

          this._resultOutputs[i] = cacheHit.output
        }
      },
    )
  }

  // inputResolvingCompilationTask.cpp:106-112: input resolving tasks have
  // nothing to contribute to the interrupt state.
  protected _interrupt(_compilationState: Exec_CompilationState): void {}
}
