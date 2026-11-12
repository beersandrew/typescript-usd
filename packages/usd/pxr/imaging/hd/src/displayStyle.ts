// Ported from OpenUSD 26.11.1: pxr/imaging/hd/enums.h,
//  pxr/imaging/hd/mesh.cpp, pxr/imaging/hd/mesh.h,
//  pxr/imaging/hd/renderIndex.cpp, pxr/imaging/hd/repr.cpp,
//  pxr/imaging/hd/repr.h, and 3 more cited below
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// FAITHFULNESS-DEBT(hd-display-style-fusion): this TypeScript unit covers
// pxr/imaging/hd/repr.h, pxr/imaging/hd/enums.h, pxr/imaging/hd/mesh.h,
// pxr/imaging/hd/sceneDelegate.h, and pxr/imaging/hd/renderIndex.cpp; split the
// value types and registries along those upstream file boundaries.
// Mirrors the CPU-side display-representation core of Hydra:
//   - HdReprTokens / HdMeshReprDescTokens   (hd/tokens.h, hd/mesh.h)
//   - HdCullStyle / HdMeshGeomStyle         (hd/enums.h)
//   - HdReprSelector                        (hd/repr.{h,cpp})
//   - HdMeshReprDesc                        (hd/mesh.h)
//   - HdDisplayStyle                        (hd/sceneDelegate.h)
//   - HdMesh repr configuration registry    (hd/mesh.cpp + hd/rprim.h
//                                            _ReprDescConfigs, default reprs
//                                            from hd/renderIndex.cpp)
//
// This is the faithful core exercised by the hdSt InitRepr / DisplayStyle /
// Transition tests: rprims initialize and switch reprs through HdReprSelector,
// and each repr resolves to one-or-two HdMeshReprDesc descriptors via the
// HdMesh::ConfigureRepr registry. The GPU draw-item assembly those tests then
// rasterize is out of scope here; the selector logic + descriptor tables are
// the deterministic, CPU-extractable behavior they depend on.

// --- HdReprTokens (HD_REPR_TOKENS, hd/tokens.h) ----------------------------
import { HdReprTokens } from './tokens.ts'
export { HdReprTokens }

// --- HdMeshReprDescTokens (HD_MESH_REPR_DESC_TOKENS, hd/mesh.h) -------------
export const HdMeshReprDescTokens = {
  surfaceShader:        'surfaceShader',
  surfaceShaderUnlit:   'surfaceShaderUnlit',
  surfaceShaderSheer:   'surfaceShaderSheer',
  surfaceShaderOutline: 'surfaceShaderOutline',
  constantColor:        'constantColor',
  hullColor:            'hullColor',
  pointColor:           'pointColor',
} as const

// --- HdCullStyle (hd/enums.h) ----------------------------------------------
export enum HdCullStyle {
  HdCullStyleDontCare,
  HdCullStyleNothing,
  HdCullStyleBack,
  HdCullStyleFront,
  HdCullStyleBackUnlessDoubleSided,
  HdCullStyleFrontUnlessDoubleSided,
}

// HdInvertCullStyle (hd/enums.cpp): backface culling becomes frontface and
// vice versa; all other styles are unchanged.
export function HdInvertCullStyle(cs: HdCullStyle): HdCullStyle {
  switch (cs) {
    case HdCullStyle.HdCullStyleBack:  return HdCullStyle.HdCullStyleFront
    case HdCullStyle.HdCullStyleFront: return HdCullStyle.HdCullStyleBack
    case HdCullStyle.HdCullStyleBackUnlessDoubleSided:
      return HdCullStyle.HdCullStyleFrontUnlessDoubleSided
    case HdCullStyle.HdCullStyleFrontUnlessDoubleSided:
      return HdCullStyle.HdCullStyleBackUnlessDoubleSided
    default: return cs
  }
}

// --- HdMeshGeomStyle (hd/enums.h) ------------------------------------------
export enum HdMeshGeomStyle {
  HdMeshGeomStyleInvalid,
  HdMeshGeomStyleSurf,
  HdMeshGeomStyleEdgeOnly,
  HdMeshGeomStyleEdgeOnSurf,
  HdMeshGeomStyleHull,
  HdMeshGeomStyleHullEdgeOnly,
  HdMeshGeomStyleHullEdgeOnSurf,
  HdMeshGeomStylePoints,
}

// --- HdReprSelector (hd/repr.{h,cpp}) --------------------------------------
// Describes one or more authored display representations for an rprim, keyed
// by topology index (refined / unrefined / points). An empty token means
// "no opinion" for compositing.
const EMPTY_TOKEN = ''

export class HdReprSelector {
  static readonly MAX_TOPOLOGY_REPRS = 3

  readonly refinedToken: string
  readonly unrefinedToken: string
  readonly pointsToken: string

  constructor(refined = EMPTY_TOKEN, unrefined = EMPTY_TOKEN, points = EMPTY_TOKEN) {
    this.refinedToken = refined
    this.unrefinedToken = unrefined
    this.pointsToken = points
  }

  // operator[](topologyIndex)
  at(topologyIndex: number): string {
    switch (topologyIndex) {
      case 0: return this.refinedToken
      case 1: return this.unrefinedToken
      case 2: return this.pointsToken
      default: return this.refinedToken
    }
  }

  // Contains: true if reprToken is in the set for any topology index.
  contains(reprToken: string): boolean {
    return (
      reprToken === this.refinedToken ||
      reprToken === this.unrefinedToken ||
      reprToken === this.pointsToken
    )
  }

  // IsActiveRepr: the token at index is neither empty nor disabled.
  isActiveRepr(topologyIndex: number): boolean {
    const reprToken = this.at(topologyIndex)
    return !(reprToken === EMPTY_TOKEN || reprToken === HdReprTokens.disabled)
  }

  // AnyActiveRepr: any topology token is active.
  anyActiveRepr(): boolean {
    for (let i = 0; i < HdReprSelector.MAX_TOPOLOGY_REPRS; i++) {
      if (this.isActiveRepr(i)) return true
    }
    return false
  }

  // CompositeOver: for each token that is empty in this selector, take the
  // corresponding token from `under`. This selector wins where it has an
  // opinion (a non-empty token).
  compositeOver(under: HdReprSelector): HdReprSelector {
    const has = (t: string) => t !== EMPTY_TOKEN
    return new HdReprSelector(
      has(this.refinedToken)   ? this.refinedToken   : under.refinedToken,
      has(this.unrefinedToken) ? this.unrefinedToken : under.unrefinedToken,
      has(this.pointsToken)    ? this.pointsToken    : under.pointsToken,
    )
  }

  equals(rhs: HdReprSelector): boolean {
    return (
      this.refinedToken === rhs.refinedToken &&
      this.unrefinedToken === rhs.unrefinedToken &&
      this.pointsToken === rhs.pointsToken
    )
  }

  notEquals(rhs: HdReprSelector): boolean {
    return !this.equals(rhs)
  }

  // PascalCase alias matching the C++ HdReprSelector::operator== call sites.
  Equals(rhs: HdReprSelector): boolean { return this.equals(rhs) }

  // Stable identity string (used as part of the draw-items cache key).
  Key(): string {
    return [this.refinedToken, this.unrefinedToken, this.pointsToken].join('|')
  }

  // operator<: lexicographic over (refined, unrefined, points).
  lessThan(rhs: HdReprSelector): boolean {
    if (this.refinedToken !== rhs.refinedToken) {
      return this.refinedToken < rhs.refinedToken
    }
    if (this.unrefinedToken !== rhs.unrefinedToken) {
      return this.unrefinedToken < rhs.unrefinedToken
    }
    return this.pointsToken < rhs.pointsToken
  }

  // GetText: the refined token's string (HdReprSelector::GetText()).
  getText(): string { return this.refinedToken }
}

// --- HdMeshReprDesc (hd/mesh.h) --------------------------------------------
// Descriptor configuring the draw item(s) for a repr. Defaults mirror the C++
// constructor's default arguments exactly.
export class HdMeshReprDesc {
  readonly geomStyle: HdMeshGeomStyle
  readonly cullStyle: HdCullStyle
  readonly shadingTerminal: string
  readonly flatShadingEnabled: boolean
  readonly blendWireframeColor: boolean
  readonly forceOpaqueEdges: boolean
  readonly surfaceEdgeIds: boolean
  readonly doubleSided: boolean
  readonly lineWidth: number
  readonly useCustomDisplacement: boolean
  readonly enableScalarOverride: boolean

  constructor(
    geomStyle: HdMeshGeomStyle = HdMeshGeomStyle.HdMeshGeomStyleInvalid,
    cullStyle: HdCullStyle = HdCullStyle.HdCullStyleDontCare,
    shadingTerminal: string = HdMeshReprDescTokens.surfaceShader,
    flatShadingEnabled = false,
    blendWireframeColor = true,
    forceOpaqueEdges = true,
    surfaceEdgeIds = false,
    doubleSided = false,
    lineWidth = 0,
    useCustomDisplacement = true,
    enableScalarOverride = true,
  ) {
    this.geomStyle = geomStyle
    this.cullStyle = cullStyle
    this.shadingTerminal = shadingTerminal
    this.flatShadingEnabled = flatShadingEnabled
    this.blendWireframeColor = blendWireframeColor
    this.forceOpaqueEdges = forceOpaqueEdges
    this.surfaceEdgeIds = surfaceEdgeIds
    this.doubleSided = doubleSided
    this.lineWidth = lineWidth
    this.useCustomDisplacement = useCustomDisplacement
    this.enableScalarOverride = enableScalarOverride
  }

  IsEmpty(): boolean {
    return this.geomStyle === HdMeshGeomStyle.HdMeshGeomStyleInvalid
  }

  equals(rhs: HdMeshReprDesc): boolean {
    return (
      this.geomStyle === rhs.geomStyle &&
      this.cullStyle === rhs.cullStyle &&
      this.shadingTerminal === rhs.shadingTerminal &&
      this.flatShadingEnabled === rhs.flatShadingEnabled &&
      this.blendWireframeColor === rhs.blendWireframeColor &&
      this.forceOpaqueEdges === rhs.forceOpaqueEdges &&
      this.surfaceEdgeIds === rhs.surfaceEdgeIds &&
      this.doubleSided === rhs.doubleSided &&
      this.lineWidth === rhs.lineWidth &&
      this.useCustomDisplacement === rhs.useCustomDisplacement &&
      this.enableScalarOverride === rhs.enableScalarOverride
    )
  }
}

// --- HdDisplayStyle (hd/sceneDelegate.h) -----------------------------------
// Describes how the geometry of a prim should be displayed. The refineLevel is
// clamped to a minimum of 0 (negative -> 0) per the C++ constructor.
export class HdDisplayStyle {
  readonly refineLevel: number
  readonly flatShadingEnabled: boolean
  readonly displacementEnabled: boolean
  readonly displayInOverlay: boolean
  readonly occludedSelectionShowsThrough: boolean
  readonly pointsShadingEnabled: boolean
  readonly materialIsFinal: boolean

  constructor(
    refineLevel = 0,
    flatShading = false,
    displacement = true,
    displayInOverlay = false,
    occludedSelectionShowsThrough = false,
    pointsShadingEnabled = false,
    materialIsFinal = false,
  ) {
    // std::max(0, refineLevel_) — negative refine levels clamp to 0.
    this.refineLevel = Math.max(0, refineLevel)
    this.flatShadingEnabled = flatShading
    this.displacementEnabled = displacement
    this.displayInOverlay = displayInOverlay
    this.occludedSelectionShowsThrough = occludedSelectionShowsThrough
    this.pointsShadingEnabled = pointsShadingEnabled
    this.materialIsFinal = materialIsFinal
  }

  equals(rhs: HdDisplayStyle): boolean {
    return (
      this.refineLevel === rhs.refineLevel &&
      this.flatShadingEnabled === rhs.flatShadingEnabled &&
      this.displacementEnabled === rhs.displacementEnabled &&
      this.displayInOverlay === rhs.displayInOverlay &&
      this.occludedSelectionShowsThrough === rhs.occludedSelectionShowsThrough &&
      this.pointsShadingEnabled === rhs.pointsShadingEnabled &&
      this.materialIsFinal === rhs.materialIsFinal
    )
  }

  notEquals(rhs: HdDisplayStyle): boolean {
    return !this.equals(rhs)
  }
}

// --- HdMesh repr configuration registry ------------------------------------
// Mirrors HdMesh::_reprDescConfig (a _ReprDescConfigs<HdMeshReprDesc, 2> from
// hd/rprim.h) and HdMesh::ConfigureRepr / _GetReprDesc (hd/mesh.cpp). Up to two
// descriptors per repr.
export const HD_MESH_MAX_DESCS = 2
export type HdMeshDescArray = [HdMeshReprDesc, HdMeshReprDesc]

export class HdMeshReprConfig {
  private _configs: { token: string; descs: HdMeshDescArray }[] = []

  // _ReprDescConfigs::AddOrUpdate — overwrite an existing entry or append.
  addOrUpdate(reprToken: string, descs: HdMeshDescArray): void {
    for (const config of this._configs) {
      if (config.token === reprToken) {
        config.descs = descs
        return
      }
    }
    this._configs.push({ token: reprToken, descs })
  }

  // _ReprDescConfigs::Find — linear search; returns an empty DescArray if the
  // repr is not configured (the C++ logs a coding error and returns DescArray()).
  find(reprToken: string): HdMeshDescArray {
    for (const config of this._configs) {
      if (config.token === reprToken) return config.descs
    }
    return [new HdMeshReprDesc(), new HdMeshReprDesc()]
  }

  has(reprToken: string): boolean {
    return this._configs.some((c) => c.token === reprToken)
  }
}

// HdMesh::ConfigureRepr(reprName, desc1, desc2=HdMeshReprDesc()).
export function HdMeshConfigureRepr(
  config: HdMeshReprConfig,
  reprName: string,
  desc1: HdMeshReprDesc,
  desc2: HdMeshReprDesc = new HdMeshReprDesc(),
): void {
  config.addOrUpdate(reprName, [desc1, desc2])
}

// HdRenderIndex::_ConfigureReprs() — the pre-defined mesh reprs, registered
// verbatim from hd/renderIndex.cpp. Returns a fresh, fully-populated config so
// callers (and tests) get the standard table without GPU plumbing.
export function HdMeshMakeDefaultReprConfig(): HdMeshReprConfig {
  const config = new HdMeshReprConfig()
  const {
    HdMeshGeomStyleHull,
    HdMeshGeomStyleHullEdgeOnly,
    HdMeshGeomStyleHullEdgeOnSurf,
    HdMeshGeomStyleSurf,
    HdMeshGeomStyleEdgeOnly,
    HdMeshGeomStyleEdgeOnSurf,
    HdMeshGeomStylePoints,
  } = HdMeshGeomStyle
  const dontCare = HdCullStyle.HdCullStyleDontCare
  const nothing = HdCullStyle.HdCullStyleNothing
  const T = HdMeshReprDescTokens

  HdMeshConfigureRepr(config, HdReprTokens.hull,
    new HdMeshReprDesc(HdMeshGeomStyleHull, dontCare, T.surfaceShader,
      /*flatShadingEnabled=*/true, /*blendWireframeColor=*/false))
  HdMeshConfigureRepr(config, HdReprTokens.smoothHull,
    new HdMeshReprDesc(HdMeshGeomStyleHull, dontCare, T.surfaceShader,
      /*flatShadingEnabled=*/false, /*blendWireframeColor=*/false))
  HdMeshConfigureRepr(config, HdReprTokens.wire,
    new HdMeshReprDesc(HdMeshGeomStyleHullEdgeOnly, dontCare, T.surfaceShader,
      /*flatShadingEnabled=*/false, /*blendWireframeColor=*/true))
  HdMeshConfigureRepr(config, HdReprTokens.wireOnSurf,
    new HdMeshReprDesc(HdMeshGeomStyleHullEdgeOnSurf, dontCare, T.surfaceShader,
      /*flatShadingEnabled=*/false, /*blendWireframeColor=*/true,
      /*forceOpaqueEdges=*/false))
  HdMeshConfigureRepr(config, HdReprTokens.solidWireOnSurf,
    new HdMeshReprDesc(HdMeshGeomStyleHullEdgeOnSurf, dontCare, T.surfaceShader,
      /*flatShadingEnabled=*/false, /*blendWireframeColor=*/true,
      /*forceOpaqueEdges=*/true))
  HdMeshConfigureRepr(config, HdReprTokens.refined,
    new HdMeshReprDesc(HdMeshGeomStyleSurf, dontCare, T.surfaceShader,
      /*flatShadingEnabled=*/false, /*blendWireframeColor=*/false))
  HdMeshConfigureRepr(config, HdReprTokens.refinedWire,
    new HdMeshReprDesc(HdMeshGeomStyleEdgeOnly, dontCare, T.surfaceShader,
      /*flatShadingEnabled=*/false, /*blendWireframeColor=*/true))
  HdMeshConfigureRepr(config, HdReprTokens.refinedWireOnSurf,
    new HdMeshReprDesc(HdMeshGeomStyleEdgeOnSurf, dontCare, T.surfaceShader,
      /*flatShadingEnabled=*/false, /*blendWireframeColor=*/true,
      /*forceOpaqueEdges=*/false))
  HdMeshConfigureRepr(config, HdReprTokens.refinedSolidWireOnSurf,
    new HdMeshReprDesc(HdMeshGeomStyleEdgeOnSurf, dontCare, T.surfaceShader,
      /*flatShadingEnabled=*/false, /*blendWireframeColor=*/true,
      /*forceOpaqueEdges=*/true))
  HdMeshConfigureRepr(config, HdReprTokens.points,
    new HdMeshReprDesc(HdMeshGeomStylePoints, nothing, T.pointColor,
      /*flatShadingEnabled=*/false, /*blendWireframeColor=*/false))

  return config
}
