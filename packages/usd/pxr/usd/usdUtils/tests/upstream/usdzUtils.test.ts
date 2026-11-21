// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/testUsdUtilsUsdzUtils.py
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/usdUtils/testenv/testUsdUtilsUsdzUtils.py
// (registration testUsdUtilsUsdzUtils, pxr/usd/usdUtils/CMakeLists.txt:614-619).
// The testenv directory testUsdUtilsUsdzUtils is copied unmodified into
// fixtures/testUsdUtilsUsdzUtils (Copyright Pixar, TOST 1.0,
// https://openusd.org/license); the registration runs the script in a copy of
// it, and each case here runs in a temporary copy that is the working
// directory.
//
// API mapping: `with UsdUtils.UsdzScanIterator(p) as it` is
// `using it = await new UsdzScanIterator(p).enter()`; its (name, memoryview)
// pairs are [name, Uint8Array] and bytes(view) is the array's bytes.
// `with UsdUtils.UsdzUpdateIterator(p, ...) as upd` is
// `await new UsdzUpdateIterator(p, {...}).with(async upd => ...)`;
// Entries() is entries(), and AllAssets() and UsdAssets() are the async
// generators allAssets() and usdAssets(). unittest.SkipTest is ctx.skip().
// Patching Sdf.ZipFileWriter.CreateNew is patching ZipFileWriter.createNew.
// UsdUtils.ExtractUsdzPackage and UsdUtils.CreateNewUsdzPackage are the
// Promise-returning UsdUtilsExtractUsdzPackage and
// UsdUtilsCreateNewUsdzPackage. Sdf.ZipFileWriter.CreateNew used as a context
// manager is ZipFileWriter.createNew, then addFile for each entry and save().
// Python's ValueError and RuntimeError are thrown Errors.
// PLATFORM-DIVERGENCE(usdutils-usdz-scan-detached-view): a view held past
// the scope reads as empty instead of raising ValueError.

import {
  chmodSync, chownSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AssetPath as SdfAssetPath, ZipFileWriter as SdfZipFileWriter } from 'typescript-usd/sdf'
import { JoinPackageRelativePath as ArJoinPackageRelativePath } from 'typescript-usd/ar'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { Stage } from 'typescript-usd/usd'
import {
  UsdUtilsCreateNewUsdzPackage, UsdUtilsExtractUsdzPackage, UsdzAssetIterator, UsdzScanIterator,
  UsdzUpdateIterator,
} from 'typescript-usd/usdUtils'

const TESTENV = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures/testUsdUtilsUsdzUtils')

let dir = ''
let cwd = ''
let scratch = ''
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'testUsdUtilsUsdzUtils'))
  cpSync(TESTENV, dir, { recursive: true })
  cwd = process.cwd()
  process.chdir(dir)
  _resetResolverForTest()
  // setUp (testUsdUtilsUsdzUtils.py:85-86).
  scratch = mkdtempSync(path.join(tmpdir(), 'testUsdzUtils.'))
})
afterEach(() => {
  // tearDown (testUsdUtilsUsdzUtils.py:88-89).
  rmSync(scratch, { recursive: true, force: true })
  process.chdir(cwd)
  rmSync(dir, { recursive: true, force: true })
})

// _WriteText (testUsdUtilsUsdzUtils.py:13-19).
function writeText(filePath: string, body: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, Buffer.from(body, 'utf-8'))
}

// _BuildUsdz (testUsdUtilsUsdzUtils.py:21-25).
async function buildUsdz(outPath: string, entries: [string, string][]): Promise<void> {
  const w = await SdfZipFileWriter.createNew(outPath)
  for (const [src, arc] of entries) w.addFile(src, arc)
  expect(await w.save()).toBe(true)
}

// _BuildSimpleUsdz (testUsdUtilsUsdzUtils.py:91-101).
async function buildSimpleUsdz(name = 'simple.usdz'): Promise<string> {
  const src = path.join(scratch, 'src')
  writeText(path.join(src, 'root.usda'), '#usda 1.0\n')
  writeText(path.join(src, 'sub.usda'), '#usda 1.0\n(\n   doc = "sub"\n)\n')
  const outPath = path.join(scratch, name)
  await buildUsdz(outPath, [
    [path.join(src, 'root.usda'), 'root.usda'],
    [path.join(src, 'sub.usda'), 'deep/sub.usda'],
  ])
  return outPath
}

// _BuildNestedUsdz (testUsdUtilsUsdzUtils.py:103-117).
async function buildNestedUsdz(name = 'outer.usdz'): Promise<string> {
  const innerSrc = path.join(scratch, 'inner_src')
  writeText(path.join(innerSrc, 'inner.usda'), '#usda 1.0\n')
  const innerPath = path.join(scratch, 'inner.usdz')
  await buildUsdz(innerPath, [[path.join(innerSrc, 'inner.usda'), 'inner.usda']])
  const outerSrc = path.join(scratch, 'outer_src')
  writeText(path.join(outerSrc, 'root.usda'), '#usda 1.0\n')
  const outerPath = path.join(scratch, name)
  await buildUsdz(outerPath, [
    [path.join(outerSrc, 'root.usda'), 'root.usda'],
    [innerPath, 'inner.usdz'],
  ])
  return outerPath
}

// _BuildSameStemNestedUsdz (testUsdUtilsUsdzUtils.py:119-138): an outer
// .usdz with two same-stem nested packages at different archive paths,
// 'dirA/nested.usdz' and 'dirB/nested.usdz'.
async function buildSameStemNestedUsdz(name = 'collide.usdz'): Promise<string> {
  const src = path.join(scratch, 'collide_src')
  writeText(path.join(src, 'a.usda'), '#usda 1.0\n')
  writeText(path.join(src, 'b.usda'), '#usda 1.0\n')
  const innerA = path.join(scratch, 'innerA.usdz')
  await buildUsdz(innerA, [[path.join(src, 'a.usda'), 'a.usda']])
  const innerB = path.join(scratch, 'innerB.usdz')
  await buildUsdz(innerB, [[path.join(src, 'b.usda'), 'b.usda']])
  const outer = path.join(scratch, name)
  await buildUsdz(outer, [
    [innerA, 'dirA/nested.usdz'],
    [innerB, 'dirB/nested.usdz'],
  ])
  return outer
}

// _snapshot (testUsdUtilsUsdzUtils.py:232-237): each entry's bytes.
async function snapshot(p: string): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>()
  using it = await new UsdzScanIterator(p).enter()
  for (const [name, view] of it) entries.set(name, view.slice())
  return entries
}

const decoder = new TextDecoder()
const isFile = (p: string) => existsSync(p) && statSync(p).isFile()

describe('TestUsdUtilsUsdzUtils', () => {
  // testUsdUtilsUsdzUtils.py:28-66
  it('test_RelativePaths', async () => {
    // root.usda references @subdir/sub.usda@</Sub>, which has an
    // asset-valued attribute pointing to "../texture.jpg". Create a .usdz
    // file from this layer and verify that asset is resolvable in that .usdz.
    expect(await UsdUtilsCreateNewUsdzPackage(
      new SdfAssetPath('relativePaths/root.usda'), 'relative_paths_1.usdz')).toBe(true)

    let stage = await Stage.open('relative_paths_1.usdz')
    let val = stage!.getAttributeAtPath('/Root.file')!.get() as SdfAssetPath
    let expectedPackagePath = ArJoinPackageRelativePath(['relative_paths_1.usdz', 'texture.jpg'])
    expect(val.getResolvedPath().endsWith(expectedPackagePath),
      `'${val.getResolvedPath()}' does not contain expected packaged path '${expectedPackagePath}'`).toBe(true)

    // subdir/sub.usda has an asset-valued attribute pointing to
    // "../texture.jpg". Create a .usdz file from this layer and verify that
    // asset is resolvable in that .usdz.
    expect(await UsdUtilsCreateNewUsdzPackage(
      new SdfAssetPath('relativePaths/subdir/sub.usda'), 'relative_paths_2.usdz')).toBe(true)

    stage = await Stage.open('relative_paths_2.usdz')
    val = stage!.getAttributeAtPath('/Sub.file')!.get() as SdfAssetPath
    expectedPackagePath = ArJoinPackageRelativePath(['relative_paths_2.usdz', '0/texture.jpg'])
    expect(val.getResolvedPath().endsWith(expectedPackagePath),
      `'${val.getResolvedPath()}' does not contain expected packaged path '${expectedPackagePath}'`).toBe(true)
  })

  // testUsdUtilsUsdzUtils.py:68-79
  it('test_UsdzAssetIteratorWorkingDirectory', async () => {
    // Ensures the working directory is correctly reset after iteration.
    const expectedWorkingDir = process.cwd()
    await new UsdzAssetIterator('usdzAssetIterator/test.usdz', false).with(async usdAssetItr => {
      for await (const _ of usdAssetItr.usdAssets()) { /* pass */ }
    })
    const actualWorkingDir = process.cwd()
    expect(actualWorkingDir).toBe(expectedWorkingDir)
  })

  // testUsdUtilsUsdzUtils.py:140-146
  it('test_ExtractUsdzPackage_success', async () => {
    const usdz = await buildSimpleUsdz()
    const target = path.join(scratch, 'extract_ok')
    expect(await UsdUtilsExtractUsdzPackage(usdz, target)).toBe(true)
    expect(isFile(path.join(target, 'root.usda'))).toBe(true)
    expect(isFile(path.join(target, 'deep', 'sub.usda'))).toBe(true)
  })

  // testUsdUtilsUsdzUtils.py:148-152
  it('test_ExtractUsdzPackage_existingDirNoForce', async () => {
    const usdz = await buildSimpleUsdz()
    const target = path.join(scratch, 'extract_collide')
    expect(await UsdUtilsExtractUsdzPackage(usdz, target)).toBe(true)
    expect(await UsdUtilsExtractUsdzPackage(usdz, target)).toBe(false)
  })

  // testUsdUtilsUsdzUtils.py:154-159
  it('test_ExtractUsdzPackage_existingDirForce', async () => {
    const usdz = await buildSimpleUsdz()
    const target = path.join(scratch, 'extract_force')
    expect(await UsdUtilsExtractUsdzPackage(usdz, target)).toBe(true)
    expect(await UsdUtilsExtractUsdzPackage(usdz, target, false, true)).toBe(true)
  })

  // testUsdUtilsUsdzUtils.py:161-164
  it('test_ExtractUsdzPackage_missingInput', async () => {
    expect(await UsdUtilsExtractUsdzPackage(
      path.join(scratch, 'nope.usdz'), path.join(scratch, 'extract_missing'))).toBe(false)
  })

  // testUsdUtilsUsdzUtils.py:166-171
  it('test_ExtractUsdzPackage_notUsdzExtension', async () => {
    const notUsdz = path.join(scratch, 'not.txt')
    writeFileSync(notUsdz, 'hi')
    expect(await UsdUtilsExtractUsdzPackage(notUsdz, path.join(scratch, 'extract_badext'))).toBe(false)
  })

  // testUsdUtilsUsdzUtils.py:173-181
  it('test_ExtractUsdzPackage_targetIsFile', async () => {
    const usdz = await buildSimpleUsdz()
    const plainFile = path.join(scratch, 'plainfile')
    writeFileSync(plainFile, 'hi')
    expect(await UsdUtilsExtractUsdzPackage(usdz, plainFile)).toBe(false)
    // Untouched.
    expect(readFileSync(plainFile, 'utf-8')).toBe('hi')
  })

  // testUsdUtilsUsdzUtils.py:183-191
  it('test_UsdzScanIterator_basicEntries', async () => {
    const usdz = await buildSimpleUsdz()
    const seen = new Map<string, string>()
    {
      using it = await new UsdzScanIterator(usdz).enter()
      for (const [name, view] of it) seen.set(name, decoder.decode(view.slice()))
    }
    expect(new Set(seen.keys())).toEqual(new Set(['root.usda', 'deep/sub.usda']))
    expect(seen.get('root.usda')).toBe('#usda 1.0\n')
    expect(seen.get('deep/sub.usda')!.startsWith('#usda 1.0')).toBe(true)
  })

  // testUsdUtilsUsdzUtils.py:193-201
  it('test_UsdzScanIterator_nestedRecurse', async () => {
    const usdz = await buildNestedUsdz()
    const names = new Set<string>()
    {
      using it = await new UsdzScanIterator(usdz, { recurse: true }).enter()
      for (const [name, view] of it) {
        names.add(name)
        // Every yielded entry should look like a usda layer.
        expect(decoder.decode(view.slice(0, 9))).toBe('#usda 1.0')
      }
    }
    expect(names).toEqual(new Set(['root.usda', 'inner.usdz/inner.usda']))
  })

  // testUsdUtilsUsdzUtils.py:203-210
  it('test_UsdzScanIterator_nestedNoRecurse', async () => {
    const usdz = await buildNestedUsdz()
    const names = new Set<string>()
    {
      using it = await new UsdzScanIterator(usdz, { recurse: false }).enter()
      for (const [name] of it) names.add(name)
    }
    expect(names.has('inner.usdz')).toBe(true)
    expect(names.has('inner.usdz/inner.usda')).toBe(false)
  })

  // testUsdUtilsUsdzUtils.py:212-221. A held view reads as empty
  // (PLATFORM-DIVERGENCE(usdutils-usdz-scan-detached-view)).
  it('test_UsdzScanIterator_viewInvalidAfterExit', async () => {
    const usdz = await buildSimpleUsdz()
    let held: Uint8Array | undefined
    {
      using it = await new UsdzScanIterator(usdz).enter()
      for (const [, view] of it) {
        held = view
        break
      }
    }
    expect(held).toBeDefined()
    expect(held!.length).toBe(0)
    expect(held![0]).toBeUndefined()
  })

  // testUsdUtilsUsdzUtils.py:223-227
  it('test_UsdzScanIterator_outsideContextRaises', async () => {
    const usdz = await buildSimpleUsdz()
    const it = new UsdzScanIterator(usdz)
    expect(() => [...it]).toThrow(Error)
  })

  // testUsdUtilsUsdzUtils.py:229-244
  it('test_UsdzUpdateIterator_roundTripPerEntryBytes', async () => {
    const usdz = await buildNestedUsdz('rt.usdz')
    const before = await snapshot(usdz)
    await new UsdzUpdateIterator(usdz).with(async upd => {
      for await (const _ of upd.allAssets()) { /* pass */ }
    })
    const after = await snapshot(usdz)
    expect(after).toEqual(before)
  })

  // testUsdUtilsUsdzUtils.py:246-276
  it('test_UsdzUpdateIterator_sameStemNestedNoCollision', async () => {
    // Two nested packages with the same filename stem but different archive
    // paths must iterate cleanly: their extract dirs must not share a path.
    const usdz = await buildSameStemNestedUsdz()
    // Drain AllAssets recursively; succeeds only if the nested extract dirs
    // don't trample each other.
    const seenInners: string[] = []
    await new UsdzUpdateIterator(usdz).with(async upd => {
      for await (const p of upd.allAssets()) {
        seenInners.push(p)
        // While we're iterating inner asset paths, each must actually exist
        // on disk (it's inside a live extract dir for the package it came
        // from).
        expect(isFile(p), `asset '${p}' not on disk during iteration`).toBe(true)
      }
    })
    // We should have seen a.usda from innerA and b.usda from innerB (plus
    // possibly no others).
    const bases = seenInners.map(p => path.basename(p)).sort()
    expect(bases).toContain('a.usda')
    expect(bases).toContain('b.usda')

    // And the post-iteration scan should agree on what's inside.
    expect(new Set((await snapshot(usdz)).keys()))
      .toEqual(new Set(['dirA/nested.usdz/a.usda', 'dirB/nested.usdz/b.usda']))
  })

  // testUsdUtilsUsdzUtils.py:278-287
  it('test_UsdzUpdateIterator_atomicOnException', async () => {
    const usdz = await buildSimpleUsdz('atomic.usdz')
    const origBytes = readFileSync(usdz)
    await expect(new UsdzUpdateIterator(usdz).with(async upd => {
      for await (const _ of upd.allAssets()) throw new Error('simulated failure')
    })).rejects.toThrow('simulated failure')
    expect(readFileSync(usdz).equals(origBytes)).toBe(true)
  })

  // testUsdUtilsUsdzUtils.py:289-299
  it('test_UsdzUpdateIterator_outputPathLeavesOriginal', async () => {
    const src = await buildSimpleUsdz('src.usdz')
    const srcBytes = readFileSync(src)
    const dst = path.join(scratch, 'dst.usdz')
    await new UsdzUpdateIterator(src, { outputPath: dst }).with(async upd => {
      for await (const _ of upd.allAssets()) { /* pass */ }
    })
    expect(isFile(dst)).toBe(true)
    expect(readFileSync(src).equals(srcBytes)).toBe(true)
  })

  // testUsdUtilsUsdzUtils.py:301-310
  it('test_UsdzUpdateIterator_entriesFlat', async () => {
    const usdz = await buildNestedUsdz('entries.usdz')
    const seen = new Set<string>()
    await new UsdzUpdateIterator(usdz).with(upd => {
      for (const [absPath, arcname] of upd.entries()) {
        expect(path.isAbsolute(absPath)).toBe(true)
        expect(isFile(absPath)).toBe(true)
        seen.add(arcname)
      }
    })
    // Flat view: nested .usdz is one entry, not its contents.
    expect(seen).toEqual(new Set(['root.usda', 'inner.usdz']))
  })

  // testUsdUtilsUsdzUtils.py:312-316
  it('test_UsdzUpdateIterator_entriesOutsideContext', async () => {
    const usdz = await buildSimpleUsdz('entries_outside.usdz')
    const upd = new UsdzUpdateIterator(usdz)
    // Before enter(): there is no extract dir; entries() yields nothing.
    expect([...upd.entries()]).toEqual([])
  })

  // testUsdUtilsUsdzUtils.py:318-324
  it('test_UsdzUpdateIterator_yieldsAbsolutePaths', async () => {
    const usdz = await buildSimpleUsdz('abs.usdz')
    await new UsdzUpdateIterator(usdz).with(async upd => {
      for await (const p of upd.allAssets()) {
        expect(path.isAbsolute(p), `expected absolute path, got '${p}'`).toBe(true)
        expect(isFile(p)).toBe(true)
      }
    })
  })

  // testUsdUtilsUsdzUtils.py:326-340
  it.skipIf(process.platform === 'win32')('test_UsdzUpdateIterator_preserveAll', async () => {
    const usdz = await buildSimpleUsdz('attrs.usdz')
    chmodSync(usdz, 0o640)
    const before = statSync(usdz)
    await new UsdzUpdateIterator(usdz, { preserveMode: true, preserveGroup: true, preserveOwner: true })
      .with(async upd => {
        for await (const _ of upd.allAssets()) { /* pass */ }
      })
    const after = statSync(usdz)
    expect(after.mode).toBe(before.mode)
    expect(after.uid).toBe(before.uid)
    expect(after.gid).toBe(before.gid)
  })

  // testUsdUtilsUsdzUtils.py:341-355
  it.skipIf(process.platform === 'win32')('test_UsdzUpdateIterator_noPreserve', async () => {
    // With every preserve flag off, the rewrite lands with the mode a freshly
    // written package gets, not the original's.
    const usdz = await buildSimpleUsdz('no_attrs.usdz')
    const control = await buildSimpleUsdz('no_attrs_control.usdz')
    chmodSync(usdz, 0o600)
    await new UsdzUpdateIterator(usdz).with(async upd => {
      for await (const _ of upd.allAssets()) { /* pass */ }
    })
    // Compare against the control rather than a literal: both went through
    // ZipFileWriter under the same umask, so this holds whatever it is.
    expect(statSync(usdz).mode & 0o7777).toBe(statSync(control).mode & 0o7777)
  })

  // testUsdUtilsUsdzUtils.py:356-391
  it.skipIf(process.platform === 'win32')('test_UsdzUpdateIterator_preserveGroupWithoutOwner', async ctx => {
    // Mode and group are preservable without root; owner is not. Asking for
    // mode+group only must succeed and leave the rewrite owned by the running
    // user, which is what an unprivileged bulk update needs.
    const usdz = await buildSimpleUsdz('group_only.usdz')
    // Needs a group other than the default to observe anything, and one we
    // can actually chown to.
    let altGid: number | undefined
    for (const gid of [...new Set(process.getgroups!())].sort((a, b) => a - b)) {
      if (gid === process.getgid!()) continue
      try {
        chownSync(usdz, -1, gid)
      } catch {
        continue
      }
      altGid = gid
      break
    }
    if (altGid === undefined) {
      // no secondary group this process can chown to, so a preserved group
      // is indistinguishable from the default
      ctx.skip()
      return
    }

    chmodSync(usdz, 0o640)
    const before = statSync(usdz)
    expect(before.gid).toBe(altGid)

    await new UsdzUpdateIterator(usdz, { preserveMode: true, preserveGroup: true }).with(async upd => {
      for await (const _ of upd.allAssets()) { /* pass */ }
    })

    const after = statSync(usdz)
    expect(after.mode & 0o7777).toBe(0o640)
    expect(after.gid).toBe(altGid)
    expect(after.uid).toBe(process.geteuid!())
  })

  // testUsdUtilsUsdzUtils.py:393-433
  it('test_UsdzUpdateIterator_tagInTempNames', async () => {
    // When tag is set, the extract dir and rewrite temp file names embed the
    // tag. Verified by snapshotting names mid-rewrite via a ZipFileWriter
    // monkey-patch.
    const usdz = await buildSimpleUsdz('tagged.usdz')
    const seen = { extractDirs: [] as string[], tempFiles: [] as string[] }

    // Patch ZipFileWriter.createNew to record the output path (which is the
    // rewrite temp) and snapshot any sibling extract dirs at the moment the
    // writer is created.
    const origCreate = SdfZipFileWriter.createNew
    const spy = (outPath: string) => {
      seen.tempFiles.push(path.basename(outPath))
      const parent = path.dirname(outPath) || '.'
      for (const entry of readdirSync(parent)) {
        const full = path.join(parent, entry)
        if (statSync(full).isDirectory() && entry.includes('usdzExtract')) seen.extractDirs.push(entry)
      }
      return origCreate.call(SdfZipFileWriter, outPath)
    }

    SdfZipFileWriter.createNew = spy
    try {
      await new UsdzUpdateIterator(usdz, { tag: 'mycampaign' }).with(async upd => {
        for await (const _ of upd.allAssets()) { /* pass */ }
      })
    } finally {
      SdfZipFileWriter.createNew = origCreate
    }

    expect(seen.tempFiles.length, 'no rewrite temp observed').toBeGreaterThan(0)
    expect(seen.extractDirs.length, 'no extract dir observed').toBeGreaterThan(0)
    for (const n of seen.tempFiles) {
      expect(n.includes('.mycampaign.'), `tag missing from temp name '${n}'`).toBe(true)
      expect(n.endsWith('.tmp.usdz'), `temp name should end .tmp.usdz: '${n}'`).toBe(true)
    }
    for (const n of seen.extractDirs) {
      expect(n.startsWith('.usdzExtract.mycampaign.'), `tag missing from extract dir '${n}'`).toBe(true)
    }
  })

  // testUsdUtilsUsdzUtils.py:435-460
  it('test_UsdzUpdateIterator_noTagDefaultNames', async () => {
    // When tag is omitted (default), names use the untagged form.
    const usdz = await buildSimpleUsdz('untagged.usdz')
    const seen: string[] = []
    const origCreate = SdfZipFileWriter.createNew
    const spy = (outPath: string) => {
      seen.push(path.basename(outPath))
      return origCreate.call(SdfZipFileWriter, outPath)
    }

    SdfZipFileWriter.createNew = spy
    try {
      await new UsdzUpdateIterator(usdz).with(async upd => {
        for await (const _ of upd.allAssets()) { /* pass */ }
      })
    } finally {
      SdfZipFileWriter.createNew = origCreate
    }

    expect(seen.length).toBeGreaterThan(0)
    for (const n of seen) {
      expect(n.endsWith('.tmp.usdz')).toBe(true)
      // Untagged: name is "<base>.<pid>.tmp.usdz"; just check the tag form
      // isn't present.
      expect(n.includes('.mycampaign.')).toBe(false)
    }
  })

  // testUsdUtilsUsdzUtils.py:462-473. os.name = 'nt' is process.platform =
  // 'win32'.
  it('test_UsdzUpdateIterator_rejectsPreserveFlagsOnWindows', async () => {
    const usdz = await buildSimpleUsdz('nt_reject.usdz')
    const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'win32' }) // sneaky, but just for a test...
    try {
      for (const flag of ['preserveMode', 'preserveGroup', 'preserveOwner'] as const) {
        expect(() => new UsdzUpdateIterator(usdz, { [flag]: true })).toThrow(Error)
      }
      // All flags off stays legal on Windows.
      new UsdzUpdateIterator(usdz)
    } finally {
      Object.defineProperty(process, 'platform', realPlatform)
    }
  })
})
