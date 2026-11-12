// Ported from OpenUSD 26.11.1: pxr/base/gf/limits.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd/gf — mathematical limits. Mirrors OpenUSD pxr/base/gf/limits.h.

/**
 * Used to determine whether the length of a vector is too small to handle
 * accurately. (GF_MIN_VECTOR_LENGTH)
 */
export const GF_MIN_VECTOR_LENGTH = 1e-10

/**
 * Used to determine when a set of basis vectors is close to orthogonal.
 * (GF_MIN_ORTHO_TOLERANCE)
 */
export const GF_MIN_ORTHO_TOLERANCE = 1e-6
