// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/fieldSubtextureIdentifier.cpp,
//  pxr/imaging/hdSt/fieldSubtextureIdentifier.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/fieldSubtextureIdentifier.{h,cpp}
// (OpenUSD 26.11.1).

import { HashCombine as TfHashCombine, type Token as TfToken } from 'typescript-usd/tf'
import {
  HdStFieldBaseSubtextureIdentifier,
  _typeHash,
  type HdStSubtextureIdentifier,
  type HdStSubtextureIdentifierID,
} from './subtextureIdentifier.ts'

/** fieldSubtextureIdentifier.h:21-46. Identifies a grid in an OpenVDB file.
 *  Parallels OpenVDBAsset in usdVol. */
export class HdStOpenVDBAssetSubtextureIdentifier extends HdStFieldBaseSubtextureIdentifier {
  /** fieldSubtextureIdentifier.cpp:16-20 */
  constructor(fieldName: TfToken, fieldIndex: number) {
    super(fieldName, fieldIndex)
  }

  /** fieldSubtextureIdentifier.cpp:25-30 */
  Clone(): HdStSubtextureIdentifier {
    return new HdStOpenVDBAssetSubtextureIdentifier(
      this.getFieldName(), this.getFieldIndex())
  }

  /** fieldSubtextureIdentifier.cpp:32-40 */
  protected override _hash(): HdStSubtextureIdentifierID {
    return TfHashCombine(_typeHash('vdb'), super._hash())
  }
}

/** fieldSubtextureIdentifier.h:50-82. Identifies the grid in a Field3DAsset
 *  file. Parallels Field3DAsset in usdVol. */
export class HdStField3DAssetSubtextureIdentifier extends HdStFieldBaseSubtextureIdentifier {
  private readonly _fieldPurpose: TfToken

  /** fieldSubtextureIdentifier.cpp:45-52 */
  constructor(fieldName: TfToken, fieldIndex: number, fieldPurpose: TfToken) {
    super(fieldName, fieldIndex)
    this._fieldPurpose = fieldPurpose
  }

  /** fieldSubtextureIdentifier.cpp:57-62 */
  Clone(): HdStSubtextureIdentifier {
    return new HdStField3DAssetSubtextureIdentifier(
      this.getFieldName(), this.getFieldIndex(), this.getFieldPurpose())
  }

  /** fieldSubtextureIdentifier.h:69 */
  getFieldPurpose(): TfToken { return this._fieldPurpose }

  /** fieldSubtextureIdentifier.cpp:64-73 */
  protected override _hash(): HdStSubtextureIdentifierID {
    return TfHashCombine(_typeHash('Field3D'), super._hash(), this._fieldPurpose)
  }
}
