// The API-only example scripts (python/examples, adapted from the
// usd-thumbnail-generator and usd-cards-generator) run unchanged under
// Pyodide over the pxr forwarding layer: `pnpm test:python`.
//
// Expected outputs are the scripts' exports under native OpenUSD 26.11.1
// (packages/usd/openusd-pin.json), captured into
// python/examples/fixtures/native/ with
//   cd <tmp with cube_rainbow.usd> && PYTHONPATH=<usd-2611>/lib/python3.12/site-packages \
//     python3.12 generate_thumbnail_api.py --usd-file cube_rainbow.usd --apply-thumbnail \
//       --create-usdz-result --width 512 --output-dir <out>
//     python3.12 generate_cards_api.py cube_rainbow.usd --apply-cards --create-usdz-result \
//       --image-width 512 --output-dir <out>
// (usdz-entries.txt is `unzip -Z1` of the package).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadPxrPython, type PxrPython } from './runUpstream.ts'
import { runPythonScript, type ScriptResult } from './runScript.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const examples = path.join(here, 'examples')
const fixtures = path.join(examples, 'fixtures')

const CASES = [
  {
    name: 'thumbnail',
    script: 'generate_thumbnail_api.py',
    argv: ['--usd-file', 'cube_rainbow.usd', '--apply-thumbnail', '--create-usdz-result', '--width', '512'],
    usdz: 'cube_rainbow_Thumbnail.usdz',
  },
  {
    name: 'cards',
    script: 'generate_cards_api.py',
    argv: ['cube_rainbow.usd', '--apply-cards', '--create-usdz-result', '--image-width', '512'],
    usdz: 'cube_rainbow_Cards.usdz',
  },
]

let pxr: PxrPython
const dirs: string[] = []
beforeAll(async () => { pxr = await loadPxrPython() })
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }) })

for (const c of CASES) {
  describe(`examples/${c.script}`, () => {
    let work: string
    let out: string
    let result: ScriptResult
    beforeAll(async () => {
      work = fs.mkdtempSync(path.join(os.tmpdir(), `${c.name}-`))
      dirs.push(work)
      out = path.join(work, 'out')
      fs.mkdirSync(out)
      fs.copyFileSync(path.join(fixtures, 'cube_rainbow.usd'), path.join(work, 'cube_rainbow.usd'))
      result = await runPythonScript(pxr, {
        script: path.join(examples, c.script), argv: [...c.argv, '--output-dir', out], cwd: work,
      })
    })

    it('runs to completion', () => {
      expect(result.exitCode, result.output).toBe(0)
    })

    const expected = path.join(fixtures, 'native', c.name)
    for (const file of fs.readdirSync(expected).filter(f => f.endsWith('.usda'))) {
      it(`exports ${file} as native OpenUSD does`, () => {
        expect(fs.readFileSync(path.join(out, file), 'utf8'))
          .toBe(fs.readFileSync(path.join(expected, file), 'utf8'))
      })
    }

    it(`packages ${c.usdz} with native OpenUSD's entries`, () => {
      const entries = pxr.pyodide.runPython(
        `import zipfile; '\\n'.join(zipfile.ZipFile(${JSON.stringify(path.join(out, c.usdz))}).namelist()) + '\\n'`)
      expect(entries).toBe(fs.readFileSync(path.join(expected, 'usdz-entries.txt'), 'utf8'))
    })
  })
}
