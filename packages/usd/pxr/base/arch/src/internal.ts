// Ported from OpenUSD 26.11.1: pxr/base/arch/hash.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Deliberately internal seams for cross-package implementation (Tf hashing
// feeds Arch's SpookyHash core 32-bit word pairs directly, avoiding a bigint
// round trip per call). Upstream's SpookyHash is private to arch/hash.cpp;
// this module is not part of typescript-usd/arch's public barrel.

export { Arch_SpookyHash128, Arch_spookyOut } from './hash.ts'
