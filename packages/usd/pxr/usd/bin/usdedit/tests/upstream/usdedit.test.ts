// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdedit/CMakeLists.txt
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usdedit test registrations
// (pxr/usd/bin/usdedit/CMakeLists.txt:30-114), run in process
// (pxr/testing/toolRegistration.ts) with each registration's ENV. The
// testenv directories are copied unmodified into fixtures/ (Copyright Pixar,
// TOST 1.0, https://openusd.org/license). PRE_COMMAND `chmod -w` clears the
// file's write bits; POST_COMMAND `head -cN file` with
// POST_COMMAND_STDOUT_REDIRECT is the file's first N bytes written to the
// redirect file. The registrations' editor `sed -i 's/a/b/g'` is GNU sed's
// form; with BSD sed (macOS), whose -i takes a suffix argument, it is
// `sed -i '' 's/a/b/g'`, the same edit in place.

import { chmodSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runRegistration } from '../../../../../testing/toolRegistration.ts'
import { usdedit } from '../../usdedit.ts'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

const gnuSed = (() => {
  try { execFileSync('sed', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
})()
const sedInPlace = (expr: string) => gnuSed ? `sed -i '${expr}'` : `sed -i '' '${expr}'`

interface Case {
  lines: string
  testenv: string
  command: string
  code: number
  editor: string
  chmodW?: string
  head?: [number, string, string]
}

const registrations: Record<string, Case> = {
  testUsdEditFilePermissions1: { lines: '30-40', testenv: 'testUsdEditFilePermissions',
    command: 'write_protected.usda', code: 1, editor: 'head', chmodW: 'write_protected.usda' },
  testUsdEditFilePermissions2: { lines: '42-52', testenv: 'testUsdEditFilePermissions',
    command: '-n write_protected.usda', code: 0, editor: 'head', chmodW: 'write_protected.usda' },
  testUsdEditFilePermissions3: { lines: '54-64', testenv: 'testUsdEditFilePermissions',
    command: '-f write_protected.usda', code: 0, editor: 'head', chmodW: 'write_protected.usda' },
  testUsdEditRespectFileFormat1: { lines: '66-78', testenv: 'testUsdEditRespectFileFormat',
    command: 'hello_ascii.usd', code: 0, editor: sedInPlace('s/hello/goodbye/g'),
    head: [9, 'hello_ascii.usd', 'ascii_output.txt'] },
  testUsdEditRespectFileFormat2: { lines: '80-92', testenv: 'testUsdEditRespectFileFormat',
    command: 'hello_crate.usd', code: 0, editor: sedInPlace('s/hello/goodbye/g'),
    head: [8, 'hello_crate.usd', 'crate_output.txt'] },
  testUsdEditPackageFile1: { lines: '94-103', testenv: 'testUsdEditPackageFile',
    command: 'test.usdz', code: 0, editor: sedInPlace('s/Sphere/Sphere2/g') },
  testUsdEditPackageFile2: { lines: '105-114', testenv: 'testUsdEditPackageFile',
    command: 'test.usdz[test.usda]', code: 0, editor: sedInPlace('s/Sphere/Sphere2/g') },
}

describe('usdedit', () => {
  // One case per registration (CMakeLists.txt at the lines given).
  for (const [name, c] of Object.entries(registrations)) {
    it(name, async () => {
      const env = { PATH: process.env['PATH'], USD_EDITOR: c.editor }
      let editedText: string | undefined
      const r = await runRegistration(
        (argv, io) => {
          // PRE_COMMAND chmod -w, in the working directory.
          if (c.chmodW) chmodSync(c.chmodW, statSync(c.chmodW).mode & ~0o222)
          return usdedit(argv, { ...io, env })
        }, {
          testenv: path.join(FIXTURES, c.testenv), args: c.command.split(' '),
          post: dir => {
            if (!c.head) return
            const [n, file, redirect] = c.head
            writeFileSync(path.join(dir, redirect), readFileSync(path.join(dir, file)).subarray(0, n))
            editedText = readFileSync(path.join(dir, file)).toString('latin1')
          },
          ...(c.head ? { diffCompare: [c.head[2]] } : {}),
        })
      expect(r.exitCode, r.stdout + r.stderr).toBe(c.code)
      for (const [file, got, baseline] of r.compared) expect(got, file).toBe(baseline)
      // The edit was written back (the registrations check only the format).
      if (editedText !== undefined) expect(editedText).toContain('goodbye')
    })
  }
})
