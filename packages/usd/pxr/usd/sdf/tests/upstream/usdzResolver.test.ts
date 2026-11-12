// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfUsdzResolver.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/sdf/testenv/testSdfUsdzResolver.cpp (TestOpenAsset) —
// opening / resolving an asset addressed by a package-relative path inside a
// .usdz, including nested .usdz packages (test.usdz[nested.usdz[file.usdc]]).
//
// The first suite reads the archive directly with UsdZipFile +
// splitPackagePath to check each entry's absolute byte offset within the
// outermost archive (ArAsset::GetFileUnsafe().second, which has no ArAsset
// analog here); the second goes through ArGetResolver().
//
// The fixture is upstream's own testSdfUsdzResolver/test.usdz (base64-embedded
// below). Golden sizes/offsets are the literals from the C++ suite; golden
// content hashes (FNV-1a 64-bit) were captured from the Pixar build (usd-2605)
// via Ar.GetResolver().OpenAsset(...).GetBuffer().

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'
import { ArInMemoryResolver, _setResolverForTest } from 'typescript-usd/ar/_internal'
import { UsdZipFile } from 'typescript-usd/sdf'
import { splitPackagePath } from 'typescript-usd/sdf/_internal'

// Pure-TS base64 decode + FNV-1a hash so the suite needs no node:crypto/Buffer
// types (the typescript-usd/sdf tsconfig is browser-first: bare ES2022 lib).
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function b64decode(s: string): Uint8Array {
  const lut = new Int16Array(256).fill(-1)
  for (let i = 0; i < B64.length; i++) lut[B64.charCodeAt(i)] = i
  const clean = s.replace(/=+$/, '')
  const out = new Uint8Array((clean.length * 3) >> 2)
  let acc = 0
  let bits = 0
  let o = 0
  for (let i = 0; i < clean.length; i++) {
    const v = lut[clean.charCodeAt(i)] ?? -1
    if (v < 0) continue
    acc = (acc << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[o++] = (acc >> bits) & 0xff
    }
  }
  return out
}

// FNV-1a 64-bit, hex string — matches the python capture used for goldens.
function fnv1a(bytes: Uint8Array): string {
  const PRIME = 0x100000001b3n
  const MASK = 0xffffffffffffffffn
  let h = 0xcbf29ce484222325n
  for (let i = 0; i < bytes.length; i++) {
    h = ((h ^ BigInt(bytes[i] ?? 0)) * PRIME) & MASK
  }
  return '0x' + h.toString(16)
}

// upstream testSdfUsdzResolver/test.usdz, base64.
const TEST_USDZ_B64 =
  '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'

const TEST_USDZ = b64decode(TEST_USDZ_B64)

interface ResolvedAsset {
  bytes: Uint8Array
  offset: number
}

// ArResolver::OpenAsset analog. Descends package paths recursively
// (test.usdz[nested.usdz[file.usdc]]) and returns the resolved bytes plus the
// data's absolute byte offset in the OUTERMOST archive (GetFileUnsafe().second).
async function resolveInZip(
  zip: UsdZipFile,
  innerPath: string,
  baseOffset: number,
): Promise<ResolvedAsset | null> {
  const nested = splitPackagePath(innerPath)
  if (nested) {
    const entry = zip.getEntry(nested.packagePath)
    if (!entry) return null
    const childBytes = await zip.extract(nested.packagePath)
    const childZip = UsdZipFile.fromBytes(childBytes)
    return resolveInZip(childZip, nested.innerPath, baseOffset + entry.dataOffset)
  }
  const entry = zip.getEntry(innerPath)
  if (!entry) return null
  const bytes = await zip.extract(innerPath)
  return { bytes, offset: baseOffset + entry.dataOffset }
}

async function openAsset(packageRelativePath: string): Promise<ResolvedAsset | null> {
  const split = splitPackagePath(packageRelativePath)
  if (!split) return null
  // The only outer package here is test.usdz.
  expect(split.packagePath).toBe('test.usdz')
  const zip = UsdZipFile.fromBytes(TEST_USDZ)
  return resolveInZip(zip, split.innerPath, 0)
}

// (packageRelativePath, expectedSize, expectedOffset, expectedHash)
// sizes + offsets: literals from testSdfUsdzResolver.cpp.
// hashes (FNV-1a 64-bit): captured from Pixar usd-2605 Ar.OpenAsset(...).GetBuffer().
const CASES: Array<[string, number, number, string]> = [
  ['test.usdz[file_1.usdc]', 680, 64, '0x364a5826ae0745e0'],
  ['test.usdz[nested.usdz]', 2376, 832, '0x908a478a68795bd1'],
  ['test.usdz[nested.usdz[file_1.usdc]]', 680, 896, '0x364a5826ae0745e0'],
  ['test.usdz[nested.usdz[file_2.usdc]]', 621, 1664, '0x1feede338f204609'],
  ['test.usdz[nested.usdz[subdir/file_3.usdc]]', 640, 2368, '0xba028b445e06cc59'],
  ['test.usdz[file_2.usdc]', 621, 3264, '0x1feede338f204609'],
  ['test.usdz[subdir/file_3.usdc]', 640, 3968, '0xba028b445e06cc59'],
]

describe('UsdzResolver — OpenAsset on files within a .usdz', () => {
  it('returns null for a missing entry (test.usdz[bogus.file])', async () => {
    expect(await openAsset('test.usdz[bogus.file]')).toBeNull()
  })

  for (const [path, expectedSize, expectedOffset, expectedHash] of CASES) {
    it(`resolves ${path}`, async () => {
      const asset = await openAsset(path)
      expect(asset, path).not.toBeNull()
      // GetSize()
      expect(asset!.bytes.length).toBe(expectedSize)
      // GetBuffer() content matches the source file
      expect(fnv1a(asset!.bytes)).toBe(expectedHash)
      // GetFileUnsafe().second — data offset in the outermost archive
      expect(asset!.offset).toBe(expectedOffset)
      // Read(arr, numToRead, offset) for offset=100 mirrors upstream: the tail
      // from byte 100 is exactly the source file's tail.
      const tail = asset!.bytes.subarray(100)
      expect(tail.length).toBe(expectedSize - 100)
    })
  }

  it('reads identical content for a file and its copy inside nested.usdz', async () => {
    const outer = await openAsset('test.usdz[file_1.usdc]')
    const nested = await openAsset('test.usdz[nested.usdz[file_1.usdc]]')
    expect(fnv1a(outer!.bytes)).toBe(fnv1a(nested!.bytes))
    expect(outer!.bytes).toEqual(nested!.bytes)
  })
})

// The same TestOpenAsset cases through ArGetResolver(), which dispatches the
// packaged portion of each path to Sdf_UsdzResolver (usdzResolver.cpp). The
// in-memory primary resolver serves test.usdz.
describe('UsdzResolver — ArGetResolver dispatch to Sdf_UsdzResolver', () => {
  let previous: ReturnType<typeof ArGetResolver>
  beforeAll(() => {
    previous = ArGetResolver()
    _setResolverForTest(new ArInMemoryResolver({ 'test.usdz': TEST_USDZ }))
  })
  afterAll(() => _setResolverForTest(previous))

  it('opens no asset for a missing entry (test.usdz[bogus.file])', async () => {
    expect(await ArGetResolver().openAsset(new ArResolvedPath('test.usdz[bogus.file]')))
      .toBeUndefined()
  })

  for (const [path, expectedSize, , expectedHash] of CASES) {
    it(`opens ${path}`, async () => {
      const asset = await ArGetResolver().openAsset(new ArResolvedPath(path))
      expect(asset, path).toBeDefined()
      expect(asset!.getSize()).toBe(expectedSize)
      expect(fnv1a(await asset!.getBuffer())).toBe(expectedHash)
      const tail = await asset!.read(expectedSize - 100, 100)
      expect(tail.length).toBe(expectedSize - 100)
    })
  }

  // Expected values from OpenUSD v26.08 Ar.GetResolver().Resolve run in
  // testenv/testSdfUsdzResolver: a packaged path resolves only if the package
  // holds that entry.
  it('resolves a package-relative path only if the package holds the entry', async () => {
    const resolver = ArGetResolver()
    expect((await resolver.resolve('test.usdz[file_1.usdc]')).toString())
      .toBe('test.usdz[file_1.usdc]')
    expect((await resolver.resolve('test.usdz[nested.usdz[file_2.usdc]]')).toString())
      .toBe('test.usdz[nested.usdz[file_2.usdc]]')
    expect((await resolver.resolve('test.usdz[bogus.file]')).toString()).toBe('')
    expect((await resolver.resolve('test.usdz[nested.usdz[bogus]]')).toString()).toBe('')
    expect((await resolver.resolve('missing.usdz[file_1.usdc]')).toString()).toBe('')
  })
})

// Cache ownership mirrors usdzResolver.cpp:29-90. File bytes remain the
// native testSdfUsdzResolver fixture above; counters verify scoped work reuse.
describe('scoped USDZ archive reuse', () => {
  it('shares concurrent and nested scope reads, then reopens outside the scope', async () => {
    const { ResolverScopedCache } = await import('typescript-usd/ar')
    const previous = ArGetResolver()
    const memory = new ArInMemoryResolver({'test.usdz':TEST_USDZ})
    const open = memory.openAsset.bind(memory);let opens=0
    memory.openAsset = async path => { opens++;await Promise.resolve();return open(path) }
    _setResolverForTest(memory)
    try {
      const resolver=ArGetResolver(),scope=new ResolverScopedCache()
      await scope.run(async()=>{
        await Promise.all(Array.from({length:4},()=>resolver.openAsset(new ArResolvedPath('test.usdz[file_1.usdc]'))))
        expect(opens).toBe(1)
        await new ResolverScopedCache(scope).run(()=>resolver.openAsset(new ArResolvedPath('test.usdz[nested.usdz[file_2.usdc]]')))
        expect(opens).toBe(1)
      })
      await resolver.openAsset(new ArResolvedPath('test.usdz[file_1.usdc]'))
      expect(opens).toBe(2)
    }finally{_setResolverForTest(previous)}
  })
  it('isolates explicit browser scope contexts and shares layer/Hio package reads', async () => {
    const { _interim_createResolverScopedCacheContext, _resolverContextForResolver } = await import('typescript-usd/ar/_internal')
    const { openZip } = await import('../../src/usdzFileFormat.ts')
    const nested=UsdZipFile.fromBytes(TEST_USDZ)._extractStored('nested.usdz')!
    const readers=[new ArInMemoryResolver({'same.usdz':TEST_USDZ}),new ArInMemoryResolver({'same.usdz':nested})]
    const counts=[0,0]
    readers.forEach((r,i)=>{const open=r.openAsset.bind(r);r.openAsset=async path=>{counts[i] = counts[i]! + 1;return open(path)}})
    const scopes=readers.map(r=>_interim_createResolverScopedCacheContext(_resolverContextForResolver(r)))
    try {
      const results=await Promise.all(scopes.map(s=>Promise.all([openZip('same.usdz',undefined,s.context),openZip('same.usdz',undefined,s.context)])))
      expect(results[0]![0]).toBe(results[0]![1]);expect(results[1]![0]).toBe(results[1]![1])
      expect(results[0]![0].has('file_1.usdc')).toBe(true)
      expect(results[0]![0].has('nested.usdz')).toBe(true)
      expect(results[1]![0].has('nested.usdz')).toBe(false)
      expect(results[1]![0].has('file_2.usdc')).toBe(true)
      expect(counts).toEqual([1,1])
      scopes[0]!.dispose()
      await openZip('same.usdz',undefined,scopes[0]!.context)
      expect(counts).toEqual([2,1])
    }finally{scopes.forEach(s=>s.dispose())}
  })
  it('does not retain a rejected asynchronous package open', async()=>{
    const { _interim_createResolverScopedCacheContext, _resolverContextForResolver } = await import('typescript-usd/ar/_internal')
    const { openZip } = await import('../../src/usdzFileFormat.ts')
    const memory=new ArInMemoryResolver({'retry.usdz':TEST_USDZ}),open=memory.openAsset.bind(memory)
    let first=true;memory.openAsset=async path=>{if(first){first=false;throw new Error('network interrupted')}return open(path)}
    const scope=_interim_createResolverScopedCacheContext(_resolverContextForResolver(memory))
    try {
      await expect(openZip('retry.usdz',undefined,scope.context)).rejects.toThrow('network interrupted')
      expect((await openZip('retry.usdz',undefined,scope.context)).has('file_1.usdc')).toBe(true)
    }finally{scope.dispose()}
  })
})
