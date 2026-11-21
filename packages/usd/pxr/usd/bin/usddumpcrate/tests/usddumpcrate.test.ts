// Checks of usddumpcrate (pxr/usd/bin/usddumpcrate/usddumpcrate.ts) and the
// SdfCrateInfo it reports (pxr/usd/sdf/src/crateInfo.ts). OpenUSD 26.11.1
// registers no test for usddumpcrate (pxr/usd/bin/usddumpcrate/CMakeLists.txt)
// or SdfCrateInfo, so these check the report against what it is read from:
// the crate file's own bootstrap header and table of contents, and a layer
// written as crate from known content.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import 'typescript-usd/usd'
import { CrateInfo, Layer } from 'typescript-usd/sdf'
import { usddumpcrate } from '../usddumpcrate.ts'

let dir = ''
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'testUsdDumpCrate')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const LAYER = `#usda 1.0
def "Prim"
{
    double value = 1
    def "Child"
    {
    }
}
`

function writeCrate(): string {
  const file = path.join(dir, 'test.usdc')
  writeFileSync(file, Layer.createInMemory('test.usdc', LAYER).toUsdc())
  return file
}

async function run(args: string[]) {
  let stdout = ''
  let stderr = ''
  const exitCode = await usddumpcrate(args, { stdout: t => { stdout += t }, stderr: t => { stderr += t } })
  return { exitCode, stdout, stderr }
}

describe('usddumpcrate', () => {
  it('reports the file version from the bootstrap header and the table of contents', async () => {
    const file = writeCrate()
    const bytes = readFileSync(file)
    const info = await CrateInfo.open(file)
    expect(info.isValid()).toBe(true)
    expect(info.getFileVersion()).toBe(`${bytes[8]}.${bytes[9]}.${bytes[10]}`)

    // The table of contents, read independently: its offset is the bootstrap's
    // u64 at byte 16; then a u64 count and (16-byte name, u64 start, u64 size)
    // entries.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const toc = Number(view.getBigUint64(16, true))
    const count = Number(view.getBigUint64(toc, true))
    const sections = Array.from({ length: count }, (_, i) => {
      const at = toc + 8 + i * 32
      const name = new TextDecoder().decode(bytes.subarray(at, at + 16)).replace(/\0.*$/s, '')
      return [name, Number(view.getBigUint64(at + 16, true)), Number(view.getBigUint64(at + 24, true))]
    })
    expect(info.getSections().map(s => [s.name, s.start, s.size])).toEqual(sections)
    expect(sections.map(s => s[0])).toEqual(['TOKENS', 'STRINGS', 'FIELDS', 'FIELDSETS', 'PATHS', 'SPECS'])

    // The specs and paths are the layer's: the pseudo-root, /Prim, /Prim.value
    // and /Prim/Child.
    const stats = info.getSummaryStats()
    expect(stats.numSpecs).toBe(4)
    expect(stats.numUniquePaths).toBe(4)

    const r = await run([file])
    expect(r.exitCode, r.stderr).toBe(0)
    const lines = r.stdout.split('\n')
    expect(lines[0]).toBe(`Usd crate software version ${info.getSoftwareVersion()}`)
    expect(lines[1]).toBe(`@${file}@ file version ${info.getFileVersion()}`)
    expect(lines[2]).toBe(`  ${stats.numSpecs} specs, ${stats.numUniquePaths} paths, ${stats.numUniqueTokens} tokens, ` +
      `${stats.numUniqueStrings} strings, ${stats.numUniqueFields} fields, ${stats.numUniqueFieldSets} field sets`)
    expect(lines[3]).toBe('  Structural Sections:')
    for (const [i, [name, start, size]] of sections.entries()) {
      expect(lines[4 + i]).toBe(`    ${String(name).padStart(16)} ${String(size).padStart(16)} bytes at offset ` +
        `0x${start!.toString(16).toUpperCase()}`)
    }
  })

  it('reports only the summary with --summary', async () => {
    const r = await run(['--summary', writeCrate()])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).not.toContain('Structural Sections')
    expect(r.stdout.trimEnd().split('\n')).toHaveLength(3)
  })

  it('reports files it cannot read and carries on', async () => {
    const text = path.join(dir, 'text.usda')
    writeFileSync(text, LAYER)
    const r = await run([text, path.join(dir, 'missing.usdc'), writeCrate()])
    expect(r.exitCode).toBe(0)
    expect(r.stderr).toContain(`Error: Failed to read ${text}`)
    expect(r.stderr).toContain(`Error: Failed to read ${path.join(dir, 'missing.usdc')}`)
    expect(r.stdout).toContain('file version')
  })
})
