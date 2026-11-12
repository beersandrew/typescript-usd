// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/lightingShader.cpp,
//  pxr/imaging/hdSt/lightingShader.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdSt/lightingShader.{h,cpp} (OpenUSD 26.11.1).

import type { Matrix4d as GfMatrix4d } from 'typescript-usd/gf'
import { HdStShaderCode } from './shaderCode.ts'

/** lightingShader.h:24-42. A lighting shader base class. */
export abstract class HdStLightingShader extends HdStShaderCode {
  /** lightingShader.h:32-34. Sets camera state. */
  abstract setCamera(worldToViewMatrix: GfMatrix4d,
    projectionMatrix: GfMatrix4d): void
}
export type HdStLightingShaderSharedPtr = HdStLightingShader
