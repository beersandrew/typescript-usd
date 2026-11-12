// Ported from OpenUSD 26.11.1: pxr/base/tf/diagnosticContainer.cpp,
//  pxr/base/tf/diagnosticContainer.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ordered heterogeneous diagnostic container from OpenUSD v26.08
// pxr/base/tf/diagnosticContainer.h:25-195.
import { TfDiagnosticBase, TfError, TfStatus, TfWarning } from './diagnostic.ts'
export class Tf_DiagnosticContainer implements Iterable<TfDiagnosticBase> {
  #values: TfDiagnosticBase[] = []
  append(value: TfDiagnosticBase): void { this.#values.push(value) }
  clear(): void { this.#values = [] }
  IsEmpty(): boolean { return this.#values.length === 0 }
  size(): number { return this.#values.length }
  getErrors(): TfError[] { return this.#values.filter(value => value instanceof TfError) }
  getWarnings(): TfWarning[] { return this.#values.filter(value => value instanceof TfWarning) }
  getStatuses(): TfStatus[] { return this.#values.filter(value => value instanceof TfStatus) }
  post(): void {}
  getIterator(): Iterator<TfDiagnosticBase> { return this.#values[Symbol.iterator]() }
  [Symbol.iterator](): Iterator<TfDiagnosticBase> { return this.getIterator() }
}
