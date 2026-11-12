// Ported from OpenUSD 26.11.1: pxr/exec/exec/compiler.cpp,
//  pxr/exec/exec/compiler.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/compiler.h and compiler.cpp.
//
// The busy scopes (compiler.cpp:64-100) end in `finally` blocks. The
// compilation state's destructor runs when the scoped-dispatcher callback
// returns (compiler.cpp:108), as Exec_CompilationState.Destroy(); the
// isolated subnetwork's destructor runs when Compile returns
// (compiler.cpp:139), as VdfIsolatedSubnetwork._Destruct().

import { WorkParallelForN, WorkWithScopedDispatcher } from 'typescript-usd/work'

import type { EfLeafNode } from 'typescript-usd/ef'
import type { EsfStage } from 'typescript-usd/esf'
import { VdfMaskedOutput } from 'typescript-usd/vdf'

import { Exec_CompilationState } from './compilationState.ts'
import { Exec_InputRecompilationTask } from './inputRecompilationTask.ts'
import { Exec_LeafCompilationTask } from './leafCompilationTask.ts'
import type { Exec_Program } from './program.ts'
import type { Exec_Runtime } from './runtime.ts'
import type { ExecValueKey } from './valueKey.ts'

/**
 * This class is responsible for compiling the data flow network for requested
 * value keys (compiler.h:28-50).
 */
export class Exec_Compiler {
  private readonly _stage: EsfStage
  private readonly _program: Exec_Program
  private readonly _runtime: Exec_Runtime

  /** compiler.cpp:31-38 */
  constructor(stage: EsfStage, program: Exec_Program, runtime: Exec_Runtime) {
    this._stage = stage
    this._program = program
    this._runtime = runtime
  }

  /**
   * Returns an array of leaf masked outputs and an array of leaf nodes, both
   * containing entries that correspond to the value key at the same index in
   * `valueKeys` (compiler.cpp:40-141).
   */
  Compile(
    valueKeys: readonly ExecValueKey[],
  ): [VdfMaskedOutput[], Array<EfLeafNode | null>] {
    // This begins a new round of compilation.
    this._program.beginCompilation()

    // Note that the returned vectors must have the same size as valueKeys.
    // Any key that fails to compile should yield a null masked output and a
    // null leaf node at the corresponding index in the result.
    const leafOutputs: VdfMaskedOutput[] = []
    const leafNodes: Array<EfLeafNode | null> = []
    for (let i = 0; i < valueKeys.length; ++i) {
      leafOutputs.push(new VdfMaskedOutput())
      leafNodes.push(null)
    }

    const stage = this._stage
    const program = this._program

    // Process requested value keys in parallel and spawn compilation tasks.
    WorkWithScopedDispatcher(dispatcher => {
      // Compiler state shared between all compilation tasks.
      const state = new Exec_CompilationState(dispatcher, stage, program)

      {
        // The main thread remains busy until all LeafCompilationTasks and
        // InputRecompilationTasks have been spawned. This prevents detecting
        // task cycles until all entry tasks have been created.
        const busyScope = state.getTaskCycleDetector().newBusyScope()
        try {
          WorkParallelForN(valueKeys.length, (b, e) => {
            const innerBusyScope = state.getTaskCycleDetector().newBusyScope()
            try {
              for (let i = b; i !== e; ++i) {
                Exec_CompilationState.newTask(
                  state, Exec_LeafCompilationTask,
                  valueKeys[i]!, leafOutputs, leafNodes, i)
              }
            } finally {
              innerBusyScope.dispose()
            }
          })

          // These VdfInputs have been disconnected by previous rounds of
          // uncompilation and need to be recompiled. The parallel loop over
          // the set's buckets is a loop over the set.
          const inputsRequiringRecompilation =
            program.getInputsRequiringRecompilation()

          const innerBusyScope = state.getTaskCycleDetector().newBusyScope()
          try {
            for (const input of inputsRequiringRecompilation) {
              Exec_CompilationState.newTask(
                state, Exec_InputRecompilationTask, input)
            }
          } finally {
            innerBusyScope.dispose()
          }
        } finally {
          busyScope.dispose()
        }
      }

      dispatcher.Wait()

      program.endCompilation(state)

      // ~Exec_CompilationState
      state.destroy()
    })

    // If compilation was interrupted, we do not clean up any isolated
    // subnetworks, because they may no longer be isolated after the next
    // round of compilation.
    if (!this._program.wasInterrupted()) {
      // We hold onto the isolated subnetwork object until we are done
      // clearing node output data, because the subnetwork object's destructor
      // deletes the isolated nodes.
      const subnetwork = this._program.createIsolatedSubnetwork()
      const runtime = this._runtime

      try {
        WorkWithScopedDispatcher(dispatcher => {
          dispatcher.run(() => {
            subnetwork.removeIsolatedObjectsFromNetwork()
          })

          for (const node of subnetwork.getIsolatedNodes()) {
            runtime.deleteData(node)
          }
        })
      } finally {
        subnetwork._destruct()
      }
    }

    return [leafOutputs, leafNodes]
  }
}
