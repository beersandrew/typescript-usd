// Ported from OpenUSD 26.11.1: pxr/base/ts/TsTest_Baseliner.py
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Baseline file access for the TsTest_Baseliner ports. TsTest_Baseliner.py
// reads "baseline/<name>_TsTestBaseline.txt" from the test's run directory;
// these tests run from fixtures/<testenv>/ copies of the upstream baselines.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { TsTest_BaselinerIO } from '../../src/index.ts'

export function baselineIO(testenv: string): TsTest_BaselinerIO {
  const root = fileURLToPath(new URL(`./fixtures/${testenv}/`, import.meta.url))
  return {
    readFile: (path: string) => existsSync(root + path) ? readFileSync(root + path, 'utf8') : undefined,
    exists: (path: string) => existsSync(root + path),
  }
}
