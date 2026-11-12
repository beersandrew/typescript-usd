// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/textureIdentifier.cpp,
//  pxr/imaging/hdSt/textureIdentifier.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/textureIdentifier.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - ID is a bigint (TfHash). The hashes are cache keys only.
// - The class has value semantics as upstream: the subtexture identifier is
//   cloned on copy (Copy() is the copy constructor).

import { HashCombine as TfHashCombine, Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue } from 'typescript-usd/vt'
import type { HdStSubtextureIdentifier } from './subtextureIdentifier.ts'

export type HdStTextureIdentifierID = bigint

/** textureIdentifier.cpp:13-21 */
function _CloneSubtextureId(
  subtextureId: HdStSubtextureIdentifier | null,
): HdStSubtextureIdentifier | null {
  if (subtextureId) {
    return subtextureId.Clone()
  }
  return null
}

/** textureIdentifier.h:22-106. Class to identify a texture file or a
 *  texture within the texture file (e.g., a frame in a movie).
 *
 *  The class has value semantics and uses HdStSubtextureIdentifier in a
 *  polymorphic way. */
export class HdStTextureIdentifier {
  private readonly _filePath: TfToken
  private readonly _fallback: VtValue
  private readonly _defaultToFallback: boolean
  private readonly _subtextureId: HdStSubtextureIdentifier | null

  /** textureIdentifier.cpp:23-49. The C'tors for files that can contain
   *  only one texture (no subtexture identifier) and for files that can
   *  contain more than one texture (e.g., frames in a movie, grids in a VDB
   *  file). */
  constructor(
    filePath: TfToken = TfToken(),
    subtextureIdOrFallback: HdStSubtextureIdentifier | VtValue | null = null,
    fallbackOrDefault: VtValue | boolean = VtValue.getEmpty(),
    defaultToFallback = false,
  ) {
    this._filePath = filePath
    if (subtextureIdOrFallback instanceof VtValue) {
      // textureIdentifier.cpp:25-33 (filePath, fallback, defaultToFallback)
      this._subtextureId = null
      this._fallback = subtextureIdOrFallback
      this._defaultToFallback = fallbackOrDefault === true
    } else {
      // textureIdentifier.cpp:35-45 (filePath, subtextureId, fallback,
      // defaultToFallback)
      this._subtextureId = subtextureIdOrFallback
      this._fallback = fallbackOrDefault instanceof VtValue ? fallbackOrDefault : VtValue.getEmpty()
      this._defaultToFallback = defaultToFallback
    }
  }

  /** textureIdentifier.cpp:47-54 (copy constructor). */
  copy(): HdStTextureIdentifier {
    return new HdStTextureIdentifier(
      this._filePath, _CloneSubtextureId(this._subtextureId),
      this._fallback, this._defaultToFallback)
  }

  /** The copy a VtValue holds (vt/src/value.ts copyHeldValue). */
  Clone(): HdStTextureIdentifier {
    return this.copy()
  }

  /** textureIdentifier.h:68-70. Get file path of texture file. */
  getFilePath(): TfToken {
    return this._filePath
  }

  /** textureIdentifier.h:74-76. Get fallback value that's used if loading
   *  from _filePath fails. */
  getFallback(): VtValue {
    return this._fallback
  }

  /** textureIdentifier.h:80-82. Get if reading from _filePath should be
   *  skipped. */
  shouldDefaultToFallback(): boolean {
    return this._defaultToFallback
  }

  /** textureIdentifier.h:91-93. Get additional information identifying a
   *  texture in a file that can contain more than one texture (e.g., a
   *  frame in a movie or a grid in a VDB file). Null for files (e.g., png)
   *  that can contain only one texture. */
  getSubtextureIdentifier(): HdStSubtextureIdentifier | null {
    return this._subtextureId
  }

  /** textureIdentifier.cpp:81-89 */
  equals(other: HdStTextureIdentifier): boolean {
    const a = _OptionalSubidentifierHash(this)
    const b = _OptionalSubidentifierHash(other)
    return this._filePath === other._filePath &&
      this._fallback.equals(other._fallback) &&
      this._defaultToFallback === other._defaultToFallback &&
      a[0] === b[0] && a[1] === b[1]
  }

  /** textureIdentifier.cpp:97-108 hash_value */
  hash_value(): HdStTextureIdentifierID {
    const subId = this.getSubtextureIdentifier()
    if (subId) {
      return TfHashCombine(this.getFilePath(), this.getFallback(),
        this.shouldDefaultToFallback(), subId)
    } else {
      return TfHashCombine(this.getFilePath(), this.getFallback(),
        this.shouldDefaultToFallback())
    }
  }
}

/** textureIdentifier.cpp:71-79 */
function _OptionalSubidentifierHash(id: HdStTextureIdentifier): [boolean, bigint] {
  const subId = id.getSubtextureIdentifier()
  if (subId) {
    return [true, subId.hash_value()]
  }
  return [false, 0n]
}
