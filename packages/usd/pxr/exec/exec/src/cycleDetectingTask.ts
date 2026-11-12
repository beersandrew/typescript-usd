// Ported from OpenUSD 26.11.1: pxr/exec/exec/cycleDetectingTask.cpp,
//  pxr/exec/exec/cycleDetectingTask.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/cycleDetectingTask.h and
// cycleDetectingTask.cpp.

import type { VdfNode } from 'typescript-usd/vdf'

import type { Exec_CompilationState } from './compilationState.ts'
import { Exec_CompilationTask } from './compilationTask.ts'

/**
 * Used to detect cycles that pass through one or more recompiled inputs
 * (cycleDetectingTask.h:20-56).
 *
 * When recompiling an input, it's possible that the new dependencies are
 * already downstream of the input. Connecting the new dependencies to the
 * input would introduce a cycle. Exec_CycleDetectingTasks traverse the network
 * in the upstream direction searching for inputs currently being recompiled.
 * If found, the task waits on the completion of the corresponding
 * Exec_InputRecompilationTasks for those inputs, which introduces a task cycle
 * to be handled by the Exec_TaskCycleDetector if the new upstream nodes are
 * also downstream of the recompiled input.
 */
export class Exec_CycleDetectingTask extends Exec_CompilationTask {
  // The task begins its search from this node.
  private readonly _node: VdfNode

  constructor(compilationState: Exec_CompilationState, node: VdfNode) {
    super(compilationState)
    this._node = node
  }

  // cycleDetectingTask.cpp:21-75
  protected _compile(
    compilationState: Exec_CompilationState,
    taskPhases: Exec_CompilationTask.TaskPhases,
  ): void {
    taskPhases.invoke(
      (deps) => {
        // If this node is a VdfSpeculationNode, traversal should not proceed
        // upwards from here, because VdfSpeculationNodes are specifically
        // created to break topological cycles, and there is no need to
        // re-detect those cycles.
        if (this._node.isSpeculationNode()) {
          return
        }

        const inputsRequiringRecompilation =
          compilationState.getProgram().getInputsRequiringRecompilation()

        for (const [, input] of this._node.getInputsIterator()) {
          if (inputsRequiringRecompilation.has(input)) {
            // This input is being recompiled. This task cannot complete until
            // the input has finished recompilation. If recompilation of the
            // input depends on the current Exec_CycleDetectingTask, then the
            // dependency added here introduces a task cycle, which will be
            // caught by the Exec_TaskCycleDetector.
            deps.waitOnInputRecompilationTask(input)
            continue
          }

          // The input is not being recompiled. Recursively spawn more cycle
          // detecting tasks for all nodes upstream of this input.
          for (const connection of input.getConnections()) {
            const sourceNode = connection.getSourceNode()
            if (deps.claimCycleDetectingTask(sourceNode)) {
              deps.newSubtask(compilationState, Exec_CycleDetectingTask, sourceNode)
            }
          }
        }
      },
      (deps) => {
        // Any upstream inputs undergoing recompilation have completed.
        deps.markDoneCycleDetectingTask(this._node)
      },
    )
  }

  // cycleDetectingTask.cpp:77-83: cycle detecting tasks have nothing to
  // contribute to the interrupt state.
  protected _interrupt(_compilationState: Exec_CompilationState): void {}
}
