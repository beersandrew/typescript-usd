// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdImagingGL/rendererSettings.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usdImaging/usdImagingGL/rendererSettings.h (OpenUSD 26.11.1).

import type { Value as VtValue } from 'typescript-usd/vt'

/** rendererSettings.h:19-24 */
export enum UsdImagingGLRendererSettingType {
  TYPE_FLAG,
  TYPE_INT,
  TYPE_FLOAT,
  TYPE_STRING,
}

/** rendererSettings.h:18-29 */
export interface UsdImagingGLRendererSetting {
  name: string
  key: string
  type: UsdImagingGLRendererSettingType
  defValue: VtValue
}

/** rendererSettings.h:31-32 */
export type UsdImagingGLRendererSettingsList = UsdImagingGLRendererSetting[]
