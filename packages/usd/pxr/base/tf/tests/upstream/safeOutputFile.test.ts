// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/safeOutputFile.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/base/tf/testenv/safeOutputFile.cpp (testTf
// registration TfSafeOutputFile). Each case
// runs in its own temporary directory; fprintf is Get().Write and the
// destructor's Close is Dispose() / [Symbol.asyncDispose].
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TfErrorMark, TfSafeOutputFile } from '../../src/index.ts'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'typescript-usd-tf-safe-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const at = (name: string) => join(dir, name)
// safeOutputFile.cpp:29-36 (Tf_CountFileMatches of "<stem>.*")
const countMatches = (directory: string, stem: string) =>
  readdirSync(directory).filter(name => name.startsWith(`${stem}.`)).length
const isFile = (path: string) => { try { return statSync(path).isFile() } catch { return false } }
const firstLine = (path: string) => readFileSync(path, 'utf8').split('\n')[0]

// safeOutputFile.cpp:38-46
async function checkFail(fn: () => Promise<TfSafeOutputFile | undefined>): Promise<void> {
  const m = new TfErrorMark()
  try {
    const outf = await fn()
    await outf?.close()
    expect(m.isClean()).toBe(false)
    m.clear()
  } finally {
    m.dispose()
  }
}

describe('TfSafeOutputFile (testenv/safeOutputFile.cpp)', () => {
  // safeOutputFile.cpp:47-72
  it('TestErrorCases', async () => {
    await checkFail(() => TfSafeOutputFile.update(''))
    await checkFail(() => TfSafeOutputFile.Replace(''))
    await checkFail(() => TfSafeOutputFile.update('/var/run/a/testTf_file_'))
    await checkFail(() => TfSafeOutputFile.Replace('/var/run/a/testTf_file_'))
    await checkFail(() => TfSafeOutputFile.update('/var/run/testTf_file_'))
    await checkFail(() => TfSafeOutputFile.Replace('/var/run/testTf_file_'))
    // safeOutputFile.cpp:67-71 checks an unwritable file in an unwritable
    // directory. Keep that permission contract in a temporary fixture: opening
    // /etc/passwd for update hangs on this host.
    const protectedDir = at('protected'), protectedFile = join(protectedDir, 'file')
    mkdirSync(protectedDir); writeFileSync(protectedFile, 'unchanged')
    chmodSync(protectedFile, 0o444); chmodSync(protectedDir, 0o555)
    try {
      await checkFail(() => TfSafeOutputFile.update(protectedFile))
      await checkFail(() => TfSafeOutputFile.Replace(protectedFile))
      expect(readFileSync(protectedFile, 'utf8')).toBe('unchanged')
    } finally { chmodSync(protectedDir, 0o755) }
  })

  // safeOutputFile.cpp:74-102
  it('TestReplaceNewFile', async () => {
    const outf = (await TfSafeOutputFile.Replace(at('testTf_NewFileCommit.txt')))!
    expect(outf.Get()).toBeDefined()
    expect(isFile(at('testTf_NewFileCommit.txt'))).toBe(false)
    expect(countMatches(dir, 'testTf_NewFileCommit')).toBe(1)
    outf.Get()!.write('New Content\n')
    await outf.close()
    expect(outf.Get()).toBeUndefined()
    expect(countMatches(dir, 'testTf_NewFileCommit')).toBe(1)
    expect(firstLine(at('testTf_NewFileCommit.txt'))).toBe('New Content')
  })

  // safeOutputFile.cpp:104-136
  it('TestReplaceExistingFile', async () => {
    writeFileSync(at('testTf_ExFileCommit.txt'), 'Existing content\n')
    const outf = (await TfSafeOutputFile.Replace(at('testTf_ExFileCommit.txt')))!
    expect(outf.Get()).toBeDefined()
    expect(countMatches(dir, 'testTf_ExFileCommit')).toBe(2)
    outf.Get()!.write('New Content\n')
    await outf.close()
    expect(outf.Get()).toBeUndefined()
    expect(countMatches(dir, 'testTf_ExFileCommit')).toBe(1)
    expect(firstLine(at('testTf_ExFileCommit.txt'))).toBe('New Content')
  })

  // safeOutputFile.cpp:138-172. "rb+" writes in place: the bytes past the
  // new content survive.
  it('TestUpdateExistingFile', async () => {
    writeFileSync(at('testTf_ExFileUpdate.txt'), 'Existing content\n')
    const outf = (await TfSafeOutputFile.update(at('testTf_ExFileUpdate.txt')))!
    expect(outf.Get()).toBeDefined()
    expect(countMatches(dir, 'testTf_ExFileUpdate')).toBe(1)
    outf.Get()!.write('New Content\n')
    expect(outf.isOpenForUpdate()).toBe(true)
    await outf.close()
    expect(outf.Get()).toBeUndefined()
    expect(countMatches(dir, 'testTf_ExFileUpdate')).toBe(1)
    expect(firstLine(at('testTf_ExFileUpdate.txt'))).toBe('New Content')
    expect(readFileSync(at('testTf_ExFileUpdate.txt'), 'utf8')).toBe('New Content\ntent\n')
  })

  // safeOutputFile.cpp:174-221
  it('TestReplaceSymlink', async () => {
    mkdirSync(at('a/b/c/d'), { recursive: true })
    const filePath = at('a/b/c/d/testTf_File.txt')
    writeFileSync(filePath, 'Existing Content\n')
    symlinkSync(filePath, at('testTf_Symlink.txt'))
    expect(lstatSync(at('testTf_Symlink.txt')).isSymbolicLink()).toBe(true)

    const outf = (await TfSafeOutputFile.Replace(at('testTf_Symlink.txt')))!
    expect(outf.Get()).toBeDefined()
    expect(countMatches(at('a/b/c/d'), 'testTf_File')).toBe(2)
    outf.Get()!.write('New Content\n')
    await outf.close()
    expect(outf.Get()).toBeUndefined()
    expect(countMatches(at('a/b/c/d'), 'testTf_File')).toBe(1)
    expect(firstLine(filePath)).toBe('New Content')
  })

  // safeOutputFile.cpp:223-282
  it('TestFilePermissions', async () => {
    const mask = process.umask(0o002)
    try {
      const fresh = (await TfSafeOutputFile.Replace(at('testTf_NewFilePerm.txt')))!
      expect(fresh.Get()).toBeDefined()
      await fresh.close()
      expect(statSync(at('testTf_NewFilePerm.txt')).mode & 0o777).toBe(0o666 & ~0o002)

      writeFileSync(at('testTf_ExistingFilePerm.txt'), '', { mode: 0o600 })
      expect(statSync(at('testTf_ExistingFilePerm.txt')).mode & 0o777).toBe(0o600)
      const existing = (await TfSafeOutputFile.Replace(at('testTf_ExistingFilePerm.txt')))!
      expect(existing.Get()).toBeDefined()
      existing.Get()!.write('testTf_ExistingFilePerm.txt\n')
      await existing.close()
      expect(statSync(at('testTf_ExistingFilePerm.txt')).mode & 0o060).toBe(0)
    } finally {
      process.umask(mask)
    }
  })

  // safeOutputFile.cpp:284-334
  it('TestDiscard', async () => {
    writeFileSync(at('testTf_Discard.txt'), 'Existing content\n')
    expect(isFile(at('testTf_Discard.txt'))).toBe(true)

    {
      const m = new TfErrorMark()
      const outf = (await TfSafeOutputFile.update(at('testTf_Discard.txt')))!
      await outf.discard()
      expect(m.isClean()).toBe(false)
      m.clear()
      await outf[Symbol.asyncDispose]()
      m.dispose()
    }

    {
      const outf = (await TfSafeOutputFile.Replace(at('testTf_Discard.txt')))!
      outf.Get()!.write('New Content')
      await outf.discard()
      expect(outf.Get()).toBeUndefined()
      expect(firstLine(at('testTf_Discard.txt'))).toBe('Existing content')
    }

    {
      const outf = (await TfSafeOutputFile.Replace(at('testTf_Discard_New.txt')))!
      outf.Get()!.write('New Content')
      await outf.discard()
      expect(outf.Get()).toBeUndefined()
      expect(isFile(at('testTf_Discard_New.txt'))).toBe(false)
    }
  })
})

describe('TfSafeOutputFile behavior from safeOutputFile.cpp', () => {
  // safeOutputFile.cpp:38-51: the released FILE * belongs to the caller.
  it('ReleaseUpdatedFile hands over the open update stream', async () => {
    writeFileSync(at('testTf_Release.txt'), '0123456789')
    const outf = (await TfSafeOutputFile.update(at('testTf_Release.txt')))!
    const file = outf.releaseUpdatedFile()!
    expect(file.isOpen()).toBe(true)
    expect(outf.Get()).toBeUndefined()
    expect(outf.isOpenForUpdate()).toBe(false)
    await outf.close()
    expect(file.isOpen()).toBe(true)
    file.seek(4)
    file.write('ab')
    await file.close()
    expect(readFileSync(at('testTf_Release.txt'), 'utf8')).toBe('0123ab6789')
  })

  it('ReleaseUpdatedFile is a coding error for a replace', async () => {
    const outf = (await TfSafeOutputFile.Replace(at('testTf_ReleaseReplace.txt')))!
    const m = new TfErrorMark()
    expect(outf.releaseUpdatedFile()).toBeUndefined()
    expect(m.isClean()).toBe(false)
    m.clear()
    m.dispose()
    await outf.discard()
  })

  // safeOutputFile.cpp:27-30: the destructor closes, which commits a replace.
  it('Dispose closes and commits a replace', async () => {
    const outf = (await TfSafeOutputFile.Replace(at('testTf_Dispose.txt')))!
    outf.Get()!.write('Disposed\n')
    await outf.dispose()
    expect(firstLine(at('testTf_Dispose.txt'))).toBe('Disposed')
    expect(countMatches(dir, 'testTf_Dispose')).toBe(1)
  })
})
