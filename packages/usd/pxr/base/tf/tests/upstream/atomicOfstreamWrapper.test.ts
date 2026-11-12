// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/atomicOfstreamWrapper.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/base/tf/testenv/atomicOfstreamWrapper.cpp
// (testTf registration TfAtomicOfstreamWrapper). Each
// case runs in its own temporary directory; leaving a scope without Commit is
// Dispose() / [Symbol.asyncDispose], the destructor's Cancel.
import {
  lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TfAtomicOfstreamWrapper } from '../../src/index.ts'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'typescript-usd-tf-atomic-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const at = (name: string) => join(dir, name)
// atomicOfstreamWrapper.cpp:29-35 (Tf_CountFileMatches of "<stem>.*")
const countMatches = (directory: string, stem: string) =>
  readdirSync(directory).filter(name => name.startsWith(`${stem}.`)).length
const isFile = (path: string) => { try { return statSync(path).isFile() } catch { return false } }
const firstLine = (path: string) => readFileSync(path, 'utf8').split('\n')[0]

describe('TfAtomicOfstreamWrapper (testenv/atomicOfstreamWrapper.cpp)', () => {
  // atomicOfstreamWrapper.cpp:38-60
  it('TestErrorCases', async () => {
    expect(await new TfAtomicOfstreamWrapper('').Open()).toBe(false)
    expect(await new TfAtomicOfstreamWrapper('/var/run/a/testTf_file_').Open()).toBe(false)
    expect(await new TfAtomicOfstreamWrapper('/var/run/testTf_file_').Open()).toBe(false)
    expect(await new TfAtomicOfstreamWrapper('/etc/passwd').Open()).toBe(false)
    expect(await new TfAtomicOfstreamWrapper('').commit()).toBe(false)
    expect(await new TfAtomicOfstreamWrapper('').cancel()).toBe(false)

    const wrapper = new TfAtomicOfstreamWrapper('')
    expect(wrapper.getStream().isOpen()).toBe(false)
    wrapper.getStream().write('Into the bit bucket...\n')
    expect(wrapper.getStream().isOpen()).toBe(false)
  })

  it('reports reasons as the reason out-parameter', async () => {
    const reason = { value: '' }
    expect(await new TfAtomicOfstreamWrapper('').Open(reason)).toBe(false)
    expect(reason.value).toBe('Empty fileName')
    expect(await new TfAtomicOfstreamWrapper('').commit(reason)).toBe(false)
    expect(reason.value).toBe('Stream is not open')
    expect(await new TfAtomicOfstreamWrapper('').cancel(reason)).toBe(false)
    expect(reason.value).toBe('Buffer is not open')
    const wrapper = new TfAtomicOfstreamWrapper(at('testTf_Reason.txt'))
    expect(await wrapper.Open()).toBe(true)
    expect(await wrapper.Open(reason)).toBe(false)
    expect(reason.value).toBe('Stream is already open')
    expect(await wrapper.cancel()).toBe(true)
  })

  // atomicOfstreamWrapper.cpp:62-91
  it('TestCommitToNewFile', async () => {
    const wrapper = new TfAtomicOfstreamWrapper(at('testTf_NewFileCommit.txt'))
    expect(await wrapper.Open()).toBe(true)
    expect(isFile(at('testTf_NewFileCommit.txt'))).toBe(false)
    expect(countMatches(dir, 'testTf_NewFileCommit')).toBe(1)
    wrapper.getStream().write('New Content\n')
    expect(await wrapper.commit()).toBe(true)
    expect(wrapper.getStream().isOpen()).toBe(false)
    expect(countMatches(dir, 'testTf_NewFileCommit')).toBe(1)
    expect(firstLine(at('testTf_NewFileCommit.txt'))).toBe('New Content')
  })

  // atomicOfstreamWrapper.cpp:93-126
  it('TestCommitToExistingFile', async () => {
    writeFileSync(at('testTf_ExFileCommit.txt'), 'Existing content\n')
    const wrapper = new TfAtomicOfstreamWrapper(at('testTf_ExFileCommit.txt'))
    expect(await wrapper.Open()).toBe(true)
    expect(countMatches(dir, 'testTf_ExFileCommit')).toBe(2)
    wrapper.getStream().write('New Content\n')
    expect(await wrapper.commit()).toBe(true)
    expect(wrapper.getStream().isOpen()).toBe(false)
    expect(countMatches(dir, 'testTf_ExFileCommit')).toBe(1)
    expect(firstLine(at('testTf_ExFileCommit.txt'))).toBe('New Content')
  })

  // atomicOfstreamWrapper.cpp:128-176
  it('TestCommitSymlink', async () => {
    mkdirSync(at('a/b/c/d'), { recursive: true })
    const filePath = at('a/b/c/d/testTf_File.txt')
    writeFileSync(filePath, 'Existing Content\n')
    symlinkSync(filePath, at('testTf_Symlink.txt'))
    expect(lstatSync(at('testTf_Symlink.txt')).isSymbolicLink()).toBe(true)

    const wrapper = new TfAtomicOfstreamWrapper(at('testTf_Symlink.txt'))
    expect(await wrapper.Open()).toBe(true)
    expect(countMatches(at('a/b/c/d'), 'testTf_File')).toBe(2)
    wrapper.getStream().write('New Content\n')
    expect(await wrapper.commit()).toBe(true)
    expect(wrapper.getStream().isOpen()).toBe(false)
    expect(countMatches(at('a/b/c/d'), 'testTf_File')).toBe(1)
    expect(firstLine(filePath)).toBe('New Content')
    expect(lstatSync(at('testTf_Symlink.txt')).isSymbolicLink()).toBe(true)
  })

  // atomicOfstreamWrapper.cpp:178-197
  it('TestCancel', async () => {
    const wrapper = new TfAtomicOfstreamWrapper(at('testTf_Cancel.txt'))
    expect(await wrapper.Open()).toBe(true)
    expect(isFile(at('testTf_Cancel.txt'))).toBe(false)
    expect(countMatches(dir, 'testTf_Cancel')).toBe(1)
    expect(await wrapper.cancel()).toBe(true)
    expect(isFile(at('testTf_Cancel.txt'))).toBe(false)
    expect(countMatches(dir, 'testTf_Cancel')).toBe(0)
  })

  // atomicOfstreamWrapper.cpp:199-219
  it('TestAutoCancel', async () => {
    {
      const wrapper = new TfAtomicOfstreamWrapper(at('testTf_AutoCancel.txt'))
      expect(await wrapper.Open()).toBe(true)
      expect(isFile(at('testTf_AutoCancel.txt'))).toBe(false)
      expect(countMatches(dir, 'testTf_AutoCancel')).toBe(1)
      // wrapper going out of scope without a commit.
      await wrapper[Symbol.asyncDispose]()
    }
    expect(isFile(at('testTf_AutoCancel.txt'))).toBe(false)
    expect(countMatches(dir, 'testTf_AutoCancel')).toBe(0)
  })

  it('leaves a committed file alone when disposed', async () => {
    const wrapper = new TfAtomicOfstreamWrapper(at('testTf_Committed.txt'))
    expect(await wrapper.Open()).toBe(true)
    wrapper.getStream().write('Kept\n')
    expect(await wrapper.commit()).toBe(true)
    await wrapper.dispose()
    expect(firstLine(at('testTf_Committed.txt'))).toBe('Kept')
  })

  // atomicOfstreamWrapper.cpp:221-280
  it('TestFilePermissions', async () => {
    const mask = process.umask(0o002)
    try {
      const fresh = new TfAtomicOfstreamWrapper(at('testTf_NewFilePerm.txt'))
      expect(await fresh.Open()).toBe(true)
      expect(await fresh.commit()).toBe(true)
      expect(statSync(at('testTf_NewFilePerm.txt')).mode & 0o777).toBe(0o666 & ~0o002)

      writeFileSync(at('testTf_ExistingFilePerm.txt'), '', { mode: 0o600 })
      expect(statSync(at('testTf_ExistingFilePerm.txt')).mode & 0o777).toBe(0o600)
      const existing = new TfAtomicOfstreamWrapper(at('testTf_ExistingFilePerm.txt'))
      expect(await existing.Open()).toBe(true)
      existing.getStream().write('testTf_ExistingFilePerm.txt\n')
      expect(await existing.commit()).toBe(true)
      expect(statSync(at('testTf_ExistingFilePerm.txt')).mode & 0o060).toBe(0)
    } finally {
      process.umask(mask)
    }
  })
})
