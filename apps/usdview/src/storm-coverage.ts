// What the faithful imaging stack does not draw yet, diagnosed per scene and
// display settings so the viewer never draws a feature wrongly in silence
// (packages/usd/docs/imaging-i2.md, "Decision: one faithful implementation,
// no backup renderer"). Each entry names the upstream piece that is missing.
// Remove an entry when its milestone lands. Core only (no imaging imports),
// so the scan runs before the imaging chunk has loaded.
//
// No entries at present: the last ones, NurbsCurves, NurbsPatch and TetMesh,
// are drawn as OpenUSD 26.11.1 Storm draws them (usdImaging's
// UsdImagingNurbsCurvesAdapter, UsdImagingNurbsPatchAdapter and
// UsdImagingTetMeshAdapter; Storm's HdSt_NurbsApproximatingSceneIndexPlugin
// and HdSt_TetMeshConversionSceneIndexPlugin).
import type { Stage } from 'typescript-usd/usd'
import type { DisplaySettings } from './display-settings'

/** One warning per missing feature the stage or the settings use. */
export function stormCoverageWarnings(_stage: Stage, _settings: DisplaySettings): string[] {
  return []
}
