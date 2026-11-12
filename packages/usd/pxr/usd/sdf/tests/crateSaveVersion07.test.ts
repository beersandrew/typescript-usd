// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateData.cpp,
//  pxr/usd/sdf/crateFile.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Native 26.11.1 captures: fixtures/crateSaveVersion07 (FIXTURES.md).
// Saving a crate file in place keeps its version (crateFile.cpp:993-999);
// single explicit payloads are stored as SdfPayload values
// (crateData.cpp:1100-1129), without a layer offset before 0.8.0
// (crateFile.cpp:1554-1570); an appended payload needs a SdfPayloadListOp
// and upgrades the file to 0.8.0 (crateFile.cpp:1589-1596).
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Layer, Payload as SdfPayload } from 'typescript-usd/sdf'
import { parseCrateLazy } from '../src/crateFile.ts'
import { VT } from '../src/crateTypes.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const input = path.join(here, '../../usd/tests/upstream/fixtures/testUsdCratePayloadConversionFromVersion07/crate07SinglePayload.usdc')
const native = (name: string) => new Uint8Array(readFileSync(path.join(here, 'fixtures/crateSaveVersion07', name)))

// The file version and, per prim, the crate type the payload field is stored as.
function describeCrate(bytes: Uint8Array) {
  const contents = parseCrateLazy(bytes, 'x.usdc')
  const payloadTypes: Record<string, number> = {}
  for (const spec of contents.specs) {
    for (let fi = spec.fieldSetStart; fi < contents.fieldSets.length; fi++) {
      const index = contents.fieldSets[fi]!
      if (index < 0 || index === 0xffffffff) break
      const field = contents.fields[index]!
      if (field.name === 'payload') payloadTypes[spec.path] = field.rep.typeId
    }
  }
  return { version: [...bytes.subarray(8, 11)].join('.'), payloadTypes }
}
const text = (bytes: Uint8Array) => Layer.fromBytes(bytes, 'x.usdc').exportToString()

let dir = ''
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), 'crateSaveVersion07')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('saving a 0.7.0 crate file in place', () => {
  it('keeps the version and writes single payloads as OpenUSD does', async () => {
    const file = path.join(dir, 'crate07.usdc')
    cpSync(input, file)
    const layer = (await Layer.findOrOpen(file))!
    layer.getPrimAtPath('/PayloadRefNone')!.getPayloadList().getExplicitItems().assign([
      new SdfPayload('PayloadNew.usda', '/Parent')])
    expect(await layer.save()).toBe(true)
    const saved1 = new Uint8Array(readFileSync(file))
    expect(describeCrate(saved1)).toEqual(describeCrate(native('saved1.usdc')))
    expect(describeCrate(saved1).payloadTypes['/PayloadRef1']).toBe(VT.Payload)
    expect(text(saved1)).toBe(text(native('saved1.usdc')))

    layer.getPrimAtPath('/PayloadNoOpinion')!.getPayloadList().getAppendedItems().assign([
      new SdfPayload('PayloadNew.usda', '/Parent')])
    expect(await layer.save()).toBe(true)
    const saved2 = new Uint8Array(readFileSync(file))
    expect(describeCrate(saved2)).toEqual(describeCrate(native('saved2.usdc')))
    expect(text(saved2)).toBe(text(native('saved2.usdc')))
  })
})
