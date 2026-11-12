// Ported from OpenUSD 26.11.1: pxr/usd/ar/filesystemAsset.cpp,
//  pxr/usd/ar/filesystemAsset.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { ArInMemoryAsset } from './asset.ts'
import type { ArResolvedPath } from './resolvedPath.ts'
import { _readFile } from './platformFilesystem.ts'

// ArFilesystemAsset (filesystemAsset.h:27-76): the ArAsset ArDefaultResolver
// returns for a file on disk. The browser-safe filesystem seam only reads
// whole files, so the contents are read at Open; there is no FILE* behind
// GetFileUnsafe.
export class ArFilesystemAsset extends ArInMemoryAsset {
  // ArFilesystemAsset::Open (filesystemAsset.cpp:19-34).
  static async open(resolvedPath: ArResolvedPath): Promise<ArFilesystemAsset | undefined> {
    try {
      return new ArFilesystemAsset(new Uint8Array(await _readFile(resolvedPath.toString())))
    } catch {
      return undefined
    }
  }

  // ArFilesystemAsset::Read (filesystemAsset.cpp:90-100) is ArchPRead: it
  // returns the bytes available from offset, up to count, rather than the
  // all-or-nothing ArInMemoryAsset::Read (inMemoryAsset.cpp:84-94).
  override async read(count: number, offset: number): Promise<Uint8Array> {
    const bytes = await this.getBuffer()
    if (offset < 0 || count < 0 || offset >= bytes.byteLength) return new Uint8Array()
    return bytes.slice(offset, Math.min(bytes.byteLength, offset + count))
  }
}
