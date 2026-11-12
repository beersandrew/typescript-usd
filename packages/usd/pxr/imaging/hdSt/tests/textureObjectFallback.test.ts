// Ported from OpenUSD 26.11.1: pxr/base/vt/value.h,
//  pxr/imaging/hdSt/textureObject.cpp
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GetDefaultForFallbackTexture's warning (hdSt/textureObject.cpp:34-82):
// the file path and the fallback VtValue streamed through its
// operator<< (vt/value.h:1364-1366), not JavaScript's object string.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TfDiagnosticMgr, Token as TfToken } from 'typescript-usd/tf'
import { Value as VtValue, ValueTypes as VtValueTypes } from 'typescript-usd/vt'
import { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { HgiFormat } from 'typescript-usd/hgi'
import { HdStTextureIdentifier } from '../src/textureIdentifier.ts'
import { GetDefaultForFallbackTexture } from '../src/textureObject.ts'

describe('GetDefaultForFallbackTexture', () => {
  const warnings: string[] = []
  const delegate = {
    issueError() {}, issueFatalError() {}, issueStatus() {},
    issueWarning(w: { getCommentary(): string }) { warnings.push(w.getCommentary()) },
  }
  beforeEach(() => { warnings.length = 0; TfDiagnosticMgr.GetInstance().addDelegate(delegate as never) })
  afterEach(() => TfDiagnosticMgr.GetInstance().removeDelegate(delegate as never))

  it('warns with the message of the reference build', () => {
    // The reference build's usdrecord on a UsdUVTexture with
    // inputs:file = @missing.png@ and inputs:fallback = (0.5, 0.25, 1, 1):
    //   Warning: in GetDefaultForFallbackTexture at line 77 of
    //   .../hdSt/textureObject.cpp -- Loading missing.png failed! Using
    //   fallback value: (0.5, 0.25, 1, 1)
    const id = new HdStTextureIdentifier(TfToken('missing.png'),
      VtValue.create(new GfVec4f(0.5, 0.25, 1, 1), VtValueTypes.GfVec4f))
    const [format, fallback] = GetDefaultForFallbackTexture(id)
    expect(format).toBe(HgiFormat.HgiFormatFloat32Vec4)
    expect(fallback.Get<GfVec4f>().data).toEqual(new GfVec4f(0.5, 0.25, 1, 1).data)
    expect(warnings).toEqual(['Loading missing.png failed! Using fallback value: (0.5, 0.25, 1, 1)'])
  })
})
