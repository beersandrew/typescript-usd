import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DefaultResolver as ArDefaultResolver, ResolverWriteMode as ArResolverWriteMode,
} from '../../src/index.ts'

describe('ArFilesystemWritableAsset safe output', () => {
  it('creates parent directories and atomically publishes replacements on close', async () => {
    const root = mkdtempSync(join(tmpdir(), 'typescript-usd-ar-write-'))
    try {
      const resolver = new ArDefaultResolver()
      const target = join(root, 'new', 'nested', 'asset.usda')
      const resolved = await resolver.resolveForNewAsset(target)
      const created = await resolver.openAssetForWrite(resolved, ArResolverWriteMode.Replace)
      expect(created).toBeDefined()
      expect(await created!.write(new TextEncoder().encode('first'), 0)).toBe(5)
      expect(await created!.close()).toBe(true)
      expect(readFileSync(target, 'utf8')).toBe('first')

      const replacement = await resolver.openAssetForWrite(resolved, ArResolverWriteMode.Replace)
      expect(await replacement!.write(new TextEncoder().encode('second'), 0)).toBe(6)
      expect(readFileSync(target, 'utf8')).toBe('first')
      expect(await replacement!.close()).toBe(true)
      expect(readFileSync(target, 'utf8')).toBe('second')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
