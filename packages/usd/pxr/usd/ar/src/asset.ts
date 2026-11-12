// Ported from OpenUSD 26.11.1: pxr/usd/ar/asset.cpp, pxr/usd/ar/asset.h
// Copyright 2018, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

export abstract class ArAsset {
  abstract getSize(): number
  abstract getBuffer(): Promise<Uint8Array>
  abstract read(count: number, offset: number): Promise<Uint8Array>

  async getDetachedAsset(): Promise<ArAsset> {
    return new ArInMemoryAsset(new Uint8Array(await this.getBuffer()))
  }
}

export class ArInMemoryAsset extends ArAsset {
  constructor(private readonly bytes: Uint8Array) { super() }
  getSize(): number { return this.bytes.byteLength }
  async getBuffer(): Promise<Uint8Array> { return this.bytes }
  async read(count: number, offset: number): Promise<Uint8Array> {
    if (offset < 0 || count < 0 || offset + count > this.bytes.byteLength) return new Uint8Array()
    return this.bytes.slice(offset, offset + count)
  }
}
