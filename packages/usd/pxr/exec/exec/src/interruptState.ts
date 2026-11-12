// Ported from OpenUSD 26.11.1: pxr/exec/exec/interruptState.cpp,
//  pxr/exec/exec/interruptState.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/interruptState.h and
// interruptState.cpp.
//
// tbb::concurrent_vector members are plain arrays; the atomic flag is a plain
// field (single-threaded, docs/openexec-x1.md section 5).

import { TF_VERIFY } from 'typescript-usd/tf'

import type { VdfInput } from 'typescript-usd/vdf'
import type { VdfNode } from 'typescript-usd/vdf'

import type { Exec_CompilationState } from './compilationState.ts'

/**
 * Maintains state related to the interruption of a round of compilation
 * (interruptState.h:24-38).
 *
 * An instance of this class is owned by the Exec_CompilationState for a given
 * round of compilation. When task cycles are detected, exec interrupts the
 * compilation process by invoking Interrupt().
 */
export class Exec_InterruptState {
  // interruptState.h:79-82: stored as a vector to make insertions fast.
  // Duplicates are removed by GetPotentiallyIsolatedNodes.
  private readonly _potentiallyIsolatedNodes: VdfNode[] = []

  // interruptState.h:84-87
  private readonly _inputsRequiringRecompilation: VdfInput[] = []

  // A back-pointer to the current compilation state.
  private readonly _compilationState: Exec_CompilationState

  // True if the current round of compilation has been interrupted.
  private _wasInterrupted = false

  /** interruptState.cpp:16-20 */
  constructor(compilationState: Exec_CompilationState) {
    this._compilationState = compilationState
  }

  /** Interrupts the current round of compilation (interruptState.cpp:22-49). */
  interrupt(): void {
    // Sets the flag to indicate that the current round of compilation has been
    // interrupted. This should only happen once.
    const wasAlreadyInterrupted = this._wasInterrupted
    this._wasInterrupted = true
    if (!TF_VERIFY(!wasAlreadyInterrupted, '!wasAlreadyInterrupted')) {
      return
    }

    // We mark done every key in every task sync while holding a busy scope.
    // It's possible that an unblocked task runs to completion and detects a
    // cycle among the remaining tasks, only because we haven't got around to
    // unblocking them yet. By creating a busy scope, we ensure that no cycles
    // can be detected until we finish unblocking ALL the waiting tasks.
    const detector = this._compilationState.getTaskCycleDetector()
    detector.beginThreadBusy()
    try {
      // Mark done every key in every Exec_CompilerTaskSync<T>. If any tasks
      // are stuck in a task cycle, this will break those cycles, allowing
      // those tasks to complete.
      this._compilationState._getOutputProvidingTaskSync().markAllDone()
      this._compilationState._getInputRecompilationTaskSync().markAllDone()
      this._compilationState._getCycleDetectingTaskSync().markAllDone()
    } finally {
      detector.endThreadBusy()
    }
  }

  /** Returns true if the current round of compilation was interrupted. */
  wasInterrupted(): boolean {
    return this._wasInterrupted
  }

  /**
   * Stores into `out` the set of nodes that are potentially isolated because
   * the interrupt prevented their downstream nodes from being compiled
   * (interruptState.cpp:51-58).
   */
  getPotentiallyIsolatedNodes(out: Set<VdfNode>): void {
    for (const node of this._potentiallyIsolatedNodes) out.add(node)
  }

  /**
   * Stores into `out` the set of inputs that could not complete recompilation
   * due to the interrupt (interruptState.cpp:60-67).
   */
  getInputsRequiringRecompilation(out: Set<VdfInput>): void {
    for (const input of this._inputsRequiringRecompilation) out.add(input)
  }

  /** interruptState.cpp:69-73 */
  addPotentiallyIsolatedNode(node: VdfNode): void {
    this._potentiallyIsolatedNodes.push(node)
  }

  /** interruptState.cpp:75-79 */
  addInputRequiringRecompilation(input: VdfInput): void {
    this._inputsRequiringRecompilation.push(input)
  }
}
