// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/field.cpp,
//  pxr/imaging/hdSt/field.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/field.{h,cpp} (OpenUSD 26.11.1): a volume
// field bprim, giving HdStVolume the texture identifier and memory request
// of its field texture.
//
// Divergences:
// - HdDirtyBits* is an HdDirtyBitsRef box; Sync takes the scene-delegate
//   form of HdBprim's union signature (hd/src/bprim.ts).

import { Token as TfToken } from 'typescript-usd/tf'
import {
  Field as HdField,
  FieldTokens as HdFieldTokens,
  type DirtyBits as HdDirtyBits,
  type DirtyBitsRef as HdDirtyBitsRef,
  type RenderParam as HdRenderParam,
  type SceneDelegate as HdSceneDelegate,
  type SceneIndexPrim as HdSceneIndexPrim,
} from 'typescript-usd/hd'
import type { AssetPath as SdfAssetPath } from 'typescript-usd/sdf'
import type { Value as VtValue } from 'typescript-usd/vt'
import {
  HdStField3DAssetSubtextureIdentifier,
  HdStOpenVDBAssetSubtextureIdentifier,
} from './fieldSubtextureIdentifier.ts'
import { HdStTextureIdentifier } from './textureIdentifier.ts'

/** field.cpp:16-25 */
const _tokens = Object.freeze({
  fieldIndex: 'fieldIndex',
  fieldPurpose: 'fieldPurpose',
  textureMemory: 'textureMemory',

  openvdbAsset: 'openvdbAsset',
  field3dAsset: 'field3dAsset',
})

/** VtValue::Get<T> of a value the scene delegate returned: T() when it holds
 *  no value (the empty VtValue upstream's Get would reject with a coding
 *  error, returning the default). */
function _Get<T>(value: VtValue, fallback: T): T {
  return value.IsEmpty() ? fallback : value.Get<T>()
}

/** field.h:22-67 */
export class HdStField extends HdField {
  private readonly _fieldType: TfToken
  private _textureId = new HdStTextureIdentifier()
  private _textureMemory = 0

  /** field.cpp:27-32. For now, only fieldType HdStTokens->openvdbAsset is
   *  supported. */
  constructor(id: string, fieldType: TfToken) {
    super(id)
    this._fieldType = fieldType
  }

  /** field.cpp:36-87. Loads field as 3d texture to generate
   *  GetFieldResource. */
  override sync(
    sceneDelegateOrPrim: HdSceneDelegate | HdSceneIndexPrim,
    _renderParam: HdRenderParam | null | undefined | HdDirtyBits,
    dirtyBits?: HdDirtyBitsRef,
  ): void {
    const sceneDelegate = sceneDelegateOrPrim as HdSceneDelegate
    const bits = dirtyBits!
    if (bits.value & HdField.DirtyBits.DirtyParams) {

      // Get asset path from scene delegate.
      //
      const filePathValue = sceneDelegate.Get(
        this.getId(), HdFieldTokens.filePath)
      const filePath = _Get<SdfAssetPath | null>(filePathValue, null)

      // Resolve asset path
      //
      // Assuming that correct resolve context is set when HdStField::Sync is
      // called.
      const resolvedFilePath = TfToken(filePath ? filePath.getResolvedPath() : '')

      const fieldNameValue = sceneDelegate.Get(
        this.getId(), HdFieldTokens.fieldName)
      const fieldName = TfToken(_Get<string>(fieldNameValue, ''))

      const fieldIndexValue = sceneDelegate.Get(
        this.getId(), _tokens.fieldIndex)

      const fieldIndex = _Get<number>(fieldIndexValue, 0)

      if (this._fieldType === _tokens.openvdbAsset) {
        this._textureId = new HdStTextureIdentifier(
          resolvedFilePath,
          new HdStOpenVDBAssetSubtextureIdentifier(
            fieldName, fieldIndex))
      } else {
        const fieldPurposeValue = sceneDelegate.Get(
          this.getId(), _tokens.fieldPurpose)
        const fieldPurpose = TfToken(_Get<string>(fieldPurposeValue, ''))

        this._textureId = new HdStTextureIdentifier(
          resolvedFilePath,
          new HdStField3DAssetSubtextureIdentifier(
            fieldName, fieldIndex, fieldPurpose))
      }

      const textureMemoryValue = sceneDelegate.Get(
        this.getId(), _tokens.textureMemory)
      // size_t(1048576 * float): the product is a float, truncated.
      this._textureMemory = Math.trunc(Math.fround(
        1048576 * Math.fround(textureMemoryValue.getWithDefault<number>(0.0))))
    }

    bits.value = HdField.DirtyBits.Clean
  }

  /** field.cpp:89-93 */
  override getInitialDirtyBitsMask(): HdDirtyBits {
    return HdField.DirtyBits.AllDirty
  }

  /** field.h:44-48. Initialized by Sync. */
  GetTextureIdentifier(): HdStTextureIdentifier {
    return this._textureId
  }

  /** field.h:50-51. Get memory request for this field. */
  getTextureMemory(): number { return this._textureMemory }

  /** field.cpp:95-103. Bprim types handled by this class. */
  static getSupportedBprimTypes(): readonly TfToken[] {
    return HdStField._supportedBprimTypes
  }
  private static readonly _supportedBprimTypes: readonly TfToken[] = [
    TfToken(_tokens.openvdbAsset),
    TfToken(_tokens.field3dAsset),
  ]

  /** field.cpp:105-111. Can bprim type be handled by this class. */
  static isSupportedBprimType(bprimType: TfToken | string): boolean {
    return bprimType === _tokens.openvdbAsset ||
      bprimType === _tokens.field3dAsset
  }
}
