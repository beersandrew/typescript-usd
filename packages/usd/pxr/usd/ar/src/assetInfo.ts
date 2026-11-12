// Ported from OpenUSD 26.11.1: pxr/usd/ar/assetInfo.cpp,
//  pxr/usd/ar/assetInfo.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// ArAssetInfo (OpenUSD 26.11.1 pxr/usd/ar/assetInfo.h:22-74,
// assetInfo.cpp:13-30): resolver-provided asset identity metadata.
import { Hash as TfHash } from 'typescript-usd/tf'

export class ArAssetInfo {
  constructor(
    public version = '',
    public assetName = '',
    public resolverInfo: unknown = undefined,
    public repoPath = '',
  ) {}

  // operator== / operator!= (assetInfo.cpp:13-30).
  equals(rhs: ArAssetInfo): boolean {
    return this.version === rhs.version && this.assetName === rhs.assetName &&
      this.repoPath === rhs.repoPath && valueEquals(this.resolverInfo, rhs.resolverInfo)
  }
  notEquals(rhs: ArAssetInfo): boolean { return !this.equals(rhs) }

  // TfHashAppend (assetInfo.h:45-50).
  hash(): bigint {
    return TfHash([this.version, this.assetName, this.repoPath, this.resolverInfo])
  }
}

// VtValue equality: held values of the same type compare with their own
// equality operator.
function valueEquals(lhs: unknown, rhs: unknown): boolean {
  if (lhs === rhs) return true
  if (lhs !== null && typeof lhs === 'object' && typeof (lhs as { equals?: unknown }).equals === 'function') {
    return (lhs as { equals(o: unknown): boolean }).equals(rhs)
  }
  return false
}
