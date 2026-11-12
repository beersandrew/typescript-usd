// Ported from OpenUSD 26.11.1: pxr/base/ts/diff.cpp, pxr/base/ts/diff.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { TsSpline } from './spline.ts'
export function TsDiff(a: TsSpline, b: TsSpline): readonly [number, number] | undefined { return a.diff(b) }
