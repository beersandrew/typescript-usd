// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdstitchclips/CMakeLists.txt
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1's usdstitchclips test registrations
// (pxr/usd/bin/usdstitchclips/CMakeLists.txt:11-116), run in process
// (pxr/testing/toolRegistration.ts). The testenv directories are copied
// unmodified into fixtures/ (Copyright Pixar, TOST 1.0,
// https://openusd.org/license). FILES_EXIST and FILES_DONT_EXIST are checked
// in the directory after the command. The registrations pass 'p.*.usda'
// unexpanded, as testWrapper.py runs COMMAND without a shell
// (cmake/macros/testWrapper.py:310).

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { runRegistration } from '../../../../../testing/toolRegistration.ts'
import { usdstitchclips } from '../../usdstitchclips.ts'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

const splash = Array.from({ length: 9 }, (_, i) => `Particles_Splash.${101 + i}.usd`).join(' ')

interface Case {
  lines: string
  testenv: string
  command: string
  code: number
  diffCompare?: string[]
  filesExist?: string[]
  filesDontExist?: string[]
}

const registrations: Record<string, Case> = {
  testUsdStitchClipsInvalidClipPaths1: { lines: '11-16', testenv: 'testInvalidClipPaths',
    command: 'a.usd b.usd --clipPath /World/fx/Particles_Splash --out test1.usd', code: 0 },
  testUsdStitchClipsInvalidClipPaths2: { lines: '18-23', testenv: 'testInvalidClipPaths',
    command: 'a.usd b.usd --clipPath /World/f_x --out test2.usd', code: 1 },
  testUsdStitchClipsFileCleanup1: { lines: '25-31', testenv: 'testFileCleanup',
    command: '--clipPath /Wrong/Clip/Path --out result.usd a.usd b.usd', code: 1,
    filesDontExist: ['result.usd', 'result.topology.usd'] },
  testUsdStitchClipsFileCleanup2: { lines: '33-40', testenv: 'testFileCleanup',
    command: '--clipPath /Wrong/Clip/Path --out preexisting.usd a.usd b.usd', code: 1,
    filesExist: ['preexisting.topology.usd'], filesDontExist: ['preexisting.usd'] },
  testUsdStitchClipsFileCleanup3: { lines: '42-48', testenv: 'testFileCleanup',
    command: '--clipPath /Wrong/Clip/Path --out nonexistant.usd a.usd b.usd', code: 1,
    filesDontExist: ['nonexistant.usd', 'nonexistant.topology.usd'] },
  testUsdStitchClips: { lines: '50-57', testenv: 'testStitchClips',
    command: `--noComment --clipPath /World/fx/Particles_Splash --out result.usda ${splash}`, code: 0,
    diffCompare: ['result.usda', 'result.topology.usda'] },
  testUsdStitchClipsTemplate1: { lines: '59-65', testenv: 'testStitchClipsTemplate',
    command: '--noComment --templateMetadata --startTimeCode 101 --endTimeCode 104 --activeOffset 0.3 --stride 1 ' +
      '--templatePath p.#.usd --clipPath /World/fx/Particles_Splash/points --out result.usda ' +
      'p.101.usda p.102.usda p.103.usda p.104.usda', code: 0,
    diffCompare: ['result.usda', 'result.topology.usda'] },
  testUsdStitchClipsTemplate2: { lines: '67-72', testenv: 'testStitchClipsTemplate',
    command: '--noComment --templateMetadata --endTimeCode 104 --stride 1 --templatePath p.#.usd ' +
      '--clipPath /World/fx/Particles_Splash p.*.usda', code: 1 },
  testUsdStitchClipsTemplate3: { lines: '74-79', testenv: 'testStitchClipsTemplate',
    command: '--noComment --templateMetadata --startTimeCode 101 --stride 1 --templatePath p.#.usd ' +
      '--clipPath /World/fx/Particles_Splash p.*.usda', code: 1 },
  testUsdStitchClipsTemplate4: { lines: '81-86', testenv: 'testStitchClipsTemplate',
    command: '--noComment --templateMetadata --startTimeCode 101 --endTimeCode 104 --templatePath p.#.usd ' +
      '--clipPath /World/fx/Particles_Splash p.*.usda', code: 1 },
  testUsdStitchClipsTemplate5: { lines: '88-93', testenv: 'testStitchClipsTemplate',
    command: '--noComment --templateMetadata --startTimeCode 101 --endTimeCode 104 --stride 1 ' +
      '--clipPath /World/fx/Particles_Splash p.*.usda', code: 1 },
  testUsdStitchClipsTemplate6: { lines: '95-100', testenv: 'testStitchClipsTemplate',
    command: '--noComment --templateMetadata --startTimeCode 101 --endTimeCode 104 --stride 1 ' +
      '--templatePath p.#.usd p.*.usda', code: 1 },
  testUsdStitchClipsCustomSetName: { lines: '102-108', testenv: 'testStitchClips',
    command: `--noComment --clipSet bob --clipPath /World/fx/Particles_Splash --out result_customSetName.usda ${splash}`,
    code: 0, diffCompare: ['result_customSetName.usda', 'result_customSetName.topology.usda'] },
  testUsdStitchClipsTemplateCustomSetName: { lines: '110-116', testenv: 'testStitchClipsTemplate',
    command: '--noComment --clipSet bob --templateMetadata --startTimeCode 101 --endTimeCode 104 --stride 1 ' +
      '--templatePath p.#.usd --clipPath /World/fx/Particles_Splash/points --out result_customSetName.usda ' +
      'p.101.usda p.102.usda p.103.usda p.104.usda', code: 0,
    diffCompare: ['result_customSetName.usda', 'result_customSetName.topology.usda'] },
}

describe('usdstitchclips', () => {
  // One case per registration (CMakeLists.txt at the lines given).
  for (const [name, c] of Object.entries(registrations)) {
    it(name, async () => {
      const existence: [string, boolean][] = []
      const r = await runRegistration(usdstitchclips, {
        testenv: path.join(FIXTURES, c.testenv), args: c.command.split(/\s+/),
        ...(c.diffCompare ? { diffCompare: c.diffCompare } : {}),
        post: dir => {
          for (const f of [...c.filesExist ?? [], ...c.filesDontExist ?? []]) {
            existence.push([f, existsSync(path.join(dir, f))])
          }
        },
      })
      expect(r.exitCode, r.stdout + r.stderr).toBe(c.code)
      for (const [file, got, baseline] of r.compared) expect(got, file).toBe(baseline)
      for (const [file, exists] of existence) expect(exists, file).toBe((c.filesExist ?? []).includes(file))
    })
  }
})
