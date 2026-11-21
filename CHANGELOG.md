# Changelog

Each release of [typescript-usd](https://github.com/beersandrew/typescript-usd) is one commit,
tagged `vA.B.C.N`, made from a typescript-usd-dev commit named in its entry. `A.B.C` is the OpenUSD
version the port follows; `N` counts this port's own releases against it, starting at 0, and goes
back to 0 when the port moves to a new OpenUSD version. Package versions carry the same number as
`A.B.C+N` (semver allows only three parts).

Measurements are of the USD Museum tour (11,839 frames at 24 fps) on one Mac, unless stated.

## 26.11.1.5 — 2026-11-21

From typescript-usd-dev `63ebc5f3`, plus package versions and this entry. The library and usdview
are unchanged since 26.11.1.4, as are their test results.

### USD tool pages (apps/usd-tools)
- usdcat: the title and intro are centered; the intro links to this repository; a Licenses link
  opens usdview's licenses page; the log of what usdcat printed sits below the sample file.
- usdcat: the cat turns its head toward a file dragged over the yard.
- usdcat links to the tools' index only where the index is served, so the page can be hosted on
  its own.
- `scripts/ship.mjs <pages> <outDir>` builds only the chosen pages (`USD_TOOLS_PAGES`) with the
  samples they offer, for hosting them on their own.

### Documentation
- README: the interpreter windows, the command-line tools and `apps/usd-tools`; 26.11.1.4's test
  counts (library 9,444 pass; usdview 767 pass; upstream Python tests 85 pass, 10 fail).

## 26.11.1.4 — 2026-11-21

From typescript-usd-dev `229bfefe`, plus package versions and this entry. Library tests: 9444 pass, 4 fail (exec, vdf and hdSt cases that fail without this release's changes too); usdview: 767 pass; upstream Python tests under Pyodide: 85 pass, 10 fail (testUsdStage 7, testUsdGeomXformable 3).

### usdview
- Window > TypeScript Interpreter: usdview's interpreter console with TypeScript as its
  language (pythonInterpreter.py's console; types stripped by Sucrase 3.35.1, parsed by Acorn
  8.19.0). `usdviewApi` (a port of usdviewApi.py: stage, selection, frame, camera, viewer mode,
  status, viewport capture) and the library modules under their OpenUSD names, with variables
  kept across entries, top-level `await`, history and Tab completion. Loads on first use.
- Window > Python Interpreter (shortcut `I`): usdview's Python console under Pyodide over the
  library's `pxr` forwarding layer, with `usdviewApi` and the `pxr` modules seeded. Loads on
  first use; needs a browser with JSPI. A build ships Pyodide and the `pxr` files, so a static
  file server is enough.
- Both consoles hold the viewer's own stage: what one authors the other reads at once, the
  stage view redraws, and an entry that adds or removes prims refreshes the prim tree and
  property view, as usdview does after a stage change. The consoles share variables (the
  TypeScript console's `py`, the Python console's `ts`; a web addition).
- Safari 27.3 miscompiles Pyodide's JavaScript-to-Python number conversion after a few thousand
  conversions; the Pyodide the viewer ships is patched to avoid it.
- OpenExec runtime plugins load from a plugInfo library path, and the Stagehand example's
  scene plays live in the viewer.
- `?open=handoff`: the page that opened the viewer's tab can send it one file, which opens as a
  dropped file does (the USD tool pages use it).

### Command-line tools
- Ported: usdcat, usdchecker, usddiff, usdresolve, usdstitch, usdstitchclips, usdtree, usdzip,
  usdfixbrokenpixarschemas, usdedit, usdauthors and usddumpcrate, with the library pieces they
  need: usdUtils' usdz iterators and ExtractUsdzPackage, UsdUtils FixBrokenPixarSchemas, and
  SdfCrateInfo.

### USD tool pages (apps/usd-tools)
- New app: usdcat, usdzip, usdchecker, usddiff, usdresolve, usdstitch, usdstitchclips and
  usdfixbrokenpixarschemas as small web pages that run the ported tools in the browser on
  dropped files. Checked against OpenUSD 26.11.1's tools on the shipped samples: usdcat's
  usdc → usda output is byte-identical and usda → usdc reads back identical; usdzip packages
  hold identical files in the same order (zip timestamps differ); usddiff, usdresolve,
  usdstitch and usdstitchclips output is identical; usdchecker's findings match apart from
  anonymous layer ids; usdfixbrokenpixarschemas' fixed layers are byte-identical.
- The usdcat page converts by drag and drop, with a low-poly cat drawn by Storm, and opens a
  result in TypeScript usdview.

### Python
- `pxr` forwarding layer: schema classes for every domain library, XformCommonAPI, typed Get,
  Gf.Matrix and Gf.Quat, UsdGeom.XformOp and XformCache, materials (ComputeBoundMaterial,
  Bind), time ranges and samples, tokens. Upstream Python tests run over it unchanged under
  Pyodide (`pnpm test:python`), as do two API-only example scripts.

### Fixes
- usd: a schema object on an instance proxy is valid, as in schemaBase.h; usdchecker reported
  every material binding inside an instance as invalid.
- sdf: saving a `.usd` layer keeps its underlying format.
- gf: time code differences are GfDurations (26.11.1 arithmetic).

### Platform
- tf, ar: a host can install the filesystem that TfSafeOutputFile, TfAtomicOfstreamWrapper and
  the default resolver write through (PLATFORM-DIVERGENCE tf-host-filesystem); Node is
  unchanged. The tool pages install one in memory.
- usdExecImaging: an interim adapter hook for API schemas, so OpenExec-computed points reach
  Hydra.

## 26.11.1.3 — 2026-11-16

From typescript-usd-dev `95f86572`, plus the version label and package versions.

Full tour against 26.11.1.2, museum 1.2.0, two runs per browser:

| | Safari | Chrome |
|---|---|---|
| Time behind 24 fps | 53.6 s → 13.0 s | 14.5 s → 8.3 s |
| Render time per frame, mean | 14.8 → 11.8 ms | 12.8 → 10.0 ms |
| Render time per frame, frames 2000–6000 | 21.2 → 16.8 ms | 21.2 → 15.5 ms |
| Frames of 100 ms or more | 81 → 43 | 9 → 13–14 |

### Fixes
- hdSt: GarbageCollect destroys resource bindings that no dispatch holds, as upstream's does
  (resourceRegistry.cpp:1199-1205). They were never destroyed. Playing the tour in a loop (Node,
  no GPU), the JS heap grew 88 MB per pass in 26.11.1.2 and 9 MB per pass with this change, and
  pass times no longer increase.

### usdview
- Playback starts each frame on a deadline: each frame one period after the previous one, no
  catch-up after a slow frame (upstream usdview, appController.py:2126-2128), timed so that late
  timer callbacks do not accumulate. Frames 30–6000, time behind 24 fps: Safari 33.3 → 15.6 s,
  Chrome 11.1 → 8.1 s.
- Removed sliced arrival: a payload's prims reach Hydra in the frame the payload loads, as
  upstream.
- Releasing the playhead after a scrub loads that frame's payloads. A paused viewer loads the
  payloads playback will need next.
- Opening a stage makes fewer sequential fetches: Pcp computes the children of prims it computed
  ahead, and the layers of the start payloads are read ahead.
- The menu bar shows the typescript-usd version, linked to its release.

### Performance
- usd: attribute values resolve in one walk, typed by the spec that holds them (upstream's held
  type). Attribute reads 18–20% faster. Relationship targets and property names are looked up as
  upstream does.
- usd, pcp: read-only node walks use the prim index's shared node list.
- usd: a value clip set builds its clips, time mappings and the nodes it applies at once, as
  Usd_ClipSet does, instead of on every attribute read. Reading the museum's clip prims'
  attributes: 202–215 → 152–154 µs per frame.
- usdSkel, usdSkelImaging: CPU skinning (what Chrome uses; GPU skinning needs 13 storage buffers
  and Chrome allows 10) reads its inputs from typed storage, and dual-quaternion skinning uses no Gf
  objects per point. Skinned points are bit-identical. Chrome, frames 2000–6000: 19.4–19.9 →
  15.8–16.0 ms render per frame.
- usdSkelImaging: skinning transforms stay flat arrays between steps; the points-resolving scene
  index removes prims in one pass.
- hgiWebGPU: a CPU-to-GPU buffer copy writes the buffer with GPUQueue.writeBuffer, as hgiMetal and
  hgiVulkan write the buffer directly, instead of through a new mapped buffer per copy, unless
  unsubmitted work uses the buffer. Safari, frames 30–6000: 18.3–19.1 → 16.7–16.8 ms render per
  frame; frames over 50 ms 349–411 → 247–312.
- hd, hdsi, gf, sdr, hgiWebGPU: double-to-float buffer conversion from typed storage, render index
  subtree removal without copies, back plates skipped when a stage has none, frustum box tests
  without copies, discovery lookups by identifier or name, border texels a row at a time.

### Behaviour matching upstream
- When layers disagree on an attribute's type, its value takes the type of the layer that holds it.
- A schema fallback value takes its type from the prim definition.

### Tooling
- viewer-perf: `NULL_GPU_LIMITS` applies another browser's limits; `follow-perf --gpu-sites` and
  `--slow-ms`.

## 26.11.1.2 — 2026-11-13

From typescript-usd-dev `216a15ea`.

- usdview: while the timeline plays, a payload's prims reach Hydra a share per frame. Dragging the
  playhead loads nothing; releasing it loads the frame's payloads, then draws the frame.
- Payload loading: instance-ancestor lookups and parent paths in usd, the scene delegate set in
  HdSceneIndexAdapterSceneDelegate, path sorting and per-call rebuilds in the usdImaging scene
  indices, and the GLSL-to-WGSL tokenizer and static-use scan do less work; results unchanged.
- HgiWebGPU submits blit work that nothing waits for with the next submit. usdview reuses a render
  pipeline whose content it has already compiled.
- Tour in Safari: frames over 100 ms 96 → 35; slowest playback frame 1,255 → 366 ms.
- usdview `?perfLog=<url>` posts a per-frame performance log of playback.

## 26.11.1.1 — 2026-11-12

From typescript-usd-dev `3c0c152e`.

- usdview: the tour camera is at `/<defaultPrim>/cameras/tour_cam`. Select Camera lists at most
  20 cameras, then More Cameras…. Choosing a camera whose customData names a tour frame moves the
  timeline there. Phones open the viewer without panels.
- UsdImagingRerootingSceneIndex skips path mapping below prims that none of its sources hold. Tour
  median frame with everything loaded: 30.6 → 26.2 ms.
- usdview working set: a scene opened with `?camera=` whose payload prims author extentsHint keeps
  only the payloads near the camera's path loaded (`?workingSet=0` loads everything).

## 26.11.1.0 — 2026-11-12

First public release: a TypeScript port of OpenUSD 26.11.1, with partial ports of MaterialX,
OpenSubdiv and OpenVDB, and a browser port of usdview.
