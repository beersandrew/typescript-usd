// Ported from OpenUSD 26.11.1: pxr/exec/vdf/executorObserver.cpp,
//  pxr/exec/vdf/executorObserver.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/executorObserver.h and
// pxr/exec/vdf/executorObserver.cpp.
//
// The protected callbacks are invoked by VdfExecutorInterface, a C++ friend;
// TS has no friend access, so they are public members that keep upstream's
// leading underscore.

import type { VdfExecutorInterface } from './executorInterface.ts'

/**
 * VdfExecutorObserver (executorObserver.h:31-51): an interface for classes
 * that listen to executor deletion and executor ClearData.
 */
export abstract class VdfExecutorObserver {
  /** Called when the observed executor gets deleted (executorObserver.h:42). */
  abstract _onExecutorDelete(executor: VdfExecutorInterface): void

  /**
   * Called when temporary buffers and invalidation state are cleared for the
   * observed executor (executorObserver.h:48).
   */
  abstract _onExecutorClearData(executor: VdfExecutorInterface): void
}
