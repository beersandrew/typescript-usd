// Ported from OpenUSD 26.11.1: pxr/imaging/hd/points.cpp,
//  pxr/imaging/hd/points.h, pxr/imaging/hd/renderIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/points.{h,cpp} (OpenUSD 26.11.1) — HdPoints,
// the Hydra schema for a point cloud.
//
// Deliberate divergence: the static _reprDescConfig starts with the
// pre-defined reprs that HdRenderIndex::_ConfigureReprs registers on
// construction (renderIndex.cpp:1097-1116), as HdMesh's does (mesh.ts
// header).

import type { Token as TfToken } from 'typescript-usd/tf'
import { HdRprim, HdRprim_ReprDescConfigs } from './rprim.ts'
import type { HdDisplayStyle } from './displayStyle.ts'
import { HdPointsGeomStyle } from './enums.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import { HdReprTokens, HdTokens } from './tokens.ts'

/** points.h:22-36 */
export class HdPointsReprDesc {
  geomStyle: HdPointsGeomStyle

  constructor(geomStyle: HdPointsGeomStyle = HdPointsGeomStyle.HdPointsGeomStyleInvalid) {
    this.geomStyle = geomStyle
  }

  IsEmpty(): boolean {
    return this.geomStyle === HdPointsGeomStyle.HdPointsGeomStyleInvalid
  }
}

/** The pre-defined points reprs (renderIndex.cpp:1097-1116). */
function _MakeDefaultReprConfig(): HdRprim_ReprDescConfigs<HdPointsReprDesc> {
  const config = new HdRprim_ReprDescConfigs<HdPointsReprDesc>(1, () => new HdPointsReprDesc())
  for (const repr of [HdReprTokens.hull, HdReprTokens.smoothHull, HdReprTokens.wire,
    HdReprTokens.wireOnSurf, HdReprTokens.solidWireOnSurf, HdReprTokens.refined,
    HdReprTokens.refinedWire, HdReprTokens.refinedWireOnSurf,
    HdReprTokens.refinedSolidWireOnSurf, HdReprTokens.points]) {
    config.addOrUpdate(repr, [new HdPointsReprDesc(HdPointsGeomStyle.HdPointsGeomStylePoints)])
  }
  return config
}

/** points.h:42-71 */
export abstract class HdPoints extends HdRprim {
  // points.cpp:34 static _PointsReprConfig _reprDescConfig.
  private static _reprDescConfigStorage: HdRprim_ReprDescConfigs<HdPointsReprDesc> | null = null
  private static get _reprDescConfig(): HdRprim_ReprDescConfigs<HdPointsReprDesc> {
    return HdPoints._reprDescConfigStorage ??= _MakeDefaultReprConfig()
  }

  /** points.cpp:16-20 */
  protected constructor(id: string) {
    super(id)
  }

  /** points.h:76-80 */
  getDisplayStyle(delegate: HdSceneDelegate): HdDisplayStyle {
    return delegate.getDisplayStyle(this.getId())
  }

  /** points.cpp:24-32 */
  override getBuiltinPrimvarNames(): readonly TfToken[] {
    return HdPoints._primvarNames
  }
  private static readonly _primvarNames: readonly TfToken[] = [
    HdTokens.points as TfToken, HdTokens.normals as TfToken, HdTokens.widths as TfToken,
  ]

  /** points.cpp:37-44 */
  static configureRepr(reprName: string, desc: HdPointsReprDesc): void {
    HdPoints._reprDescConfig.addOrUpdate(reprName, [desc])
  }

  /** points.cpp:47-51 */
  protected static _getReprDesc(reprName: string): HdPointsReprDesc[] {
    return HdPoints._reprDescConfig.find(reprName)
  }
}
