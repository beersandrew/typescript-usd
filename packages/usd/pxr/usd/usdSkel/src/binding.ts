// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/binding.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/usd/usdSkel/binding.h.
import type { Skeleton } from './skeleton.ts'
import type { UsdSkelSkinningQuery } from './queries.ts'

export class Binding {
  constructor(
    private readonly skeleton?: Skeleton,
    private readonly skinningTargets: UsdSkelSkinningQuery[] = [],
  ) {}
  getSkeleton(): Skeleton | undefined { return this.skeleton }
  getSkinningTargets(): UsdSkelSkinningQuery[] { return [...this.skinningTargets] }
}
