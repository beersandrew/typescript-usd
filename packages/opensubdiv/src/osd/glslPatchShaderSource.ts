// Ported from OpenSubdiv 3.6.1: opensubdiv/osd/glslPatchShaderSource.h,
//  opensubdiv/osd/glslPatchShaderSource.cpp
// Copyright 2015 Pixar. Modified Apache 2.0 License.
// Translated to TypeScript and modified. See LICENSE-OpenSubdiv-3.6.1.txt and
//  NOTICE.

// Ported from OpenSubdiv 3.6.1 opensubdiv/osd/glslPatchShaderSource.{h,cpp}
// (local source addition, see PROVENANCE.md). The shader text is the
// stringified OpenSubdiv source in shaderSources.generated.ts.
//
// Deliberate divergence: OPENSUBDIV_GREGORY_EVAL_TRUE_DERIVATIVES
// (glslPatchShaderSource.cpp:85-87) is a build option that is off in the
// OpenUSD 26.11.1 build, so it is never defined here.

import { PatchType } from '../far/patchDescriptor.ts'
import {
  commonShaderSource,
  commonTessShaderSource,
  patchLegacyShaderSource,
  patchBasisTypesShaderSource,
  patchBasisShaderSource,
  boxSplineTriangleShaderSource,
  bsplineShaderSource,
  gregoryShaderSource,
  gregoryBasisShaderSource,
  gregoryTriangleShaderSource,
} from './shaderSources.generated.ts'

type _Stage = 'VERTEX' | 'TESS_CONTROL' | 'TESS_EVAL'

/** glslPatchShaderSource.cpp:93-247: the three per-stage switches, which
 *  differ only in the stage name of the second define. */
function _StageSource(type: PatchType, stage: _Stage): string {
  switch (type) {
    case PatchType.REGULAR:
      return '#define OSD_PATCH_BSPLINE\n' +
        `#define OSD_PATCH_${stage}_BSPLINE_SHADER\n` +
        bsplineShaderSource
    case PatchType.LOOP:
      return '#define OSD_PATCH_BOX_SPLINE_TRIANGLE\n' +
        `#define OSD_PATCH_${stage}_BOX_SPLINE_TRIANGLE_SHADER\n` +
        boxSplineTriangleShaderSource
    case PatchType.GREGORY:
      return '#define OSD_PATCH_GREGORY\n' +
        `#define OSD_PATCH_${stage}_GREGORY_SHADER\n` +
        gregoryShaderSource
    case PatchType.GREGORY_BOUNDARY:
      return '#define OSD_PATCH_GREGORY_BOUNDARY\n' +
        `#define OSD_PATCH_${stage}_GREGORY_SHADER\n` +
        gregoryShaderSource
    case PatchType.GREGORY_BASIS:
      return '#define OSD_PATCH_GREGORY_BASIS\n' +
        `#define OSD_PATCH_${stage}_GREGORY_BASIS_SHADER\n` +
        gregoryBasisShaderSource
    case PatchType.GREGORY_TRIANGLE:
      return '#define OSD_PATCH_GREGORY_TRIANGLE\n' +
        `#define OSD_PATCH_${stage}_GREGORY_TRIANGLE_SHADER\n` +
        gregoryTriangleShaderSource
    default:
      return '' // returns empty (points, lines, quads, ...)
  }
}

/** glslPatchShaderSource.h:40-71 */
export const GLSLPatchShaderSource = {
  /** glslPatchShaderSource.cpp:81-91 */
  getPatchBasisShaderSource(): string {
    return patchBasisTypesShaderSource + patchBasisShaderSource
  },

  /** glslPatchShaderSource.cpp:63-69 */
  getPatchDrawingShaderSource(): string {
    return commonShaderSource + commonTessShaderSource
  },

  /** glslPatchShaderSource.cpp:71-79 */
  getCommonShaderSource(): string {
    return GLSLPatchShaderSource.getPatchDrawingShaderSource() + patchLegacyShaderSource
  },

  /** glslPatchShaderSource.cpp:93-136 */
  getVertexShaderSource(type: PatchType): string {
    return _StageSource(type, 'VERTEX')
  },

  /** glslPatchShaderSource.cpp:138-181 */
  getTessControlShaderSource(type: PatchType): string {
    return _StageSource(type, 'TESS_CONTROL')
  },

  /** glslPatchShaderSource.cpp:183-226 */
  getTessEvalShaderSource(type: PatchType): string {
    return _StageSource(type, 'TESS_EVAL')
  },
}
