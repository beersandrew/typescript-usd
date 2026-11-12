// Ported from OpenUSD 26.11.1: pxr/imaging/hd/basisCurves.cpp,
//  pxr/imaging/hd/basisCurves.h, pxr/imaging/hd/renderIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/basisCurves.{h,cpp} (OpenUSD 26.11.1) —
// HdBasisCurves, the Hydra schema for a collection of curves using a
// particular basis.
//
// Deliberate divergences:
// - The static _reprDescConfig starts with the pre-defined reprs that
//   HdRenderIndex::_ConfigureReprs registers on construction
//   (renderIndex.cpp:1076-1095), as HdMesh's does (mesh.ts header).
// - GetBuiltinPrimvarNames does not consult HdSkinningSettings
//   (basisCurves.cpp:30-45): deferred skinning is not ported, so the
//   !IsSkinningDeferred() branch is taken.

import { TfEnvSetting, TfGetEnvSetting, type Token as TfToken } from 'typescript-usd/tf'
import { HdRprim, HdRprim_ReprDescConfigs } from './rprim.ts'
import type { HdBasisCurvesTopology } from './basisCurvesTopology.ts'
import type { HdDisplayStyle } from './displayStyle.ts'
import { HdReprTokens } from './tokens.ts'
import { HdBasisCurvesGeomStyle } from './enums.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import { HdTokens } from './tokens.ts'

/** basisCurves.h:20-27 HD_BASISCURVES_REPR_DESC_TOKENS */
export const HdBasisCurvesReprDescTokens = {
  surfaceShader: 'surfaceShader' as TfToken,
  surfaceShaderUnlit: 'surfaceShaderUnlit' as TfToken,
  hullColor: 'hullColor' as TfToken,
  pointColor: 'pointColor' as TfToken,
} as const

/** basisCurves.h:34-50 */
export class HdBasisCurvesReprDesc {
  geomStyle: HdBasisCurvesGeomStyle
  /** Specifies how the fragment color should be computed from primvar;
   *  this can be used to render heatmap highlighting etc. */
  shadingTerminal: TfToken

  constructor(
    geomStyle: HdBasisCurvesGeomStyle = HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleInvalid,
    shadingTerminal: TfToken = HdBasisCurvesReprDescTokens.surfaceShader,
  ) {
    this.geomStyle = geomStyle
    this.shadingTerminal = shadingTerminal
  }

  IsEmpty(): boolean {
    return this.geomStyle === HdBasisCurvesGeomStyle.HdBasisCurvesGeomStyleInvalid
  }
}

/** basisCurves.cpp:18-19 */
const HD_ENABLE_REFINED_CURVES = new TfEnvSetting<number>(
  'HD_ENABLE_REFINED_CURVES', 0, 'Force curves to always be refined.')

/** The pre-defined curve reprs (renderIndex.cpp:1076-1095). */
function _MakeDefaultReprConfig(): HdRprim_ReprDescConfigs<HdBasisCurvesReprDesc> {
  const config = new HdRprim_ReprDescConfigs<HdBasisCurvesReprDesc>(1,
    () => new HdBasisCurvesReprDesc())
  const S = HdBasisCurvesGeomStyle
  const add = (repr: string, geomStyle: HdBasisCurvesGeomStyle) => {
    const desc = new HdBasisCurvesReprDesc(geomStyle)
    // basisCurves.cpp:61-63 (ConfigureRepr)
    if (HdBasisCurves.isEnabledForceRefinedCurves()) {
      desc.geomStyle = S.HdBasisCurvesGeomStylePatch
    }
    config.addOrUpdate(repr, [desc])
  }
  add(HdReprTokens.hull, S.HdBasisCurvesGeomStylePatch)
  add(HdReprTokens.smoothHull, S.HdBasisCurvesGeomStylePatch)
  add(HdReprTokens.wire, S.HdBasisCurvesGeomStyleWire)
  add(HdReprTokens.wireOnSurf, S.HdBasisCurvesGeomStylePatch)
  add(HdReprTokens.solidWireOnSurf, S.HdBasisCurvesGeomStylePatch)
  add(HdReprTokens.refined, S.HdBasisCurvesGeomStylePatch)
  add(HdReprTokens.refinedWire, S.HdBasisCurvesGeomStyleWire)
  add(HdReprTokens.refinedWireOnSurf, S.HdBasisCurvesGeomStylePatch)
  add(HdReprTokens.refinedSolidWireOnSurf, S.HdBasisCurvesGeomStylePatch)
  add(HdReprTokens.points, S.HdBasisCurvesGeomStylePoints)
  return config
}

/** basisCurves.h:52-97 */
export abstract class HdBasisCurves extends HdRprim {
  // basisCurves.cpp:48 static _BasisCurvesReprConfig _reprDescConfig.
  private static _reprDescConfigStorage: HdRprim_ReprDescConfigs<HdBasisCurvesReprDesc> | null = null
  private static get _reprDescConfig(): HdRprim_ReprDescConfigs<HdBasisCurvesReprDesc> {
    return HdBasisCurves._reprDescConfigStorage ??= _MakeDefaultReprConfig()
  }

  /** basisCurves.cpp:21-25 */
  protected constructor(id: string) {
    super(id)
  }

  /** basisCurves.h:99-103 */
  getBasisCurvesTopology(delegate: HdSceneDelegate): HdBasisCurvesTopology {
    return delegate.getBasisCurvesTopology(this.getId())
  }

  /** basisCurves.h:105-109 */
  getDisplayStyle(delegate: HdSceneDelegate): HdDisplayStyle {
    return delegate.getDisplayStyle(this.getId())
  }

  /** basisCurves.cpp:29-45 */
  override getBuiltinPrimvarNames(): readonly TfToken[] {
    return HdBasisCurves._primvarNames
  }
  private static readonly _primvarNames: readonly TfToken[] = [
    HdTokens.points as TfToken, HdTokens.normals as TfToken, HdTokens.widths as TfToken,
  ]

  /** basisCurves.cpp:50-55 */
  static isEnabledForceRefinedCurves(): boolean {
    return TfGetEnvSetting(HD_ENABLE_REFINED_CURVES) === 1
  }

  /** basisCurves.cpp:58-71 */
  static configureRepr(reprName: string, desc: HdBasisCurvesReprDesc): void {
    if (HdBasisCurves.isEnabledForceRefinedCurves()) {
      desc.geomStyle = HdBasisCurvesGeomStyle.HdBasisCurvesGeomStylePatch
    }
    HdBasisCurves._reprDescConfig.addOrUpdate(reprName, [desc])
  }

  /** basisCurves.cpp:73-78 */
  protected static _getReprDesc(reprName: string): HdBasisCurvesReprDesc[] {
    return HdBasisCurves._reprDescConfig.find(reprName)
  }
}
