// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/subtextureIdentifier.cpp,
//  pxr/imaging/hdSt/subtextureIdentifier.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/subtextureIdentifier.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - ID is a bigint (TfHash). The hashes are cache keys only.
// - std::unique_ptr ownership: Clone() returns a new object, as upstream.
// - dynamic_cast checks are `instanceof` checks.

import { Hash as TfHash, HashCombine as TfHashCombine, type Token as TfToken } from 'typescript-usd/tf'
import type { HdStDynamicUvTextureImplementation } from './dynamicUvTextureImplementation.ts'

export type HdStSubtextureIdentifierID = bigint

/** subtextureIdentifier.h:22-48. Base class for additional information to
 *  identify a texture in a file that can contain several textures (e.g.,
 *  frames in a movie or grids in an OpenVDB file). */
export abstract class HdStSubtextureIdentifier {
  abstract Clone(): HdStSubtextureIdentifier

  /** subtextureIdentifier.h:45 */
  protected abstract _hash(): HdStSubtextureIdentifierID

  /** subtextureIdentifier.cpp:20-24 hash_value(const HdStSubtextureIdentifier &) */
  hash_value(): HdStSubtextureIdentifierID {
    return this._hash()
  }
}

/** subtextureIdentifier.h:52-81. Base class for information identifying a
 *  grid in a volume field file. Parallels FieldBase in usdVol. */
export abstract class HdStFieldBaseSubtextureIdentifier extends HdStSubtextureIdentifier {
  private readonly _fieldName: TfToken
  private readonly _fieldIndex: number

  /** subtextureIdentifier.cpp:29-33 */
  protected constructor(fieldName: TfToken, fieldIndex: number) {
    super()
    this._fieldName = fieldName
    this._fieldIndex = fieldIndex
  }

  /** subtextureIdentifier.h:58-60. Get field name. */
  getFieldName(): TfToken { return this._fieldName }

  /** subtextureIdentifier.h:62-64. Get field index. */
  getFieldIndex(): number { return this._fieldIndex }

  /** subtextureIdentifier.cpp:38-42. The field index is a C++ int. */
  protected _hash(): HdStSubtextureIdentifierID {
    return TfHashCombine(this._fieldName, BigInt(this._fieldIndex))
  }
}

/** subtextureIdentifier.h:85-131. Specifies whether a UV texture should be
 *  loaded flipped vertically, whether it should be loaded with
 *  pre-multiplied alpha values, and the color space in which the texture is
 *  encoded. */
export class HdStAssetUvSubtextureIdentifier extends HdStSubtextureIdentifier {
  private readonly _flipVertically: boolean
  private readonly _premultiplyAlpha: boolean
  private readonly _sourceColorSpace: TfToken

  /** subtextureIdentifier.cpp:47-55 */
  constructor(flipVertically: boolean, premultiplyAlpha: boolean, sourceColorSpace: TfToken) {
    super()
    this._flipVertically = flipVertically
    this._premultiplyAlpha = premultiplyAlpha
    this._sourceColorSpace = sourceColorSpace
  }

  /** subtextureIdentifier.cpp:60-65 */
  Clone(): HdStSubtextureIdentifier {
    return new HdStAssetUvSubtextureIdentifier(
      this.getFlipVertically(), this.getPremultiplyAlpha(), this.getSourceColorSpace())
  }

  getFlipVertically(): boolean { return this._flipVertically }
  getPremultiplyAlpha(): boolean { return this._premultiplyAlpha }
  getSourceColorSpace(): TfToken { return this._sourceColorSpace }

  /** subtextureIdentifier.cpp:67-77 */
  protected _hash(): HdStSubtextureIdentifierID {
    return TfHashCombine(
      _typeHash('HdStAssetUvSubtextureIdentifier'),
      this.getFlipVertically(),
      this.getPremultiplyAlpha(),
      this.getSourceColorSpace())
  }
}

/** subtextureIdentifier.h:135-174. Used as a tag that the Storm texture
 *  system returns a HdStDynamicUvTextureObject that is populated by a client
 *  rather than by the Storm texture system.
 *
 *  Clients can subclass this class and provide their own
 *  HdStDynamicUvTextureImplementation to create UV texture with custom load
 *  and commit behavior (testHdStDynamicUvTexture.cpp is an example). */
export class HdStDynamicUvSubtextureIdentifier extends HdStSubtextureIdentifier {
  /** subtextureIdentifier.cpp:82-83 */
  constructor() {
    super()
  }

  /** subtextureIdentifier.cpp:88-92 */
  Clone(): HdStSubtextureIdentifier {
    return new HdStDynamicUvSubtextureIdentifier()
  }

  /** subtextureIdentifier.cpp:102-106. Textures can return their own
   *  HdStDynamicUvTextureImplementation to customize the load and commit
   *  behavior. */
  getTextureImplementation(): HdStDynamicUvTextureImplementation | null {
    return null
  }

  /** subtextureIdentifier.cpp:94-100 */
  protected _hash(): HdStSubtextureIdentifierID {
    return _typeHash('HdStDynamicUvSubtextureIdentifier')
  }
}

/** subtextureIdentifier.h:178-205. Specifies whether a Ptex texture should
 *  be loaded with pre-multiplied alpha values. */
export class HdStPtexSubtextureIdentifier extends HdStSubtextureIdentifier {
  private readonly _premultiplyAlpha: boolean

  /** subtextureIdentifier.cpp:139-143 */
  constructor(premultiplyAlpha: boolean) {
    super()
    this._premultiplyAlpha = premultiplyAlpha
  }

  /** subtextureIdentifier.cpp:148-153 */
  Clone(): HdStSubtextureIdentifier {
    return new HdStPtexSubtextureIdentifier(this.getPremultiplyAlpha())
  }

  getPremultiplyAlpha(): boolean { return this._premultiplyAlpha }

  /** subtextureIdentifier.cpp:155-163 */
  protected _hash(): HdStSubtextureIdentifierID {
    return TfHashCombine(
      _typeHash('HdStPtexSubtextureIdentifier'),
      this.getPremultiplyAlpha())
  }
}

/** subtextureIdentifier.h:209-241. Specifies whether a Udim texture should
 *  be loaded with pre-multiplied alpha values and the color space in which
 *  the texture is encoded. */
export class HdStUdimSubtextureIdentifier extends HdStSubtextureIdentifier {
  private readonly _premultiplyAlpha: boolean
  private readonly _sourceColorSpace: TfToken

  /** subtextureIdentifier.cpp:111-115 */
  constructor(premultiplyAlpha: boolean, sourceColorSpace: TfToken) {
    super()
    this._premultiplyAlpha = premultiplyAlpha
    this._sourceColorSpace = sourceColorSpace
  }

  /** subtextureIdentifier.cpp:120-125 */
  Clone(): HdStSubtextureIdentifier {
    return new HdStUdimSubtextureIdentifier(
      this.getPremultiplyAlpha(), this.getSourceColorSpace())
  }

  getPremultiplyAlpha(): boolean { return this._premultiplyAlpha }
  getSourceColorSpace(): TfToken { return this._sourceColorSpace }

  /** subtextureIdentifier.cpp:127-136 */
  protected _hash(): HdStSubtextureIdentifierID {
    return TfHashCombine(
      _typeHash('HdStUdimSubtextureIdentifier'),
      this.getPremultiplyAlpha(),
      this.getSourceColorSpace())
  }
}

/** subtextureIdentifier.h:245-275. Used as a tag that the Storm texture
 *  system returns a HdStDynamicUvTextureObject (of cubemap type) that is
 *  populated by a client rather than by the Storm texture system. */
export class HdStDynamicCubemapSubtextureIdentifier extends HdStSubtextureIdentifier {
  /** subtextureIdentifier.cpp:168-169 */
  constructor() {
    super()
  }

  /** subtextureIdentifier.cpp:174-178 */
  Clone(): HdStSubtextureIdentifier {
    return new HdStDynamicCubemapSubtextureIdentifier()
  }

  /** subtextureIdentifier.cpp:188-192 */
  getTextureImplementation(): HdStDynamicUvTextureImplementation | null {
    return null
  }

  /** subtextureIdentifier.cpp:180-186 */
  protected _hash(): HdStSubtextureIdentifierID {
    return _typeHash('HdStDynamicCubemapSubtextureIdentifier')
  }
}

/** The function-local `static ID typeHash = TfHash()(std::string(...))`
 *  of each _Hash above. */
const _typeHashes = new Map<string, bigint>()
export function _typeHash(name: string): bigint {
  let h = _typeHashes.get(name)
  if (h === undefined) {
    h = TfHash(name)
    _typeHashes.set(name, h)
  }
  return h
}
