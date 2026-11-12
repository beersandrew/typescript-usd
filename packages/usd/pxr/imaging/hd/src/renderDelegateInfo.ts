// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderDelegateInfo.cpp,
//  pxr/imaging/hd/renderDelegateInfo.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderDelegateInfo.{h,cpp} (OpenUSD 26.11.1).

import type { Token as TfToken } from 'typescript-usd/tf'

/** renderDelegateInfo.h:18-26 */
export interface HdRenderDelegateInfo {
  materialBindingPurpose: TfToken
  materialRenderContexts: TfToken[]
  renderSettingsNamespaces: TfToken[]
  isPrimvarFilteringNeeded: boolean
  shaderSourceTypes: TfToken[]
  isCoordSysSupported: boolean
}

function _TokenVectorsEqual(a: readonly TfToken[], b: readonly TfToken[]): boolean {
  return a.length === b.length && a.every((token, i) => token === b[i])
}

/** renderDelegateInfo.cpp:11-20 (operator==) */
export function HdRenderDelegateInfoEquals(
  a: HdRenderDelegateInfo, b: HdRenderDelegateInfo,
): boolean {
  return a.materialBindingPurpose === b.materialBindingPurpose &&
    _TokenVectorsEqual(a.materialRenderContexts, b.materialRenderContexts) &&
    _TokenVectorsEqual(a.renderSettingsNamespaces, b.renderSettingsNamespaces) &&
    a.isPrimvarFilteringNeeded === b.isPrimvarFilteringNeeded &&
    _TokenVectorsEqual(a.shaderSourceTypes, b.shaderSourceTypes) &&
    a.isCoordSysSupported === b.isCoordSysSupported
}
