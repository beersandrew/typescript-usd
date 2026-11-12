// Ported from OpenUSD 26.11.1: pxr/base/tf/regTest.cpp, pxr/base/tf/regTest.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Test registry behavior from OpenUSD v26.08 pxr/base/tf/regTest.h:27-129.
export class TfRegTest {
  static readonly #tests = new Map<string, (args: string[]) => boolean>()
  static add(name: string, test: (args: string[]) => boolean): void { this.#tests.set(name, test) }
  static Main(args: string[]): number {
    if (args.length === 0) return 2
    const test = this.#tests.get(args[0]!)
    if (!test) return 3
    if (args.length !== 1) return 2
    return test([]) ? 0 : 1
  }
}
