// Ported from OpenUSD 26.11.1: pxr/base/gf/ostreamHelpers.cpp,
//  pxr/base/gf/ostreamHelpers.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/gf/ostreamHelpers.{h,cpp}: JavaScript
// returns the formatted representation rather than writing through ostream.
export function Gf_OstreamHelperP(value: number): string {
  return Number.isNaN(value) ? 'nan' : String(value)
}
