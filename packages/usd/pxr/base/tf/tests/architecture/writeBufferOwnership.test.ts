// A caller may reuse its byte buffer as soon as a write returns: native
// std::ofstream / FILE * writes copy the bytes at the call. Expectations are
// native 26.11.1 captures (fixtures/bufferOwnership; FIXTURES.md).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TfAtomicOfstreamWrapper, TfSafeOutputFile } from '../../src/index.ts'
import expectedFixture from '../fixtures/bufferOwnership/expected.json' with { type: 'json' }
import { oraclePayload } from '../../../../testing/oracleFixture.ts'

const expected = oraclePayload(expectedFixture)
let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'typescript-usd-tf-buffers-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('deferred writers snapshot caller bytes', () => {
  it('TfAtomicOfstreamWrapper commits the bytes as written', async () => {
    const target = join(dir, 'atomic')
    const writer = new TfAtomicOfstreamWrapper(target)
    expect(await writer.Open()).toBe(true)
    const bytes = new TextEncoder().encode('hello')
    writer.getStream().write(bytes)
    bytes.fill(0x78)
    expect(await writer.commit()).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe(expected.atomic)
  })

  it('TfSafeOutputFile.Update writes the bytes as written', async () => {
    const target = join(dir, 'update')
    writeFileSync(target, '-----')
    const out = (await TfSafeOutputFile.update(target))!
    const bytes = new TextEncoder().encode('hello')
    out.Get()!.write(bytes)
    bytes.fill(0x78)
    await out.close()
    expect(readFileSync(target, 'utf8')).toBe(expected.update)
  })

  it('TfSafeOutputFile.Replace writes the bytes as written', async () => {
    const target = join(dir, 'replace')
    writeFileSync(target, '-----')
    const out = (await TfSafeOutputFile.Replace(target))!
    const bytes = new TextEncoder().encode('hello')
    out.Get()!.write(bytes)
    bytes.fill(0x78)
    await out.close()
    expect(readFileSync(target, 'utf8')).toBe(expected.replace)
  })
})
