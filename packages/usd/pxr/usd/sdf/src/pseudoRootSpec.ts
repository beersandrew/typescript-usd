// Ported from OpenUSD 26.11.1: pxr/usd/sdf/pseudoRootSpec.cpp,
//  pxr/usd/sdf/pseudoRootSpec.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/usd/sdf/pseudoRootSpec.{h,cpp}: the root of a layer's
// namespace, a prim spec whose prim fields cannot be edited.

import { SdfPrimSpec } from './primSpec.ts'

export class SdfPseudoRootSpec extends SdfPrimSpec {}
