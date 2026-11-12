// The generated module that embeds pxr/imaging/hdSt/shaders/*.glslfx
// (src/shaders.generated.ts, scripts/generate-glslfx-resources.mjs) must stay
// byte-identical to the vendored OpenUSD 26.11.1 files (shaders/PROVENANCE.md).
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { HdSt_ShaderResourceFiles } from '../src/shaders.generated.ts'

const shaders = new URL('../shaders/', import.meta.url)
const files = readdirSync(shaders).filter((f) => f.endsWith('.glslfx')).sort()

it('embeds exactly the vendored glslfx files', () => {
  expect(files.length).toBe(38)
  expect(Object.keys(HdSt_ShaderResourceFiles).sort()).toEqual(files.map((f) => `shaders/${f}`))
})

for (const file of files) {
  it(`embeds shaders/${file} byte for byte`, () => {
    const embedded = Buffer.from(HdSt_ShaderResourceFiles[`shaders/${file}`]!, 'utf8')
    expect(embedded.equals(readFileSync(new URL(file, shaders)))).toBe(true)
  })
}

it('is what the generator writes', () => {
  const script = fileURLToPath(new URL('../../../../scripts/generate-glslfx-resources.mjs', import.meta.url))
  expect(() => execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' })).not.toThrow()
})
