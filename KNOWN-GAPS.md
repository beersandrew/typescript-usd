# Known gaps

What typescript-usd does not do, or does differently from OpenUSD
[v26.11.1](https://github.com/PixarAnimationStudios/OpenUSD/tree/v26.11.1).
Each item says what is missing or different, what it means for someone using
the library or the viewer, where the evidence is in this repository, and its
status:

- **by design**: not planned, because it does not apply to a TypeScript and
  WebGPU port (another GPU backend, Python, a native-only facility);
- **not yet ported**: in scope, not done;
- **known bug**: ported, but the result differs from OpenUSD.

As of `main` at `754736d8` (November 8, 2026). Numbers come from the
repository's own tools, each named with its result: the library test suite
(`cd packages/usd && npx vitest run`, run once at that commit), the upstream
test coverage script (run with the tooling kept outside this repository),
the generated imaging ledger
([packages/usd/docs/imaging-status.md](packages/usd/docs/imaging-status.md),
whose suites were last run on November 11, 2026, in Safari 27.3) and the dated
performance documents. Anything not measured is said to be not measured.
Known divergences are also marked in the code: `FAITHFULNESS-DEBT(<id>)` for
a stand-in that can be retired by porting the upstream mechanism, and
`PLATFORM-DIVERGENCE(<id>)` for a difference JavaScript, the browser or
WebGPU forces. Every id, its code sites and its faithful end-state are in the
generated [packages/usd/docs/faithfulness-debt.md](packages/usd/docs/faithfulness-debt.md).
The ids are given below so each item can be traced to its code site.

## Platform and runtime

- **WebGPU is the only GPU backend, and Storm is the only render delegate.**
  There is no HgiGL, HgiMetal or HgiVulkan, and no hdEmbree, hdPrman or other
  Hydra renderer plugin. Rendering needs a WebGPU device; Node can run every
  CPU step but draws nothing. Evidence: `packages/usd/pxr/imaging/` (hgi,
  hgiWebGPU, hdSt and the `plugin/hdStorm` plugin only). Status: by design.
- **Safari and Chrome on macOS have been tested; no other browser or OS.**
  The viewer is checked in Safari 27.3 (WebKit 605.1.15) on an Apple M4 Pro
  Mac and in Chrome 156 (156.0.8078.80, WebGPU adapter apple / metal-3) on
  the same Mac. Since November 11, 2026 every image suite and both asset
  sets of the imaging ledger run in both browsers
  (`run.mjs --browser chrome`, a separate Chrome instance with its own
  profile): Chrome's results equal Safari's but for 14 image rows over
  its binding limits (below) and a few one-level pixels, and every asset
  passes in both. Firefox,
  other operating systems and other GPUs are not measured, so whether it runs
  there is unknown. Evidence: [apps/usdview/README.md](apps/usdview/README.md),
  the conditions in
  [performance-viewer.md](packages/usd/docs/performance-viewer.md). Status:
  not measured.
- **Chrome's WebGPU binding limits are much lower than Safari's.** Chrome 156
  on macOS reports 10 storage buffers per shader stage
  (`maxStorageBuffersPerShaderStage`, `maxStorageBuffersInVertexStage`,
  `maxStorageBuffersInFragmentStage`), 12 uniform buffers, 48 sampled
  textures, 16 samplers and 8 storage textures per stage; Safari reports 44
  storage buffers. Storm's emulated post-tessellation draws declared up to 20
  storage buffers in the vertex stage. HgiWebGPU now makes a binding visible
  only to the stages that use it (`PLATFORM-DIVERGENCE(webgpu-binding-visibility)`),
  binds the tessellator's points only for draws with per-patch factors, and,
  when a pipeline is still over the device's limit, pulls the control point
  indices and all vertex attributes from one buffer it packs with GPU copies
  (`PLATFORM-DIVERGENCE(webgpu-storage-buffer-limit)`; Safari does not take
  this path unless `HGIWEBGPU_FORCE_PACKED_ATTRIBUTES` is set). The packed
  path costs GPU memory equal to the packed vertex and index buffers, a GPU
  copy of each source buffer whenever it is written (every HgiWebGPU write
  path bumps a per-buffer write version; since November 9, 2026 only the
  sources written since the last copy are copied again, so deforming and
  skinned meshes copy their points each frame and static ones once), slower
  first frames from compiling the packed shader variants, and a second path
  to test. Forced on in Safari 27.3 (M4 Pro), CarbonFrameBike (one
  asset-acceptance `--perf` run each, forced on and off): orbit (17 ms) and
  playback (29 / 24 ms median) intervals within run-to-run noise; bytes
  copied 95 MB against 40 MB off (17.5 GB before the write versions); live
  GPU memory 169 MB against 127 MB; first settled frame 4.0 s against
  3.7 s, still over the performance guard's 3.35 s, from one longer program
  compile, not the copies. BrainStem (skinned) copied 286 MB against 85 MB
  off (857 MB before). The basic-drawing, hdst-programs and usdimaging-gl
  image suites give byte-identical images with it on and off, the skinned
  and blend shape frames included. Details: performance-viewer.md, "Packed
  pulled attributes: copying only what changed".
  A pipeline that still exceeds a limit is reported (`TF_CODING_ERROR` with
  the counts) and its draws are skipped (`PLATFORM-DIVERGENCE(webgpu-binding-limits)`).
  The image suites in Chrome 156 (November 11, 2026) find these cases, 14
  rows (`webgpu-binding-limits` in the ledger's Chrome section): UsdSkel's
  GPU skinning and blend shape computation declares 13 storage buffers
  (Storm's ExtComputation layout, unchanged), so a library user's skinned
  points stay at the rest pose (testUsdImagingGLSkelBlendShapes,
  testUsdImagingGLUsdSkelExtCompGPU_arm and _twoBends, which force GPU
  skinning; CarbonFrameBike: one brake cable); instanced draws with their
  instance primvars and nested instance indices (11-16 vertex storage
  buffers) and GPU frustum culling (11-17 compute storage buffers) in
  testHdStInstancing (Unbalanced, Refined, Wire, Div3_Level3, Div4_Level4,
  Div5_Level2); refined basis curves in testHdStCurveDrawing_lv1_refined
  (11). The packed path covers the vertex attributes and control point
  indices only. The viewer sets upstream's
  `USDSKELIMAGING_FORCE_CPU_COMPUTE=1` itself on such a device, unless the
  page's `env=` sets it, so it skins on the CPU and draws
  (`apps/usdview/src/gpu-device-settings.ts`,
  `PLATFORM-DIVERGENCE(viewer-cpu-skinning-fallback)`). Status: platform limit.
- **Optional WebGPU features change results.** Without the device feature
  `primitive-index`, a non-patch draw that reads `gl_PrimitiveID` reads 0
  (`PLATFORM-DIVERGENCE(hgiWebGPU-primitive-id)`); without
  `float32-filterable`, float textures are sampled differently
  (`hgiWebGPU/src/capabilities.ts`, `depthSampling.ts`). Which browsers offer
  which features is not measured. Status: platform limit.
- **One JavaScript thread instead of TBB.** Pcp prim indexing, stage
  population, crate reading and teardown run serially. OpenExec runs
  upstream's serial engine configuration only. The one use of threads is
  image decoding, which runs on a pool of Web Workers
  (`hio/src/stbImageDecodePool.ts`). Impact: on the measured assets the native
  build's default 12 threads gave at most 1.6x over its single-threaded
  build, which is itself 3-9x faster than either JavaScript engine. Evidence: [performance-p1.md](packages/usd/docs/performance-p1.md)
  section 7, `packages/usd/pxr/base/work` (a subset). Status: by design.
- **I/O is asynchronous.** `Stage.open` returns a promise. OpenUSD's
  synchronous `ArResolver::Resolve`/`OpenAsset` calls made during Hydra's
  synchronous processing (glslfx files, card textures and similar) are served
  from assets read ahead through Ar (`ar/src/prefetchedAssets.ts`,
  `hio/src/glslfxPrefetch.ts`). Ar scoped caches are carried with the
  resolver context because browsers have no async-context propagation
  (`PLATFORM-DIVERGENCE(ar-explicit-cache-carrier)`). Impact: code that calls
  a synchronous read the prefetcher did not anticipate gets nothing. Status:
  by design.
- **Resolver plugins can register after the resolver exists.** Resolver
  types are registered as in OpenUSD (`DefineResolver` and a plugInfo.json
  `Types` entry, see the package README), but a browser registers plugins at
  any time, so a URI or package resolver registered after the first
  `GetResolver()` call is still found; the primary resolver is chosen once
  (`PLATFORM-DIVERGENCE(ar-resolver-late-registration)`). The viewer reads
  over HTTP through such a plugin (`apps/usdview/src/http-resolver.ts`).
  Status: by design.
- **Tests carry resolver instances in contexts.** Many ported tests, and
  usdGenSchema's in-memory schema assets, hand a stage a resolver instance
  through an internal context rather than registering a resolver plugin or
  reading files as upstream's tests do
  (`FAITHFULNESS-DEBT(ar-host-resolver-carrier)`). Impact: none on the
  public API. Status: not yet ported.
- **No Python bindings.** None of `pxr.*` exists, and Python-only upstream
  tests are not run (see "Upstream tests not ported"). Status: by design.
- **The parsers are not fuzzed.** Do not give the library untrusted input.
  Status: not measured.

- **Edits that must open a layer recompose asynchronously.** OpenUSD
  recomposes inside the edit, opening sublayer, reference and payload layers
  synchronously. Here a layer is opened through an asynchronous resolver, so
  an edit that needs an unopened layer finishes composing after the call
  returns; read the stage after `await stage.flushChanges()`. Edits whose
  layers are already open (anonymous layers, layers already loaded) recompose
  synchronously (`PLATFORM-DIVERGENCE(usd-async-layer-open-composition)`,
  `usd/src/stage.ts`). Status: by design.

## Libraries and tools not ported

Compared with OpenUSD 26.11.1's `pxr/` tree. Evidence: the directories under
`packages/usd/pxr/`, which mirror upstream's.

- **Other GPU backends and GL support: hgiGL, hgiMetal, hgiVulkan, garch.**
  Status: by design.
- **Python-only and Qt pieces: Python bindings (`pxr/external/boost/python`),
  usdviewq and the `usdview` Python application.** The browser viewer in
  `apps/usdview` is a separate TypeScript port (see "Viewer"). Status: by
  design.
- **Render and file-format plugins: hdEmbree, usdAbc (Alembic), usdDraco,
  sdrOsl, the RenderMan plugins under `third_party/renderman`.** Opening an
  `.abc` or Draco-compressed asset fails as it does in an OpenUSD build
  without those plugins. Status: not ported (the RenderMan plugins are out of
  scope).
- **Image plugins: hioImageIO, hioOiio, hioAvif.** Only the formats in
  "File formats and images" read. Status: not yet ported.
- **usdUtils: the Python-only modules.** The C++ library is ported
  (`packages/usd/pxr/usd/usdUtils`); `usdzUtils.py` (ExtractUsdzPackage and
  the usdz scan, update and asset iterators), `updateSchemaWithSdrNode.py`,
  `constantsGroup.py`, `fixBrokenPixarSchemas.py` and `toolPaths.py` are not,
  nor the Python-only `_BooleanExpressionRenameVariables` of
  `wrapPipeline.cpp`. In a browser, asset localization and usdz packaging find
  no clip-template files or external asset files and have no temporary files
  for modified layers (`PLATFORM-DIVERGENCE(usdutils-host-filesystem)`); the
  diagnostic delegates throw a fatal `TfError` where OpenUSD aborts the
  process (`usdutils-abort-throws`); `ComputeUsdStageStats` reports no memory
  use (`usdutils-stage-stats-no-malloc-tags`). A plugin that provides
  registered variant sets must be loaded with `loadAsync` before the first
  `UsdUtilsGetRegisteredVariantSets()`. Status: not yet ported (Python
  modules); by design (the rest).
- **hdGp and usdProcImaging.** Generative procedural prims are not expanded:
  the Hydra procedural framework is not there. Status: not yet ported.
- **Particle field imaging (Gaussian splats).** The UsdVol particle field
  schemas (`ParticleField3DGaussianSplat` and its kernel and attribute APIs,
  new in 26.03) are ported and generated; usdVolImaging's particle field
  adapter, Hydra's `HdParticleFieldSchema`, `HdsiParticleFieldConversionSceneIndex`
  and the `extras/imaging/examples/hdParticleField` reference delegate are not.
  Nothing draws a splat. Native Storm draws nothing for one either (no hdSt
  code reads particle fields and nothing installs the conversion scene index,
  hd/version.h:144); native renders them only through hdParticleField.
  Status: not yet ported (set aside November 11, 2026).
- **usdIrImaging, usdPmc, usdAppUtils, `pxr/base/js`, `pxr/exec/execTest`.**
  `hio/src/dictionary.ts` stands in for the `js` JSON reader
  (`FAITHFULNESS-DEBT(hio-js-reader)`). Status: not yet ported.
- **Command-line tools: usdcat, usddiff, usdtree, usdedit, usdresolve,
  usdstitch, usdstitchclips, usdzip, usdcompress, usdchecker, usdrecord,
  sdfdump, sdffilter, usdgenschemafromsdr and the others under `pxr/bin`,
  `pxr/usd/bin`, `pxr/usdImaging/bin`.** The library has the APIs most of
  them call, but not the tools. Status: not yet ported.
- **The legacy UsdImagingDelegate path** (`USDIMAGINGGL_ENGINE_ENABLE_SCENE_INDEX=false`).
  Only the scene index path exists. Evidence: the 4 not-run
  `testUsdImagingGLCards*` rows of the imaging ledger. Status: by design.
- **hf and hdar** have no library of their own; the parts used are folded
  into `hd/src/rendererPluginRegistry.ts` and
  `usdImaging/src/dataSourceStage.ts`. Status: by design.

## File formats and images

- **Reads and writes:** `.usda`, `.usdc`, `.usdz` (`sdf/src/usdaFileFormat.ts`,
  `crateFile.ts`, `crateWriter.ts`, `usdzFileFormat.ts`), and `.mtlx` when
  `typescript-usd/usdMtlx` is imported. Runtime file-format plugins can be
  registered from a `plugInfo.json` URL
  ([packages/usd/README.md](packages/usd/README.md)).
- **Textures read:** PNG, JPEG, BMP, TGA, Radiance HDR (ports of stb_image,
  `hio/src/stbImage.ts`) and OpenEXR (a port of the OpenEXRCore OpenUSD
  vendors, `hio/src/openexrHioImage.ts`). TIFF, AVIF and anything else that
  native reads through ImageIO, OIIO or hioAvif do not read. Status: not yet
  ported.
- **OpenEXR limits.** Deep scanline and deep tiled parts are not decoded
  (`hio/src/openexrCore.ts` header). HTJ2K compression fails, as it does in
  the OpenEXRCore OpenUSD vendors. Some header attribute types (box, matrix,
  rational, vector) throw from `GetMetadata` instead of being converted
  (`openexrHioImage.ts` header). Status: deep data not yet ported; HTJ2K
  same as upstream.
- **Image writing is not ported** for any format (`hio/src/hioImage.ts`).
  Status: not yet ported.
- **Ptex is not supported.** The Ptex library has no port; the 14
  `testHdStPtex*` image tests are not run
  (`FAITHFULNESS-DEBT(hdst-ptex)`). Status: not yet ported.
- **OpenVDB** fields read through `typescript-usd/hioOpenVDB` (the partial
  port in `packages/openvdb`) and are uploaded as dense 3D textures. Level-set
  rebuild and non-linear resampling in that port are not ported
  ([packages/openvdb/README.md](packages/openvdb/README.md)). Status: not yet ported.

## Rendering differences (Storm on WebGPU)

The imaging ledger compares every Safari image suite and the viewer's asset
renders with native OpenUSD 26.11.1 (native Storm on Metal). Its summary:
711 rows, **513 pass, 150 fail, 2 error, 46 not run**. Viewer
assets: curated set 28 of 28, corpus 190 of 191 (the 1 error is an asset the
native reference itself crashes on).

By class (the ledger's "Failures by class", generated from each cause's
class in `classification.json`), Safari 27.3, image tests: **295 of 446 run
pass; 14 real differences** (dome light 8, translucent wire edges 2,
coincident-surface depth tie 2, MaterialX custom node 1, unexplained 1);
113 point and wire edge pixels from WebGPU's emulation of wide points and
line polygon mode (platform: `PLATFORM-DIVERGENCE(hgiWebGPU-wide-points)`,
`PLATFORM-DIVERGENCE(hgiWebGPU-polygon-mode-line)`; the point-disk row of
testUsdImagingGLPoints included); 16 rounding near-matches; 8 where native
can't be compared. Chrome 156: 285 pass; the same 14 real differences; 14
over Chrome's binding limits (platform, above); 110 point and wire edge
pixels; 15 rounding near-matches; 8 where native can't be compared. Assets
in both browsers: 218 of 219 pass (1 native crash). Of upstream's 669 image test registrations, 442 are never
run (397 have no native capture, 45 are skipped by a runner). The causes of
the 152 failing and error rows:

- **Wide points: edge pixels differ** (59 rows, `points-pointsize`). WebGPU
  has no `gl_PointSize`; HgiWebGPU emulates it, and edge pixels within about
  0.06 px of a point's square edge disagree with Metal. Points are drawn at
  the right size and place. Status: known bug, cause partly explained in the
  ledger.
- **Wireframe reprs: edge pixels differ** (53 rows, `wire-and-points`).
  WebGPU has no line polygon mode; the emulation interpolates attributes
  along the line rather than across the triangle, so `fwidth`-based edge
  tests differ near the threshold and refined grids on pixel boundaries draw
  solid (`PLATFORM-DIVERGENCE(hgiWebGPU-polygon-mode-line)`). Status: platform
  limit, emulated.
- **Near matches** (16 rows): within 2/255 on all but a few pixels, failing
  the strict tolerance narrowly. Status: not explained (rounding).
- **Dome light** (8 rows): a few dozen pixels over 2/255 and 1-5% of pixels
  one or two levels off. Status: known bug.
- **Wire edges on translucent and coincident surfaces** (2 rows
  `translucent-constant-opacity`, 2 rows `velocity-motion-coincident-edge`):
  the opacity-0.5 surface itself matches; wire-edge pixels, and one depth tie
  between coincident meshes, differ. Status: known bug.
- **Smaller causes, 1 row each:** a MaterialX custom node defined in a file
  reached through two paths in the browser (`materialx-custom-nodes`), point
  edges, one unexplained difference. Status: known bugs.
- **Not differences of this port** (9 rows): 4 shadow rows where the native
  Metal reference does not bind shadow maps, so there is no correct native
  image (`native-shadow-texture-array`); 2
  MaterialX custom surface shader rows and 1 AOV primId row that upstream
  registers only off Apple, where the native reference draws a fallback or
  varies between runs; one asset on which native itself crashes; one test
  where native exits 1 as its registration does not expect.
- **Not run** (46 rows): 14 adaptive-subdivision rows
  (`HD_ENABLE_OPENSUBDIV3_ADAPTIVE=1`; the OpenSubdiv port has no
  `RefineAdaptive`, `FAITHFULNESS-DEBT(hdst-osd-adaptive)`); 12 rows under
  `HD_ENABLE_FORCE_QUADRANGULATE=1`, which the runner skips; 4 UsdImagingDelegate
  rows; 12 rows of other test programs not driven by the usdImagingGL runner;
  3 hdx test programs not ported (`testHdxDrawTarget`,
  `testHdxNoResourceBindings`, `testHdxPickTransparentOccluder`); 1 without
  a native capture.

Divergences in the code that the ledger does not show as rows:

- **Deep picking (`resolveDeep`) does not work in Safari.** Its WGSL
  `atomicCompareExchangeWeak` fails to compile in Safari's WebGPU, so the
  pick buffer is bound only for that mode
  (`PLATFORM-DIVERGENCE(webkit-wgsl-atomic-compare-exchange)`,
  `hdx/src/pickTask.ts`). Other pick modes work. Status: platform bug.
- **GPU readbacks complete later than in OpenUSD.** `HdStReadBuffer`, pick
  results and GPU visible-instance counts arrive when the submission
  completes, not when the call returns; callers await them, and a visible
  count reaches `itemsDrawn` at the next `ExecuteDraw` after its read-back
  (`PLATFORM-DIVERGENCE(hdst-readbuffer-sync)`,
  `PLATFORM-DIVERGENCE(hdst-gpu-count-visible-readback)`). GPU frustum
  culling's instance counts are not read for pulled-vertex and patch draws
  (`PLATFORM-DIVERGENCE(hgiWebGPU-patch-indirect)`). Status: platform
  adaptation.
- **Shadows.** Glf's OpenGL shadow-map management is not ported
  (`PLATFORM-DIVERGENCE(glf-shadow-gl)`); Storm allocates its own shadow maps.
  There is no native image with shadows to compare against (see the ledger
  rows above). Status: not measured.
- **No OpenColorIO.** The OCIO color correction mode warns and uses sRGB,
  where a non-OCIO OpenUSD build substitutes sRGB silently
  (`FAITHFULNESS-DEBT(hdx-ocio)`). Status: not yet ported.
- **Storm prim types not created:** HdStSphere, HdStConicalFrustum,
  HdStCapsule, HdStDrawTarget and HdImageShader report a coding error if
  requested (`FAITHFULNESS-DEBT(hdst-prim-types)`). Implicit surfaces still
  render: the implicit-surface scene index turns them into meshes. Status:
  not yet ported.
- **Scene index plugins are ordered by their registration only:** the
  "tags" and "ordering" plugInfo metadata and the JsonMetadataOnly and Hybrid
  ordering policies are not ported, so every policy orders plugins by
  insertion phase and order (`FAITHFULNESS-DEBT(hd-scene-index-plugin-json-ordering)`).
  Storm's twelve plugins come out in OpenUSD's order. Status: not yet ported.
- **Sampling differences:** border-color clamping near mips and corners
  (`PLATFORM-DIVERGENCE(hgiwebgpu-border-mip)`), and no alpha-to-coverage on
  pipelines that also write a sample mask (Storm's points), which WebGPU
  forbids (`PLATFORM-DIVERGENCE(hgiwebgpu-alpha-to-coverage-mask)`). Status:
  platform limit.
- **Bindless handles are always 0** and the GL bind paths are no-ops
  (`PLATFORM-DIVERGENCE(hdst-bindless-handles)`,
  `PLATFORM-DIVERGENCE(hdst-gl-binding)`). Status: by design.

- **A nested native instancer's flattened xform and visibility depend on the
  order its prims arrive.** For native instancing inside a prototype (a USD
  prototype that itself holds instances), the `UsdNiInstancer` of the
  propagated prototype sometimes has the flattened `xform` (identity, reset)
  and `visibility` (true) data sources and sometimes has neither, depending on
  whether the nested instance reaches the prototype propagating scene indices
  in the same PrimsAdded notice as the instance that brings its prototype in.
  It shows without slicing, in upstream's order: the USD Museum's
  `__Prototype_35` lacks them when its payload's prims come in one notice and
  has them when they come a share at a time (`usdimaging-sliced-prims-added`);
  pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLResync/world.usda is the
  other way round. Impact: none seen in images or draws (both values are the
  defaults); scene index contents differ. Evidence: the scene dumps of
  `apps/usdview/scripts/viewer-perf/follow-perf.ts --dump-scene`,
  `packages/usd/pxr/usdImaging/usdImaging/tests/slicedPrimsAdded.test.ts`.
  Status: known bug, cause not found (OpenUSD not yet compared).

## MaterialX

- **Supported through a partial port** (`packages/materialx`: core,
  format, genshader, genhw, genglsl and two MaterialXRender files) and
  turned on by importing `typescript-usd/hdSt/materialx`. Evidence:
  [packages/materialx/README.md](packages/materialx/README.md).
- **10 of 27 rows of the MaterialX image suite pass.** Most of the rest are
  near matches or native-reference limits (see "Rendering differences"); one
  custom node defined in a file reached through two paths is not treated as
  a library node in the browser. Evidence: suite `usdimaging-gl-materialx` in
  [imaging-status.md](packages/usd/docs/imaging-status.md). Status: known
  bugs.
- **usdMtlx's upstream tests are not ported.** Documents and their
  XIncludes are read through Ar as `utils.cpp` does (since 58f238a3; the
  debt `usdmTlx-ar-document` is retired). None of usdMtlx's 5 registered
  upstream tests is ported; its tests compare with native captures.
  Status: not yet ported.

## OpenExec

Ported: vdf, ef, esf, esfUsd, exec, execUsd, execGeom, execIr and
usdExecImaging. As in OpenUSD 26.11.1, the viewer uses it only when
`USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1`. Evidence:
[openexec-x1.md](packages/usd/docs/openexec-x1.md) sections 5 and 11.

- **Only the serial engine.** The parallel executor engine, parallel data
  managers and scheduler are not ported; asking for
  `VDF_ENABLE_PARALLEL_EVALUATION_ENGINE` fails loudly
  (`PLATFORM-DIVERGENCE(openexec-parallel)`). Results and evaluation order
  match native run with that setting at 0. Status: by design for now
  (decision D1 in openexec-x1.md).
- **Not ported:** speculation executors (`openexec-speculation`),
  `VdfExecutionStats` (`openexec-stats`), `VdfNode::GetMemoryUsage`
  (`openexec-memory-usage`, needs native object sizes), TraceReporter
  serialization used by `testExecUsdBasicCompilation`, and `execTest`.
  Background deallocation frees immediately
  (`openexec-background-dealloc`); plugins load lazily and are bundled by
  URL (`openexec-plugin-load`, `openexec-plugin-bundling`). Status: not yet
  ported. 8 failing tests (below).

## Scene description (Core) divergences

No library test failure is in Core (`sdf`, `pcp`, `usd`, `ar`). Every
registered upstream test of sdf, pcp, usd, ar, usdGeom, usdShade, usdSkel and
the other schema libraries has a port (coverage script). Known differences
at code sites:

- **File formats have no schema of their own.** Every layer uses SdfSchema;
  OpenUSD gives each SdfFileFormat its own schema (SdfLayer::GetSchema)
  (`FAITHFULNESS-DEBT(sdf-file-format-schemas)`, `pcp/src/layerStack.ts`).
  Impact: none for usda, usdc and usdz, which use SdfSchema natively; a
  file format plugin cannot register extra fields, such as the legacy prim
  `relocates` Pcp composes only for formats that register it. Status: known
  difference.
- **Editing a value clip layer recomposes the stage;** OpenUSD does not
  process changes to clip layers (`FAITHFULNESS-DEBT(usd-clip-layer-changes)`,
  `usd/src/stage.ts`). Status: known difference.
- **Layer stacks expire later.** Unreferenced layer stacks are dropped when a
  cache next applies changes, not the moment the last reference goes away
  (`FAITHFULNESS-DEBT(pcp-layer-stack-lifetime)`). Status: known
  difference.
- **An inverse single-axis scale op scales by 1/v.** OpenUSD negates the
  value (xformOp.cpp:562-578), so its inverse `scaleX` of 2 scales by -2, which
  is not an inverse; typescript-usd keeps 1/v (`usdGeom/src/xformOp.ts`).
  Status: deliberate difference from an OpenUSD bug.
- **Hashes differ from native.** JavaScript numbers hash as doubles even
  where upstream hashes an integer, strings have no address, and some value
  types hash without a layout (`PLATFORM-DIVERGENCE(tf-hash-js-values)`,
  `tf-hash-char-ptr`, `tf-bits-hash`, `vt-hash-held`,
  `vt-hash-value-vtvalue`). Impact: do not compare hash values with a native
  process. Status: by design.
- **Sdr**: a property converted to `vstruct` keeps its raw default where
  upstream resets it to the Sdf type's default
  (`FAITHFULNESS-DEBT(sdr-default-value-vtvalue)`). Status: not yet ported.
- **UsdSkel** lacks the token-dispatched point, normal and transform
  skinning overloads of `utils.cpp`
  (`FAITHFULNESS-DEBT(usdskel-transform-dispatch-utilities)`). Status: not
  yet ported.
- **`Layer.find` does not look a layer up by its resolved path** through a
  custom resolver, as `SdfLayer::Find` does: resolvers are asynchronous here
  and `Find` is synchronous, so an identifier that names an open layer only
  through the resolver is not found; `Layer.findOrOpen` returns that open
  layer (`PLATFORM-DIVERGENCE(sdf-find-async-resolver)`, `sdf/src/layer.ts`;
  `testUsdUtilsDependenciesCustomResolver` `test_ComputeAllDependencies` looks
  the layers up that way). Status: platform adaptation.
- **Plugin metadata fields have no Sdf value type.** Sdf's schema has no
  field definition for `apiSchemas` (OpenUSD registers it from usd's
  plugInfo as a token list op), so `UsdUtilsStitchLayers` keeps the stronger
  `apiSchemas` opinion instead of merging the list ops; the same holds for any
  plugin metadata field without a registered type. `Layer.createNew` does not
  drop arguments equal to a format's defaults
  (`FAITHFULNESS-DEBT(usdutils-sdf-create-new-default-args)`). `UsdStage`
  `Get`/`SetColorConfiguration` and `Get`/`SetColorManagementSystem` are not
  ported (the static fallbacks are). Status: not yet ported.
- **Smaller structural differences** where one TypeScript unit merges
  several upstream units or a JS mechanism stands in for a C++ one, with no
  known effect on results: `sdr-shader-types-fusion`,
  `usdskel-query-fusion`, `hd-display-style-fusion`, `hd-tokens-grabbag`,
  `hd-bar-shared-ptr`, `hd-instance-use-count`, `hd-typed-path-data-source`,
  `hd-typed-cast`, `constraintTarget-isModel`,
  `usdUI-property-dict-key` and others; the full list is the `grep` above
  (166 sites, 72 ids at `754736d8`).

## Viewer (`apps/usdview`)

Compared with the menus of OpenUSD 26.11.1's Qt usdview. Evidence:
[apps/usdview/docs/usdview-menu-gaps.md](apps/usdview/docs/usdview-menu-gaps.md)
(dated November 2, 2026) and the disabled items in `apps/usdview/src`.

- **Disabled, with the reason shown:** the Python interpreter
  (`src/window-menu.ts`); Auto Compute Clipping Planes
  (`src/camera-controls.ts`); further renderer settings and AOVs other than
  color (`src/native-menus.ts`). Status: not yet ported (Python by design).
- **Hydra Scene Debugger and Debug Flags** open as panels inside the viewer,
  not separate windows (`PLATFORM-DIVERGENCE(usdview-tool-windows)`). Debug
  Flags lists only the debug codes the library registers (the imaging
  libraries; no `TF_`, `AR_`, `SDF_`, `PCP_` or `USD_` codes). Status: not
  yet ported.
- **Color management** is fixed to sRGB (no OCIO). Status: not yet ported.
- **GPU stats, tiny-prim culling and exposure settings** are disabled
  (usdview-menu-gaps.md M02). Status: not yet ported.
- **Rollover tooltips** show path and type only, not native usdview's full
  metadata and asset tooltip (M06). Status: not yet ported.
- **usdview Python plugins cannot run.** The viewer loads TypeScript runtime
  plugins (`?plugin=`) instead. Status: by design.
- **The viewer tests are not browser tests.** Its 691 vitest tests use jsdom
  and fake runtimes; rendering is checked only by the Safari asset harness
  ([apps/usdview/README.md](apps/usdview/README.md)).

## Performance against native

Measured on one Apple M4 Pro (12 cores, 24 GB) shared with other work,
Safari 27.2, against an OpenUSD 26.11.1 build on Metal. These ratios hold for
these assets and conditions only; ratios within about 1.5x are noise.

- **Viewer, at commit `5520e345`**
  ([performance-viewer.md](packages/usd/docs/performance-viewer.md),
  "Results"): first image 0.6-3.0x warm native; converged image up to 10.5x
  native where many textures load (OpenChessSet, 5.9 s against 0.57 s).
  Orbit redraws cost 2-10x native CPU per frame but fit a 60 Hz frame on
  every asset except OpenChessSet (13 frames per second, native about 100).
  Playback: BrainStem about 45 frames per second (native 130),
  CarbonFrameBike about 17 (native 200). Fixes measured on November 6 and 7
  (same document) cut OpenChessSet's open from 5.3 s to 1.9 s and CarbonFrameBike's
  open to first frame from 1.8 s to 1.3 s; playback was not re-measured
  in Safari after them. On November 9 (`08719949`, same document, "the
  XformQuery path") CarbonFrameBike playback took 7.9 ms of CPU per frame
  in Node (stub GPU; 41.4 ms at `5520e345`) against 2.3 ms native, about
  3.4x. In Safari at `5b71d4d9` (same document) paused time steps run at
  about 37 frames per second (27 ms per frame); since they stopped waiting
  for the GPU's error scopes (as usdview), one run at high machine load
  measured 26 ms, so the cause is not fully known. Playing draws at the
  display's 60 Hz with 10-12 ms of CPU per frame (native about 200 frames
  per second on CPU alone). Timestamp queries put the GPU's pass time at
  4-6 ms per frame in both orbit and playback (same document, "where the
  GPU time went", two runs).
- **Core, at commit `e4b3051` (November 5, 2026)**
  ([performance-p1.md](packages/usd/docs/performance-p1.md), "Results"),
  against single-threaded native: first open and traversal 2.3-5.9x slower
  in Safari, per-frame value reads during playback 3.6-8.1x, authoring
  200,000 time samples 7.0x. This predates the copy-on-write value storage
  and has not been re-measured since.
- **Large animated stages, November 8, 2026**
  ([performance-viewer.md](packages/usd/docs/performance-viewer.md), "A
  large animated scene"): on a 3,000-frame animated test scene that isn't
  included in this repository, with every payload loaded, Hydra
  syncs about 2,600 meshes per frame, as native does; Safari takes 126 ms
  per frame, native 18 ms on 8 threads (36 ms on one). With the scene's
  payload load schedule (on by default since November 11), Safari plays frames 1-3000 at a
  median of about 60 frames per second, with 56-121 ms stalls when a run
  loads and one 1.5 s stall near frame 1200 not yet explained.
- **Alpha to coverage makes Safari's fragment shading cost grow with depth
  complexity, November 9, 2026**
  ([performance-viewer.md](packages/usd/docs/performance-viewer.md), "Alpha
  to coverage in Safari"). WebKit adds a `volatile` counter to every WGSL
  loop. On Apple GPUs, a coverage-changing fragment function with such a
  loop is shaded for every fragment, hidden or not. Storm's fragment
  functions all have loops. A large animated test scene (not included in this repository) plays at about
  7 frames per second with alpha to coverage, as Storm enables by default,
  and 23.6 with `?env=TF_DEBUG=HDX_DISABLE_ALPHA_TO_COVERAGE`. Native alpha
  to coverage costs nothing measurable on the same scene. Since November 11,
  2026 the viewer sets that debug code itself in WebKit
  (`PLATFORM-DIVERGENCE(viewer-webkit-alpha-to-coverage)`,
  `apps/usdview/src/gpu-device-settings.ts`); it changes only partially
  transparent pixels of default-material draws and stored AOV alpha.
  `?env=TF_DEBUG=-HDX_DISABLE_ALPHA_TO_COVERAGE` keeps alpha to coverage on.
  The library is unchanged. Status: by design (WebKit's compiler).
- **Memory:** Storm's own GPU memory accounting is lower than native's on
  every asset measured (Metal allocates buffer arrays larger). Safari
  exposes no JavaScript heap measure, so browser heap use is not measured.

## Failing library tests

`cd packages/usd && npx vitest run` on November 12, 2026: 882 test files,
**9,279 pass, 4 fail**; 26 checks the platform rules out are skipped in Node
at a `PLATFORM-DIVERGENCE` id and not counted. Each failure is a ported
upstream test or a native-capture check kept failing on purpose to expose a
real gap in the port. None is in Core. See also
[packages/usd/README.md](packages/usd/README.md#known-failing-tests).

### Real failures (4)

- **OpenExec, 3.** `TfSpan` conversion (`testVdfInputValuesPointer`,
  `FAITHFULNESS-DEBT(openexec-tfspan)`), TraceReporter serialization
  (`SerializeProcessedCollections`, `testExecUsdBasicCompilation`) and
  `pxr/exec/execTest` (`testExecComputationRegistration`). Status: not yet
  ported.
- **Storm, 1.** `testHdStBarAllocationLimit` is an image test (a basis curve
  over the VBO limit, compared with upstream's PNG); no native capture or
  image runner exists for it yet, so its Node placeholder fails. Status: not
  yet ported.

### Checks the platform rules out (not counted)

- **Storm GPU computations under Node, 26 skipped.** Smooth and flat normals
  (`testHdStMeshTopology`, 12), GPU quadrangulation
  (`testHdStQuadrangulation`, 5) and GPU subdivision refinement
  (`testHdStSubdivision`, 9). Node has no WebGPU device and the test Hgi has
  no compute pipelines (`PLATFORM-DIVERGENCE(hdst-node-no-gpu-compute)`,
  `hdSt/tests/bufferTestHgi.ts`). Verified in Safari: the same tests run
  over HgiWebGPU in the ledger's `hdst-gpu` suite
  (`tests/browser/storm-image/hdst-gpu/run.mjs`), where 96 of 99 rows passed on
  November 9; the 3 that failed were the double-precision cases, no longer
  registered. Their compute-free cases (`quad`, `EmptyTopologyTest`) still
  run in Node.
- **Adapted at an id and passing, 2.** The GPU visible-instance count
  (`HdSt_PipelineDrawBatch`) is read back asynchronously, as WebGPU's
  `mapAsync` requires; the check awaits it before `ExecuteDraw`
  (`hdst-gpu-count-visible-readback`, `hdSt/tests/pipelineDrawBatch.test.ts`).
  `testUsdUtilsDependenciesCustomResolver` `test_ComputeAllDependencies`
  looks its layers up with `Layer.findOrOpen`, because the synchronous
  `Layer.find` cannot call an asynchronous resolver
  (`sdf-find-async-resolver`); the identity checks still hold.
- **Left out or adapted earlier:** the three double-precision GPU normals
  cases (`webgpu-no-shader-double`), DumpStats memory
  (`openexec-memory-usage`) and the lvalue copy count (`js-no-copy-move`).

## Upstream tests not ported

The upstream test coverage script (tooling kept outside this repository): **783 of 1,906**
registered OpenUSD tests have a detected port. The script counts only ports
that cite their upstream test; image tests that run in Safari are counted in
the imaging ledger instead.

- **Out of scope by design** (other backends, Python, Qt, legacy paths):
  Python bindings (70 registrations), the Python `tf` tests, hgiGL and
  hgiVulkan (2 each), testusdview (77) and usdviewq (6), usdrecord (12),
  `testUsdImagingDelegate*`, and the RenderMan plugins. Evidence: the
  "out of scope" reasons in `packages/usd/tests/browser/imaging-status/classification.json`.
- **Counted elsewhere:** usdImagingGL (0 of 436 by the script) and hdx (0 of
  15) are image tests run by the Safari ledger; hdSt has 20 of 225 by the
  script for the same reason. Two exec examples are ported under
  `pxr/exec/execUsd/tests/upstream` and not counted.
- **Not yet ported:** the command-line tools (usdcat, usddiff, usdtree,
  usdedit, usdstitchclips, usdzip, usdcompress, usdchecker and the rest),
  usdUtils (4: testUsdUtilsUsdzUtils, the two testUsdUtilsUpdateSchemaWithSdrNode
  registrations and testUsdUtilsConstantsGroup, all of Python-only modules),
  usdAbc (18), usdMtlx (5),
  arch (16), work (12), hio (1), most C++ `tf` tests (37 of 92 ported; many
  of the rest test C++ facilities such as `TfRefPtr`, `TfWeakPtr`,
  `TfSmallVector` and mutexes), 4 of 5 hdsi tests, and the threading and
  `_Perf` variants of the exec tests.

## Test-environment limits

- **GPU work cannot be checked under Node.** Node has no WebGPU; the
  recording test Hgi (`hdSt/tests/bufferTestHgi.ts`) keeps buffer bytes on
  the CPU and has no compute pipelines. Every image result comes from
  Safari runs recorded in the ledger, not from `vitest`.
- **The imaging ledger is not regenerated on every commit.** Each suite
  records the commit it ran at; the rows above are from runs between
  November 6 and 8, 2026, at several commits.
- **Imaging code coverage is understated.** The never-executed-function
  report instruments only the Node suite, not the Safari harnesses
  ([never-executed.md](packages/usd/docs/never-executed.md), generated at
  `93bdd69f` on November 6, 2026).
- **Native references can be wrong or missing.** Some native captures cannot
  be made on the reference Mac (no shadows through HgiMetal, no OpenGL 4.5
  for hgiGL); 397 upstream image tests have no committed native capture.
