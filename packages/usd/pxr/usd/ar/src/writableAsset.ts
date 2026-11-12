// Ported from OpenUSD 26.11.1: pxr/usd/ar/writableAsset.cpp,
//  pxr/usd/ar/writableAsset.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

export abstract class ArWritableAsset {
  abstract write(buffer: Uint8Array, offset: number): Promise<number>
  abstract close(): Promise<boolean>
}

export enum ArResolverWriteMode {
  Update = 'update',
  Replace = 'replace',
}
