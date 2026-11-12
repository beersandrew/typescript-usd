// Ported from OpenUSD 26.11.1: pxr/usd/usd/common.cpp, pxr/usd/usd/common.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/usd/common.h's UsdListPosition.  The string values are the
// JavaScript representation used by list-editing authoring APIs.
export const ListPositionFrontOfPrependList = 'frontOfPrependList' as const
export const ListPositionBackOfPrependList = 'backOfPrependList' as const
export const ListPositionFrontOfAppendList = 'frontOfAppendList' as const
export const ListPositionBackOfAppendList = 'backOfAppendList' as const

export type UsdListPosition =
  | typeof ListPositionFrontOfPrependList
  | typeof ListPositionBackOfPrependList
  | typeof ListPositionFrontOfAppendList
  | typeof ListPositionBackOfAppendList
