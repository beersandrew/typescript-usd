// Ported from OpenUSD 26.11.1: pxr/base/ts/tsTest_Types.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.08 pxr/base/ts/tsTest_Types.h.
export class TsTest_Sample {
  constructor(
    public time = 0,
    public value = 0,
  ) {}
}

export type TsTest_SampleVec = TsTest_Sample[]
