// Ported from OpenUSD 26.11.1: pxr/usd/usdLod/heuristicQuery.cpp,
//  pxr/usd/usdLod/heuristicQuery.h
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/usd/usdLod/heuristicQuery.{h,cpp}.

/**
 * Base class of the LOD heuristic queries: a detached snapshot of a heuristic
 * prim's values that a renderer can evaluate without referring back to USD
 * (heuristicQuery.h:17-49).
 */
export class HeuristicQuery {
  /**
   * The LOD domain of this heuristic. All heuristics have a domain over which
   * they operate. This serves to further identify the purpose of this
   * heuristic to the renderer. If the renderer is not interested in this
   * domain, it should ignore the heuristic. For example, an audio renderer may
   * ignore heuristics in the imaging domain (heuristicQuery.h:20-26).
   */
  lodDomain = ''

  /** heuristicQuery.h:29-34: default construction or an explicit domain. */
  constructor(lodDomainIn?: string) {
    if (lodDomainIn !== undefined) this.lodDomain = lodDomainIn
  }
}
