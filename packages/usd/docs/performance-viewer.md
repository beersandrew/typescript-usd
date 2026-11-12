# Viewer performance: the faithful renderer against native OpenUSD

Status: measurements and a proposed order of fixes; steps 1-4 are landed
("Results of steps 1-4" below; the sections before it describe base
`5520e345`). It times the viewer as it renders, only through
`UsdImagingGLEngine` (usdImaging scene index chain, Hydra, `hdSt`,
`HgiWebGPU`), in Safari, against OpenUSD 26.11.1's own `UsdImagingGLEngine`
(Storm on HgiMetal) on the same scenes, and lists where the time goes. It
also wires the performance guard of `imaging-i2.md` section 1.3 (adopted in
its Decisions of November 5, 2026) into the asset report. The shape follows
`performance-p1.md`.

Citations: `upstream/...` is `pxr/...` of OpenUSD 26.11.1 (`$OPENUSD_SOURCE`); other paths are
in this package (`packages/usd/`) unless they start with `apps/usdview/`.
Library line numbers are at `5520e345`.

The dated sections below record the commands as they were run then. Since
then the native program (`native/viewerPerf.cpp`) and the harness's native
steps (and with them `--skip-native` and `--skip-usdview`) have moved to the
capture tooling kept outside this repository (`FIXTURES.md`); the scripts
here consume the native results it writes into `--out`.

## Measurements

Three instruments, all in `apps/usdview/scripts/`:

- **Safari, through the viewer.** The asset-acceptance harness
  (`asset-acceptance/run.mjs`, `harness.ts`) opens each prepared scene
  (the harness's native half: the asset subLayered under `/AcceptanceCam`) with the
  viewer runtime, as the `<usd-viewer>` element does, at 512 x 512.
  Every run records `openMs`, the `usdview:<phase>` spans the runtime
  already emits (`apps/usdview/src/load-timing.ts`), the last frame's CPU
  time (`frameRendered`), the settled time and, for BrainStem, playback.
  `run.mjs --perf` adds (`harness.ts` `measurePerf`,
  `viewer-perf/probe.ts`): phase spans around the engine's steps
  (`performance.now()` wrappers on `UsdImagingGLEngine.PrepareBatch`/
  `RenderBatch`, `HdEngine.Execute`, `HdRenderIndex.SyncAll`/
  `CommitResources`, every `hdx` task's `Prepare`/`Execute`,
  `HdSt_CodeGen.Compile`, the GLSL to WGSL translator, `HgiWebGPU`
  shader/pipeline creation and submission); WebGPU buffer and texture bytes
  and draw calls (prototype wrappers); Storm's own memory accounting
  (`UsdImagingGLEngine.GetRenderStats`); an orbit (`runtime.orbitOnce`,
  3 s, one redraw per animation frame) and a 120-frame wrap-around
  playback, each frame with its CPU time, its animation-frame interval and
  the latency until `GPUQueue.onSubmittedWorkDone`. Web Inspector's
  timeline is not automatable; these spans are its substitute.
- **Native.** The native program (run with the capture tooling kept
  outside this repository, `FIXTURES.md`, which writes its timings into
  `viewer-perf/run.mjs`'s `--out`), built against the OpenUSD 26.11.1
  reference build, configures `UsdImagingGLEngine` as
  `UsdAppUtilsFrameRecorder::Record` does (`upstream/usdImaging/usdAppUtils/
  frameRecorder.cpp:55-75, 380-468`) and times: `UsdStage::Open`; the first
  `Render` (CPU) and until its GPU work completed; `Render` until
  `IsConverged` (frameRecorder's loop) and the color AOV readback
  (`HdStTextureUtils::HgiTextureReadback`); 60 orbit frames (the free camera
  turned about the bounds centre) and 120 playback frames, each timed for
  the `Render` call and until the GPU finished; `GetRenderStats`
  (`upstream/imaging/hdSt/renderDelegate.cpp:271-288`) and peak RSS.
  Five fresh processes per asset.
- **Node, CPU only.** `viewer-perf/node.ts` runs the viewer's own engine
  class (`apps/usdview/src/stage-view-engine.ts`) on a stub WebGPU device
  (`viewer-perf/null-gpu.ts`): every CPU step of a frame runs (scene index
  chain, Hydra sync, Storm commit, code generation and translation,
  `HgiWebGPU` encoding), nothing is drawn. Same scene, camera, orbit and
  playback as native. Three timed processes per asset, then one more under
  the V8 sampling profiler (`node:inspector`, 100 µs) per step (open, first
  render, orbit, playback); `viewer-perf/inclusive.mjs` maps inclusive time
  per function to sources through the bundle's source map.

`viewer-perf/run.mjs` runs the Node half, keeps the native half's timings
that the capture tooling kept outside this repository (`FIXTURES.md`) wrote
into `--out`, and joins them with the Safari runs (`--safari DIR` with
`guard/` and `perf/`).

Assets (`viewer-perf/assets.json`): CarbonFrameBike, Vehicle, OpenChessSet, McUsd, BrainStem, AnimatedCube from
the ASWF assets at 091bb5c, and `testUsdImagingGLUsdSkel/arm.usda` over its
time range (1-10).

**Conditions.** Apple M4 Pro, 12 cores, 24 GB; Safari 27.2 (WebKit
605.1.15); Node v24.7.0; the OpenUSD 26.11.1 reference build (Metal). The
machine was shared with other builds and test runs throughout: 1-minute
load averages were 8-27 during the Safari runs used below (an earlier set
at 37-200 is not used) and 12-27 during the native and Node runs. Treat
single numbers as indicative and ratios within about 1.5x as noise; the large ratios below
held in every repeat. Native first-draw times are bimodal: the first
process after a pause pays Metal's shader compilation (CarbonFrameBike 3,435 ms
cold, 289 ms warm); medians are reported. The harness serves the viewer
from Vite's dev server, unbundled, so module loading
(`usdview:materialx-module`, `usdview:imaging-module`) is slower than a
production build; it is shown separately.

## Results

### Load and steady state

Safari columns: medians of three runs of the asset-acceptance set
(`run.mjs --runs 3`) for load, one `--perf` run for the orbit. Native:
median of five processes. Node: median of three processes.

| Asset | Stage open: native / Safari / Node (ms) | First draw: native median (warm) / Safari / Node first Render (ms) | Converged image: native / Safari (ms) | Safari / native, first draw | Safari / native, converged | Orbit CPU per frame: native / Safari / Node (ms) | Orbit frame: native GPU-synced / Safari interval, GPU latency (ms) | Draws per frame (Safari) |
|---|---|---|---|---:|---:|---|---|---:|
| CarbonFrameBike | 141 / 519 / 1,050 | 3,435 (289) / 868 / 974 | 3,435 / 1,851 | 0.3x (3.0x warm) | 0.5x (6.4x warm) | 0.41 / 4 / 3.2 | 1.8 / 17, 7 | 334 |
| Vehicle | 6 / 87 / 91 | 98 (95) / 165 / 276 | 98 / 281 | 1.7x | 2.9x | 0.21 / 2 / 1.4 | 0.75 / 17, 2 | 18 |
| OpenChessSet | 46 / 164 / 263 | 564 (407) / 726 / 551 | 565 / 5,906 | 1.3x | **10.5x** | 0.85 / 5 / 1.2 | 9.5 / **78, 150** | 27 |
| McUsd | 14 / 40 / 44 | 275 (130) / 173 / 283 | 275 / 746 | 0.6x | 2.7x | 0.93 / 6 / 0.9 | 1.6 / 17, 4 | 29 |
| BrainStem | 15 / 47 / 48 | 238 (195) / 287 / 500 | 239 / 299 | 1.2x | 1.3x | 0.98 / 3 / 1.3 | 1.9 / 17, 7 | 62 |
| AnimatedCube | 14 / 50 / 8 | 227 (158) / 96 / 105 | 228 / 172 | 0.4x | 0.8x | 0.84 / 2 / 0.9 | 1.2 / 17, 2 | 4 |
| skel_arm | 11 / 21 / 4 | 127 (98) / 95 / 107 | 128 / 103 | 0.7x | 0.8x | 0.86 / 2 / 0.9 | 1.6 / 17, 1 | 4 |

- *Stage open*: native `UsdStage::Open`; Safari the `usdview:open` span;
  Node `Stage.open`.
- *First draw*: native from open to the first `Render`'s GPU work done,
  including the engine's construction (the "warm" figure is the fastest of
  the five processes, with Metal's shader cache warm); Safari from open to
  the end of the first engine `Render` (`usdview:open`, `scene-indices`,
  `validation-render` and the small spans between; module loading
  excluded, see below); Node the first `Render` alone, CPU only.
- *Converged image*: native until `IsConverged` and the color readback;
  Safari `runtime.open()` resolving (it waits for convergence, `settle`,
  and presents the first frame), module loading excluded.
- *Orbit*: one turn about the bounds centre. Native CPU is the `Render`
  call, "GPU-synced" until its GPU work completed. Safari CPU is the
  runtime's `frameRendered` time (1 ms timer resolution), the interval is
  between animation frames (17 ms is the display's 60 Hz: the frame fit),
  GPU latency is until `onSubmittedWorkDone` after the frame. Node is the
  CPU of the same `Render` with no GPU.
- *Module loading* (not in the columns): `usdview:materialx-module` plus
  `imaging-module` took 159-377 ms per asset in Safari from the dev server;
  the runtime awaits the MaterialX module before opening the stage
  (`apps/usdview/src/runtime.ts:549`). A production build will differ; it
  is not a renderer cost.
- The guard's `settledMs` (page start to two identical captures) adds the
  page start-up and the harness's capture loop (250 ms, then 1 s per
  capture, `apps/usdview/scripts/asset-acceptance/harness.ts`); it is
  1.65-7.65 s here and is meant for comparisons with the same harness only.

Native first draws are bimodal (Metal shader compilation in a cold
process): CarbonFrameBike took 3.4-3.6 s in three processes and 0.29 s in
two. Against warm native processes the browser's first draw is 0.6-3.0x
native (CarbonFrameBike 3.0x); the converged image is up
to 10.5x slower where many textures load (OpenChessSet). Orbit redraws cost
2-10x native CPU per frame (CarbonFrameBike 9.8x,
Vehicle 9.5x, McUsd 6.5x, OpenChessSet 5.9x) but fit the 60 Hz frame on
every asset except OpenChessSet, which is GPU-bound at 13 frames per second
(native: about 100).

### Playback

120 frames over the stage's time codes, wrapping. Native and Node: per
frame, `Render` at the new time. Safari: per time code, `setTime` then the
next animation frame (`harness.ts` `measurePerf`), so 16.7 ms is the
display's floor; the engine's own work per time code is from the phase
spans.

| Asset | Native CPU / GPU-synced (ms) | Safari wall per time code (ms) | Safari engine work per time code (ms) | Node CPU (ms) | Safari engine / native CPU | Guard p95 (Safari / hdStWgsl baseline, ms) |
|---|---|---:|---:|---:|---:|---|
| BrainStem | 5.75 / 7.7 | 22.0 | 12.2 (`SyncAll` 8.0, commit 1.9) | 14.5 | 2.1x | 29 / 18 (limit 39) |
| CarbonFrameBike | 2.96 / 4.9 | 58.4 | 27.0 (`SyncAll` 17.0, task execute 7.9) | 41.4 | 9.1x | - |
| AnimatedCube | 0.53 / 0.9 | 16.6 | 2.7 | 0.6 | 5x | - |
| skel_arm | 0.74 / 1.5 | 16.6 | 2.3 | 0.8 | 3x | - |

BrainStem plays at about 45 frames per second in Safari (native: 130).
CarbonFrameBike, whose wheels and cranks are animated (174 time-varying
xforms over 331 meshes), plays at about 17 (native: 200). The two small
assets reach the display rate.

### Memory

| Asset | Storm `gpuMemoryUsed`: native / Safari (MB) | of which textures (both) | WebGPU bytes allocated by the page, live after load (MB) | Native peak RSS (MB) | Node heap after the first Render (MB) |
|---|---:|---:|---:|---:|---:|
| CarbonFrameBike | 156.0 / 81.9 | 74.1 | 94.5 | 270 | 166 |
| Vehicle | 12.8 / 6.5 | 6.3 | 19.1 | 102 | 93 |
| OpenChessSet | 1,340 / 714 | 627 | 1,046 | 993 | 121 |
| McUsd | 102.4 / 76.9 | 25.4 | 98.2 | 128 | 81 |
| BrainStem | 15.8 / 10.0 | 6.3 | 22.8 | 108 | 144 |
| AnimatedCube | 18.2 / 9.1 | 9.1 | 21.7 | 98 | 79 |
| skel_arm | 12.6 / 6.3 | 6.3 | 18.9 | 76 | 84 |

Storm's accounting is `UsdImagingGLEngine::GetRenderStats`
(`upstream/imaging/hdSt/renderDelegate.cpp:271-288`) on both sides; the
texture bytes match exactly, the buffer bytes are lower here (Metal's buffer
arrays are allocated larger). The WebGPU column counts every buffer and
texture the page created (Storm's, the viewer's AOVs, overlays, MSAA
targets), by format and mip chain (`harness.ts` `installGpuCounters`).
Safari exposes no JS heap measure (`performance.memory` is absent, and
`measureUserAgentSpecificMemory` is not implemented), so the heap column is
Node's `process.memoryUsage().heapUsed` for the same scene and engine, an
estimate of the browser's heap, not a measurement of it.

## Where the time goes

### Load: open to first image

Safari phase spans of the load (`--perf` run; inclusive, so nested spans
are also in their parents), then the Node profile of the first `Render`
(inclusive time per function, the engine's own call chain omitted).

| Asset | First `Render` in Safari | `SyncAll` | Task execute (draw, incl. compile) | `CodeGen.Compile` | of which GLSL to WGSL | `CommitResources` | Waiting for textures (`settle`) |
|---|---:|---:|---:|---:|---:|---:|---:|
| CarbonFrameBike | 585 | 204 | 314 | 158 | 144 | 42 | 810 |
| Vehicle | 140 | 43 | 78 | 43 | 38 | 6 | 106 |
| OpenChessSet | 1,714 | 455 | 549 (with OIT) | 177 | 171 | 777 | 5,003 |
| McUsd | 501 | 102 | 337 (with OIT) | 177 | 163 | 52 | 502 |
| BrainStem | 207 | 134 | 38 | 23 | 25 | 23 | 0 |

(ms; all `Render` calls up to the converged image, so OpenChessSet's and
McUsd's include the renders made while textures load.)

Top costs, Node first `Render` (inclusive, % of the step):

1. **Mesh sync through the scene index chain** (CarbonFrameBike 36%,
   OpenChessSet 43%): `HdStMesh::Sync` →
   `_UpdateDrawItem` (`pxr/imaging/hdSt/src/mesh.ts:2545`) →
   `HdStPopulateConstantPrimvars` (`hdSt/src/primUtils.ts:922`) and `HdStGetPrimvarDescriptors` (`hdSt/src/primUtils.ts:193` →
   `hd/src/sceneIndexAdapterSceneDelegate.ts:2171`
   `_ComputePrimvarDescriptors`, 25%). Each `Get` walks the filtering chain:
   `hd/src/overlayContainerDataSource.ts:65` (35%),
   `hd/src/flatteningSceneIndex.ts:183`,
   `usdImaging/src/materialBindingsResolvingSceneIndex.ts:280`,
   `hdsi/src/materialPrimvarTransferSceneIndex.ts:124,200`,
   `usdImaging/src/selectionSceneIndex.ts:223`,
   `hdSt/src/dependencySceneIndexPlugin.ts:197` (15-18% each, nested), down
   to USD attribute resolution (`usd/usd/src/stage.ts:2577`
   `_resolveAttributeImpl` 14%, `usd/usd/src/attributeQuery.ts:27`).
   Upstream has the same chain (`upstream/imaging/hd/
   sceneIndexAdapterSceneDelegate.cpp`); the cost is the per-`Get` work in
   TypeScript.
2. **Topology** (OpenChessSet 28%): `HdStMesh::_PopulateTopology`
   (`hdSt/src/mesh.ts:751`) → `HdMeshTopology` construction
   (`hd/src/meshTopology.ts:93`, 22%) and its hash
   (`pxOsd/src/meshTopology.ts:110` → `PxOsd_HashInts`,
   `pxOsd/src/subdivTags.ts:23`, 10% in the first measurement).
3. **Shader code generation and translation** (Vehicle 22%, OpenChessSet
   13%, McUsd 35% of the Safari first render): `HdSt_CodeGen::Compile`
   (`hdSt/src/codeGen.ts:3198`) → `HgiWebGPUShaderFunction`
   (`hgiWebGPU/src/shaderFunction.ts:61`) → the GLSL to WGSL translator
   (`hgiWebGPU/src/glsl/translator.ts:120`; parser
   `glsl/parser.ts:43-532`, lexer `glsl/lexer.ts:74`, checker). The
   translation is 84-92% of `Compile`. It has no native counterpart (Metal
   compiles MSL generated directly).
4. **Material networks** (McUsd 37%): `HdStMaterial::Sync`
   (`hdSt/src/material.ts:143`) → `GetMaterialResource`
   (`hd/src/sceneIndexAdapterSceneDelegate.ts:1944`) →
   `_ToMaterialNetworkMap`/`_Walk` (`:706`, `:602`) →
   `usdShade/src/connectableAPI.ts:372,548` (value-producing attributes).
5. **Population** (`usdImaging.SetStage`, CarbonFrameBike 17%): the
   `PrimsAdded` fan-out through the chain (`hd/src/sceneIndex.ts:85-101`,
   `hd/src/filteringSceneIndex.ts:50`).
6. **Stage open** (not imaging, `performance-p1.md` covers it):
   CarbonFrameBike USDA parsing (`sdf/src/textFileFormatParser.ts`, 66%).
7. **Texture loading to convergence** (Safari only; Node decodes no
   images): OpenChessSet waits 5.0 s in `settle` for 627 MB of textures and
   spends 1.2 s in the renders made meanwhile (`revalidate-render`);
   CarbonFrameBike 0.8 s, McUsd 0.5 s. Natively Storm loads textures
   during the commit of the first `Render` (`IsConverged` is true after
   one `Render` on every asset here). This phase has no per-texture spans
   yet: fetch, `createImageBitmap` decode (at the time in `hio/src/stbImage.ts`) and
   upload cannot be told apart from these numbers.

### Steady state: orbit redraws

Per orbit frame, Safari phase spans (ms per frame): OpenChessSet 5.9
(render 3.0, OIT 1.3); McUsd 5.7; CarbonFrameBike 3.7. Sync and commit are
under 0.3 ms per frame on every asset: an orbit dirties nothing but the
camera, as upstream.

Top costs, Node orbit of the heaviest scene profiled, a local production set outside the asset list (inclusive):

1. **CPU frustum culling, 42%**: `HdStCommandBuffer::_FrustumCullCPU`
   (`hdSt/src/commandBuffer.ts:512`) →
   `HdStDrawItem::IntersectsViewVolume` (`hdSt/src/drawItem.ts:149`) →
   `GfFrustum::IntersectsViewVolume` (`base/gf/src/frustum.ts:966`), which
   allocates eight `GfVec4d`, a matrix product and eight transformed
   vectors per draw item per frame (`GfVec` construction alone is 21% of
   the orbit); `GfBBox3d.GetRange` (`base/gf/src/bbox3d.ts:104`) adds 8%.
   Storm culls on the CPU when the backend has no multi-draw-indirect
   (`upstream/imaging/hdSt/commandBuffer.cpp:271-288,564-611`); HgiWebGPU
   reports none (`hgiWebGPU/src/capabilities.ts:45`), so this is the
   faithful path. Natively, Metal culls on the GPU and the CPU cost is
   absent; upstream's CPU cull also runs in parallel (`WorkParallelForN`,
   commandBuffer.cpp:592).
2. **Per-draw encoding of emulated patch draws, 19%**:
   `HgiWebGPUGraphicsCmds::_DrawPatches` (`hgiWebGPU/src/graphicsCmds.ts:517`)
   → `_PatchConstantsBindGroup` (`:562`, 17%): a `Uint32Array`, a `Map` and a
   uniform slice per draw, written with `queue.writeBuffer`
   (`HgiWebGPUConstantsAllocator.AllocateSlot`,
   `hgiWebGPU/src/resourceBindings.ts:216`, which also copies into a fresh
   padded array). Metal passes these with `setVertexBytes`
   (`upstream/imaging/hgiMetal/stepFunctions.mm:76-104`).
3. **The draw loop itself**: `HdSt_PipelineDrawBatch::ExecuteDraw`
   (`hdSt/src/pipelineDrawBatch.ts:1393`) issues one draw per item
   because there is no multi-draw-indirect
   (`imaging-i1.md:699-702`); natively Storm encodes each batch as one
   indirect multi-draw.
4. **GPU time (OpenChessSet only)**: the orbit is GPU-bound in Safari, 150 ms
   from submission to completion per frame and a 78 ms frame interval,
   against 9.5 ms GPU-synced natively; CPU per frame is 5 ms. The 27 draws
   include OIT (`hdx.OitRenderTask`, `OitResolveTask`). Which pass costs it
   needs a Metal frame capture of Safari's GPU process (manual; not
   automatable here). The texture bytes are the same as native (627 MB).

### Playback

Top costs, Node playback (inclusive, % of the step):

- **BrainStem** (per frame: Node 14.5 ms, Safari engine 12.2 ms, native
  5.75 ms CPU):
  1. ExtComputation sync, 37%: `HdStExtComputation::Sync`
     (`hdSt/src/extComputation.ts:72`) →
     `GetExtComputationInput` (`hd/src/sceneIndexAdapterSceneDelegate.ts:2844`,
     27%) → the resolved skeleton (`usdSkelImaging/src/
     dataSourceResolvedSkeletonPrim.ts:408,859`) → skinning transforms
     recomputed (`usdSkelImaging/src/skelData.ts:219`, 19%;
     `_ComputeJointLocalTransforms`, `:116`, 15% in the first
     measurement).
  2. Points sync, 30%: `HdStMesh::_PopulateVertexPrimvars`
     (`hdSt/src/mesh.ts:1345`), of which the material binding resolved again
     for every `primvars` `Get`: `hdsi/src/materialPrimvarTransferSceneIndex.ts:63`
     `_GetMaterialPath` → `usdImaging/src/materialBindingsResolvingSceneIndex.ts:79`
     → relationship targets (`usd/usd/src/relationship.ts:60`), 25%.
  3. Commit, 10%: `HdStResourceRegistry::_Commit`
     (`hdSt/src/resourceRegistry.ts:1038`).
- **CarbonFrameBike** (per frame: Node 41 ms, Safari engine 27 ms, native
  3.0 ms): 59% under `HdSceneIndexAdapterSceneDelegate::GetTransform`
  (`hd/src/sceneIndexAdapterSceneDelegate.ts:2647`) from
  `HdStPopulateConstantPrimvars`: every mesh below the 174 animated xforms
  re-flattens its transform (`hd/src/flattenedXformDataSourceProvider.ts:66`
  → `hd/src/xformSchema.ts:31`), which builds a `UsdGeomXformable::XformQuery`
  (`usdImaging/src/dataSourcePrim.ts:1020`; `usd/usdGeom/src/xformable.ts:321`,
  30%) and resolves attributes (`usd/usd/src/stage.ts:2577`, 33%;
  `usd/usd/src/prim.ts:1271,1316`). Upstream does the same work per dirtied
  prim (`upstream/usdImaging/usdImaging/dataSourcePrim.cpp:741-861`); the
  cost is the USD read path.
- **AnimatedCube, skel_arm**: under 3 ms of engine work per frame; the
  remaining per-frame cost is the fixed task overhead
  (`hdx.RenderSetupTask.Prepare` 0.3 ms, `RenderTask.Prepare` 0.2 ms,
  skydome 0.2 ms, every frame).

### A long animated review scene (November 7, 2026)

A review scene of 17 units placed one after another on a 3,528-frame
timeline (24 fps, a scene camera): each unit sits under a carrier xform
whose `xformOp:transform` and `visibility` are time-sampled, and the units
animate with value clips (walking robots: 4 lanes, each robot with 4
onion-skin copies, the same clips referenced again under layer offsets),
splines (balls whose trails are the spline referenced under 48 layer
offsets) and time samples. It played at about 6 fps in Safari against about
23 natively. Measured in Node (`viewer-perf/node.ts <scene> --camera <path>
--from T --playback 48`, stub GPU) and natively (`native/viewerPerf.cpp`,
same options, Storm on HgiMetal), standalone playback, 512x512.

**Where.** A sweep of every frame (one process per complexity) is flat:
48-56 ms per frame in Node across the timeline, 5-6 ms CPU natively (native
spikes of 11-50 ms are the frames where a unit first becomes visible). No
unit window or phase dominates: every time change dirties every carrier, so
the cost is the whole scene's at every frame. Three 48-frame ranges were
kept: frames 1873 (spline cars), 2065 (value-clip robots) and 3361 (the
slowest bin).

**Complexity.** High and low cost the same per frame (within noise, before
and after): refinement happens when topology syncs, and nothing here
animates topology.

**What a time change dirties: the same as native.** Per frame,
`UsdImagingStageSceneIndex::_SetTime` (`stageSceneIndex.cpp:426-435`) sends
248 prims (246 `xform`, 17 `visibility`, one `primvars/displayColor`, one
`sphere/radius`); the flattening scene index forwards them to the
descendants whose flattened xform or visibility was computed
(`flatteningSceneIndex.cpp:587-620`); the change tracker marks 995 rprims
and 7 instancers; Sync runs 991 `HdStMesh`, 4 `HdStBasisCurves` and 7
`HdStInstancer` (`viewer-perf/dirty-stats.ts`, `node.ts --dirty-stats`).
The native trace of the same frames (`viewerPerf --trace FILE`) has 991
`HdStMesh::_UpdateRepr`, 950 `GetTransform` and 938 `GetVisible` per frame.
Hidden units sync natively too: their meshes' visibility is dirtied every
frame through the carrier's time-varying `visibility`, so
`HdRprim::CanSkipDirtyBitPropagationAndSync` (`rprim.cpp:32-63`) does not
skip them. Storm uploads only the dirtied meshes' constant primvars (6
staging buffers, 365 KB per frame; no geometry). There is no
over-invalidation to remove.

**Per frame (ms), before (`76334cd3`) and after; Node figures are the
median of three processes' 48-frame means:**

| Range | Node, high | Node, low | Native CPU, high (8 threads / 1 thread) | Native CPU, low | Native GPU-synced, high |
|---|---:|---:|---:|---:|---:|
| 1873 | 60.5 -> 36.9 | 52.1 -> 36.8 | 4.95 / 9.87 | 5.57 | 5.85 |
| 2065 | 53.8 -> 37.2 | 51.9 -> 39.5 | 4.99 / 9.88 | 5.17 | 5.63 |
| 3361 | 53.0 -> 37.5 | 52.1 -> 36.9 | 5.08 / 9.31 | 5.45 | 5.82 |

Phases at 2065, high (probe spans, inclusive): `SyncAll` 44.7 -> 31.6,
`SetTime` with its observers' `PrimsDirtied` 4.8 -> 3.3, `CommitResources`
1.2 -> 1.2, task prepare and execute 0.6 -> 0.6. Natively the same frames
spend 1.4 ms (summed over threads) in `_SetTime` and 12 ms of CPU, on 8
worker threads, in mesh `_UpdateRepr`.

**By source (frames 1873-1920, Sync ms per frame, before -> after,
`dirty-stats.ts` byGroup):** value-clip robots (188 mesh syncs) 15.0 ->
9.1; spline balls (158) 13.3 -> 9.8; spline cars (83) 3.5 -> 3.0; the
looping train (39) 2.0 -> 1.3; every other unit 0.4-1.7; native-instanced
prototypes (46) 6.3 before. No unit here is skinned. Onion-skin copies cost
exactly their prim count: each copy is its own prim under its own layer
offset, synced as upstream syncs it.

**Cause.** Per dirtied mesh, the same work as upstream (its flattened
transform and visibility, `dataSourcePrim.cpp:741-861`), at about 46 us per
mesh against about 12 us of native CPU. Inside it, attribute resolution:
6,270 resolutions per frame, of which `XformQuery` made two to four more per
op than upstream does:
1. `XformQuery` resolved every op attribute a second time for its
   time-sampled flag, and `TransformMightBeTimeVarying` (asked by
   `UsdImagingDataSourceXform`'s constructor on every flattened xform,
   `dataSourcePrim.cpp:478-489`) resolved every op twice more rather than
   asking the op's `UsdAttributeQuery` (`xformOp.h:319-320, 593-605`).
2. Resolving a clipped attribute listed every clip's time samples on each
   value read; upstream asks the clip set only `ContainsValueForAttribute`
   (`stage.cpp:7192-7210`) and lists samples for sample queries
   (`stage.cpp:8820-8834`).
3. `SdfPath.fromString` parsed the same path strings again throughout the
   scene index chain (8% of the frame).

**Fixed** (one commit each; the dirty set and the synced prims are
unchanged, checked with `dirty-stats.ts`): `XformQuery` answers from its
attribute queries (4,717 resolutions per frame after), and ops without a
query use `UsdAttribute::ValueMightBeTimeVarying`, so value clips get
upstream's `_ValueFromClipsMightBeTimeVarying` (`stage.cpp:9735-9800`)
where any clip counted as varying before (native fixture
`usdGeom/tests/fixtures/xformQueryClips`: a one-clip, one-sample op is not
varying); a clip set's samples are listed only when read; `SdfPath.fromString`
keeps the paths of recently parsed strings.

**What remains (37 ms against 5 ms native, 3.7x native on one thread).**
Not invalidation: the per-resolution cost of the USD read path
(`usdResolveAttributeValue`; the separate composed-`typeName` walk
`usdResolveAttributeField`, 3.7 ms per frame; `SdfData` lookups per site;
`usdPropertySites`' per-site objects), the scene index chain's `getPrim`
per `Get` (5.6 ms) and the observers' `PrimsDirtied` (3.3 ms) - row 6
below, now measured on this access pattern - and native's parallel rprim
sync (`_SyncRPrims` on `WorkParallelForN`), which this single-threaded port
does not have. Safari was not measured (the browser was in use).

**Read path, second pass (November 8, 2026).** Seven changes, one commit
each, dirty and synced counts unchanged: every `XformQuery` op reads through
its `UsdAttributeQuery`, which now re-reads a default source from its layer
as `_GetValueFromResolveInfoImpl` does (`stage.cpp:8014-8030`; native
capture `usdGeom/tests/fixtures/xformQueryEdits`), 3,915 resolutions per
frame after; one walk of the typeName opinions per resolution; the resolve
info holds its facts on the object; `SdfLayer::GetField` asks for a spec type
only for required fields; the value walk is inlined without per-site objects;
`HdRetainedSceneIndex` finds entries by path; the instance cache's ancestor
walk is a loop. `SyncAll` at 2065, high: 34.7 -> 25.7 ms per frame (frame
40.6 -> 31.5; 1873 40.9 -> 32.0; 3361 41.7 -> 32.5, Node, median of three
processes' 48-frame means). What remains, from the sampling profile at 2065
(ms per frame, profiled): attribute resolution 9 (of which the SdfData spec
and field lookups by path string are about a third), the scene index chain's
`GetPrim` 5.5 (1,132 traversals per frame of about 25 scene indices, nearly
all from `GetVisible`, as natively; the string-path ancestor walks of the
pi/ni prototype scene indices and the stage's instance-proxy fallback lead
it), `XformQuery` and query construction 2.4, constant primvar buffer
sources 2.1, `HdStUpdateInstancerData` 1.5.

## Recommended order

Each step is one change, landed only if the library and viewer suites, the
upstream-ported image tests and the asset-acceptance pixels are unchanged,
and recorded before and after with `node apps/usdview/scripts/viewer-perf/run.mjs`
and the asset-acceptance `--perf` run. None changes what Storm computes or
draws; the order is by expected gain per risk. "Moves" names the row it
should change.

| # | Change | Moves | Expected | Risk |
|---|---|---|---|---|
| 1 | `GfFrustum.IntersectsViewVolume` without allocation: the eight corners and the clip-space test over one scratch `Float64Array`, the bbox-times-view-projection product in place; `HdStDrawItem` keeps its bounds' range rather than building one per test (`base/gf/src/frustum.ts:966`, `hdSt/src/drawItem.ts:149`) | Orbit; every redraw with many draw items | Most of the 42% culling share of an orbit frame; the same arithmetic as `upstream/base/gf/frustum.cpp:1265` | Low: one pure function, covered by the ported `testGfFrustum` (`base/gf/tests/upstream/frustum.test.ts`) and the image tests |
| 2 | HgiWebGPU per-draw constants without per-draw allocation: one staging buffer per command buffer for the patch-draw words, written once at submit; bind groups reused per chunk; `AllocateSlot` writes without a padded copy (`hgiWebGPU/src/graphicsCmds.ts:517-606`, `resourceBindings.ts:200-235`) | Orbit and every frame, by draw count | Most of the 17-19% patch-draw share; fewer `writeBuffer` calls per frame (one instead of one per draw) | Low to medium: HgiWebGPU only, the counterpart of `setVertexBytes`; `hgiWebGPU/tests/postTessVertex.test.ts` and the image tests cover it |
| 3 | Memoize the GLSL to WGSL translation of a shader stage by its source text and stage (`hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts:203`), so programs that share stage bodies translate once per session | First draw; material-heavy assets (McUsd 163 ms, OpenChessSet 171 ms, CarbonFrameBike 144 ms) | Depends on the share of repeated bodies, to be counted first (the probe's call counts); Storm already shares whole programs by hash (`hdSt/src/resourceRegistry.ts:863`) | Low: a pure function of its input |
| 4 | Texture loading spans, then concurrency: add `usdview:`/probe spans per texture (fetch, `createImageBitmap`, upload, mip generation), then load independent textures concurrently where they are serialized | Converged image, OpenChessSet (5.0 s), CarbonFrameBike, McUsd | Unknown until measured; natively all textures load inside the first commit | Low for the spans; the change itself depends on what they show |
| 5 | Mesh sync data path: profile-driven speed-ups of the per-`Get` work of the scene index chain without changing its shape: container data sources and `HdDataSourceLocator` handling (`hd/src/overlayContainerDataSource.ts:65`, `hd/src/flatteningSceneIndex.ts:183`), `_ComputePrimvarDescriptors` (`hd/src/sceneIndexAdapterSceneDelegate.ts:2171`), the material binding resolution per `primvars` `Get` (`hdsi/src/materialPrimvarTransferSceneIndex.ts:63`, `usdImaging/src/materialBindingsResolvingSceneIndex.ts:79`) | First draw, CarbonFrameBike (36% of its first `Render`); BrainStem playback (25%) | Tens of percent of first-draw CPU on large scenes | Medium: many scene indices; upstream's data-source semantics (caching only where upstream caches) must hold |
| 6 | USD read path under imaging: `XformQuery` construction and attribute resolution as the dirtied xforms re-flatten (`usd/usdGeom/src/xformable.ts:321`, `usd/usd/src/stage.ts:2577`, `usd/usd/src/prim.ts:1271-1316`, `usd/usd/src/relationship.ts:60`) - `performance-p1.md` steps 2-3 applied to this access pattern | Playback, CarbonFrameBike (9x native); BrainStem | Most of CarbonFrameBike's 59% under `GetTransform` | Medium: shared with Core; oracle captures guard it |
| 7 | UsdSkel per-frame data: skinning transforms and joint local transforms over typed arrays (`usdSkelImaging/src/skelData.ts:121,219`), ext-computation inputs read once per frame (`hd/src/sceneIndexAdapterSceneDelegate.ts:2844`) | Playback, BrainStem (2.1x native, 45 fps) | Most of the 37% ext-computation share | Low to medium: `testUsdImagingGLUsdSkel` captures |
| 8 | Topology construction and hashing over typed arrays (`hd/src/meshTopology.ts:93`, `pxOsd/src/meshTopology.ts:110`, `pxOsd/src/subdivTags.ts:23`) | First draw, OpenChessSet (28%) | Most of that share | Low |
| 9 | GPU: capture an OpenChessSet frame in Safari's GPU process (Xcode Metal capture, manual) and compare the passes with a native capture | Orbit, OpenChessSet (150 ms GPU vs 9.5 ms) | Identifies the pass; no change proposed before that | None (measurement) |
| 10 | Measure the viewer from a production build (`vite build`, lazy chunks) in the harness alongside the dev server | Module loading (159-377 ms per asset here) | User-facing load numbers; no renderer change | None (measurement) |

Not proposed: GPU frustum culling and multi-draw-indirect emulation. WebGPU
has no multi-draw-indirect; Storm's CPU path for that case is upstream's own
(`upstream/imaging/hdSt/commandBuffer.cpp:271-288`), and steps 1-2 address
its cost without a second path.

## Results of steps 1-4 (November 6, 2026)

Steps 1-4 are landed, one commit each (step 4 in three). Each stage was
measured on its own commit with the probe commits applied (`probe.ts`
texture spans and translation counts are tooling only): the
asset-acceptance `--perf` run (one Safari run of the nine assets below)
and `viewer-perf/run.mjs` (Node, three processes per asset; the native
half is unchanged and was not re-run). Base is `d7db885b`. Same machine
and Safari as above; 1-minute load averages were 4-54 during these runs
(other builds), so single Safari numbers move by 10-20% between runs; the
Node orbit medians held within 0.3 ms over the three processes.

Every capture (`browser.png` and `browser-usdrecord.png`) of every stage
is byte-identical to base's, on all nine perf assets and on the 27-asset
guard set (one exception, see the guard below). The library suite is
unchanged (8,082 pass, the same 40 known failures), as are the viewer's
(596 pass, both tsc configurations, `vite build`).

| Step | Commit | Measure | Before | After |
|---|---|---|---:|---:|
| 2 per-draw constants | `19b56121` | Node orbit, CarbonFrameBike | 1.50 | 1.14 |
| 3 translation memo | `d6777ac7` | translations repeated, of all (Safari, to the converged image) | | 6 of 149 |
| | | Safari `Translate` ms, OpenChessSet / McUsd | 179 / 163 | 187 / 176 (noise) |
| 4a no second open per texture | `959de16c` | OpenChessSet texture loads, first start to last commit (ms) | 5,216 | 3,648 |
| | | OpenChessSet fetches | 172 | 86 |
| | | StandardShaderBall texture loads (ms) | 3,977 | 1,900 |
| 4b decode on workers | `5ad96c29` | OpenChessSet texture loads (ms) | 3,648 | 1,827 |
| | | OpenChessSet `runtime.open()` (ms) | 4,453 | 2,467 |
| | | StandardShaderBall texture loads (ms) | 1,900 | 2,182 (noise: 3 files, one dominates) |
| 4c swizzle expansion | `bc162e8a` | OpenChessSet GPU texture creation (`upload` spans, ms, sum over 47) | 706 | 274 |
| | | OpenChessSet texture loads (ms) | 1,827 | 1,303 |
| | | OpenChessSet `runtime.open()` (ms) | 2,467 | 1,931 |

Over the four steps (base to `bc162e8a`, Safari `--perf`):
OpenChessSet `runtime.open()` 5,316 to 1,931 ms and its textures 4,773 to
1,303 ms; StandardShaderBall `runtime.open()` 4,071 to 2,419 ms. First
draws (Node first `Render`) and playback do not move: steps 5-8 address
them.

Notes per step:

1. `GfFrustum.IntersectsViewVolume` (`base/gf/src/frustum.ts`) reads the
   bbox's range and matrix in place (`GfBBox3d._GetRangeConstRef`,
   `_GetMatrixConstRef`: upstream's `GetRange`/`GetMatrix` return const
   references) and forms the product and the eight corners over scalars
   in `GetMultiply`'s and `MultVecMatrix`'s summation order, so every
   comparison sees the same doubles as before (checked against the old
   implementation on 20,000 random boxes before landing). `HdStDrawItem`
   needed no change: `GetBounds()` already returns the shared bounds.
2. `HgiWebGPUConstantsAllocator` copies each block into a CPU staging copy
   of its 64 KiB uniform buffer and `Flush()` writes each used buffer once
   before the cmds submit (`graphicsCmds.ts`, `computeCmds.ts` `_Submit`):
   one `writeBuffer` per chunk instead of one per draw. Patch draws fill a
   reused scratch array and reuse the previous draw's bind group when the
   resources match. What remains of `_PatchConstantsBindGroup` is the per-draw resource key and the
   `setBindGroup` call.
3. Counted first, with `probe.ts` (calls and distinct (stage,
   declarations, code) inputs, open to converged image): CarbonFrameBike 26/26, Vehicle 8/8, OpenChessSet
   24/23, McUsd 36/33, BrainStem 5/5, AnimatedCube 4/4, skel_arm 6/6,
   StandardShaderBall 24/24. Storm's program registry already shares the
   programs (`hdSt/src/resourceRegistry.ts:863`), so stage bodies repeat
   only across different programs; the memo saves at most 4% of the
   translation time on a first open, within the noise here. It pays when
   a page opens a stage whose programs it has translated before (a
   reload or a second viewer). The cache keys are the full translator
   inputs (0.2-0.7 MB of text per asset) and live for the session.
4. The per-texture spans (`probe.ts` `textureReport`, in the `--perf`
   record as `perf.load.textures`: fetch, open per mip, CPU read, GPU
   creation, mip generation) showed the loads already start together
   (`HdSt_TextureObjectRegistry.LoadAsync`, `Promise.all`), but two things
   serialized them:
   - `HdStTextureUtils::GetAllMipImages` asks for mip 1 of every file
     (`upstream/imaging/hdSt/textureUtils.cpp:430-436`); upstream's
     `Hio_StbImage` reads only the header and returns false
     (`upstream/imaging/hio/stbImage.cpp:384-387`), but ours fetched the
     file again and decoded all its pixels first. Now another subimage or
     mip returns false without reading (`hio/src/stbImage.ts`).
   - The decodes finished one after another, about 60 ms apart for each
     2048 x 2048 JPEG: the canvas readback and channel copy run on the
     page's thread. Upstream decodes on TBB worker threads
     (`WorkParallelForEach`, `upstream/imaging/hdSt/textureObjectRegistry.cpp:236-244`).
     The pixel decoding moved unchanged into `hio/src/stbImagePixels.ts`
     and runs on a pool of Web Workers (`stbImageDecodePool.ts`, at most 8,
     the hardware threads but one); without workers (Node) the same
     function runs on the calling thread.
   - GPU texture creation then took 700 ms over OpenChessSet's 47
     textures, most of it in `HgiWebGPUTexture`'s expansion of swizzled
     single-channel texels to four components (WebGPU has no component
     swizzle; Storm reads grayscale textures as rrr1): a per-texel loop
     with a branch per component, 30-50 ms per 2048 x 2048 texture. It now
     runs one strided pass per destination component, writing the same
     bytes (`hgiWebGPU/src/texture.ts` `_Swizzle`; checked against the old
     loop for every channel count, component size and swizzle before
     landing): 274 ms.
   GPU creation and the commit stay on the page's thread, in Storm's commit. `IsConverged`
   stays false until every texture is committed, and nothing is drawn
   before (`HdSt_RenderPass`, unchanged).

## The performance guard

`imaging-i2.md` section 1.3 (adopted with its Decisions of November 5,
2026: the guard gates the final switch) defines three checks against the
hand-written renderer: `settledMs` at most 1.5x per asset, a guarded asset's
`lastFrameCpuMs` at most 2x, BrainStem playback at least as smooth. The
hand-written renderer was deleted at the switch, so its numbers are a
recorded baseline:

- `apps/usdview/scripts/asset-acceptance/perf-baseline.json`: hdStWgsl at
  `15513a14` (its last commit, "Decision: one faithful implementation"),
  three Safari runs of that commit's own harness on this machine, written by
  `perf-baseline.mjs` (which documents the commands).
- `score.mjs` `guard()` and `guardOverall()` apply the three checks per
  asset (the playback check is the p95 frame time within the baseline's
  plus 3x the larger run-to-run spread, the tie-band rule of section 1.3);
  `report.mjs` adds a guard column, a guard section to `report.html` and the
  failing checks to the console summary; `run.mjs --perf-baseline FILE`
  points at another baseline. Tests:
  `apps/usdview/tests/asset-acceptance-scoring.test.mjs` (synthetic
  records).
- Assets the baseline renderer failed (curves, subdiv_refined, volumes,
  vdb_volume, dome_light) are not guarded.

Result, faithful renderer at `5520e345` against the baseline recorded in the
same session (both three runs, load 8-27):

| Check | Baseline (hdStWgsl) | Faithful | Limit | |
|---|---:|---:|---:|---|
| OpenChessSet `settledMs` | 3,333 | 7,653 | 5,000 | **fails** |
| StandardShaderBall `settledMs` | 3,928 | 6,198 | 5,892 | **fails** |
| CarbonFrameBike `settledMs` | 2,233 | 3,402 | 3,350 | **fails** (by 52 ms) |
| BrainStem playback p95 | 18 | 29 | 39 | passes |
| 18 other assets `settledMs` | | | | pass (1.09-1.36x the baseline) |

The guard fails on the three texture-heavy assets, where the converged image
waits for textures (step 4 above). A first pair of runs under a load
average of 37-200 failed seven assets; the guard is only meaningful with the
baseline and the candidate run back to back on a quiet machine, which
`perf-baseline.mjs` and the report header say.

Result after steps 1-4 (November 6, 2026): base `d7db885b` and
`bc162e8a` alternated on the same machine, three guard sets of base and
two of the candidate (each three runs; 1-minute load 2-54 over the sets,
the quietest pair back to back at 2-7), against the same
`perf-baseline.json`:

| Check | Baseline (hdStWgsl) | Base `d7db885b` (3 sets) | After `bc162e8a` (2 sets) | Limit | |
|---|---:|---|---|---:|---|
| OpenChessSet `settledMs` | 3,333 | 7,602 / 7,511 / 7,117 | 3,509 / 3,448 | 5,000 | **fails** before, passes after |
| StandardShaderBall `settledMs` | 3,928 | 5,484 / 5,736 / 5,453 | 3,922 / 3,773 | 5,892 | passes |
| CarbonFrameBike `settledMs` | 2,233 | 3,094 / 3,242 / 3,092 | 3,203 / 3,111 | 3,350 | passes (150-240 ms margin) |
| BrainStem playback p95 | 18 | 27 / 26 / 24 | 24 / 24 | 39 | passes |

The guard passes on both candidate sets and fails on all three base sets
(OpenChessSet only; CarbonFrameBike passed in all of them this time). An
intermediate set (after step 4b, under a load of 43) failed OpenChessSet
by 97 ms (5,097); the same commit passed in the next, quieter set
(3,852). CarbonFrameBike's converged image waits for little texture work
(its ten textures load in 0.5-0.8 s); its margin moves with the first
`Render` (steps 5 and 6).

The captures of every run of every set (27 assets) are byte-identical to
base's, except one OpenChessSet capture in one intermediate set (91 pixels
one level apart; the other two runs of that set and every other
OpenChessSet capture identical). OpenChessSet draws through OIT, whose
fragment order on the GPU is the likely source; no change here touches
it.

Two candidate-side sets each recorded one harness watchdog timeout
("hung": the tab stopped reporting for 420 s) on `subdiv_refined`, in their
first run; its other runs captured base's image. Six further runs of it at
`bc162e8a` on a quiet machine all captured base's image in 1.7 s. On
base code a first guard attempt of this work stalled the same way
(`teapot`: the driver's tab was gone from Safari), and the last full
ledger's corpus run (`5520e345`) records one hung asset, so it is not
attributed to these changes, but it is not explained either.

After merging `main` at `11eb284d` (the stb_image JPEG/BMP/TGA
decoder ports, which replace the browser decode and run as
TypeScript): the ported `stbi_load_from_memory` dispatch runs unchanged
on the decode workers (`stbImagePixels.ts`), so the slower decoder does
not reach the page's thread. Merged base (`11eb284d`) and merged result
(`a23e467d`) alternated, two sets each, three runs per set, on a quiet
machine (1-minute load 2.0-4.7):

| Check | Merged base `11eb284d` | Merged result `a23e467d` | Limit | |
|---|---|---|---:|---|
| OpenChessSet `settledMs` | 7,540 / 7,357 | 3,516 / 3,450 | 5,000 | **fails** before, passes after |
| StandardShaderBall `settledMs` | 5,415 / 5,561 | 3,878 / 3,855 | 5,892 | passes |
| CarbonFrameBike `settledMs` | 3,181 / 3,356 | 3,229 / 3,148 | 3,350 | base fails one set; passes after (120-200 ms margin) |
| BrainStem playback p95 | 24 / 24 | 24 / 25 | 39 | passes |

The `--perf` run of the merged result matches the pre-merge numbers
(OpenChessSet textures 5,025 to 1,293 ms, `runtime.open()` 5,581 to
1,908 ms).
Every capture of the merged result is byte-identical to the merged
base's, and no asset hung in these four sets. Gate on the merged result:
library 8,144 pass with the same 40 known failures, viewer 596 pass, both
tsc configurations, `vite build`.

## CarbonFrameBike: open to first frame (November 7, 2026)

Base `58686f26`. Instrument: the asset-acceptance `--perf` run, whose load
record now has a timeline (`probe.ts` `phaseTimeline`, `httpReport`;
`harness.ts` `loadTimeline`): every `usdview:` span and probed phase with
its start and end from the start of `runtime.open()`, every texture span
and every HTTP request of the page. Safari 27.2, dev server, 512 x 512.

### Where the time went (base, a warm run)

| ms from `runtime.open()` | Phase | ms |
|---|---|---:|
| 0-56 | `materialx-module` (module load) | 55 |
| 56-601 | `open`: `UsdStage::Open`, USDA parse of the packaged 24 MB layer | 545 |
| 603-625 | `scene-indices` (engine construction) | 22 |
| 625-993 | `validation-render`: `PrepareBatch` 62 (population 21), `SyncAll` 255, `CommitResources` 32; nothing drawn (textures not committed) | 368 |
| 961-1499 | texture loads (10 files): fetch 994-1275, decode on workers to 1452, read and upload to 1499 | 538 |
| 1014-1786 | `settle`: unconverged renders every 5 ms (1-10 ms each), then the first converged render (1496-1785): commit 6, `RenderTask.Execute` 281, of which `CodeGen.Compile` and GLSL to WGSL translation of 10 programs about 210 | 772 |
| 1786-1794 | `first-draw` | 8 |

Natively all of this is one `Render`: Storm loads the textures inside the
commit (`upstream/imaging/hdSt/textureObjectRegistry.cpp:236-244`) and
draws in the same call.

### What was fixed

1. **The usdz was downloaded twelve times per open** (the timeline's HTTP
   requests). Storm opens each texture with no resolver context or cache
   scope (`upstream/imaging/hio/stbImage.cpp:373-379`), so each texture
   packaged in a .usdz opens its package again
   (`upstream/usd/sdf/usdzResolver.cpp:61-90`, `FindOrOpenZipFile`
   outside a scope); the stage open itself opened it twice. Upstream these
   are reads of a file the OS page cache already holds; through the
   viewer's `HttpResolver` each was a new download of the whole 27 MB file
   (the harness serves `no-store`, as a server may). The transport now
   shares a download in flight and finds finished bytes again while some
   reader still holds them, through weak references, so it keeps nothing
   alive (`apps/usdview/src/http-resolver.ts`; ArAsset bytes are read-only
   and the image decodes copy them). Ar, Sdf and Storm are unchanged: the
   package is still opened per texture, as upstream.
2. **USDA parsing** (`sdf/src/textFileFormatParser.ts`), the whole of the
   `open` span: an array's scalar type was looked up again for every
   element (`validateTextValue`), every separator sliced its trivia and ran
   a comment-stripping regex (`inlineGap`), and `ws` compared one-character
   strings. Same results and errors; Node `Layer.importFromString` of the
   24 MB layer 613-676 to 485-529 ms (six runs), `exportToString`
   byte-identical.

### Before and after

Five `--perf` runs each, back to back, base sources and this work (the
same tooling); 1-minute load 8-11. Medians, ms (the five runs in brackets).

| | Base `58686f26` | After | |
|---|---:|---:|---|
| `runtime.open()` to first frame | 1,813 (1,711-1,966) | 1,342 (1,249-2,009) | -26% |
| `open` (stage open, USDA parse) | 563 (506-604) | 408 (376-606) | -28% |
| `validation-render` (`SyncAll` 252-258) | 368 | 357 | unchanged |
| `settle` (textures, then the first converged render) | 736 (634-799) | 425 (364-499) | -42% |
| texture loads, first start to last commit | 521 | 290 | |
| of which fetch | 235 (211-433) | 0-1 | |
| first converged render (compile and draw) | 229 | 202 | noise |
| usdz downloads | 12 | 1 | |
| guard `settledMs` (from the perf runs) | 3,289 | 2,880 | limit 3,350 |

The first after-run of the set (2,009) was the cold one of the session.
Every capture (both lightings, all ten runs) is byte-identical to base's.

### What remains, and why it is not changed here

- `SyncAll`, 250 ms: mesh sync through the scene index chain (Node
  profile: material binding resolution per `Get` 70 ms, from
  `hdsi/src/materialBindingResolvingSceneIndex.ts:54` down to
  `UsdRelationship.GetForwardedTargets` and Pcp property indexing;
  `HdSceneIndexAdapterSceneDelegate.GetTransform` 26 ms; `SdfPath`
  parsing from strings 42 ms spread over many callers). Upstream computes
  the same things per `Get` with no cache
  (`upstream/usdImaging/usdImaging/materialBindingsResolvingSceneIndex.cpp:74,186`);
  the cost is the TypeScript read path, step 5 of the recommended order.
- The first converged render, about 200 ms: code generation and the GLSL
  to WGSL translation of ten programs (`CodeGen.Compile` 120-150 ms)
  plus first-use draw setup. It runs only after the textures are in,
  because a render pass draws nothing while textures are uncommitted
  (`hdSt/src/renderPass.ts` header) and Storm compiles programs at draw
  time (`HdSt_DrawBatch::_GetDrawingProgram` from `ExecuteDraw`,
  `upstream/imaging/hdSt/pipelineDrawBatch.cpp`). Compiling earlier would
  need a call Storm does not have, so it is left.
- Texture decode, 120 ms before the first small JPEG is decoded: the
  start-up of the decode workers on the dev server (each harness page is
  a fresh page); they persist for later loads of a page.
- `open` 380-600 ms against native's 141: the rest of the text parse
  (`parseValue`, number scanning, tuple bookkeeping).

## The subdiv_refined "hang" (November 7, 2026)

`subdiv_refined` (testUsdImagingGLBasicDrawing `subdivTags.usda` at
complexity veryhigh, refine level 3) renders and matches native in every
run here: alone (four opens, first frame 410-842 ms, 0 px against
usdrecord, verdict "matches"), in three runs of the features group and in
three runs of the 27-asset set, all captured.
The recorded hangs were stops of the Safari tab that the harness charged to
it:

- The watchdog's record names the asset in flight, else the first asset of
  the run without a result. In the curated ledger run of November 5 the
  watchdog fired after 1,020 s, the longest browser timeout
  (900 s) plus 120 s, which it waits only while no asset is in flight: the
  tab had stopped after `skel_arm` posted its result and before the driver
  posted `subdiv_refined`'s start, and the record went to
  `subdiv_refined`, the next asset in the manifest. The two guard sets of
  November 6 (420 s) stopped after its start, also right after `skel_arm`.
  The ledger also records stops on `chess` and `teapot` ("the driver's tab
  was gone from Safari"); nothing in the assets ties them together.
- At one of those stops (Nov 6, 08:34) the system log shows a Safari Web
  Content process exiting four seconds after `skel_arm`'s result (loginwindow
  `appDeath`, no crash report); the cause of the exit is not in the
  retained log. During full-set runs a single driver tab's Web Content
  process holds 1.5-2.7 GB (the assets' pages run one after another in
  iframes of one tab).

Harness changes (`apps/usdview/scripts/asset-acceptance/run.mjs`,
`harness.ts`):

- The driver and every harness page post their steps to `browser.log`,
  timestamped by the server (driver: page loaded, outcome, page removed;
  page: started, runtime created, opening, opened, each capture, disposing,
  disposed), so the next stop can be placed between two steps.
- A stop with an asset in flight renders that asset again in the reopened
  driver, once; a second stop in the same run records it as hung. A stop
  with none in flight (120 s of quiet between a result and the next start,
  where the driver does a few seconds of work) charges no asset. Every stop
  is kept in the asset's `browser.json` (`watchdogStops`) and in
  `browser.log`; `packages/usd/tests/browser/imaging-status/run.mjs` counts all of
  them.

## A large animated scene: per-rprim sync cost (November 8, 2026)

Measured on a large animated test scene that isn't included in this repository (all
payloads loaded, its main camera, frames 1-48, 512x512) measured in Node
(`viewer-perf/node.ts --orbit 0 --playback 48`, stub GPU) and natively
(`native/viewerPerf.cpp --trace`, Storm on HgiMetal).

**The work is the same as native; each step costs more.** Per frame the
sync shape matches upstream (2,621 `HdStMesh` and 103 `HdStExtComputation`
syncs here, 2,565 and 101 natively; the gap of about 56 meshes was not
investigated). The call counts inside it match too (per frame, ours /
native trace): `HdFlatteningSceneIndex::GetPrim` 12,320 / 11,829,
`HdMergingSceneIndex::GetPrim` 7,641 / 7,328, `UsdImagingDataSourcePrim::Get`
9,552 / 9,174, `UsdImagingStageSceneIndex::GetPrim` 660 / 633, `GetTransform`
2,653 / 2,543, `GetVisible` 2,633 / 2,523, `GetExtComputationInput` 432 /
414, `HdStInstancer::GetInstanceIndices` 87 / 83,
`UsdSkelImagingComputeSkinningTransforms` 117 / 112, and about 11,000
attribute resolutions per frame (`UsdAttributeQuery::_Initialize` 6,913 plus
the `xformOpOrder` reads natively). Nothing is synced, rebuilt or
invalidated that native leaves alone: the dirtied meshes are transform and
visibility dirty (carriers' time-sampled `xformOp:transform` and
`visibility`), plus the skinned meshes' points; draw batches are not
rebuilt per frame.

**One dirty mesh, before -> after (us per mesh, Node, from the sampling
profile's shares of `SyncAll`; native from the trace, halved for tracing
overhead, one thread):**

| Phase | Before | After | Native |
|---|---:|---:|---:|
| `_UpdateVisibility` (`GetVisible`: scene index chain `GetPrim`, flattened visibility, `visibility` resolution) | 7.7 | 6.0 | ~6 |
| `HdStPopulateConstantPrimvars` (of which `GetTransform` about two thirds: flattened xform, `XformQuery`, op resolutions) | 11.2 | 8.7 | ~5 |
| `HdStUpdateInstancerData`, vertex primvars, shaders, rest of `_UpdateRepr` | 6.4 | 5.2 | ~2.5 |
| whole `HdStMesh::Sync` | 25.3 | 20.0 | ~13.5 |
| `HdStExtComputation::Sync` (skinning inputs; per computation) | 144 | 121 | ~50 |

(`SyncAll` 85.5 -> 67.5 ms per frame; meshes are 78% of it, ext
computations 17-18%.)

Attribute resolution is about 30% of `SyncAll` before and 27% after. The
scene's root layer stack has 47 layers (22 transform layers, 22 caption
layers, a layout layer and the root): 36% of resolutions walk it, so a
resolution made about 190 layer lookups per frame per prim (typeName,
timeSamples, spline and default at every layer), 2.1 million per frame.
Upstream's `Usd_Resolver` walks every layer as well (USD mode keeps no prim
stack); each lookup here is a `Map` lookup by path string in a layer of up
to tens of thousands of specs, about 30-60 ns, cache-miss bound.

**Fixed (one commit each; GPU uploads byte-identical, below):**

1. `usdResolveAttributeTypeNames` records the layers that hold the
   property's spec; the value walk reads fields only there (and with no
   clips visits only those sites). One spec lookup per layer instead of
   four.
2. `UsdStage::_GetDefiningSpecType` stops at the strongest spec, as
   `stage.cpp:5502-5519`, instead of composing the whole property stack
   (asked by every `UsdAttribute::IsValid` on a non-builtin attribute).
3. `HdVtBufferSource` builds its double-to-float conversion table once
   (it was rebuilt, with three `TfType` lookups, for every transform
   source).
4. `GfMatrix4` copy and precision-converting construction copies storage
   directly; the sixteen-scalar constructor assigns without re-spreading;
   matrix and vector storage starts from array literals rather than
   `new Array(n).fill(0)`.
5. `HdStRenderDelegate::GetSupportedRprimTypes` is computed once per
   delegate (upstream: once, `renderDelegate.cpp:92`); it was rebuilt, with
   an environment read, for every dirtied prim.
6. `UsdImagingDrawModeSceneIndex` finds a standin by upstream's
   `lower_bound` over its keys in `SdfPath` order (`drawModeSceneIndex.cpp:69-89`),
   not by walking every ancestor of the queried path.
7. Fewer path lookups per scene index query (`SdfPathTable::find` in the
   flattening scene index and the scene delegate's prim cache; the prim
   data source's prim-path check computed once).

**Per frame (ms, Node, one process each, interleaved on the same machine;
`main` at `c5aa607e` -> `work/sync-cost`):** frame 105.4 / 104.6 / 106.4 ->
85.4 / 84.4 / 84.4; `SyncAll` 85.4 / 84.9 / 86.3 -> 68.1 / 67.3 / 67.2;
`SetTime` 13.6 -> 10.4; `CommitResources` 4.9 -> 5.5 (unchanged within
noise). The 124 ms of the earlier full-scene measurement was taken under
heavier machine load; the same-load base is about 105-110. Native: 18 ms
at 8 threads, 36 ms at 1 thread.

Safari (one run each, the viewer runtime at 1024x576, complexity high,
`setTime` then the next animation frame, frames 2-49; same page and machine,
`main` -> `work/sync-cost`): median frame 147 -> 126 ms, `SyncAll` 86 -> 73,
`SetTime` 20.6 -> 17.3, `RenderBatch` 101.6 -> 88.4 per frame.

Values: every byte the stub GPU receives in the 12 frames after the first
render (queue writes and mapped staging ranges, SHA-1 per frame) is
identical before and after.

**What remains (about 84 ms against 36 ms native on one thread).** The same
operations at about 1.5-2.5 times native's cost each, spread over the scene
index chain (25 filtering scene indices per `GetPrim`, data source wrappers
per `Get`), attribute resolution (the deep layer stack's lookups, now about
6% of the frame in `SdfData::HasSpec` alone, and the per-resolution result
objects and closures), and matrix work in skinning and transforms. Getting
to ~50 ms would need either native's parallel rprim sync
(`_SyncRPrims` on `WorkParallelForN`), which this single-threaded port does
not have, or caches that upstream does not keep (for example the layers of
a layer stack holding a prim's spec, which USD-mode Pcp deliberately does
not retain); neither is done here. `TfGetEnvSetting` still reads the
environment on every call (upstream caches at first use; tests here change
settings between cases), about 1% of sync.

## CarbonFrameBike playback: the XformQuery path (November 9, 2026)

Row 6 above, measured again at `3f4412e7` before any change. Node:
`viewer-perf/run.mjs --skip-native --runs 3 --orbit 10 --playback 120 bike`
(stub GPU, 512x512, three timed processes and one profiled), then the base
and changed bundles run alternately, five processes each, 120 playback
frames (median of each process's frame median). Native:
`native/viewerPerf.cpp --orbit 10 --playback 120`, three processes, and once
with `--trace` for call counts (summed over the worker threads). Load
averages 4 to 12.

**What upstream caches, and what it does not.** `UsdGeomXformCache` keeps
one `XformQuery` per entry (`upstream/usd/usdGeom/xformCache.cpp:83-99`); the
port has done the same since `613353ac` (`pxr/usd/usdGeom/src/xformCache.ts`,
`performance-p1.md` step 2), so section 8's "does not cache its XformQuery"
no longer applies. The imaging path does not use that cache: upstream builds
a new `XformQuery` on every `UsdImagingDataSourcePrim::Get` of `xform`
(`upstream/usdImaging/usdImaging/dataSourcePrim.cpp:750-763`), as the port
does (`usdImaging/src/dataSourcePrim.ts:1009`), so no query cache was added
there. The work per frame is the same as native's: 328 `GetTransform` and
328 `HdStMesh` syncs here and natively (39,389 over the 120 traced frames);
about 2,480 attribute resolutions here (723 `xformOpOrder` reads, 1,745 op
queries) against 1,810 `UsdAttributeQuery::_Initialize` plus the
`xformOpOrder` reads natively.

**Base.** Node 8.0-8.5 ms per frame (41.4 ms at `5520e345`; the November 7-8
read-path changes above account for the difference). Native 2.2-2.4 ms CPU
(2.3 with `PXR_WORK_THREAD_LIMIT=1`): about 3.6x. In the profile
`GetTransform` is 51% of playback, `XformQuery` construction 34%, and the top
self times are SdfData lookups by spec path string: `SdfData.hasSpec` 9.2%
(`sdf/src/data.ts:138`, all from `usdResolveAttributeTypeNames`), the
time-sample lookup `_samples` 5.1% and `get` 3.1%. Every resolution built
its property's spec path string twice (the type-name walk by concatenation,
the value walk through a new `SdfPath` node), so each lookup flattened and
hashed a new string; upstream's property paths are interned nodes hashed by
pointer.

**Fixed (`08719949`).** The resolver keeps the spec path string of a prim
path and property name (`usd/src/resolver.ts`, `propSpecPath`, bounded;
`FAITHFULNESS-DEBT(sdf-path-interning)`, retired by node-keyed SdfData, step
11 of `performance-p1.md`), and both walks use it. Per frame, Node: 9.55 ->
7.89 ms alternated at load 9-12 (`SyncAll` 7.72 -> 6.17); 8.36 / 8.48 / 8.04
-> 6.97 / 7.06 / 6.96 in the `run.mjs` sets at load 4. Profiled self time:
`hasSpec` 115 -> 44 ms, `_samples` 64 -> under 1 ms. Every byte the stub GPU
received (queue writes and mapped staging ranges, SHA-1 over open, first
render, 10 orbit and 120 playback frames) is identical before and after. The
library suite is unchanged: 8,736 pass, the 46 known failures.

**What remains (about 7.9 ms against 2.3 native).** `XformQuery`
construction is still about a quarter of the frame: the op queries' resolve
info and the `xformOpOrder` reads, each a full resolution as upstream's.
Within resolution, `usdResolveAttributeValue` allocates about a dozen
closures per call (4% self), garbage collection is 6%, and `SetTime` with
its observers about 1 ms.

### Safari, at `5b71d4d9` (November 9, 2026)

One `--perf` run of the asset-acceptance harness
(`node scripts/asset-acceptance/run.mjs --manifest scripts/viewer-perf/assets.json
--skip-native --skip-usdview --perf --runs 1 bike`), Safari 27.2 on the M4
Pro, machine load 3.4-5 (a Node test suite ran alongside). The 120-frame
playback: median frame interval **27 ms (about 37 frames per second;
native about 200)**, p95 33 ms; CPU per frame median 11 ms (p95 14), of it
`HdRenderIndex.SyncAll` 8.0 ms and `UsdImaging SetTime` 1.8 ms; GPU work
done a median 14 ms after the frame's CPU work. Orbit: 17 ms frame interval
(60 Hz), 4 ms CPU. Open 1.35 s, first frame 1.84 s, settled 3.1 s. The "about
17 frames per second" in "Results" is from `5520e345`; the change is the sum
of the November 7-9 work, and playback in Safari is now bounded by the CPU
sync and the GPU together rather than by the CPU alone. One run: treat
differences under about 1.5x as noise.

The harness needs its Safari tab in front: the orbit and playback steps
draw once per animation frame, which Safari stops in a hidden tab, and the
watchdog then records the asset as hung (two such runs before this one).

## CarbonFrameBike playback in Safari: where the GPU time went (November 9, 2026)

The Safari run above has playback frames 27 ms apart with
`GPUQueue.onSubmittedWorkDone` a median 14 ms after each frame's CPU work,
against 4 ms in orbit with the same 334 draws. It looked like the GPU did
about 3.5 times orbit's work per playback frame. It does not. The GPU work
per frame is the same as orbit's. The harness's playback steps time while
paused, and each paused step waits for its frame's GPU work before the next
one starts.

**Tooling added (no library change).** The Node stub device
(`viewer-perf/null-gpu.ts`) counts `copyBufferToBuffer`, `mapAsync`, passes
and command encoders. `node.ts --gpu-calls` reports them per orbit and
playback frame, with each call's kind, label and calling function. The
harness's `--perf` GPU counters (`asset-acceptance/harness.ts`) add per-frame
`gpuCallsPerFrame`. While a step records, they also add `submitSlots`
(each submission's completion latency) and `gpuTimestamps`: every pass gets
`timestamp-query` writes, which Safari 27.2 supports. That gives the median
GPU time of each pass slot and the summed pass time per frame. A third step,
`playbackActive`, repeats the 120 playback steps under
`runtime.setPlaybackActive(true)`, as `TimelineControls.play` does, but
without its frame-rate timer. Node with `--settle` is needed for draws to be
encoded: without it the pipelines are still compiling and only 2 draws per
frame are recorded.

**GPU calls per frame** (Safari counters; Node's agree to within the viewer's
own presentation submission):

| per frame | orbit | playback |
|---|---|---|
| `createBuffer` (bytes) | 15.0 (202 KB) | 16.1 (312 KB) |
| `writeBuffer` (bytes) | 3 (87 KB) | 4 (88 KB) |
| `copyBufferToBuffer` (bytes) | 216 (9.4 KB) | 344 (97 KB) |
| `mapAsync` | 0 | 0 |
| compute passes / dispatches | 1 / 12 | 2 / 16 |
| render passes / draws | 5 / 334 | 5 / 334 |
| submits (one command buffer each) | 6 | 7 |

From `--gpu-calls`, the frames are the same work except for three things.
Playback adds the transform uploads: the 328 meshes' constant primvars
staged by `HdStStagingBuffer` (`stagingBuffer.ts:188`), which turns them
into about 340 GPU-to-GPU copies, as `stagingBuffer.cpp:146-187` does. It
also adds one larger staging upload, and one compute submission of 4
`HdStExtCompGpuComputation` dispatches: the bike's skinning, from its 4
`SkelRoot`s. The ~3,900 buffers created over a run are created at the same
rate in orbit as in playback, and none of them is a per-mesh upload. Each
frame creates:

- 10 sampler-state uniform buffers
  (`HgiWebGPUResourceBindings._getSamplerStateBuffer`, one per resource
  bindings object; the draw batches create their bindings on each execute);
- 2-3 `HgiWebGPU constants` chunks (`HgiWebGPUConstantsAllocator`, per
  command object);
- 1 placeholder storage buffer;
- the `HdStStagingBuffer` flush's upload buffer. HgiWebGPU reports no
  unified memory, so `Flush` takes upstream's non-UMA path.

Upstream reaches the same blits. On Apple silicon `hgiMetal` reports unified
memory: Storm writes the staging buffer in place and blits the same ranges.
Blit, compute and graphics commands are recorded into HgiMetal's one primary
command buffer (`hgiMetal/blitCmds.mm:46`, `computeCmds.mm:44`,
`graphicsCmds.mm:315`, `hgi.mm:388-436`), so there are fewer command
buffers per frame than the port's 6-7. This comes from reading the source;
it was not counted natively. Dirty-bit propagation already matched (328
`GetTransform` and 328 mesh syncs on both sides, above). Nothing is
recomputed on the GPU that upstream does not recompute: no normals, and the
only ext computation is the skinning.

**GPU time** (timestamp queries; two runs, `--perf --runs 1 bike`, load 8-12):

| | orbit | playback (paused steps) | playback (playing) |
|---|---|---|---|
| frame interval, median | 17 ms | 35 / 29 ms | 16 / 17 ms |
| CPU per frame, median | 3 ms | 14 / 11 ms | 12 / 10 ms |
| summed pass time, median | 8.7 / 6.2 ms | 5.5 / 4.6 ms | 7.1 / 4.3 ms |
| main Storm render pass | 7.1 / 5.9 ms | 4.8 / 4.3 ms | 3.7 ms (run 2) |
| 120 steps, wall | | 4.1 / 3.4 s | 2.0 / 2.0 s |

The GPU's pass time per playback frame is no larger than orbit's. Storm's
main render pass is 4-6 ms, and the culling, skinning and presentation
passes are under 0.1 ms each. The doubled interval comes from
`runtime.ts timeStepDraw`. A time change while paused awaits the frame's
WebGPU error scopes (`wait = !playing`). In Safari those resolve only after
the GPU has finished the frame, so each step is its CPU work, then the GPU's
completion, then the next animation frame. Playing does not wait
(`stageView.py:1547`). The same steps then draw at the display's 60 Hz with
10-12 ms of CPU each, and the GPU finishes a median 5 ms after the CPU
work. Pass timestamps are usable only as durations: their values are not
ordered across passes and command buffers in Safari.

**Why Safari's CPU (10-11 ms) exceeds Node's (7.4 ms).** Here are the phases
per playback frame, Safari (run 1) against Node at `--settle` (stub GPU,
draws encoded):

- `SyncAll`: 7.9 against 5.7 ms;
- `UsdImaging SetTime`: 1.8 against 0.9 ms;
- `hdx RenderTask.Execute`: 1.9 against 0.6 ms;
- `CommitResources`: 0.8 against 0.4 ms.

`SyncAll` and `SetTime` make no WebGPU calls. So about 3 ms of the 3.5 ms
difference is JavaScriptCore against V8 on the same JavaScript. About 1.3 ms
of it, mostly `RenderTask.Execute`, is real WebGPU encoding against the
stub: 334 draws with their pipeline and bind-group changes.

**Result.** Nothing in Storm's or HgiWebGPU's per-frame GPU work differs
from upstream's in a way that costs GPU time, so the library is unchanged.
CarbonFrameBike plays in Safari at the display rate (about 60 frames per
second, 10-12 ms CPU per frame; native about 200 on CPU alone). The "about
37 frames per second" measured paused time steps, which wait for the GPU.

**Follow-up: paused steps no longer wait (November 9, 2026).** As usdview
checks no GL errors on a frame change, `timeStepDraw` no longer awaits its
error scopes when paused either; an out-of-memory error now becomes a device
failure ("Reload the viewer") instead of rolling the frame back. One Safari
`--perf` run afterwards, at machine load 7.5: paused steps 26 ms median
interval (p95 35), 11 ms CPU; playing 17 ms (p95 19), 10 ms CPU; orbit 17 ms.
Paused steps did not reach the display rate, so the awaited scopes were not
the whole cause. Not yet explained: the harness's paused loop presents each
frame from a promise continuation, outside an animation-frame callback,
where the playing loop draws inside one; whether Safari delays the next
animation frame for such a present is not measured. Interactive playback is
unaffected (60 Hz).

**What remains.**

- **Allocations.** The port creates 15-16 GPU buffers per frame, in orbit
  and playback alike, where hgiMetal creates none. The sampler-state buffer
  per resource bindings object is the bulk of it. Caching it by content, or
  keeping it with the draw batch's bindings, would remove 10 of them. The
  constants chunks could be recycled across frames. Both are CPU and
  allocator costs, not GPU time.
- **Submissions.** The port submits 6-7 command buffers per frame where
  hgiMetal shares one primary command buffer.
- **Paused time steps** take CPU plus GPU latency, about 29-35 ms. This is
  a viewer choice (per-frame out-of-memory reporting), not upstream's.
- **The CPU gap to native** is unchanged: about 4-5x in Safari and 3x in
  Node.

## Alpha to coverage in Safari: WebKit's loop guard (November 9, 2026)

On a large animated test scene that isn't included in this repository (a camera
path through composition examples;
load schedule on, complexity high, viewer only, 2486x1388 canvas at 4x MSAA),
Safari 27.3 plays its first section (frames 1-438, driven at 24 fps) at 7.0
frames per second, with frames 144 ms apart. With
`env=TF_DEBUG=HDX_DISABLE_ALPHA_TO_COVERAGE` it plays at 23.6 (17 ms). The
viewer's CPU is 5-6 ms per frame either way. A later section (frames
1162-1806) measured 5.6 against 21.7 at `405f152a`. The probes and benches
behind these numbers are not included in the repository.

**Cause.** WebKit's WGSL-to-Metal compiler puts a forward-progress guard into
every loop the shader writes. On Apple GPU family 9 and later (this M4 Pro)
the guard is a `volatile` counter (`MetalFunctionWriter.cpp`:
`volatile uint32_t __wgslEnsureForwardProgress`, incremented and tested each
iteration). Some fragment functions change sample coverage: through
`alphaToCoverageEnabled`, a `sample_mask` output, or `discard`. When such a
function also has that counter, the GPU no longer removes hidden surfaces
before shading. Every rasterized fragment is then shaded, occluded or not,
and the cost grows with depth complexity. Storm's mesh fragment functions all
have loops: two over `GetLightCount()`, two over the selection highlight modes
and two or three instancing loops. Under alpha to coverage, every one of them
changes coverage. `hdSt/shaders/simpleLighting.glslfx:396` and the rest
compile natively without a guard, so native Metal keeps the optimization.

Evidence:

- **Bench in Safari** (a WebGPU page, not in the repository: 16 overlapping full-screen layers,
  1280x720, 4x MSAA, a 64-iteration fragment, GPU ms per frame). Off: 4.9 ms.
  Hardware alpha to coverage, a constant `sample_mask` of 0xF, the
  `alphaToOne.ts` mask and a `discard` never taken: 77-89 ms each. The same
  math unrolled with no WGSL loop: 1.3-1.4 ms for all of them, alpha to
  coverage included. Reading `@builtin(sample_index)` (4.95 ms) and
  `@interpolate(perspective, sample)` (5.0 ms) cost nothing. So it is not
  sample-rate shading.
- **Native Metal** (the same bench written against Metal). With a plain loop,
  off is 1.9 ms. A `sample_mask` output costs nothing (1.3 ms). Alpha to
  coverage costs nothing when its alpha comes from a buffer or a literal
  (1.3 ms), and 20 ms when it depends on the loop's result. With WebKit's
  `volatile` counter added to the loop, every coverage-changing case is
  89-91 ms and off is 5.3 ms. That matches Safari.
- **The viewer.** The scene's draw pipelines (4 at frame 1) are all
  `alphaToCoverageEnabled: false` with the alpha-to-one variant, which writes
  `@builtin(sample_mask)`. None reads `sample_index` or interpolates per
  sample. At a quarter of the pixels (`devicePixelRatio` forced to 1) frames
  are 42 ms apart instead of 144, so the cost is per fragment. A test-only
  rewrite of every fragment `for` loop into eight nested `if`s
  (a probe build of the viewer) takes the A2C-on scene to 17 ms frame
  intervals, 19.6 shown per second, with stalls while the larger shaders
  compile.
- **Native usdview's renderer.** usdrecord, 61 frames of the scene at 2486 wide,
  with `--traceToFile`: `HgiMetal::_SubmitCmds`, including readback waits,
  took 555 ms with alpha to coverage and 603 ms without. Native alpha to
  coverage costs nothing measurable here.

**Two follow-up questions.** (1) The hardware experiment
(7.8 frames per second) stayed slow because hardware
alpha to coverage loses hidden surface removal in the same way. Mesh
fragment functions do not write `sample_mask`, so they took the hardware
path. The alpha-to-one variant is not the cause: in the bench it costs the
same as hardware (78-89 against 77-79 ms). (2) A loop-free version of the bench
runs every case, emulated included, at the 17 ms vsync with the tab in
front. The earlier stall did not come back. It most likely came from the tab
being hidden (Safari stops `requestAnimationFrame`) and was not a
`sample_mask` problem.

**Result.** No library change. Storm enables alpha to coverage for the color
pass as upstream does (`hdx/renderSetupTask.cpp:225-227`,
`hgiMetal/graphicsPipeline.mm:304-315`). The variant keeps the stored alpha
equal to native (`8e013860`). The light and selection-mode loops have counts
read from buffers, so they cannot be unrolled exactly. The experiment was
reverted. The cost is WebKit's. Removing it needs WebKit to compile loops
without a `volatile` counter (not reported). Until then, `?env=TF_DEBUG=HDX_DISABLE_ALPHA_TO_COVERAGE`
plays large scenes at the display rate. It changes only partially transparent
pixels of default-material draws and stored AOV alpha.

**Chrome (same Mac, November 9).** The bench in Chrome 156 (Dawn,
also WGSL to Metal), 16 layers, 4x MSAA, the 64-iteration loop: off 1.6 ms,
hardware alpha to coverage 1.3, `sample_mask` 0xF 1.2, the alpha-to-one mask
1.3, unrolled 1.3-1.4 (`discard` 14-20 ms there). The same GPU runs the
looped, coverage-changing fragment at full speed under Dawn's compiler, so
the cost is specific to WebKit's. The viewer itself does not draw in Chrome
(a vertex stage binds 11 storage buffers; Chrome reports a limit of 10, Safari
44), so the scene could not be compared there. (Since `7fa27754` it draws in
Chrome; see the next section.)

## Packed pulled attributes: copying only what changed (November 9, 2026)

Chrome 156 on macOS allows 10 storage buffers per shader stage, so
HgiWebGPU draws pipelines over that limit with a variant that reads the
control point indices and all pulled attributes from one packed buffer
filled by GPU copies (`7fa27754`,
`PLATFORM-DIVERGENCE(webgpu-storage-buffer-limit)`,
`pulledAttributePacker.ts`). `HGIWEBGPU_FORCE_PACKED_ATTRIBUTES` takes the
path on any device. Nothing tracked writes, so every cmds copied every
source again.

**Change** (branch `perf/packed-versions`). Each `HgiWebGPUBuffer` has a
write version, bumped when the work that writes its GPU contents is
submitted: `HgiWebGPUBlitCmds` CopyBufferCpuToGpu, CopyBufferGpuToGpu (also
within one buffer), CopyTextureToBuffer and FillBuffer, and compute and
graphics cmds that bind it as writable (`'storage'`) storage. Nothing else
in hgiWebGPU writes an Hgi buffer (`queue.writeBuffer` and mapped writes
fill only HgiWebGPU's own constants, sampler state and staging buffers;
the initial data is version 0). A packed buffer records, per source range,
the source and the version it holds; a cmds copies, on its pre-pass encoder
ahead of the draws as before, only the ranges whose source changed (or
that work encoded earlier in the same cmds writes), and at submission
copies again ranges written by work submitted in between. It is rebuilt only
when a source's identity or size changes. `bufferWriteVersion.test.ts` runs
every `HgiWebGPUBlitCmds` method against a fake device that reports each
command's written buffers and fails if one keeps its version.

**Measurements.** Safari 27.3, M4 Pro, one asset-acceptance `--perf` run
each (`node scripts/asset-acceptance/run.mjs --manifest
scripts/viewer-perf/assets.json --skip-native --skip-usdview --perf --runs 1
<asset>`), the forced runs with the setting's default switched to true
(1-minute load 3-8; another session's pages took the front window twice, so
two bike runs paused hidden after their captures; settle, bytes and memory
are measured before that):

| CarbonFrameBike | Forced, before (`c88bb232`) | Forced, after | Off, after |
|---|---:|---:|---:|
| Bytes copied (whole run) | 17.5 GB | 95 MB | 40 MB |
| Live GPU memory | 169 MB | 169 MB | 127 MB |
| First settled frame | 4.0 s | 4.0 s | 3.7 s |
| Orbit frame interval, median / p95 | 17 / 18 ms | 17 / 18 ms | 17 / 20 ms |
| Playback frame interval, median / p95 | 26 / 32 ms | 29 / 36 ms | 24 / 33 ms |
| Performance guard (settled at most 3,350 ms) | fails | **fails** | fails this run |

| BrainStem (skinned) | Forced, before (`c88bb232`) | Forced, after | Off, after |
|---|---:|---:|---:|
| Bytes copied (whole run) | 857 MB | 286 MB | 85 MB |
| Playback frame interval, median / p95 | 17 / 18 ms | 17 / 18 ms | 17 / 18 ms |
| First settled frame | 2.3 s | 2.2 s | 2.3 s |

The "before" bike column is the run recorded in `KNOWN-GAPS.md` the same day
(off then: 3.2 s settled). The copies are gone from the bike's cost but the
settle time is not: in the forced run the last render before convergence
took 930 ms against 256 ms off, 335 ms of it one `hdSt.CodeGen.Compile`, so
the remaining cost is compiling the packed program variants, not copying.
Off, this run's 3.7 s settle (3.2 s earlier the same day) is load noise
from one run. BrainStem's remaining 200 MB over off is its skinned points,
copied once per frame they change. The packed buffers keep their memory.

**Correctness.** basic-drawing, hdst-programs and usdimaging-gl in Safari,
forced on and off: all 332 rendered images byte-identical, and identical to
`c88bb232` run the same evening. Against the committed
`imaging-status.json`, hdst-programs matches; 13 basic-drawing rows (points
and wire differ by 105 instead of 107 pixels) and 3 usdimaging-gl rows
(Cards_SceneIndex basic and visibility, BasicLighting_refined) differ the
same way on `c88bb232`, so they predate this change (Safari 27.3). With a
mutation that never copies a range again, the forced usdimaging-gl run
fails the later frames of UsdSkelExtCompCPU/GPU arm and arm_baked and
SkelBlendShapes, so those suites check that deforming points reach the
packed buffer. Chrome 156 (throwaway profile): the same large scene (two
frames) and CarbonFrameBike draw, with no WebGPU errors; the only error is
the known `ExtComputation` binding-limit report.

## A long animated scene: hitches at the load schedule's frames (November 9, 2026)

The viewer following a native usdview through a long animated scene (`?follow=`, `?loadSchedule=1`) showed a long
frame and then a camera snap near the end of most rooms. Measured with
`apps/usdview/scripts/viewer-perf/follow-perf.ts` (Node, stub GPU, CPU
only), every frame 1-16665 of a long animated test scene that isn't included in this
repository, with its camera, `--complexity high`, the scene's own profile and
fallback plugins, at 1280x720. Base `c88bb232`; two processes per build,
alternated, load averages 7-44 (other test suites and Safari runs).
The SSR bundle must be given `--web-profile
apps/usdview/public/plugins/typescript-usd-web-profile/plugInfo.json` when it
is built outside `viewer-perf/`: its default path is relative to the bundle,
and a bundle elsewhere runs without the viewer's profile (the earlier
5-6 ms "normal frame" figures were taken that way; with the profile, the
median frame is 2.5-2.8 ms).

**Where the time went (base).** 58 of 16,664 frames took over 42 ms (24
frames per second). Three kinds:

1. *Load and unload frames* (39 of the 58). At a carrier's first frame the
   follower does `UsdStage::LoadAndUnload`, `SetTime` and one `Render`.
   Frame 3036 (a section with 152 layers): 558 ms = the load 85
   (of it about half reading and parsing the payloads' layers: composition
   that meets an unopened layer waits for it and computes the prim index
   again, `pcp/src/cache.ts` `PcpCacheLayerSource`), `ApplyPendingUpdates`
   104 (the resync through the scene index chain) and `SyncAll` 273 (rprim
   and material sync; a third of it self time in `HdMergingSceneIndex.getPrim`).
   Frame 3681, the unload of the same section, 330 ms, all in the scene index
   chain's `PrimsRemoved` (sorting every instance path per removed entry, see
   below). Frame 7127 (`animation/characters`): `CommitResources` 126 ms,
   OpenSubdiv's uniform refinement of the subdivided characters
   (`hdSt/src/subdivision.ts` `resolve`, `packages/opensubdiv`).
2. *First-use shader frames* (18 of the 58, 15-70 frames after a load, e.g.
   55, 3057-3059, 3768-3772, 4169, 7843-7846, 11899-11906; 78-163 ms). Texture
   loads are asynchronous (`hdSt/src/textureObjectRegistry.ts`); while any is
   loading Storm draws nothing and the viewer keeps the frame it last showed
   (`apps/usdview/src/runtime.ts` `present`), so the image holds still. The
   first frame that draws again builds the batches and compiles every new
   program at once: `HdSt_CodeGen.Compile` 115-128 ms of which the GLSL to
   WGSL translation 84-95, `HgiWebGPU` pipelines 12. The rest compile when
   batches whose items were all frustum culled first come into view
   (upstream compiles at first draw too; there the driver's compile is fast).
   The translation cache (`hgiWebGPU/src/glsl/glslShaderBodyTranslator.ts`)
   already shares identical stage bodies: over the scene 189 programs are
   compiled, every one a distinct hash, 440 shader functions of which 377
   distinct sources, 565 modules of which 461 distinct.
3. *A lighting change* (frame 14309-14311, 91-100 ms, no load): in the
   lights wing the dome light's computations run on that frame
   (`HdSt_DomeLightComputationGPU`) and the visible batches' programs are
   compiled again, most likely because the lighting shader they include
   changed (not traced further).

In follow mode (`--follow`, 24 frames per second of wall clock, frames
2960-3140, three processes) the frames around 3036 were: the load frame
625-656 ms (the follower then jumps 13 frames), a few frames held while
textures load, the compile frame 150 ms (another jump of 5): the image stood
still for about 0.9 s and then snapped, which is the hitch seen in the
browser. Safari adds WebKit's pipeline compile and runs this JavaScript about
1.5x slower.

**Changed.**

- *Read ahead* (`apps/usdview/src/load-prefetch.ts`, a viewer adaptation in
  `apps/usdview/docs/viewer-contracts.md`). For the 48 frames before a
  carrier's window opens, the viewer opens the layers its payloads bring in
  (the payload layers and, transitively, the sublayers, references and
  payloads they name) with `SdfLayer::FindOrOpen` under the stage's resolver
  context, and holds them through the window's first frame. The load then
  finds them in the layer registry. Nothing loads early. The sum of the load
  calls over the scene: 1,020 -> 390 ms; frame 3036's load 85 -> 32 ms.
- *Compiling ahead* (`PLATFORM-DIVERGENCE(hdst-compile-ahead)`,
  `hdSt/src/commandBuffer.ts`). After a pass draws, and on the frames it
  draws nothing while textures load, the batches that have not drawn yet
  compile their programs, within 8 ms per frame shared by the passes
  (`HDST_COMPILE_AHEAD_MS`, 0 restores compile-at-first-draw), not on the
  frame that built the batches. A draw that finds its program compiled uses
  it; a changed shader still recompiles at the draw. On 7500-7950 the
  compile count went from 33 to 36 (three programs compiled for a state that
  changed before they drew).
- *Two ports made faithful.* `HdMergingSceneIndex` returned every input for
  every path; upstream looks the inputs up in its path table once there are
  five or more (`hd/mergingSceneIndex.cpp:71-127, 424-429`). Point
  instancer prototypes give the merging scene index of a gallery hundreds of
  inputs, so each `getPrim` scanned all of them. And the instance
  aggregation and native prototype propagating scene indices sorted every
  instance path once per removed entry; upstream walks its `std::map` from
  `lower_bound` (`niInstanceAggregationSceneIndex.cpp:1310-1331`,
  `niPrototypePropagatingSceneIndex.cpp:561-576`); the port now sorts once
  per notice and does the same. A test checks the path-table lookup against
  a scan of every input (`hd/tests/mergingSceneIndexPathTable.test.ts`).

**After.** Frames over 42 ms: 58 / 57 -> 35 / 38 (two runs each). Over 42 ms
outside load and unload frames: 19 / 18 -> 1 / 1 (the lighting change).
Median frame unchanged (2.7-2.8 ms); p99 11.8 -> 15.2 ms (frames that
compile ahead). Worst frame per wing (run 1 / run 2) and frames over 42 ms:

| Wing | Before (ms) | >42 | After (ms) | >42 |
|---|---|---:|---|---:|
| foundations | 1063: 189.9 / 1063: 180.9 | 10/9 | 1063: 162.4 / 1063: 217.9 | 4/4 |
| composition | 3036: 557.7 / 3036: 562.3 | 11/11 | 3036: 409.3 / 3036: 409.8 | 6/7 |
| instancing | 4364: 140.6 / 4364: 140.1 | 6/6 | 4364: 123.7 / 4364: 127.6 | 3/3 |
| animation | 7127: 217.2 / 7127: 213.8 | 8/8 | 7127: 185.4 / 7127: 191.4 | 6/6 |
| stage | 7783: 127.9 / 7846: 138.5 | 7/7 | 9685: 113.4 / 8346: 105.7 | 5/5 |
| geometry | 10473: 116.9 / 10473: 116 | 5/5 | 10473: 98.2 / 10473: 96.7 | 3/4 |
| materials | 11831: 158.1 / 11831: 168.3 | 6/6 | 11831: 121.9 / 11831: 117.6 | 3/4 |
| lights | 14310: 90.8 / 14309: 92.4 | 2/2 | 14309: 95.9 / 14311: 99.9 | 2/2 |
| cameras | 15304: 90.9 / 14492: 91.9 | 2/2 | 14492: 78.7 / 14492: 76.3 | 2/2 |
| physics | 15988: 85 / 15988: 80.2 | 1/1 | 15988: 73.8 / 15988: 74.8 | 1/1 |

Frame 3681 (the unload): 330 -> 128 ms. Frame 3036: 558 -> 409 ms (load 85
-> 32, `ApplyPendingUpdates` 104 -> 75, `SyncAll` 273 -> 229). In follow
mode (three processes) the same stretch went to a load frame of 498-509 ms
and a first drawn frame of 100-131 ms: there the textures load within one
to three frames of
wall time, too few for the 8 ms budget to compile everything, so part of
the compile still lands on the first frame that draws. (Three times the
budget on frames that draw nothing was tried; it put frames right after a
load at 43-52 ms in the every-frame run, and was dropped.)

Correctness. Safari 27.2, the asset-acceptance harness's browser step
(`--skip-native --skip-usdview --runs 1`) on base and on this branch for
chess, mcusd, damaged_helmet, curves, pi_basic, ni_cubes, skel_arm,
dome_light and translucent_overlay: all 18 captures (`browser.png`,
`browser-usdrecord.png`) are byte-identical. The library suite: 8,748 pass,
45 fail, the same failures as base `c88bb232` (8,747 / 46 there; the
difference is `testVdfVector TestSharedVector`, which passed this time). The
viewer suite: 637 pass (635 and the two read-ahead tests).

**Not done.** Spreading a load's Hydra population over several frames
would change what the frames after the load show (the gallery would appear
in parts), so it was not done; the load frames that remain over 42 ms are
that population (`ApplyPendingUpdates` and `SyncAll`, 40-300 ms) and, at
7127, OpenSubdiv refinement. What remains to try: the scene index chain's
cost per added prim (about 30 filtering scene indices; `getPrim` through
them dominates `SyncAll`), the refinement in `packages/opensubdiv`, reading
the next carriers' textures ahead (the held-image frames after a load are
texture decode), and the lighting-change recompile.
## The side-by-side compare: a brightening and a snap at each wing's load (November 11, 2026)

In the side-by-side compare (a local script; C++ usdview
leading, this viewer following in Safari) the review showed, near the end of every
wing, the TypeScript view get a little brighter and then the camera snap.
Measured on the same test scene (not in this repository) at a fixed revision (11,908
frames; the Node runs on an archived copy of that revision, as the scene was
regenerated during the session), at the nine loads of a next wing's hall,
base `0d52c521`. Node: `apps/usdview/scripts/viewer-perf/follow-perf.ts`
(stub GPU, CPU only; `--follow` at 24 frames per second; the new `--lights`
logs the lighting context Storm draws with on every frame). Safari 27.3: a
follower tab on its own relay, driven by a Node leader at 24 frames per
second, with a probe (not committed) recording every `present` (time, frame,
held or drawn, CPU ms, mean RGB of the canvas) and every GPUDevice pipeline
call; the window was full screen (2276x1312).

**The brightening is the scene's.** Storm's lights never drop out. On every
frame around each load the simple light task's lighting context holds the
camera light plus the visible lamps, 4 before and 6 after the load (5 -> 7 at
10416): the two dim lamps the note names. Never zero lights, never a
default or dome fallback. Upstream has none to fall back to either:
usdview hands the engine the camera light (and the default dome light when
enabled) on every draw, whatever the scene holds (`usdviewq/stageView.py`
1451-1483), and `HdxSimpleLightTask::Sync` lights with the light sprims it
finds (`hdx/simpleLightTask.cpp`), as this port does. The step in mean RGB
(0-255, average of the three channels) at the first frame drawn after the
load is +0.4 to +2.2 in Safari, against +1.0 to +1.7 for C++ Storm
(`UsdAppUtils.FrameRecorder`, 1280x720, the schedule applied before each
frame as a usdview load-schedule plugin does): the lamps and the newly loaded hall, in
both. The note's "less than 1/255" came from usdrecord, which does not apply the
schedule: every payload is loaded there, and the hall is already in view. The difference is when: C++ shows the step
at the load frame, the follower showed it up to a second later, at the end
of a hold, together with a jump: that is the brightening the review saw.

**Where the load frame goes** (Node, every frame, base):

| Load (glide) | Frame ms | LoadAndUnload | ApplyPendingUpdates | SyncAll | Compile | CommitResources | Lights before -> after |
|---|---:|---:|---:|---:|---:|---:|---|
| 1153 (1201) | 190 | 37 | 11 | 111 | 0 | 3 | 4 -> 6 |
| 2513 (2561) | 110 | 10 | 8 | 76 | 0 | 2 | 4 -> 6 |
| 3159 (3207) | 177 | 17 | 10 | 126 | 0 | 5 | 4 -> 6 |
| 5822 (5870) | 161 | 12 | 9 | 111 | 3 | 2 | 4 -> 6 |
| 7553 (7601) | 109 | 8 | 5 | 78 | 0 | 7 | 4 -> 6 |
| 8762 (8810) | 222 | 21 | 8 | 164 | 3 | 4 | 4 -> 6 |
| 9785 (9833) | 89 | 8 | 3 | 65 | 0 | 1 | 4 -> 6 |
| 10416 (10464) | 126 | 12 | 5 | 92 | 0 | 2 | 5 -> 7 |
| 11344 (11392) | 146 | 10 | 6 | 85 | 3 | 29 | 4 -> 6 |

The load frame draws nothing: the hall's placard textures (42-102 PNGs)
start loading there, and while any texture loads Storm draws nothing and the
viewer keeps the image it last showed (`hdSt/src/renderPass.ts`,
`runtime.ts` `present`). Upstream loads them inside that frame's commit.

**What made the image stand still and then jump.** Three things, all ours:

1. *The hold after the load* (Safari base: 0.29-0.94 s with the image still,
   then a jump of 7-19 frames). The textures were read and decoded only once
   the load had composed them, and the layer read-ahead of November 9 never
   ran in Safari: it opened each layer inside `ArResolverContextBinder.run`
   with an asynchronous function, which throws without the host's
   AsyncContext (`ar/src/asyncState.ts`; Node has AsyncLocalStorage, so the
   Node measurements of November 9 did not show it), and the throw was
   caught as "nothing to read". Every Safari load composed from unread
   layers.
2. *First-use pipeline compiles at the glide* (Safari base, the first sweep of
   the session: 858 ms at 5876, 3,379 ms at 8816, 1,401 ms at 10470, a few
   frames after the camera starts toward the doorway). Compile-ahead had
   translated those batches' programs, but each GPURenderPipeline was created
   at its first draw, and WebKit compiles the pipeline's Metal shaders then:
   the frame waits for it. The same frames create new pipelines in Node. Once
   WebKit has compiled a pipeline it reuses it across reloads, so repeat runs
   (and fresh-page runs) no longer show these frames: the first pass through
   a wing after a Safari start or a shader change does. This is the camera
   snap: the image holds for seconds just as the camera starts to move.
3. *Two draws per leader frame.* The follower is told the play state with
   every message, and `setPlaybackActive` scheduled a redraw each time, so
   every frame was rendered and presented twice (Safari: 220-234 presents in
   a run, 121-123 after).

**Changed.**

- `apps/usdview/src/load-prefetch.ts`: the context is bound only while each
  Ar call starts (the call reads it then and its asynchronous work keeps it),
  so the read-ahead works without AsyncContext; and the images the carrier's
  layers name (asset-valued attributes with an image extension) are read and
  decoded ahead too, through
  `PLATFORM-DIVERGENCE(hio-image-read-ahead)` (`hio/src/stbImage.ts`,
  `typescript-usd/hio/_internal`), and held until 24 frames after the window
  opens. The texture open at the load takes them from memory.
- `PLATFORM-DIVERGENCE(hgiwebgpu-pipeline-ahead)`: compile-ahead
  (`hdst-compile-ahead`, `hdSt/src/pipelineDrawBatch.ts`) also creates the
  batch's draw pipeline, through `HgiWebGPU._createGraphicsPipelineAhead`,
  which uses `createRenderPipelineAsync`; a first use before it is ready
  creates it synchronously, as before.
- `runtime.ts` `setPlaybackActive` redraws only when the play state changes.

**After** (Node follow, two runs each, frames skipped between the last image
before the load and the first after it, and the load frame's ms):

| Load | Before | After |
|---|---|---|
| 1153 | 13 (196 ms) / 15 (209 ms) | 6 (195 ms) / 6 (199 ms) |
| 2513 | 8 (127 ms) / 6 (120 ms) | 4 (137 ms) / 4 (116 ms) |
| 3159 | 10 (181 ms) / 11 (174 ms) | 6 (183 ms) / 6 (178 ms) |
| 5822 | 10 (162 ms) / 11 (170 ms) | 5 (164 ms) / 6 (184 ms) |
| 7553 | 8 (117 ms) / 8 (114 ms) | 4 (115 ms) / 4 (115 ms) |
| 8762 | 13 (225 ms) / 14 (247 ms) | 7 (224 ms) / 7 (230 ms) |
| 9785 | 5 (92 ms) / 5 (95 ms) | 3 (94 ms) / 3 (98 ms) |
| 10416 | 8 (123 ms) / 9 (137 ms) | 4 (119 ms) / 4 (119 ms) |
| 11344 | 7 (147 ms) / 7 (159 ms) | 4 (153 ms) / 4 (147 ms) |

After, only the load frame is held; what remains of the jump is that frame's
own length (SyncAll of the new hall) and the next frame, which commits the
textures and compiles the programs the two new lamps changed (the lighting
shader's light count is in every program's hash, as upstream).

Safari, before and after the pipeline and redraw changes (the image read-ahead
was not yet working in Safari in this run): image still (ms) / frames
skipped at the load, presents per run, and the longest draw after the glide:

| Load | Before | After |
|---|---|---|
| 1153 | 407 / 9, 232, 30 ms | 648 / 14, 123, 30 ms |
| 2513 | 630 / 14, 225, 20 ms | 422 / 9, 123, 17 ms |
| 3159 | 604 / 13, 230, 24 ms | 634 / 13, 122, 23 ms |
| 5822 | 508 / 10, 229, **858 ms @ 5876** | 468 / 9, 122, 39 ms |
| 7553 | 390 / 9, 232, 29 ms | 875 / 21, 122, 30 ms |
| 8762 | 944 / 19, 157, **3,379 ms @ 8816** | 931 / 17, 121, 44 ms |
| 9785 | 288 / 7, 234, 15 ms | 214 / 5, 123, 25 ms |
| 10416 | 477 / 11, 226, **1,401 ms @ 10470** | 375 / 9, 122, 35 ms |
| 11344 | 933 / 12, 220, 326 ms | 264 / 6, 121, 25 ms |

In that run the pipelines of those frames were created by
`createRenderPipelineAsync` during the hold, and no `createRenderPipeline`
ran at the glide frames; but WebKit's pipeline cache was warm by then, so the
missing long frames do not by themselves prove the change. A Safari run with
the image read-ahead working (the AsyncContext fix) held only the load frame
at every threshold (1 draw instead of 5-26), but it ran while the scene was
being regenerated and every frame, before the loads too, was 2-4 times
slower than in the other runs, so its times are not comparable and are not
given; Safari was then in use for the compare, and it was not repeated. To
confirm in the compare: the first pass through each wing after starting
Safari, the frames after the glide starts (no multi-second hold), and the
brightening arriving together with C++'s at the load frame.

Correctness: no change to what is drawn. The viewer suite passes 678 (the
two known `hydra-scene-debugger-native` failures), with new tests for the
image read-ahead and its hold (`tests/load-prefetch.test.ts`, including a
binder without AsyncContext), the pipeline created ahead
(`tests/pipeline-ahead.test.ts`), `hio/tests/imageReadAhead.test.ts`
(pixels against the native capture) and
`hgiWebGPU/tests/pipelineAhead.test.ts`. hio, hgiWebGPU, hdSt and hdx: 923
pass, 2 fail (`testHdStBufferArray`, `testHdStBarAllocationLimit`, failing
on main too).
