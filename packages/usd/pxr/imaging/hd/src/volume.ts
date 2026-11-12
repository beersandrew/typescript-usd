// Ported from OpenUSD 26.11.1: pxr/imaging/hd/volume.cpp,
//  pxr/imaging/hd/volume.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/volume.{h,cpp} (OpenUSD 26.11.1): HdVolume,
// the Hydra schema for a renderable volume primitive.

import type { Token as TfToken } from 'typescript-usd/tf'
import { HdRprim } from './rprim.ts'

/** volume.h:22-38 */
export abstract class HdVolume extends HdRprim {
  /** volume.cpp:12-16 */
  protected constructor(id: string) {
    super(id)
  }

  /** volume.cpp:20-26 */
  override getBuiltinPrimvarNames(): readonly TfToken[] {
    return HdVolume._primvarNames
  }
  private static readonly _primvarNames: readonly TfToken[] = []
}
