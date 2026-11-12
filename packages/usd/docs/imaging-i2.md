# Imaging I-2 and after: replacing hdStWgsl with the faithful Storm (design notes)

Written 2026-11-04 (base `629cec2`) as the plan for the rest of the imaging
port. The decisions at the end record what was adopted; hdStWgsl has since
been deleted.

I-1 showed that Storm's own code generator, glslfx shaders and Hgi can drive
WebGPU: `testHdStDepthBias` matches the native images exactly in Safari
(`imaging-i1.md:1143-1169`). This page plans the rest of the port, up to the
point where the viewer switches to the faithful `hdSt` and `hdStWgsl` is
deleted. It covers:

1. the replacement bar: numbers, scoring rules, and the viewer features that
   must survive the deletion;
2. what the faithful port still lacks, by upstream library and file, with line
   counts;
3. the upstream tests that become the bar for each area, and the native
   captures they need;
4. a sequenced list of milestones with parallel tracks, risks, and the switch
   point.

Pins are the same as I-1: OpenUSD 26.11.1 at `$OPENUSD_SOURCE` (paths
below are relative to its `pxr/` unless they say otherwise), a native
OpenUSD 26.11.1 reference build (Storm on Metal, Apple M4 Pro), and Safari 27.2.

Three tracks run in parallel with this plan: **i2-textures**
(textures/materials), **i2-lighting** (lighting) and **i2-usdimaging**
(UsdImaging → faithful hdSt). When this was written, their branches had no
commits beyond `629cec2`. This plan therefore assumes the scopes their names
give them. It schedules everything else around them and does not duplicate
them. Section 4.1 lists what each of them must hand over.

## Summary

**The bar.** "Renders the asset-acceptance set at least as well" becomes a
per-asset rule on the existing report metric (section 1.3):

- **Metric:** the count of pixels where any RGB channel is more than 2/255 from
  OpenUSD 26.11.1 `usdrecord`, at 512×512 (`report.mjs:24,43`).
- **hdStWgsl baseline:** 231,704 such pixels over 17 assets. Two assets match
  exactly and one is within 4 pixels (table in section 1.2).
- **What counts as a regression:** the faithful port may not regress any asset
  by more than a tie band of max(262 px, 3 × the measured run-to-run spread).
  Assets that match today must still match. A crash, timeout or missing image
  is a regression.
- **Gaps in the set:** it contains no curves, points, volumes or point
  instancers, and it renders everything at refine level 0. Those features are
  barred by upstream tests, plus a new "features" group of upstream testenv
  scenes added to the same report. hdStWgsl must be baselined on that group
  *before* it is deleted (section 1.4).
- **Viewer features:** section 1.5 lists 16 features to keep. Section 1.6
  inventories what goes with hdStWgsl: 53 files, 11,176 lines.

**What is missing.** The faithful `hdSt` is 64 files and 34,255 lines; upstream
`hdSt` is 76,886 lines. It draws meshes from `HdUnitTestDelegate` only. There
are 82 distinct `FAITHFULNESS-DEBT` tags in `imaging/` and `usdImaging/`, 23 of
them in the faithful `hdSt`.

The main missing pieces, in upstream lines:

| Area | Upstream lines | Parts |
|---|---|---|
| Textures and materials | ≈12.2k | |
| Lighting | 2.3k (hdSt) + 2.1k (hdx tasks) | |
| Curves and points | 3.8k | plus two WebGPU emulations (point expansion, tessellation factors above 1) |
| Volumes | 1.96k (hdSt) + 1.4k (usdVolImaging) | |
| OpenSubdiv | 2.2k | `hdSt/subdivision` |
| Far | ≈8k | stencil and patch tables, which `packages/opensubdiv` lacks |
| Ext computations | 2.5k | `hdSt` part |
| Skinning | 16.8k | `usdSkelImaging` |
| hdx tasks and task controller scene index | ≈21k | |
| `UsdImagingGLEngine` | 3.9k | |
| Storm's 12 scene-index plugins | ≈10k | together with the hdsi/hd scene indices they create |

**Milestones** (section 4):

- **I-2:** finish surface shading and the stage path. This is the three running
  tracks plus test infrastructure.
- **I-3:** the engine and hdx tasks, including selection and picking. This
  unlocks 436 of upstream's 461 usdImagingGL image tests, which all run through
  `testUsdImagingGLBasicDrawing`.
- **I-4:** geometry: curves and points, instancing, ext computations and
  skinning, OpenSubdiv.
- **I-5:** MaterialX, volumes and order-independent transparency (OIT).
- **I-6:** move the viewer onto the engine, run the comparison, switch, and
  delete hdStWgsl.

The viewer can switch at the end of I-6, and not earlier. Volumes, MaterialX and
picking are viewer features today, so nothing can be deleted until I-5's areas
pass.

**Top risks** (section 5):

1. Tessellation factors above 1 and point sizes above 1 px need new WebGPU
   emulation with no upstream template. Refined curves and points depend on it.
2. The draw loop is per draw item, because WebGPU has no multi-draw-indirect.
   On scenes with many draw items, frame time is at risk.
3. Faithful MaterialX needs MaterialX's GLSL generator, which is not vendored
   here.
4. The milestones depend on each other in series: the engine needs the scene
   index path, and the usdImagingGL bar needs the engine.
5. The browser is Safari-only, and harness iteration is slow.

## 1. The replacement bar

### 1.1 The metric

`apps/usdview/scripts/asset-acceptance/` works as follows:

1. It renders each asset through OpenUSD 26.11.1
   `usdrecord --camera /AcceptanceCam -w 512`.
2. It renders the same asset through the viewer runtime (`createRuntime`,
   `harness.ts:23,93`) in Safari, at the same size and camera.
3. It compares RGB (`report.mjs:29-57`). A pixel is **significant** when any
   channel differs by more than `TOL = 2` levels (`report.mjs:24,43`).
4. The verdict is `match` when there are no significant pixels
   (`report.mjs:92`). PSNR, maximum difference and coverage mismatch are
   reported but not scored.

The harness can only exercise what the runtime exposes. Today that is
hdStWgsl's `RenderDelegate` with the viewer's display settings: camera light
on, default material ambient 0.2 and specular 0.1, complexity low, MSAA 4×,
and payloads loaded before capture (`run.mjs:21-25,58-66`).

### 1.2 hdStWgsl baseline

The baseline run is the I-1 asset baseline: Nov 4, 2026,
`<scratch>/i1-assets/out/report.json` (not in the repository), Safari 27.2, 512×512 =
262,144 px per asset. Columns:

- **Significant px:** pixels differing by more than 2/255 (`stats.significant`).
- **Max:** `maxDiff`.
- **Open / settled ms:** `browser.timings.openMs` / `settledMs`.
- **Gap class:** from `notes.json`.

| Asset | Significant px | % | PSNR dB | Max | Open / settled ms | Gap class (notes.json) |
|---|---|---|---|---|---|---|
| animated_cube | 38,138 | 14.55 | 41.04 | 42 | 151 / 1,436 | texture sampling |
| roughness | 35,194 | 13.43 | 29.38 | 70 | 194 / 1,474 | material/shading (coverage mismatch 12,215) |
| mcusd | 26,347 | 10.05 | 38.02 | 195 | 466 / 1,749 | texture sampling |
| damaged_helmet | 25,651 | 9.79 | 36.00 | 169 | 352 / 1,640 | material/shading |
| texture_transform | 21,116 | 8.06 | 37.20 | 99 | 188 / 1,458 | material/shading |
| subdiv_catmull_clark | 21,058 | 8.03 | 42.28 | 7 | 140 / 1,427 | lighting (camera-light ambient) |
| mtlx_basic | 14,034 | 5.35 | 42.81 | 98 | 142 / 1,421 | material/shading |
| alpha_blend_mode | 13,880 | 5.29 | 34.97 | 212 | 393 / 1,664 | material/shading (opacity) |
| chess | 13,843 | 5.28 | 37.67 | 255 | 2,265 / 3,567 | material/shading |
| elephant | 5,273 | 2.01 | 44.96 | 122 | 194 / 1,467 | texture sampling |
| normals_types | 5,073 | 1.94 | 50.34 | 10 | 144 / 1,416 | lighting (camera-light ambient) |
| teapot | 5,028 | 1.92 | 43.09 | 73 | 230 / 1,513 | material/shading |
| bike | 3,965 | 1.51 | 42.01 | 165 | 922 / 2,214 | material/shading |
| normals_bias_scale | 3,100 | 1.18 | 48.55 | 51 | 166 / 1,449 | material/shading |
| brainstem | 4 | 0.00 | 63.63 | 11 | 257 / 1,551 | match (edge pixels) |
| vehicle | 0 | 0 | 65.78 | 1 | 209 / 1,483 | match |
| shaderball | 0 | 0 | 55.37 | 1 | 2,461 / 3,737 | match (environment box only; shading not exercised) |
| **Total** | **231,704** | 5.20 | | | | 2 match, 15 differ |

Repeatability: a repeat run of three assets reproduced the same counts exactly
(`.../i1-assets/repeat1/report.json`: mcusd 26,347, damaged_helmet 25,651). Once
in five runs, McUsd rendered darker: 51,637 px, 19.7 % (`notes.json:9`).

These assets differ only by `usdrecord`'s camera-light ambient of 0.01
(`usdAppUtils/frameRecorder.cpp:442,454`), which the hdStWgsl runtime cannot
express:

| Asset | Today | With `--material-ambient 0.4` |
|---|---|---|
| subdiv_catmull_clark | 21,058 | 0 |
| normals_types | 5,073 | 46 |

The same setting makes `normals_bias_scale` worse: 3,100 → 34,882 px
(`notes.json:4`, `.../i1-assets/exp-ambient04-full/report.json`).

### 1.3 Scoring: better, tie, regression

The proposed rules:

1. **Runs.** Run each renderer three times on the full set. Score each asset by
   the median of its three significant-pixel counts. Record the spread
   (max − min) per asset. Keep Safari visible during runs (`notes.json:10`).
2. **Settings.** Configure each renderer as close to `usdrecord` as it can
   express. The faithful path goes through `UsdImagingGLEngine` (I-3), so the
   harness gives it `usdrecord`'s own lighting state:
   `SetLightingState(lights, material, SCENE_AMBIENT)`, as
   `frameRecorder.cpp:396-468` does. hdStWgsl keeps its baseline settings.
   This is not a handicap: the score is the distance to native, and
   expressing the native settings is part of being faithful.
3. **Tie band per asset:** ε = max(262 px, which is 0.1 % of the image;
   3 × the larger of the two spreads).
   - **Better:** faithful < hdStWgsl − ε.
   - **Tie:** within ±ε.
   - **Regression:** faithful > hdStWgsl + ε.
4. **Hard failures are regressions:** a crash, timeout, no image, a size
   mismatch, an uncaught browser error, or a WebGPU validation error. An
   unexplained rise in viewer diagnostics is also a regression.
5. **Matching assets stay matching.** `vehicle` and `shaderball` must keep
   `significant = 0`. `brainstem` must stay at 262 px or fewer, which is its
   tie band.
6. **The bar is met** when there are zero regressions over all assets in the
   run, including the features group from section 1.4. The total significant
   count is reported (231,704 today) but does not gate.
7. **Exceptions.** An asset may regress only with a recorded, reviewed
   exception in `notes.json`. A typical case: hdStWgsl is closer for a non-upstream reason,
   and the faithful image matches Storm's behaviour elsewhere.

**Performance guard.** This is proposed. It is recorded every run and gates
only the switch:

- per asset, `settledMs` at most 1.5 × hdStWgsl's;
- a guarded asset's `lastFrameCpuMs` at most 2 × hdStWgsl's;
- BrainStem playback at least as smooth as hdStWgsl's (frame time at the
  stage's time codes).

The faithful path draws per draw item, because there is no
multi-draw-indirect (`imaging-i1.md:699-702`). Without a guard, a regression
here would only show up after the deletion.

Implemented (November 5, 2026): `score.mjs` `guard()` against the recorded
hdStWgsl baseline `perf-baseline.json`; measurements and results in
`performance-viewer.md`.

### 1.4 What the set does not exercise, and the features group

The 17 assets (`assets.json`) contain:

- no `BasisCurves`, `Points` or `Volume`;
- no point instancer that renders visibly. `chess` is the one ASWF asset with
  `instanceable = true`.

The harness also runs at complexity low, which is refine level 0, so
subdivision is exercised only as a coarse hull.

Proposal: add a `features` group to `assets.json`. Its scenes are upstream
OpenUSD 26.11.1 usdImagingGL testenv scenes, used unchanged. They are
Apache-2.0 files with provenance recorded per entry. Each scene is
sub-layered under the harness's framing camera or rendered with its own `main_cam`.
The upstream test for each scene is noted.

| id | Scene (`usdImaging/usdImagingGL/testenv/...`) | Exercises | Upstream test |
|---|---|---|---|
| curves | `testUsdImagingGLCurves/` | linear and cubic curves | `usdImagingGL/CMakeLists.txt:334` |
| points | `testUsdImagingGLPoints/` | points with widths | `:411` |
| pi_basic | `testUsdImagingGLPointInstancer/` (`pi_basic`) | point instancer | `:1680` |
| ni_cubes | `testUsdImagingGLInstancing/` (`instancedCubes`) | native instancing | `:1288` |
| skel_arm | `testUsdImagingGLUsdSkel/` (`arm`) | skinning | `:3856` (CPU) / `:3896` (GPU) |
| subdiv_refined | `basicDrawing/subdivTags.usda` at complexity 1.4 | OpenSubdiv refinement | `:258` |
| volumes | `testUsdImagingGLSimpleVolumes/simpleVolumes.usda` | procedural volume fields | `:3984` |
| vdb_volume | `testUsdImagingGLVdbVolume/vdbVolume.usda` | OpenVDB fields (`hioOpenVDB` is in the reference build) | `:5893` |

The order matters:

1. Add the group and baseline hdStWgsl on it now, while hdStWgsl still exists.
2. Then the same scoring rules apply to these rows.

This group is the only way to say "at least as well" for curves, points,
volumes and instancing at the viewer level. Upstream tests (section 3) say
"correct", which is a different and stricter question.

### 1.5 Viewer features the replacement must keep

What the viewer calls today, and what replaces it in the faithful path. Paths
are in `apps/usdview/src/`.

| Feature | Viewer today | hdStWgsl / other provider | Faithful replacement | Check |
|---|---|---|---|---|
| Construction and draw | `RenderDelegate.New(device, format, sampleCount)` (`runtime.ts:668,844`); `delegate.Render(device, colorView, depthView, matrix, eye, …)` (`runtime.ts:694,929`) | `hdStWgsl/src/renderDelegate.ts:478` | `UsdImagingGLEngine` (`usdImagingGL/engine.cpp`, 3,857 lines) over `HdStRenderDelegate` + `HdxTaskControllerSceneIndex` (`engine.cpp:1647-1662`). Presentation to the canvas: `HdxPresentTask` uses HgiInterop, so a WebGPU divergence is needed: blit the color AOV to the canvas texture. | I-3 engine tests; viewer vitest |
| Picking | `PickTask.New(device, …bind group layouts)` (`runtime.ts:679,858`); `pick.PickIdentity(meshes, …)` (`runtime.ts:487,1162`) | `hdx/src/pickTask.ts` (536 lines), hand-written WGSL that imports hdStWgsl internals (`pickTask.ts:14-18`) | `HdxPickTask` (2,454) + `HdxPickFromRenderBufferTask` (451); `UsdImagingGLEngine::TestIntersection` / `DecodeIntersection`. ID readback is asynchronous: the divergence already used by I-1's readback. | `testHdxPickAndHighlight`, `testUsdImagingGLPickAndHighlight`, `testUsdImagingGLInstancePicking_scene0/1` |
| Selection highlight | `delegate.SetSelection`, `SetSelectionColor`, `SetEnableSelection` (`runtime.ts:375-378`, `draw-modes.ts:16,27,30`) | renderDelegate selection buffer | `HdxSelectionTracker` (822) + `HdxSelectionTask` (309) + `hdx/shaders/selection.glslfx` (476) and `renderPassColorAndSelectionShader.glslfx`; `engine.SetSelected` / `SetSelectionColor` | `testUsdImagingGLHighlight` (`:1543`), `testHdxPickAndHighlight` |
| Draw modes (11 shading modes, `render-modes.ts`) | `SetCollection(repr)`, `SetRenderParams({enableLighting, depthBias…})`, two-pass Hidden Surface Wireframe (`draw-modes.ts:11-34`) | hdStWgsl reprs and `drawModes` fixtures | Storm mesh reprs (`refined`, `refinedWire`, `refinedWireOnSurf`, `hull`, `points`) via `UsdImagingGLRenderParams.drawMode` (`engine.cpp:2589-2690`). Points mode needs point expansion (I-4). | `testHdStBasicDrawing` repr variants (earlier port's script, section 3.2); `pxr/usdImaging/usdImagingGL/tests/fixtures/native/drawModes` (12 native images) |
| Model draw modes (cards, bounds, origin) | `DrawModeSceneIndex` (`imaging.ts:10`), `_interim_waitForPendingUpdates` (`runtime.ts:291`) | usdImaging | `UsdImagingDrawModeSceneIndex` (upstream 751 lines + `drawModeStandin` 2,378), owned by i2-usdimaging | `testUsdImagingGLCards` (`:2394`) |
| Display settings | `SetDisplayPurposes`, `SetClearColor`, `SetCameraLightEnabled`, `SetSceneLightsEnabled`, `SetSceneMaterialsEnabled`, `SetBackfaceCullingEnabled`, `SetDefaultMaterial`, `SetRenderSetting('domeLightCameraVisibility')` (`display-settings.ts:60-70`) | renderDelegate setters | `UsdImagingGLRenderParams` (`showProxy/Render/Guides`, `clearColor`, `cullStyle`, `enableSceneMaterials`, `enableSceneLights`, `domeLightCameraVisibility`) + `SetLightingState` (camera light, material ambient and specular); `HdxSimpleLightTask` | `testUsdImagingGLPurpose` (`:2285`), `testUsdImagingGLBasicLighting` (`:312`) |
| Default dome light | `_interim_setBuiltInDomeLight(delegate, StinsonBeach.hdr, transform, path)` (`default-dome-light.ts:10-15`) | hdStWgsl `_internal` | `HdxTaskControllerSceneIndex`'s built-in dome light texture (as `stageView.py:1467-1474` relies on) | `testUsdImagingGLDomeLightTaskController` (`:4749`); `tests/fixtures/defaultDomeLight` |
| Complexity / refine level | `LegacyDisplayStyleOverrideSceneIndex.SetRefineLevelFallback` (`runtime.ts:680-681`) | `hdStWgsl/src/subdivision.ts`, a CPU uniform refiner through `pxOsd/_internal` | `HdSt_Subdivision` + Far stencils (I-4); `engine` `complexity` param | `testUsdImagingGLSubdivision_*` (`:951`), `testHdStBasicDrawing` `--refineLevel 1/2` |
| Camera | Viewer-owned matrices (`camera.ts`, `viewer-camera.ts`) passed to `Render` | | `engine.SetCameraState` / `SetRenderViewport` (free camera); `SetCameraPath` for scene cameras | engine tests; viewer camera vitest |
| Time and playback | `sceneIndex.SetTime` + `index.SyncAll()` (`runtime.ts:683,1083,1097`) | `StageSceneIndex` | `UsdImagingStageSceneIndex::SetTime` through the engine's `Render(root, params)` with `frame` | `testUsdImagingGLAnimatedCamera`, `testUsdImagingGLResync` (`:2247`); BrainStem playback guard |
| Payload streaming and retained index | Deferred payloads, observer updates (`runtime.ts:580-616,950-1052`) | | Same usdImaging notices into the faithful render index: the stage-to-Hydra notice path that i2-usdimaging builds | viewer `runtime-lifecycle.test.ts`; `testUsdImagingGLResync` |
| Texture loading progress | `textureRegistry._interim_waitForLoads`, `.version`, `.pendingLoads` (`runtime.ts:310,324-328`) | `hdStWgsl/src/textureHandleRegistry.ts:195` (`async-texture-commit`) | `HdSt_TextureHandleRegistry` with asynchronous commit (i2-textures); `engine.IsConverged()` | viewer `load-progress.test.ts` |
| Volumes | `import('typescript-usd/hioOpenVDB')` (`runtime.ts:53-58`) | `hdStWgsl/src/volume.ts` (519), `fieldTextureObject.ts`, NanoVDB sparse fields | `HdStVolume`, `HdStField`, `HdSt_VolumeShader`, OIT volume task (I-5; section 2.4) | `testUsdImagingGLSimpleVolumes`, `testUsdImagingGLVdbVolume` |
| MaterialX | `import('typescript-usd/hdStWgsl/materialx')` (`runtime.ts:46-50`) | `materialXShaderGen.ts` over vendored `@mtlx/genwgsl` | `HdSt_MaterialXShaderGen` (GLSL variant) + `materialXFilter` (I-5; section 2.6) | 41 `testUsdImagingGLMaterialX*` tests (`:4925-5100`) |
| Skinning | `typescript-usd/usdSkelImaging` CPU `pointsResolvingSceneIndex` (`imaging.ts:3`) | usdSkelImaging (302 lines; `usdskel-cpu-resolving`) | Upstream usdSkelImaging ext computations (16,825) + `HdStExtCompGpuComputation` (I-4) | `testUsdImagingGLUsdSkelExtCompCPU_*`/`GPU_*` (`:3842-3911`), `testUsdImagingGLSkelBlendShapes` (`:2553`) |
| Instancing, curves and points | `GetMeshes()` for drawable counts and bounds (`runtime.ts:351-354,771`) | `pointCurveRprim.ts`, `basisCurvesComputations.ts`, instanced draw in `mesh.ts` | `HdStBasisCurves`, `HdStPoints`, `HdStInstancer` (I-4). Drawable counts come from the render index (`GetRprimIds`), not a delegate map. | section 3 |
| Bounding boxes and axes overlay | Viewer-owned WebGPU (`viewport-overlays.ts:18-33,46-47`) | — | Keep it viewer-owned, as now. `HdxBoundingBoxTask` (744) is optional. | viewer tests |

### 1.6 Inventory: what goes with hdStWgsl

**Deleted with it:**

- `pxr/imaging/hdStWgsl/` (53 files, 11,176 lines) and its exports
  `typescript-usd/hdStWgsl`, `hdStWgsl/materialx` and `hdStWgsl/_internal`;
- its 26 test files (about 95 `it`s);
- the hand-written `hdx/src/pickTask.ts` (536), which imports hdStWgsl
  (`pickTask.ts:14-18`).

**Also deleted, if unused afterwards:** these compatibility seams, which
exist only for hdStWgsl and are documented so at their sites:

- `hd/src/meshUtil.ts:16`;
- `hd/src/bufferArray.ts:22,167`;
- `hd/src/bufferArrayRange.ts:23-27`;
- `hd/src/bufferSource.ts:23`;
- `hd/src/vertexAdjacency.ts:22`;
- `hd/src/vtBufferSource.ts:17`;
- `hd/src/resourceRegistry.ts:16`;
- `hd/src/rprim.ts:93`;
- `hgi/src/internal.ts:2` (`hgi-compat`);
- `pxOsd/src/internal.ts:2` (the uniform refiner adapter);
- the `aliasedLibraries` entry in `tests/architecture/libraryImports.ts:161`.

Their debt tags retire with them: `hd-bar-legacy-defaults`,
`hd-buffersource-legacy-subclasses`, `hd-bufferarray-legacy-api`,
`hd-vertexadjacency-counts-overload`, `hd-meshutil-free-functions`,
`hd-resourceregistry-allocation`, `hgi-compat` and `pxosd-uniform-adapter`.

**Kept, but re-pointed** at the faithful path before the deletion. hdStWgsl
has 24 native-capture fixture directories. Each comes from the reference build;
its capture script is kept with the capture tooling outside this repository
(`FIXTURES.md`):

- 23 in `hdStWgsl/tests/fixtures/`: `cameraLight`, `chessboard`,
  `commonMaterials`, `coneNormals`, `defaultDomeLight`, `deformation`,
  `drawModes`, `materialSubsets`, `materialxGeomprops`, `multiUv`,
  `nativeFallbacks`, `neutral-standard`, `noMaterialX`, `nonmeshReprs`,
  `normalMatrix`, `opacity`, `openpbr`, `orientation`, `pointsCurves`,
  `primvarReaderTypes`, `textureInputs`, `unlit`, `wireRaster`;
- 1 in `hdStWgsl/tests/upstream/fixtures/`: `emptyMaterial`.

These expectations are valid for any renderer. Move them, re-run each capture
with `--check`, and point the tests at the engine. Removing them would lose
coverage.

**Viewer code that changes:**

- `imaging.ts:8-9`: `RenderDelegate`, `PickTask`;
- `default-dome-light.ts:1-2`;
- `draw-modes.ts:4`;
- `display-settings.ts:60`, which is typed against the delegate's setters;
- `runtime.ts:38,64-65,121-122`, the `Pipeline` type;
- every `delegate.*` call listed in section 1.5. Most map onto
  `UsdImagingGLRenderParams`, as `usdviewq/stageView.py` uses them.

The `_interim_*` hooks disappear:

- `_interim_setBuiltInDomeLight`;
- `_interim_waitForLoads`;
- `_interim_waitForPendingUpdates`, if `UsdImagingDrawModeSceneIndex` settles
  synchronously.

**Decision needed (section 6):** `hio/src/fieldTextureData.ts` carries the sparse
NanoVDB divergence, and `packages/materialx/genwgsl` is vendored for hdStWgsl.
Both go away if sections 2.4 and 2.6 are adopted.

## 2. What the faithful port still lacks

The I-1 page has no consolidated FAITHFULNESS-DEBT list. Its debt is the
`codeGen.ts:553` marker plus the deferred list at `imaging-i1.md:1053-1060`.
The inventory below comes from the code instead. There are 82 distinct tags:

| Location | Distinct tags |
|---|---|
| `hdSt` (faithful) | 23 |
| `hdStWgsl` | 23 |
| `hd` | 16 |
| `usdImaging` | 10 |
| `usdSkelImaging` | 3 |
| `hgiWebGPU` | 3 |
| `hio` | 2 |
| `hdMtlx` | 2 |
| `hdx` | 1 |
| `hgi` | 1 |
| `pxOsd` | 1 |

The extraction command is in the appendix. "TS today" means the faithful module
unless it says otherwise.

### 2.1 Overview by area

| Area | Upstream files (h+cpp lines) | TS today | Debt tags | Owner |
|---|---|---|---|---|
| Texture stack | `hdSt/textureObject` 1,006, `textureHandleRegistry` 602, `textureBinder` 674, `samplerObject` 507, `textureUtils` 785, `udimTextureObject` 432, `ptexTextureObject` 447, `dynamicUvTextureObject` 197, identifiers, CPU data, …: 6,657 total | Registries absent from the faithful `hdSt`; `pipelineDrawBatch.ts:492` posts a coding error for named texture handles | `hdst-texture-registry` (`resourceRegistry.ts:9`), `hdst-texture-binder` (`pipelineDrawBatch.ts:36`), `hdst-texture-handle` (`shaderCode.ts:10`), `hdst-render-buffer-texture-object` (`renderBuffer.ts:4`), `hdst-bindless-handles` | **i2-textures** |
| Materials | `hdSt/material` + `materialNetwork` 1,376 + `materialParam` + `materialXFilter` 1,758 + `materialXShaderGen` 1,648: 5,538 total; `hdMtlx` 1,295 | `material.ts` 320 (fallback surface only), `materialNetworkShader.ts` 480; `hdMtlx` 181 | `hdst-material-network` (`material.ts:9`), `hdmtlx-*` (2) | **i2-textures** (network, textures); MaterialX in I-5 |
| Lighting | `hdSt/simpleLightingShader` 908, `light` 623, `domeLightComputations` 572, `lightingShader` 68, `fallbackLightingShader` 140; glslfx `simpleLighting` 534, `domeLight` 357, `pcfShader` 124 | `fallbackLightingShader.ts` 60, `lightingShader.ts` 12 | `hdst-prim-types` (lights) | **i2-lighting** (hdSt side); hdx `simpleLightTask` 1,050, `shadowTask` 675, `skydomeTask` 424 in I-3 |
| Basis curves | `hdSt/basisCurves` 1,568, `basisCurvesComputations` 752, `basisCurvesShaderKey` 664, `basisCurvesTopology` 124: 3,108; glslfx 1,381 | none | `hdst-prim-types` (tessellation factors above 1: done, section 2.2.1) | I-4 |
| Points | `hdSt/points` 564, `pointsShaderKey` 115: 679; glslfx `points` 155, `pointId` 87, `pointDisk` 103 | none | `hdst-prim-types` | I-4 |
| Volumes | `hdSt/volume` 738, `volumeShader` 565, `volumeShaderKey` 89, `field` 177, `fieldSubtextureIdentifier` 164, `fieldTextureCpuData` 224: 1,957; glslfx `volume` 484, `fallbackVolume` 97; `usdVolImaging` 1,436; `hioOpenVDB` 1,298 incl. `hio/fieldTextureData` | none in `hdSt`; usdVolImaging 143 lines; hdStWgsl's `volume.ts` 519 (sparse) | `hdst-prim-types`; `hdst-volume-materials` (hdStWgsl), `usdimaging-volume-gprim` | I-5 |
| OpenSubdiv | `hdSt/subdivision` 2,211; Far `stencilTable(+Factory, Builder)` 2,809, `patchTable(+Factory)` 3,848, `ptexIndices` 319, `patchDescriptor` 285, `patchParam` 332, `sparseMatrix` 199 (uniform needs about 7.8k); adaptive adds `patchBuilder` 1,956, `catmarkPatchBuilder` 2,082, `loopPatchBuilder` 1,963, `patchBasis` 1,515 and Osd's GLSL patch source | Uniform refinement ported (release/osd-wiring): `hdSt/src/subdivision.ts` over `pxOsd/src/refinerFactory.ts` and the Far stencil/patch tables, Osd's GLSL patch source in `@opensubdiv/core/osd`; `hdst-meshtopology-subdivision`, `hdst-osd-patch-source`, `hdst-osd-refine-gpu` closed | `hdst-osd-adaptive` (`subdivision.ts`: no `RefineAdaptive`), `hdst-osd-patch-source-msl` (`codeGen.ts`) | I-4 |
| Instancing | `hdSt/instancer` 447 + `drawItemInstance`: 572; glslfx `instancing` 223; `frustumCull` instancing sections; usdImaging NI/PI propagating scene indices | `instancer.ts` 338 (ported), `drawItemInstance.ts` 48 | `hd-instancer-builtin-names` (`resourceBinder.ts:19`), `hd-instance-use-count`, `usdimaging-native-propagation`, `usdimaging-pi-propagation` | I-4 (hdSt); propagation by i2-usdimaging or I-4 |
| Ext computations | `hdSt/extComp*` 2,471 (GPU and CPU computations, primvar buffer sources, input sources); `hd/extComputation*` 2,823 | `extCompGpuComputation.ts` 79 (grouping only; a coding error per group); `hd/extComputation*.ts` 527 | `hdst-ext-computation` (`extCompGpuComputation.ts:10`) | I-4 |
| Skinning | `usdSkelImaging` 16,825 (`extComputations.cpp` 580, `dataSourceResolvedPointsBasedPrim.cpp` 1,665, …); glslfx `skinning` 280 | `usdSkelImaging` 302 (CPU resolving scene index) | `usdskel-cpu-resolving`, `usdskel-skeleton-schema`, `inherited-skinning-primvars` | I-4 |
| hdx tasks | `taskControllerSceneIndex` 3,068 (`taskController` 2,627 legacy); `renderTask` 388, `renderSetupTask` 683, `simpleLightTask` 1,050, `skydomeTask` 424, `shadowTask` 675, `selectionTask` 309, `selectionTracker` 822, `pickTask` 2,454, `pickFromRenderBufferTask` 451, `colorCorrectionTask` 1,472, `colorizeSelectionTask` 609, `aovInputTask` 475, `presentTask` 274, `oitRenderTask` 346, `oitResolveTask` 598, `oitVolumeRenderTask` 230, `boundingBoxTask` 744, `visualizeAovTask` 852, `fullscreenShader` 733, `effectsShader` 727; hdx glslfx 2,000 lines in 18 files | `hdx` 679 lines (`renderSetupTask.ts` 11, the hdStWgsl pick task 536) | `hdx-shaders` (`hdx/src/shaderResources.ts:18`), `hdst-aov-input-textures` (`renderPassShader.ts:15`), and in hdStWgsl `hdx-skydome-task`, `hdx-built-in-light-transport`, `hdst-transparency-oit` | I-3 (OIT in I-5) |
| Engine | `usdImagingGL/engine` 3,857, `renderParams` 183, `unitTestGLDrawing` 1,238; `usdImagingGL` 5,902 in total | none | — | I-3 |
| UsdImaging scene-index path | `usdImaging` 68,418 (`stageSceneIndex` 1,296, `sceneIndices` 450, `drawModeSceneIndex` 751, `drawModeStandin` 2,378, adapters …) | `usdImaging` 2,936 (30 files) feeding hdStWgsl's scene-index sync | `usdimaging-*` (7), `cube-implicit-scene-index`, `implicit-primitive-scene-index`, `light-asset-values` | **i2-usdimaging** |
| Scene-index emulation entry | `hd/renderIndex.cpp:194-251` (terminal scene index, `HdLegacyPrimSceneIndex`, merging scene index, renderer plugin scene indices, `HdSceneIndexAdapterSceneDelegate` at `:246`); `sceneIndexAdapterSceneDelegate` 3,507; `legacyPrimSceneIndex` 137; `legacyGeomSubsetSceneIndex` 581; `dirtyBitsTranslator` 1,431 | `sceneIndexAdapterSceneDelegate.ts` 47 (topology only); `dirtyBitsTranslator.ts` 225; render index scene-index-only `SyncAll` | `hd-render-index-legacy-sync` (`renderIndex.ts:6`, `sprim.ts:22`), `hd-repr-sync-retention` (`renderIndex.ts:277`), `hd-dirty-translator-sprims` | **i2-usdimaging** (this is what "UsdImaging → faithful hdSt" needs) |
| Storm scene-index plugins | 12 plugins in `hdSt/plugInfo.json` (1,994 lines), which create `hdsi/implicitSurface` 1,781, `materialBindingResolving` 263, `materialPrimvarTransfer` 461, `nodeIdentifierResolving` 237, `nurbsApproximating` 571, `tetMeshConversion` 316, `unboundMaterialPruning` 465, `velocityMotionResolving` 1,076, `backPlate` 1,252 and `hd/dependencyForwarding` 1,017 | `hdsi` has only `legacyDisplayStyleOverrideSceneIndex` | — | i2-usdimaging if in scope; otherwise I-3 track D |
| Implicit surfaces | `hdSt/implicitSurface` 631 + glslfx (sphere, capsule, cone, cylinder); `hdsi/implicitSurfaceSceneIndex` 1,781 and `geomUtil` 2,946 | Meshed as Storm meshes them by default (`HDST_ENABLE_NATIVE_IMPLICITS` off): `geomUtil` (testMeshGenerators matches its baselines), `hdsi/src/implicitSurfaceSceneIndex.ts`, `hdSt/src/implicitSurfaceSceneIndexPlugin.ts` | `hdst-prim-types` (native HdStSphere/HdStCapsule/HdStConicalFrustum, only with `HDST_ENABLE_NATIVE_IMPLICITS`) | Done (batch 7) |
| Draw targets, image shaders | `hdSt/drawTarget`, `imageShaderRenderPass`: 753 | none | `hdst-prim-types` | not needed by the viewer; after the switch |

### 2.2 WebGPU emulation gaps in HgiWebGPU

These are not upstream files. They are divergences forced by WebGPU, and the
areas above depend on them:

- **Tessellation factors above 1.** *Done (section 2.2.1, "Implemented").*
  Before: every patch was drawn at factor 1. On Metal,
  refined cubic curves compute per-patch factors in the post-tessellation
  control stage, `Curves.TessFactorsMSL`. hgiMetal runs that stage as a
  rasterizer-disabled patch draw at factor 1, and the fixed-function
  tessellator expands each patch (corrected and superseded by section 2.2.1).
  - Proposal: run the post-tessellation control stage as a WebGPU compute pass,
    as hgiMetal does.
  - Emulate the tessellator by drawing a fixed grid per patch: (maxFactor+1)
    vertices per isoline, or the quad/triangle domain for meshes. The vertex
    stage collapses the vertices beyond the patch's own factor to a degenerate
    position.
  - This has no upstream template. It is the largest single design item after
    I-1.
- **Points larger than 1 px** (`imaging-i1.md:626`). WebGPU has no
  `gl_PointSize`. Proposal: expand each point to a 6-vertex quad by vertex
  pulling in the generated vertex stage, and evaluate `gl_PointCoord` in the
  fragment stage. `pointDisk.glslfx:20-45` then runs unchanged. Record this as a
  divergence at the shader generator. *Done (section 2.2.1).*
- **Indirect patch draws read the CPU copy** (`hgiWebGPU-patch-indirect`,
  `graphicsCmds.ts:369`). GPU frustum culling does not skip patch draws. The
  image is unchanged, but the cost grows with scene size. It is part of the
  performance risk.
- **Primitive ID outside patches** (`hgiWebGPU-primitive-id`,
  `shaderGenerator.ts:681`). Safari offers `primitive-index`. Points and curves
  that read `gl_PrimitiveID` need it, and so does picking of non-patch draws.
  *Done when the device has `primitive-index` (section 2.2.1).*

- **Triangle fill mode lines** (`HgiPolygonModeLine`; Storm's `wire`,
  `refinedWire` and hull-edge reprs, `hdSt/meshShaderKey.cpp:183-186`,
  `renderPassState.cpp:1227-1234`). hgiMetal sets
  `setTriangleFillMode:MTLTriangleFillModeLines` (`graphicsPipeline.mm:474-475`);
  WebGPU has no fill mode. Before: the pipeline filled with a warning, and the
  wire reprs' edge test (`meshWire.glslfx` `EdgeOnly*`, discard where
  `exp2(-4 d^2) < 0.5`) kept only filled pixels whose centres fall within half
  a pixel of an edge, so edges came out dashed or missing (axis-aligned edges on
  pixel boundaries were lost entirely); the barycentric and primitive-ID
  emulation were not involved. *Done (November 5, 2026)* for patch draws at
  constant factors (every unrefined and uniformly refined mesh): variants of the
  post-tessellation vertex and fragment functions, generated when a line-mode
  pipeline is made, draw each triangle's three edges as a line list. Each line
  vertex runs the body for its triangle's three vertices to cull the edge with
  the triangle and to pass the triangle's facing to the fragment stage as a
  flat value at location 14 (`HgiWebGPUFrontFacingLocation`), since a WebGPU
  line is always front-facing. Measured in Safari: the line pixels are the
  native ones (every native wire pixel is among the emulation's line pixels
  with the edge discard disabled). `PLATFORM-DIVERGENCE(hgiWebGPU-polygon-mode-line)`:
  the fragment attributes are interpolated along the line, while Metal
  interpolates fill-mode lines over the triangle's plane, so the edge distance
  Storm computes from the edge coordinate and its `fwidth` differs on
  near-threshold pixels: about 100 pixels per unrefined wire image (0.03%),
  and refined grids whose edges lie on pixel boundaries draw solid where the
  native image is dashed. Exact interpolation needs each triangle's three
  vertex outputs in the fragment stage (three times the interstage variables,
  over WebGPU's limit for Storm's meshes, or a compute pass writing them to a
  buffer); even then ties at exactly half a pixel would depend on rounding.
  Draws with per-patch factors and plain vertex functions still fill, with the
  warning.
- **Clip distances** (`testHdStClipPlanes1/2`). *Done (November 5, 2026).*
  Safari offers `clip-distances`; HgiWebGPU requests it, reports 8 clip
  distances as hgiMetal does (`capabilities.mm:119`), and writes Storm's
  `gl_ClipDistance` output (role `clip_distance`) as
  `@builtin(clip_distances)`, the role hgiMetal writes as `[[clip_distance]]`
  (`shaderGenerator.mm:737-754`). Safari compiles that member as an MSL array,
  which cannot be assigned whole, so it is copied element by element. Clip
  distances count against `maxInterStageShaderVariables`, which HgiWebGPU now
  raises to the adapter's limit (the emulated `gl_PointCoord` sits at the last
  default location, 15). Both tests match the native captures exactly.

#### 2.2.1 Design: tessellation factors above 1 and points wider than a pixel (I-4 groundwork)

**How upstream draws refined curves on Metal.** Storm's curve shader key
selects post-tessellation stages when the device reports
`MetalTessellation` (`hdSt/basisCurvesShaderKey.cpp:195-199, 250-260, 471-480`):
a post-tessellation control stage (PTCS: `Curves.CommonData`,
`Curves.PostTess.CurveData`, `Curves.TessFactorsMSL`, the
`Curves.PostTessControl.*` main and a `determineLODSettings` from
`Curves.CommonControl.*`) and a post-tessellation vertex stage (PTVS). Linear
wire curves and points skip tessellation (`:195-197`).

- `HdSt_PipelineDrawBatch` allocates a `tessFactors` buffer of 6 halves per
  index-buffer element (`pipelineDrawBatch.cpp:566-596, 848-856`), and
  before the draw runs `_ExecutePTCS` (`:1376-1385, 1790-1853`): the same
  draw, with a pipeline whose vertex function is the PTCS, rasterization
  disabled and `tessFactorMode = TessControl` (`:1316-1360`). hgiMetal draws
  that pass as a patch draw at constant factor 1 (`hgiMetal/graphicsPipeline.mm:
  187-193, 399-438`); each PTCS invocation writes its patch's factors through
  `device half *tessAsHalf = (device half *)tessFactors + patch_id * 6`
  (`basisCurves.glslfx:137-151`). A memory barrier follows.
- The real draw binds the buffer as `HgiBindResourceTypeTessFactors`
  (`pipelineDrawBatch.cpp:1098-1116`), which hgiMetal hands to the fixed
  tessellator (`hgiMetal/resourceBindings.mm:136-141`) with per-patch
  factors (`TessVertex`, `graphicsPipeline.mm:195-204`). The PTVS layouts
  ask for the quad domain with `fractional_odd_spacing`
  (`basisCurves.glslfx:608-618, 710-728`); isolines are drawn as triangles
  with line fill (`graphicsPipeline.mm:209-221`). The factors are
  screen-space: up to `GetMaxTess() = 40` segments along the curve,
  one across a ribbon, more across a half tube (`basisCurves.glslfx:280-332,
  526-606`).

**WebGPU design.** WebGPU has no tessellator and its vertex stage cannot
write storage buffers, so:

1. *PTCS as a compute pass.* The shader generator emits the
   `PostTessellationControl` function as a compute entry point, one
   invocation per patch and instance, with the post-tessellation vertex
   stage's vertex pulling (control-point indices and attributes as storage
   buffers, `HgiWebGPUPostTessVertexShaderSection`). `tessFactors` is a
   `read_write` storage `array<u32>` of the same 12 bytes per patch; the
   MSL-only `Curves.TessFactorsMSL` body is replaced at the generator by its
   WGSL equivalent (`pack2x16float` pairs), a recorded divergence because
   the section is Metal source, not GLSL. `HgiWebGPUGraphicsCmds` cannot run
   compute inside a render pass, so a PTCS draw ends the render pass, runs
   the compute pass and resumes with `loadOp: 'load'` (resolving MSAA only
   at the last segment); `InsertMemoryBarrier` stays a no-op.
2. *Tessellation as a second compute pass.* A generator-owned kernel turns
   each patch's six factors into the domain points and triangles of the
   fixed-function tessellator (quad and triangle domains; integer, pow2,
   fractional-odd and fractional-even partitioning; factors clamped to
   `maxTessellationFactor = 64`, `graphicsPipeline.mm:233-234`). It appends
   `(patch, u, v)` triples for three vertices per triangle to a storage
   buffer through an atomic counter and writes the vertex count into an
   indirect draw record.
3. *PTVS as a non-indexed indirect draw.* The emulated PTVS reads
   `(patch, u, v)` by `vertex_index` instead of deriving it from a fixed
   3- or 6-vertex corner table; everything else in the factor-1 emulation
   stays.

The images need the tessellator's vertex positions, not just its
topology: a polyline vertex moved by a fraction of a pixel flips edge
pixels by more than 2/255. The decision (section 6, item 8): port the
Direct3D 11 fixed-point tessellator from its specification.

**Implemented (November 5, 2026).**

- *The tessellator.* `hgiWebGPU/src/tessellator.ts` ports Microsoft's
  reference `CHWTessellator`, which the Direct3D 11.3 Functional
  Specification names as the definition of the pattern (section 11.7.1;
  `tessellator.cpp`/`.hpp` in github.com/microsoft/DirectX-Specs
  `d3d/archive/images/d3d11`, commit 98063a7, MIT), function by function
  with line citations: quad, triangle and isoline domains, integer, pow2,
  fractional odd and even partitioning, 16.16 fixed point. Metal's pow2
  rounds each factor up to a power of two first (the HLSL helper's
  `RoundUpTessFactor`, `tessellator.cpp:2657-2673`).
- *Checked against Apple's tessellator.* `hgiWebGPU/tests/fixtures/tessellator/
  capture.swift` drives Metal on the reference machine (Apple M4 Pro):
  the points through `position_in_patch`, the triangles and their winding
  reconstructed per pixel. `tests/tessellator.test.ts` matches all 441
  factor sets (both domains, all four partition modes, both windings):
  same points exactly, every native triangle with the same orientation,
  every port triangle covering two pixel centers drawn natively. The
  capture also fixed three facts: Metal's counter-clockwise output winding
  emits the reference's "clockwise" triangles; `patch_id` includes the
  draw's `patchStart` (HgiWebGPU now reports `BasePrimitiveOffset`, as
  hgiMetal does on Apple Silicon); constant factors give the minimum
  tessellation's diagonal ((0,0),(1,0),(0,1) and (1,0),(1,1),(0,1)), not the
  one the factor-1 emulation used. *Corrected (November 5, tess-regressions):*
  the reference device never draws constant-factor patches. Storm uses
  them only without builtin barycentrics (`hdSt/meshShaderKey.cpp:277-288`);
  hgiMetal on Apple silicon has them (`hgiMetal/capabilities.mm:44-49`),
  so native draws the same triangles and triquads as triangle lists of
  the index buffer (`geometricShader.cpp:312-318`), a triquad being
  (q0, q1, q2) and (q2, q3, q0) (`hd/meshUtil.h:398-405`). HgiWebGPU has
  no barycentrics, so Storm sends it the patches, and
  `HgiWebGPUConstantPatchCorners` draws each one as those triangles (the
  q0-q2 diagonal) so the image is the one native draws. The tessellator's
  diagonal had cost `testUsdImagingGLMaterialXTextured_mxFallbackDome`
  (pass to 1.52% of pixels, max 52) and the features scene `subdiv_refined`
  (720 to 1,261 px against usdrecord); both are back (max 1, 0.002%;
  720 px).
- *The kernels.* `tessellatorWGSL.ts` renders the port in WGSL (count, scan,
  write; one invocation per patch) into pools of `(patch, u, v)` points and
  triangle indices owned by `HgiWebGPUTessellation`, plus each draw's
  indexed indirect arguments. `tests/browser/storm-image/tessellator/run.mjs`
  runs them in Safari against the TypeScript port: 4,800 patches, every
  point and index identical, including a pool overflow and regrowth.
- *The stages.* The control stage is a compute entry point
  (`HgiWebGPUShaderGenerator`, `'control'`), dispatched per patch and
  instance; Metal's `device half *` factor writes are rewritten to packed
  half-float writes (round to nearest even, as Metal's `half()`). The
  control and tessellation dispatches of a graphics cmds go to a command
  encoder submitted just before its render pass, so the render pass is not
  split. The post-tessellation vertex stage reads its point per
  `vertex_index` (indirect draws start at instance 0; the base instance is
  added in the shader, so `indirect-first-instance` is not needed).
- *Divergences.* When a frame needs more points or indices than the pools
  hold, the draws that do not fit draw nothing that frame with a warning,
  and the pools grow. (Centroid and sample qualifiers, dropped by this
  merge as `hgiWebGPU-centroid`, are written again: WebGPU requires the
  same interpolation on both sides and Storm qualifies only the fragment
  input, `basisCurves.glslfx:1267-1268`, as GLSL and MSL allow; hgiMetal
  and hgiVulkan write each side's own qualifiers. `HgiWebGPUShaderProgram`
  gives the vertex-side outputs the interpolation of the fragment inputs
  at the same location and compiles that stage again when it changes; the
  debt is closed.)
- *Results (Safari).* `testHdStCurveDrawing_lv1_refined` passes (0 pixels
  over 2/255, 55 pixels differing by 1); `lv0` still identical. The 40
  refined/`lv1`/`lv2` testHdStBasicDrawing variants draw their curves
  (2,190 fewer pixels over tolerance each) but still fail on subdivision.
  depthBias, lighting and texture image tests are unchanged.

**Points wider than a pixel (implemented).** Metal writes `gl_PointSize`
as `[[point_size]]` because Storm gives it the `point_size` role only for
point-list programs (`hdSt/codeGen.cpp` `GenerateDrawingProgram`; hgiMetal
uses the role as the attribute, `hgiMetal/shaderGenerator.mm:727-756`);
hgiVulkan and hgiGL keep it as the built-in GLSL output
(`hgiVulkan/shaderGenerator.cpp:385-393`, `hgiGL/shaderGenerator.cpp:
384-392`). None of them reports `RoundPoints` except hgiGL, so Storm adds
`PointDisk.*` (`pointsShaderKey.cpp:41-63`) and reads `gl_PointCoord` in
the fragment stage. HgiWebGPU draws such a vertex function with vertex
pulling: 6 vertices per point, the two triangles of a square
`gl_PointSize` pixels wide around the projected point, with the
square's point coordinate passed at interstage location 15 as
`gl_PointCoord` (`HgiWebGPUPostTessVertexShaderSection`, primitive
`'point'`). The same pulling draws vertex functions that read
`gl_BaseVertex` / `hd_BaseInstance` (Metal's `[[base_vertex]]` /
`[[base_instance]]`, which WGSL lacks) one vertex per vertex
(`'vertex'`), and `gl_PrimitiveID` maps to `primitive_index` when the
device has `primitive-index`.

*Metal's point rasterization (release/wide-points).* The Metal Shading
Language specification 4.1 says only that `[[point_size]]` is the "size of a
point primitive" (5.2.3.3, Table 5.4) and that `[[point_coord]]` runs from 0
to 1 across it (5.2.3.4, Table 5.5); hgiMetal passes Storm's value through
unchanged. Fitting a CPU model of the 1,500 testHdStBasicDrawing points
against the native captures settles the rest: a pixel is covered when its
center lies strictly inside the square of `gl_PointSize` pixels around the
projected point; the size is neither rounded nor raised to one pixel, so the
0.45-pixel points of `/points3` cover a pixel only when they fall within
0.225 px of its center. Rounding the size, snapping the center or the edges
to 1/4-1/256 px, anchoring at the upper-left corner with a quantized extent,
and global shifts or scales all fit worse. The emulation now draws exactly
that square (the old one-pixel minimum is gone), and HdUnitTestDelegate
accumulates the cloud's angles in float as `unitTestDelegate.cpp:1779` does;
testHdStBasicDrawing drops from 160 to 105 px over tolerance per image. The
remaining pixels are edge pixels within 0.06 px of a square's edge where the
native capture deviates from the model by about +/-0.03 px per point (our
render matches the model to 10 px of 8,338); the same order of offset shows
in testUsdImagingGLPoints, whose native disk centers sit 0.02-0.04 px off
the exact projected centers ours hit. No documented Metal rule explains it.
WebGPU rejects alpha to coverage together with a `sample_mask` output;
Storm's points write `hd_SampleMask`, so their pipelines keep the mask and
drop alpha to coverage. Metal ANDs both, which only differs for points with
alpha below 1 (`PLATFORM-DIVERGENCE(hgiwebgpu-alpha-to-coverage-mask)`). Storm
always asks for alpha to coverage together with alpha to one, which WebGPU
also lacks; such pipelines draw with a fragment variant that computes the
coverage itself (the Apple GPU's masks), ANDs it with the shader's mask and
writes an alpha of 1 (`hgiWebGPU/src/alphaToOne.ts`), so the debt remains
only for alpha to coverage without alpha to one, which Storm does not use.

### 2.3 Translator gaps

The I-1 section-mode corpus translates 533 modules
(`modules.json`, not in the repository).

- **Section mode:** 50 of the 533 modules fail
  (`.../i1-translator/final/failures.txt`). Most are missing context: stubs
  for code-generator accessors (`HdGet_normals`, `HdGet_density`), defines
  (`EVAL_STENCILS_NUM_ELEMENTS`) or functions defined in other sections. Program
  mode supplies all of these.
- **Real errors among them:**
  - `compute.glslfx:147,156`: float → int in `writeNormal`;
  - `edgeId.glslfx:224`: int → ivec2;
  - `mesh.glslfx:159,243`: vec3 → vec2 in `GetPatchCoordLocalST`;
  - `domeLight.glslfx:205,288`: no `HgiTextureLod_*(vec3, float)` overload for
    cube maps.
- **Program mode:** only the depthBias programs compile in Safari today
  (`.../i1-translator/final/results.json`, 3 pipelines, no errors).

Each I-2 to I-5 track must add its programs to the Safari WGSL check
(`tests/browser/wgsl-check`) before it attempts images.

### 2.4 Volumes: stay faithful with dense 3D textures

hdStWgsl samples OpenVDB fields in place from a NanoVDB storage buffer. Its
justification is that "browser memory bounds rule out upstream's dense 3D
textures" (`hio/src/fieldTextureData.ts:14-18`,
`hdStWgsl/src/fieldTextureObject.ts:6-10`). Upstream already bounds that
memory:

- `HdStVolume::defaultMaxTextureMemoryPerField` is 128 MiB
  (`hdSt/volume.cpp:44`);
- the field's `textureMemory` and the render setting
  `volumeMaxTextureMemoryPerField` override it (`hdSt/field.cpp:79-82`,
  `hdSt/renderDelegate.cpp:240,708`);
- `HioOpenVDB_TextureData` resamples a grid down to that target before it
  becomes a dense texture (`hioOpenVDB/vdbTextureData.cpp:538-560`).

A 128 MiB `r32float` 3D texture is within WebGPU limits, and Safari offers
`float32-filterable` (`imaging-i1.md:458`).

Recommendation:

1. Port `HdStVolume`, `HdSt_VolumeShader`, `HdStField`, `HdStFieldTextureObject`
   (in `hdSt/textureObject.cpp`) and `volume.glslfx` as upstream has them, with
   dense 3D textures.
2. Make `hioOpenVDB` produce upstream's dense, downsampled buffer. Keep
   `@vdb/openvdb` for reading grids and its tools for resampling.
3. Drop `GetSamplingWGSL` and the NanoVDB format from `hio/fieldTextureData`.
   That removes the sparse divergence, which can only exist outside a glslfx
   program anyway, and lets `volume.glslfx` run unchanged through the
   translator.
4. Keep the sparse path only if a measured asset fails at the 128 MiB default in
   Safari. In that case record it as a divergence with that measurement, and
   lower the per-field budget first, as upstream allows.

Volumes also need these, all I-5:

- OIT: `HdxOitVolumeRenderTask` 230, `HdxOitResolveTask` 598, OIT buffer
  atomics;
- depth readback for raymarch termination;
- the material network's volume terminal, so i2-textures' material network
  must cover `volume` terminals.

### 2.5 OpenSubdiv

Upstream Storm needs only Far, not Osd's evaluators. `hdSt/subdivision.cpp:39-43`
includes `far/patchTable`, `patchTableFactory`, `stencilTable` and
`stencilTableFactory`, and refines on the GPU with its own compute shader
(`RefineGPU`, `subdivision.cpp:888-910`; `compute.glslfx` `EvalStencils`).

Adaptive patches are off by default:

- `HD_ENABLE_OPENSUBDIV3_ADAPTIVE` defaults to 0 (`hd/meshTopology.cpp:21`);
- `RefinesToBSplinePatches` needs it or `RefineModePatches`
  (`hdSt/meshTopology.cpp:271-275`).

So the viewer's complexity levels need uniform refinement only:

- Far `StencilTable*` (2,809 lines) and the uniform parts of `PatchTable*`;
- `PtexIndices`, `PatchDescriptor`/`PatchParam` and `SparseMatrix`. That is
  about 7.8k upstream lines.

`packages/opensubdiv` had no stencil or patch tables when this plan was
written. They have since been ported into `packages/opensubdiv` itself, with
their provenance in its `PROVENANCE.md`. The reference is OpenSubdiv 3.6.1's
`opensubdiv/far`.

Adaptive refinement (factor above 1 plus Osd GLSL patch source,
`hdst-osd-patch-source`) stays out until after the switch.

### 2.6 MaterialX

Upstream `HdSt_MaterialXShaderGen` derives from MaterialX's GLSL or MSL shader
generators (`hdSt/materialXShaderGen.h`), and `materialXFilter.cpp` (1,758)
drives them. When this plan was written, `packages/materialx` had only MaterialXCore,
MaterialXFormat and the hand-written `genwgsl`. Faithful path:

1. Add ports of MaterialXGenShader, MaterialXGenHw and MaterialXGenGlsl to
   `packages/materialx` (now done: `genshader/`, `genhw/`, `genglsl/`; see its
   `README.md`).
2. Port the `HdSt_MaterialXShaderGen` GLSL variant. Its output is GLSL that the
   translator handles like any glslfx.

The bar is the 41 `testUsdImagingGLMaterialX*` tests. Their native captures need
the reference build's MaterialX, which it has.

## 3. Test bar per area

The tolerance is I-1's for images: every channel within 2/255 and at most 0.5 %
of pixels differing (`imaging-i1.md:894-903`). Stdout and registry tests compare
text. Browser tests run in Safari on port 8804 or higher. They are listed
separately from vitest (`imaging-i1.md:916-934`).

### 3.1 Upstream programs per area

All image programs below exist in the OpenUSD 26.11.1 reference build's `tests/`. 436 of the 461
registered usdImagingGL tests run one program, `testUsdImagingGLBasicDrawing`,
with different stages and flags.

| Area | hdSt / hdx level (driver: `HdSt_TestDriver` / `Hdx_UnitTestDelegate`) | usdImagingGL level (driver: engine) |
|---|---|---|
| Mesh reprs and draw modes | `testHdStBasicDrawing` `--repr hull/smoothHull/wire/wireOnSurf/refined/refinedWire/refinedWireOnSurf/points` at refine levels 0–2, cull styles (`hdSt/CMakeLists.txt:838-1494`); `testHdStDisplayStyle` (`:2417`) | `testUsdImagingGLBasicDrawing` (`:178`), `_leftHanded` (wireOnSurf), `_clipped` |
| Textures | `testHdStDynamicUvTexture` (`:2479`); `testHdStTextureHandleRegistry` (`:2918`), `TextureObjectRegistry` (`:2936`), `SamplerObjectRegistry` (`:2897`); `testHdStPtex` (`:3031`, no binary in the reference build: no Ptex) | `testUsdImagingGLPreviewSurface_Texture` (`:2651`) and 29 more texture tests; `testUsdImagingGLMipmap` (`:4436`); `testUsdImagingGLUsdUdims` (`:3642`) |
| Materials | — | 48 `testUsdImagingGLPreviewSurface*`; `testUsdImagingGLMaterialTag`, `MaterialPrimvars`, `ShadeMaterial` |
| Lighting | `testHdxLightAndShadow` (`hdx/CMakeLists.txt:288`), `testHdxCameraAndLight` (`:269`) | `testUsdImagingGLBasicLighting` (`:312`), `testUsdImagingGLDomeLight_{Zup,Yup}{Front,Back}` (`:455`), `testUsdImagingGLDomeLightTaskController` (`:4749`), `testUsdImagingGLAnimatedLights` |
| Curves | `testHdStCurveDrawing` (`:2353`), `testHdStCurvePrimvarInterpolation` (`:2376`), `testHdStCurvesPrimvars` (`:2411`) | `testUsdImagingGLCurves` and 12 more curve tests (`:334`, `:1019-1044`, `:4017`) |
| Points | `testHdStBasicDrawing --repr points` (`:838`) | `testUsdImagingGLPoints` (`:411`) and 7 more |
| Instancing | `testHdStInstancing` (`:2646`), `testHdStInstancingUnbalanced` (`:2731`) | `testUsdImagingGLInstancing_*`, `testUsdImagingGLPointInstancer_*` (`:1288`, `:1680-1703`), 97 instancing tests in all |
| Subdivision | `testHdStSubdivision` (`:2909`); `testHdStBasicDrawing --refineLevel 1/2` | `testUsdImagingGLSubdivision_*` (`:951`), `testUsdImagingGLBasicDrawing_subdivTagsRefined` (`:258`), `testUsdImagingGLComplexityOsd3` (`:1006`) |
| Ext computations and skinning | — (upstream has no hdSt image test; see the earlier port's scripts below) | `testUsdImagingGLUsdSkelExtCompCPU_*` / `GPU_*` (`:3842-3911`), `testUsdImagingGLSkelBlendShapes` (`:2553`), `testUsdImagingGLSkeleton` (`:2540`) |
| Volumes | — | `testUsdImagingGLSimpleVolumes` (`:3984`), `_Glow` (`:3995`), `testUsdImagingGLVolumeMaterial` (`:4006`), `testUsdImagingGLVdbVolume` (`:5893`) |
| MaterialX | `testHdStMaterialXShaderGen` (`:2757`, text) | 41 `testUsdImagingGLMaterialX*` (`:4925-5100`) |
| Selection and picking | `testHdxPickAndHighlight` (`hdx:433`), `testHdxIdRender` (`:275`), `testHdxPickResolveMode` (`:303`), `testHdxPickTarget` (`:310`), `testHdxUnpickablesAsOccluders` (`:366`), `testHdxPickingWithReprAndRefineChanges` (`:331`) | `testUsdImagingGLPickAndHighlight` (`:1480`), `testUsdImagingGLHighlight` (`:1543`), `testUsdImagingGLInstancePicking_scene0/1` (`:1515`) |
| Task controller, AOVs, present | `testHdxRenderTask` (`:346`), `testHdxPresentTask` (`:284`) | `testUsdImagingGLDomeLightTaskController` (`:4749`, the one registered use of the `testUsdImagingGLTaskController` program), `testUsdImagingGLAovVisualization_Storm_*` (`:4698`), `testUsdImagingGLCameraExposure` (`:4057`) |
| OIT and transparency | `testHdxOitShaderRetention` (`:360`) | `testUsdImagingGLOIT` (`:4897`), `testUsdImagingGLOITPacked` |
| Purpose, cards, resync | — | `testUsdImagingGLPurpose` (`:2285`), `testUsdImagingGLCards` (`:2394`), `testUsdImagingGLResync` (`:2247`) |

**Native captures.** All of the above run from `pxr/testing/upstreamTestManifest.json`
(generated and checked against OpenUSD's source by the capture tooling kept
outside this repository; `FIXTURES.md`):

1. Run the registered command in a copy of the test's `testenv` directory, with
   `DYLD_LIBRARY_PATH` set to the reference build's `lib` and `TF_DEBUG=HD_SAFE_MODE`, as I-1
   did (`imaging-i1.md:865-882`).
2. Collect the written PNGs. Add an `.exr` where the test writes one.

Proposal: one capture (with `--check`; it now runs in the capture tooling kept
outside this repository, `FIXTURES.md`) that takes test names and writes
`<module>/tests/fixtures/<test>/`. Each track
captures only the tests it needs, so fixtures stay small. Upstream's committed
baselines (`testenv/*/baseline/`) come from GL renders on other machines, and
the I-1 rule is native Metal captures. They are not used.

**Drivers that need porting for the bar:**

- `hdSt/unitTestHelper` (TS: 364 of 1,401 lines), the `HdSt_TestDriver` and test
  lighting shader;
- `hdx/unitTestDelegate` (1,462), and `unitTestUtils` (353) for picking;
- `usdImagingGL/unitTestGLDrawing` (1,238) + `testenv/testUsdImagingGLBasicDrawing.cpp`.
  This one is in I-3. It is the most valuable port in the plan: one driver
  unlocks 436 tests.

### 3.2 Capture scripts of an earlier port under the fixture rule

The rule: a script may be reused only with its capture script, only if it runs
against the reference build alone, and only after it is re-run here with
identical output. The scripts come from an earlier, unpublished port of
OpenUSD.

| Script | Reference build only? | Reproduced? | Use |
|---|---|---|---|
| `HdStTests/capture_hdStTestenvImages.sh` | Yes: runs the reference build's `tests/*` with registered arguments. Covers `testHdStBasicDrawing` (all reprs, refine levels 0–2, cull styles, clip planes), `testHdStCurveDrawing`, `testHdStCurvePrimvarInterpolation`, `testHdStPrimGather`, `testHdStInitRepr`, `testHdStDepthBias` | 3 images reproduced byte-identical in I-1 (`imaging-i1.md:940`); the rest not run | I-2 track D (draw modes) and I-4 curves. Re-run all with `--check` first. |
| `HdStTests/capture_hdStTestenvStdout.sh` | Yes | Not run | Stdout ports (buffer, registry tests) |
| `UsdImagingTests/capture_stageSceneIndexContents.sh` | Yes (`tests/testUsdImagingStageSceneIndexContents`) | Not run | i2-usdimaging: upstream `basic.txt` plus captures |
| `UsdImagingTests/capture_testenvStdout.sh` | Yes, with upstream testenv inputs from the OpenUSD source checkout | Not run | i2-usdimaging stdout tests |
| `UsdImagingGLTests/capture_enginePick.sh` | Compiles `pickOracle.cpp` against the reference build only | Not run | I-3 picking (`TestIntersection` per pixel) |
| `UsdImagingGLTests/capture_engineCubeN.sh`, `capture_engineHdx2.sh` | Compile oracles against the reference build only | Not run | I-3 engine (renderer API, bounding box). Prefer registered tests; use these only where none exists. |
| `UsdImagingGLTests/capture_engineSkel.sh` | Reference Python plus `capture_engineCubeN.sh` | Not run | I-4 skinning, CPU and GPU (`USDSKELIMAGING_FORCE_CPU_COMPUTE`) |
| `HdxTests/capture_taskController.sh` | Compiles against the reference build only | Not run | I-3 task controller (legacy `HdxTaskController` text oracle; secondary to the scene-index form) |
| `HioTests/capture_hioGlslfx.sh` | Reference build only | Not run | Already covered by I-1's glslfx tests; optional |
| `HdStTests/capture_extCompImage.sh`, `capture_extCompCurvesImage.sh` | No: need `USD_SRC` for uninstalled `hdSt/unitTestHelper.h` | — | Not under the rule as is. A variant that links the exported symbols with headers copied from the pinned source could qualify. Decide when I-4 needs it. |
| `HdStTests/capture_subdivisionAdaptive.sh` | No: OpenSubdiv headers from the build's dependency prefix | — | Out (adaptive is out of scope anyway) |
| `HdStTests/capture_materialXShaderGen.sh` | No: MaterialX from the build's dependency prefix | — | Out. I-5 should capture `testHdStMaterialXShaderGen` with the 26.11.1 build's own MaterialX. |
| `HdStTests/capture_firstImage.sh` | No (`USD_SRC`) and not an upstream test | — | Out (I-1 already said so) |
| `scripts/asset-acceptance/*` | Not used: this repo's harness supersedes it | — | — |

## 4. Milestones

### 4.1 I-2 (now): surface shading and the stage path

| Track | Scope | Exit |
|---|---|---|
| A. i2-textures (running) | Texture stack and material network in section 2.1. The handover must include: asynchronous texture commit as a documented divergence (replacing `async-texture-commit`); `volume` terminals in the network; `HgiTextureLod`/cube-map accessors in the shader generator (`domeLight.glslfx:205,288`, section 2.3) | `testHdStDynamicUvTexture` image; texture/sampler registry tests; UsdPreviewSurface textured mesh through `HdSt_TestDriver` |
| B. i2-lighting (running) | `HdStSimpleLightingShader`, `HdStLight`, dome light computations, fallback lighting. The handover must include: the lighting context API that `HdxSimpleLightTask` (I-3) feeds | Lighting programs compile in Safari; a lit `testHdStBasicDrawing --repr smoothHull` |
| C. i2-usdimaging (running) | `HdSceneIndexAdapterSceneDelegate`, render index emulation (`renderIndex.cpp:194-251`), the usdImaging scene index chain into the faithful `hdSt`; the Storm scene-index plugins if in its scope | A `UsdStage` mesh drawn by the faithful `hdSt`; `testUsdImagingStageSceneIndexContents`; the `HdUnitTestDelegate` dirty-bit failing tests (`hd/tests/upstream/unitTestDelegate.test.ts`) pass |
| D. Test infrastructure and draw modes (proposed, new) | (1) the testenv image capture (section 3.1); (2) re-run the earlier port's `capture_hdStTestenvImages.sh --check`; (3) the asset-acceptance `features` group with an hdStWgsl baseline (section 1.4); (4) a renderer switch in the harness for comparison runs only; (5) `testHdStBasicDrawing` reprs other than `points` | Fixtures committed; features baseline recorded locally; wire, hull and refined reprs pass |

### 4.2 I-3: the engine and the hdx tasks

This milestone depends on I-2 C, and on I-2 A and B for lit and textured
images.

| Track | Scope (upstream lines) | Exit |
|---|---|---|
| A. Task controller scene index and render tasks | `taskControllerSceneIndex` 3,068, `renderTask` 388, `renderSetupTask` 683, `simpleLightTask` 1,050, `skydomeTask` 424, `shadowTask` 675, `aovInputTask` 475, `presentTask` 274 (WebGPU canvas divergence), `colorCorrectionTask` 1,472 (sRGB mode; OpenColorIO out), `fullscreenShader` 733, hdx glslfx | `testHdxRenderTask`, `testHdxPresentTask`, `testHdxLightAndShadow` |
| B. Engine and driver | `usdImagingGL/engine` 3,857, `renderParams` 183, `unitTestGLDrawing` 1,238, the `testUsdImagingGLBasicDrawing` driver in Safari | `testUsdImagingGLBasicDrawing`, `_BasicLighting`, `_DomeLight_*`, `_Purpose`, `_DomeLightTaskController` |
| C. Selection and picking | `selectionTracker` 822, `selectionTask` 309, `selection.glslfx` 476 + selection render pass shaders, `pickTask` 2,454, `pickFromRenderBufferTask` 451, `TestIntersection` | `testHdxPickAndHighlight`, `testHdxIdRender`, `testUsdImagingGLPickAndHighlight`, `testUsdImagingGLHighlight` |
| D. Storm scene-index plugins (if not in I-2 C) | 12 plugins plus the hdsi scene indices they create (about 10k) | Their hdsi stdout tests (`hdsi/CMakeLists.txt`, 5 registered) |

Tracks A and C share `renderSetupTask` and the render pass shaders, so A goes
first. B can start on a fallback-only path in parallel.

### 4.3 I-4: geometry

| Track | Scope | Exit |
|---|---|---|
| A. Curves and points | `HdStBasisCurves`, `HdStPoints`, their shader keys; HgiWebGPU tessellation factors above 1 and point expansion (section 2.2); `primitive_index` | `testHdStCurveDrawing` lv0/lv1, `testHdStCurvePrimvarInterpolation`, `testHdStBasicDrawing --repr points`, `testUsdImagingGLCurves`, `testUsdImagingGLPoints`; viewer Points draw mode |
| B. Instancing | `hdSt/instancer` completion, `instancing.glslfx`, instance culling, `hd-instancer-builtin-names`; NI/PI propagating scene indices if i2-usdimaging did not finish them | `testHdStInstancing`, `testHdStInstancingUnbalanced`, `testUsdImagingGLInstancing_*`, `testUsdImagingGLPointInstancer_*`, `testUsdImagingGLInstancePicking_*` |
| C. Ext computations and skinning | `hdSt/extComp*` 2,471, `hd` ext computation completion, usdSkelImaging scene-index ext computations (`extComputations.cpp`, `dataSourceResolvedPointsBasedPrim.cpp`) | `testUsdImagingGLUsdSkelExtCompCPU_*`, `..GPU_*`, `testUsdImagingGLSkelBlendShapes`; the earlier port's `capture_engineSkel.sh` fixtures reproduced |
| D. OpenSubdiv (uniform) | Far stencil and patch tables (section 2.5), `HdSt_Subdivision`, GPU stencil evaluation | `testHdStSubdivision`, `testHdStBasicDrawing --refineLevel 1/2`, `testUsdImagingGLSubdivision_*`, `..._subdivTagsRefined` |
| E. Viewer adapter (starts late in I-4) | The runtime on `UsdImagingGLEngine` behind the temporary comparison switch; map section 1.5's calls onto `UsdImagingGLRenderParams` | Viewer vitest green on both paths; first full asset-acceptance run on the faithful path |

Track D can start at any time: its Far work is independent of every other
track. The same holds for track A's HgiWebGPU emulation design.

### 4.4 I-5: MaterialX, volumes, OIT

| Track | Scope | Exit |
|---|---|---|
| A. MaterialX | Vendor GenShader, GenHw and GenGlsl (section 2.6); `HdSt_MaterialXShaderGen` (GLSL); `materialXFilter`; `hdMtlx` completion | `testHdStMaterialXShaderGen` text (captured from 26.11.1's MaterialX); `testUsdImagingGLMaterialXBasic_*`, `..Textured_*` |
| B. OIT | `oitRenderTask` 346, `oitResolveTask` 598, `oitBufferAccessor`, OIT shaders (atomics) | `testUsdImagingGLOIT`, `testHdxOitShaderRetention`; `alpha_blend_mode` asset |
| C. Volumes (after B) | Section 2.4: dense textures, `HdStVolume`, field, volume shader, `oitVolumeRenderTask`; `hioOpenVDB` dense; `usdVolImaging` adapters | `testUsdImagingGLSimpleVolumes`, `_Glow`, `testUsdImagingGLVolumeMaterial`, `testUsdImagingGLVdbVolume` |

### 4.5 I-6: switch and delete

1. **Comparison.** Run the full asset-acceptance set plus the `features` group,
   three runs per renderer, scored as in section 1.3. Run the performance
   guard.
2. **Feature parity.** Every row of section 1.5 is green:
   - the upstream tests of section 3 for that feature pass, or are failing
     `it()`s accepted as known divergences;
   - the 12 draw-mode native captures
     (`pxr/usdImaging/usdImagingGL/tests/fixtures/native/drawModes`) pass
     through the engine;
   - hdStWgsl's 24 native-capture fixture directories have moved (section 1.6);
   - viewer vitest (626) and `vite build` pass.
3. **Switch.** Make the faithful path the only path. Remove the comparison
   switch the same day, as decided (`imaging-i1.md`, Decisions).
4. **Delete.** Remove everything in section 1.6. That includes the hdStWgsl
   tests and the hd/hgi/pxOsd seams. Re-run the library gate. The 48 known
   failures may drop, and none may appear.

**The switch point is the end of I-6.** It cannot move earlier: volumes,
MaterialX and picking are viewer features now (`runtime.ts:46-58,487`). The
only way to switch earlier would be to drop those features from the viewer for
a period, which the freeze decision does not allow.

### 4.6 Parallel lanes at a glance

```
I-2  A textures ─┐  B lighting ─┐  C usdImaging path ─┐  D test infra + reprs
I-3              └──────────────┴── A tasks ── C selection/pick
                                    B engine + driver ── D Storm plugins (if needed)
I-4  D OpenSubdiv/Far (can start in I-2) ── A curves/points (emulation can start in I-2)
     B instancing ── C extComp/skinning ── E viewer adapter
I-5  A MaterialX ── B OIT ── C volumes
I-6  comparison ── parity ── switch ── delete
```

## 5. Risks

1. **New WebGPU emulation (tessellation factors above 1, point expansion).**
   Refined curves, points, and Points draw mode depend on it, and there is no
   upstream template. Mitigation: design both in HgiWebGPU's shader generator
   and command buffer only, so Storm's code stays unchanged. Start in I-2 as a
   design note with a Safari probe.
2. **Draw-loop cost.** Every draw is a JavaScript call, and GPU culling does not
   skip patch draws (`graphicsCmds.ts:369`). chess is the
   case to measure. Mitigation: the performance guard (section 1.3), measured
   from I-4 E onwards, not first at I-6. `indirect-first-instance` is
   available for non-patch draws.
3. **MaterialX through the GLSL generator.** This needs about 10k vendored TS
   lines and the translator on generated MaterialX GLSL, which no corpus covers
   yet. hdStWgsl's WGSL MaterialX scores 5.35 % on `mtlx_basic`. The faithful
   path must not regress it.
4. **Serial dependencies.** The usdImagingGL bar needs the engine (I-3), the
   engine needs the stage path (I-2 C), and lit or textured images need I-2 A
   and B. A slip in I-2 C delays everything after it. Mitigation: I-2 D and
   I-4 D need none of these and start immediately.
5. **Harness and tooling.**
   - Safari-only, with the window visible, and slow runs: the I-1 asset run
     took most of a session.
   - McUsd is nondeterministic once in 5 runs, so 3 runs per renderer and the
     tie band are required.
   - Upstream baselines are GL; native Metal captures are required.
6. **Asynchronous readback through picking and texture commit.** These
   divergences touch hdx tasks, which upstream writes synchronously. They must
   be designed once in Hgi and the engine (I-1 risk 4), not patched per task.
7. **Scope creep in usdImaging.** Upstream usdImaging is 68,418 lines, and the
   TS port has 2,936. The switch needs only what the asset set and the features
   group exercise. i2-usdimaging should report coverage against those scenes,
   not against upstream line counts.

## 6. Decisions proposed

1. Adopt the scoring rules (section 1.3): 3 runs, the tie band, matching assets
   must stay matching, zero regressions, reviewed exceptions in `notes.json`.
2. Add the `features` group (section 1.4) and baseline hdStWgsl on it now.
3. Adopt the performance guard as a switch gate (section 1.3), or record it
   only.
4. Volumes: dense 3D textures with upstream's 128 MiB per-field budget
   (section 2.4). This drops the NanoVDB sparse divergence from `hio`.
5. Far stencil and patch tables: port them locally into `packages/opensubdiv`
   with provenance, or in the separate OpenSubdiv port first (section 2.5).
6. MaterialX: vendor GenShader, GenHw and GenGlsl from the separate MaterialX port
   (section 2.6), and retire `packages/materialx/genwgsl` at the deletion.
7. A temporary renderer switch in the viewer runtime and the harness, from I-4 E
   until the I-6 deletion only.
8. Tessellation factors above 1 (section 2.2.1): port the Direct3D 11
   fixed-function tessellator's fixed-point algorithm (what Apple's
   tessellator matches) into HgiWebGPU with that specification as its cited
   source, or accept refined curves (and adaptive subdivision) as
   approximate with a looser per-test tolerance. *Decided: port; done.*

## Appendix: reproduction

```
# Debt tags (run in packages/usd/pxr)
grep -rno "FAITHFULNESS-DEBT([A-Za-z0-9-]*)" imaging usdImaging | grep -v /tests/
# Upstream line counts: h + cpp, e.g.
cat "$OPENUSD_SOURCE"/pxr/imaging/hdx/taskControllerSceneIndex.{h,cpp} | wc -l
# Registered usdImagingGL tests and their programs
grep -oE "tests/testUsdImagingGL[A-Za-z]+" \
  "$OPENUSD_SOURCE"/pxr/usdImaging/usdImagingGL/CMakeLists.txt | sort | uniq -c
# hdStWgsl baseline numbers
python3 -I -c "import json; r=json.load(open('<scratch>/release/i1-assets/out/report.json'));
[print(x['id'], x['stats']['significant']) for x in r['rows']]"
```

Outputs (not in the repository):

- `usdImagingGL-tests.txt`: the 461 registered names;
- `debt-tags.txt`: the debt tags by module.

## Decisions (November 5, 2026)

1. **Bar:** adopted as written in section 1.3: 3 runs per renderer, the median per asset with
   the tie band, zero regressions, assets that match today must stay matching. The
   `features` group (section 1.4) is added and hdStWgsl is baselined on it before deletion.
   The performance guard gates the final switch.
2. **Volumes:** dense 3D textures as upstream (128 MiB per field, larger grids downsampled).
   The NanoVDB sparse ray-marching divergence is dropped from the faithful port; NanoVDB
   stays only as the `.vdb` reader.
3. **OpenSubdiv:** Far stencil and patch tables are ported locally into
   `packages/opensubdiv`, recorded in its `PROVENANCE.md`.
4. **MaterialX:** GenShader, GenHw and GenGlsl are vendored from the separate MaterialX port so Storm uses
   upstream's MaterialX path; `packages/materialx/genwgsl` is retired at the deletion.
5. **Temporary renderer switch:** allowed in the viewer runtime and the harness from I-4 until
   the I-6 deletion only, for side-by-side comparison.

## Decision: one faithful implementation, no backup renderer (November 5, 2026)

This supersedes the freeze-then-delete plan (imaging-i1.md decisions; sections 1 and 4.5 above)
and decision 5 (temporary renderer switch). Principle, as for copy-on-write: where upstream's
systems can be supported faithfully in idiomatic TypeScript, there is one implementation that
does that, and no parallel fallback.

- `hdStWgsl` and everything that exists only to serve it are deleted as soon as the in-flight
  UsdImaging track is merged: the hgi compat command layer, the `*SchemaWgsl` copies, the
  frozen dirty-bit translator copy, `packages/materialx/genwgsl`, the hand-written hdx pick task,
  and the NanoVDB sparse volume path. The viewer renders only through the faithful `hdSt`. No
  renderer switch.
- Until the remaining milestones land, scene features the faithful port does not draw yet
  (MaterialX, volumes, picking/selection highlight, smooth subdivision, refined curves) are
  diagnosed in the viewer, never drawn wrongly in silence.
- The asset-acceptance bar compares the faithful renderer with native OpenUSD only (pixels and
  diagnostics like for like with usdrecord/usdview), no longer with a second renderer.
- Refined curves: port the Direct3D 11 fixed-point tessellator from its specification (cited),
  so tessellation factors above 1 match native pixels.
- Last commit with the hand-written renderer, for demos and comparison: `15513a1`.
- Done: hdStWgsl, usdImagingWgsl, the hgi compat layer, the `*SchemaWgsl` copies, the frozen
  dirty-bit translator, `packages/materialx/genwgsl`, the hand-written pick task, usdSkelImaging's
  CPU resolving scene index and the NanoVDB WGSL sampling path are deleted; the 24 native fixture
  directories of section 1.6 moved to `pxr/usdImaging/usdImagingGL/tests/fixtures/native/`.

**Note (November 5, 2026):** the text-only port of hgiGL's shader generator and the nine
`testHdStCodeGen_GL_*` registrations it enabled were removed. They were not on the WebGPU path;
Storm's generated GLSL is checked byte for byte against the native build's own output instead
(the depthBias, textured, lit and curve codegen fixtures).
