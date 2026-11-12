// Ported from OpenUSD 26.11.1: pxr/exec/vdf/boxedContainerTraits.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/vdf/boxedContainerTraits.h.
//
// Vdf_IsBoxedContainer<T> (boxedContainerTraits.h:14-21) is a compile-time
// trait; TS asks the value (openexec-x1.md 4.1 "Virtuals": instanceof).

import { Vdf_BoxedContainer } from './boxedContainer.ts'

/** Vdf_IsBoxedContainer<T>: true if `value` is a Vdf_BoxedContainer. */
export function Vdf_IsBoxedContainer(value: unknown): value is Vdf_BoxedContainer<unknown> {
  return value instanceof Vdf_BoxedContainer
}
