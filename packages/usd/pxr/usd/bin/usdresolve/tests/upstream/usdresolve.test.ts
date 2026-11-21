// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdresolve/CMakeLists.txt
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usdresolve test registration
// (pxr/usd/bin/usdresolve/CMakeLists.txt:16-24), run in process
// (pxr/testing/toolRegistration.ts). The testenv directory is copied
// unmodified into fixtures/ (Copyright Pixar, TOST 1.0,
// https://openusd.org/license).

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runRegistration } from '../../../../../testing/toolRegistration.ts'
import { usdresolve } from '../../usdresolve.ts'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

describe('usdresolve', () => {
  // CMakeLists.txt:16-24
  it('testResolveRelPath', async () => {
    const r = await runRegistration(usdresolve, {
      testenv: path.join(FIXTURES, 'testResolveRelPath'), args: ['input.usda'],
      stdoutRedirect: 'output.txt', cleanOutput: /(?:[A-Za-z]:)?\/.*\//g, diffCompare: ['output.txt'],
    })
    expect(r.exitCode, r.stderr).toBe(0)
    for (const [, got, baseline] of r.compared) expect(got).toBe(baseline)
  })
})
