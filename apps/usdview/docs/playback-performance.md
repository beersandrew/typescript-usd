# Playback performance: what we've learned (November 2026)

Notes from measuring usdview playing the USD Museum tour (11,839 frames at 24 fps) in Safari and
Chrome, against upstream usdview (OpenUSD 26.11.1 Release, Storm/Metal) on the same Mac. The working
record, scripts and raw logs live in the private perf kit (`usd-perf-kit/HANDOFF.md`); this page keeps
the conclusions that should steer future work.

## How we work

- Remove TypeScript waste first, with behaviour identical; when unsure, do it upstream's way.
- Divergences only in core libraries, marked `PLATFORM-DIVERGENCE(<id>)` and listed in KNOWN-GAPS.md.
  usdview itself may do things the web-native way as long as it looks and behaves like upstream.
- usdview stays general: no per-scene curation for the museum.
- Measure both browsers, repeat runs, and note the machine load; a busy Mac swamps a 1 ms change.

## Where frame time goes

- **Render time steps up when animated content loads, then stays.** Frames 30–2000 render in about
  8–10 ms; frames 2000–6000 in about 19–21 ms. It tracks loaded animated prims, not draw calls: sync
  goes from ~1 to ~15 ms around frame 2000 and stays there when draws drop from 280 to 76.
- **Split after frame 2000** (Node, null GPU, frames 3000–3099, 23.4 ms/frame): 16.3 ms reading
  through Usd/Pcp/Sdf, UsdImaging and the Hd scene indices; 2.9 ms numeric work (mostly small-object
  churn inside that graph code); 2.3 ms Storm bookkeeping; 0.7 ms GPU calls; 0.2 ms GC.
- **Most per-frame resyncs change nothing.** Like upstream, every time change dirties every
  time-varying attribute of every loaded prim. ~95% of those resyncs happen while the attribute's
  value is held (before its first sample, after its last, or between equal samples): the museum's 269
  varying attributes change within a median window of 96 frames.
- **Against C++.** Like for like (same 221 meshes, 39 ext computations, 168 input pulls per frame),
  TypeScript is a uniform 3–4× slower per call than single-threaded C++ (`PXR_WORK_THREAD_LIMIT=1`).
  C++ stays at 9–10 ms of main-thread CPU per frame; its wall-clock lead is mostly threads (~26 ms of
  CPU per frame across all threads).

## What didn't pay, and why

- **Web Workers for per-frame work.** Workers share no heap, so the graph reads (the bulk of the
  frame) can't be split the way `WorkParallelForN` splits them upstream without a stage replica per
  worker or a remote scene index with a frame of latency. Numeric kernels only win above ~20k points
  per frame. Shared memory needs COOP/COEP headers, which GitHub Pages can't send. Texture decode
  already runs on a worker pool.
- **Unloading payloads behind the camera.** Scrubbing back would refetch and resync a wing; upstream
  loads everything and never unloads.
- **Sliced arrival** (handing added prims to Hydra a share per frame): removed; added prims reach
  Hydra at once, as upstream. Remove waste in the normal loop before any spreading scheme.
- **Memoizing GLSL→WGSL translation:** the repeats are cheap shaders; key building cost as much as it
  saved.
- **Per-skeleton skinning caches and pose skipping:** not platform-justified divergences.

## What did pay

- Attribute value resolution in one walk (attribute reads −18–20%); relationship targets and property
  names looked up as upstream does; rerooting scene index path mapping; blit submit batching; render
  pipeline reuse.
- Playback pacing on a deadline: upstream's rule (each frame one period after the last, no catch-up)
  without `setTimeout`'s late wakes accumulating. Safari lateness over frames 30–6000: 33 s → 16 s.

## Open leads

- **Skip resyncs while a value is held** (the biggest lever, ~95% of resyncs; a core divergence).
  Correct for any jump, including scrubbing back: an attribute is skipped only when the old and new
  times fall in the same held stretch.
- **Flat CPU skinning** (Chrome, which skins on the CPU because GPU skinning needs 13 storage buffers
  and Chrome allows 10): ~75% of the skinning cost is per-element boxing; −3.5–4 ms/frame measured.
- **GPU skinning on Chrome:** pack the 13 inputs into ≤10 storage buffers (~5 ms/frame; divergence).
- **HgiWebGPU direct buffer writes and retained bindings:** measured wins on rebuilds and per-frame
  binding work.
- **GLSL→WGSL translation:** ~1–1.5 s over the tour, ~0.4 s before frame 20. Look for translator waste
  first; a worker pool needs asynchronous program creation in Storm (decide with a compile budget).
- **Value clips:** clip sites are rebuilt per resolve (~0.13 ms/frame).
- **Path-keyed SdfData** (`packages/usd/docs/performance-p1.md` §5): the remaining cost of a lookup.
- **Texture memory:** label textures as R8/RG8 or a compressed format in HgiWebGPU (4× smaller);
  share vertex/index buffers between meshes with identical content.
