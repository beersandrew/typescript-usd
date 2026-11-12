// Ported from OpenUSD 26.11.1: pxr/exec/exec/systemDiagnostics.cpp,
//  pxr/exec/exec/systemDiagnostics.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/exec/systemDiagnostics.h and
// systemDiagnostics.cpp.
//
// ExecSystem::Diagnostics is ExecSystem_Diagnostics, exposed as the static
// ExecSystem.Diagnostics (system.ts). The two GraphNetwork overloads
// (systemDiagnostics.h:37-45) are one method with an optional
// grapherOptions.

import { TF_VERIFY } from 'typescript-usd/tf'
import { VdfGrapherOptions } from 'typescript-usd/vdf'

import type { ExecSystem } from './system.ts'

/** Utility class with various diagnostic functions for ExecSystem (systemDiagnostics.h:20-49). */
export class ExecSystem_Diagnostics {
  private readonly _system: ExecSystem

  /** systemDiagnostics.cpp:16-20 */
  constructor(system: ExecSystem) {
    this._system = system
    TF_VERIFY(system, 'system')
  }

  /**
   * Invalidates all of the internal state of the exec system, resetting it
   * to a state equivalent to when it was first constructed
   * (systemDiagnostics.cpp:22-26).
   */
  invalidateAll(): void {
    this._system._invalidateAll()
  }

  /**
   * Produces a dot graph of the currently compiled exec network and writes
   * its contents to `filename`, according to `grapherOptions` when given
   * (systemDiagnostics.cpp:28-41).
   */
  graphNetwork(filename: string, grapherOptions: VdfGrapherOptions = new VdfGrapherOptions()): void {
    this._system._program!.graphNetwork(filename, grapherOptions)
  }
}
