// Ported from OpenUSD 26.11.1: pxr/imaging/hd/field.cpp,
//  pxr/imaging/hd/field.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/field.{h,cpp} (OpenUSD 26.11.1): HdField, the
// Hydra schema for a volume field bprim.

import { HdBprim } from './bprim.ts'

/** field.h:19-22 HD_FIELD_TOKENS */
export const HdFieldTokens = Object.freeze({
  filePath: 'filePath',
  fieldName: 'fieldName',
})

/** field.h:34-56 */
export abstract class HdField extends HdBprim {
  /** field.h:44-50. Change tracking for HdField. */
  static readonly DirtyBits = Object.freeze({
    Clean: 0,
    DirtyTransform: 1 << 0,
    DirtyParams: 1 << 1,
    AllDirty: (1 << 0) | (1 << 1),
  })

  /** field.cpp:13-16 */
  constructor(id: string) {
    super(id)
  }
}
