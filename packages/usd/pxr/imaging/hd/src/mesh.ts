// Ported from OpenUSD 26.11.1: pxr/imaging/hd/mesh.cpp, pxr/imaging/hd/mesh.h,
//  pxr/imaging/hd/renderIndex.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/mesh.{h,cpp} (OpenUSD 26.11.1) — HdMesh, the
// Hydra schema for a subdivision surface or poly-mesh object.
//
// Deliberate divergences:
// - HdMeshReprDescTokens, HdMeshReprDesc and the _ReprDescConfigs<.., 2>
//   container were first ported into displayStyle.ts (HdMeshReprConfig); they
//   are re-exported here, where upstream declares them.
// - The static _reprDescConfig starts with the pre-defined reprs that
//   HdRenderIndex::_ConfigureReprs registers on construction
//   (renderIndex.cpp:1008-1186), as the scene-index-only render index in
//   renderIndex.ts does not call ConfigureRepr.
// - GetBuiltinPrimvarNames does not consult HdSkinningSettings
//   (mesh.cpp:27-35): deferred skinning is not ported, so the
//   !IsSkinningDeferred() branch is taken.
// - GetTopology returns null (HdMeshTopologySharedPtr()).

import type { Token as TfToken } from 'typescript-usd/tf'
import type { Value as VtValue } from 'typescript-usd/vt'
import type { SubdivTags as PxOsdSubdivTags } from 'typescript-usd/pxOsd'
import { HdRprim } from './rprim.ts'
import type { HdMeshTopology } from './meshTopology.ts'
import type { HdSceneDelegate } from './sceneDelegate.ts'
import {
  HdMeshReprDesc, HdMeshReprDescTokens, HdMeshMakeDefaultReprConfig,
  type HdCullStyle, type HdDisplayStyle, type HdMeshDescArray,
} from './displayStyle.ts'
import { HdTokens } from './tokens.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

export { HdMeshReprDesc, HdMeshReprDescTokens }

/** mesh.h:117-187 */
export abstract class HdMesh extends HdRprim {
  // mesh.cpp:39 static _MeshReprConfig _reprDescConfig.
  private static _reprDescConfig = HdMeshMakeDefaultReprConfig()

  /** mesh.cpp:17-21 */
  protected constructor(id: string) {
    super(id)
  }

  /** mesh.h:190-194 */
  isDoubleSided(delegate: HdSceneDelegate): boolean {
    return delegate.getDoubleSided(this.getId())
  }

  /** mesh.h:196-200 */
  getCullStyle(delegate: HdSceneDelegate): HdCullStyle {
    return delegate.getCullStyle(this.getId())
  }

  /** mesh.h:202-206 */
  getShadingStyle(delegate: HdSceneDelegate): VtValue {
    return delegate.getShadingStyle(this.getId())
  }

  /** mesh.h:208-212 */
  getMeshTopology(delegate: HdSceneDelegate): HdMeshTopology {
    return delegate.getMeshTopology(this.getId())
  }

  /** mesh.h:214-218 */
  getDisplayStyle(delegate: HdSceneDelegate): HdDisplayStyle {
    return delegate.getDisplayStyle(this.getId())
  }

  /** mesh.h:220-224 */
  getSubdivTags(delegate: HdSceneDelegate): PxOsdSubdivTags {
    return delegate.getSubdivTags(this.getId())
  }

  /** mesh.h:226-230 */
  GetTopology(): HdMeshTopology | null {
    return null
  }

  /** mesh.h:232-236 */
  getPoints(delegate: HdSceneDelegate): VtValue {
    return this.getPrimvar(delegate, HdTokens.points)
  }

  /** mesh.h:238-242 */
  getNormals(delegate: HdSceneDelegate): VtValue {
    return this.getPrimvar(delegate, HdTokens.normals)
  }

  /** mesh.cpp:24-36 */
  override getBuiltinPrimvarNames(): readonly TfToken[] {
    return HdMesh._primvarNames
  }
  private static readonly _primvarNames: readonly TfToken[] = [
    HdTokens.points as TfToken, HdTokens.normals as TfToken,
  ]

  /** mesh.cpp:41-50 */
  static configureRepr(reprName: string, desc1: HdMeshReprDesc,
    desc2: HdMeshReprDesc = new HdMeshReprDesc()): void {
    HdMesh._reprDescConfig.addOrUpdate(reprName, [desc1, desc2])
  }

  /** mesh.cpp:52-57; rprim.h:327-334 Find posts the coding error. */
  protected static _getReprDesc(reprName: string): HdMeshDescArray {
    if (!HdMesh._reprDescConfig.has(reprName)) {
      TF_CODING_ERROR(`Repr ${reprName} not found`)
    }
    return HdMesh._reprDescConfig.find(reprName)
  }
}
