# Storm in TypeScript: status

Written November 5, 2026, against `main` at `fa2c789`. This is a short
status page. The plans and the evidence behind it are in
[imaging-i1.md](./imaging-i1.md) (approach and first image),
[imaging-i2.md](./imaging-i2.md) (replacement bar and milestones) and
[imaging-i2-textures.md](./imaging-i2-textures.md) (texture results).

Storm is not part of AOUSD Core, and none of this is evidence of Core
compliance. It tests the second question the repository asks: can USD,
including its imaging, be written natively for the web?

## The approach

Upstream Storm writes its shaders once, in GLSL with glslfx sections.
`HdSt_CodeGen` assembles them into programs, and each Hgi backend turns those
programs into what its API accepts:

- hgiMetal compiles the GLSL bodies as MSL, behind a generated prelude
  (`imaging-i1.md` section 1.2);
- hgiVulkan compiles GLSL 4.50 with layouts added (section 1.3).

The port does the same for WebGPU:

- `pxr/imaging/hgi` is a file-by-file port of Hgi.
- `pxr/imaging/hgiWebGPU` is a new backend, modelled on hgiMetal and
  hgiVulkan. It reports Metal-like capabilities and emulates what WebGPU
  lacks (below).
- Its shader generator hands the program to a GLSL-to-WGSL translator
  (`hgiWebGPU/src/glsl`, 13 files, about 5,400 lines). Safari's own WGSL
  compiler checks the output.
- `pxr/imaging/hdSt` is a file-by-file port of Storm (86 files, about 42,400
  lines of TypeScript, against about 76,900 upstream lines), with upstream's
  glslfx files used unchanged.

The reason for this approach is testability. Because Storm's code
generator, its shaders and its tests are upstream's, the result can be
checked against OpenUSD directly:

- the program text handed to Hgi can be compared byte for byte with the
  reference build's `HDST_DUMP_SHADER_SOURCE` output;
- upstream's `testHdSt*` programs can be ported and their images compared with
  native captures.

The alternative, a renderer written by hand in WGSL and modelled on Storm
(`pxr/imaging/hdStWgsl`), has been deleted, with everything that served only it
(`imaging-i2.md`, "Decision: one faithful implementation, no backup renderer").
The last commit with it is `15513a1`. The viewer draws through the faithful port.
It has no tests of the kind above, and its differences from Storm can only be
found image by image.

## What is shown so far

All images were rendered in Safari 27.2 on an Apple M4 Pro, the machine that
made the native captures (Storm on Metal, OpenUSD 26.11.1). The pass rule is
from `imaging-i1.md` section 6.3: every channel within 2/255, and at most 0.5%
of pixels differing at all. That is stricter than upstream's own `idiff` bar.
Re-run for this page on November 5, 2026, with the commands in each source
document. The results matched the integration run of the same day.

| Upstream test | Images | Result | Program text |
|---|---|---|---|
| `testHdStDepthBias` | 2 | identical (0 differing pixels) | byte-identical (frustum-cull compute; VS + post-tessellation VS + FS) |
| `testHdStTextureObjectRegistry` | 5 | identical | |
| `testHdStTextureHandleRegistry` | 9 | identical | |
| `testHdStSamplerObjectRegistry` | 3 | 2 identical; 1 within 1/255 on 10 pixels | |
| `testHdStDynamicUvTexture` | 2 | identical | |
| Textured material scene (C++ capture, UsdUVTexture + primvar reader) | 1 | within 1/255 on 27 pixels | byte-identical (compute, VS, PTVS, FS) |
| `testHdStSimpleLighting` capture (distant, sphere and simple lights through `HdxSimpleLightTask`) | 3 | 2 identical; 1 within 1/255 on 4 pixels | byte-identical (VS + FS) |
| `testHdStShaders` without its scene materials | 7 | identical | byte-identical (first cull and mesh programs) |

In total: 32 images (re-run November 5 after the readback fix below). 29
are identical and 3 pass the tolerance.

The earlier `shadersLighting_3` mismatch (1/255 on 7,254 pixels, 2.4%) and
most of the other 1/255 pixels were the browser drivers' quantization, not
the renderer: `hio/stbImage.cpp:566-575` computes `floor(255 * v +
0.499999f)` in float, where 127.5f + 0.499999f rounds to 128.0f, so a
float16 value of exactly 0.5 writes 128; the drivers computed it in double
and wrote 127. 0.5 is the only float16 value in [0, 1] on which the two
differ, and it was the whole of the added cube's fallback-lit face. The
drivers now round in float32 as `textureTestDriver.ts` already did.

Other checks, in Node against reference-build captures:

- `HdStLight` derives the same `GlfSimpleLight` as native for eight light
  configurations (distant, sphere, rect, disk, cylinder, hidden, dome and
  simple), exactly in float32.
- `HdRenderIndex::New` routes legacy scene delegates through scene index
  emulation, as 26.11 does. The first-sync dirty bits of `HdUnitTestDelegate`
  match the native captures.

Of upstream's 225 registered hdSt tests, 10 have a detected port
(the upstream test coverage script, tooling kept outside this repository). Of usdImagingGL's 436, none do yet.

## What is not shown yet

**Real assets.** The asset-acceptance report
(`apps/usdview/scripts/asset-acceptance/`) renders 18 assets at 512×512 and
counts pixels more than 2/255 from native usdview (`testusdview`). The run of
November 5, 2026 (Safari 27.2):

| Renderer | Assets matching | Significant pixels, all 18 assets |
|---|---|---|
| hdStWgsl (the viewer today) | 2 (vehicle, shaderball) | 271,748 |
| faithful hdSt (`run.mjs --renderer faithful`) | 0 | 999,174 |

This does not yet compare the shaders. It mostly measures what the faithful
path is missing:

- there is no `HdxTaskController`, so no camera light and no default
  material: the faithful run uses Storm's fallback lighting shader;
- there is no `UsdImagingGLEngine`;
- there are no selection, color-correction or AOV tasks beyond what the
  harness adds.

The faithful harness drives the stage through `UsdImagingCreateSceneIndices`
→ `HdsiLegacyDisplayStyleOverrideSceneIndex` → `HdRenderIndex::InsertSceneIndex`
into `HdStRenderDelegate`, and records its two stand-ins (the camera and an
sRGB conversion) in each result.

**Milestones** (`imaging-i2.md` section 4). Under the November 5 decision the
viewer switched to the faithful path and hdStWgsl was deleted ahead of I-6;
features the port does not draw yet are diagnosed in the viewer.

| Milestone | Scope | State on November 5 |
|---|---|---|
| I-2 | Textures and materials, lighting, the UsdStage → scene index → hdSt path, test infrastructure | Textures: exit tests met (table above). Lighting: simple lighting met. The dome light computations run on HgiWebGPU (cubemaps written through 2d-array storage views) and match the reference build's render of a dome-lit fixture within 1/255 (asset acceptance, `dome_light`). Stage path: a UsdStage renders through the faithful hdSt in the harness |
| I-3 | `UsdImagingGLEngine`, the hdx tasks and task controller scene index, selection and picking | Not started. This unlocks the 436 usdImagingGL image tests, which run through `testUsdImagingGLBasicDrawing` |
| I-4 | Curves and points, instancing, ext computations and skinning, OpenSubdiv (Far stencil and patch tables) | Not started |
| I-5 | MaterialX through upstream's GLSL generator, volumes as dense 3D textures, order-independent transparency | Not started |
| I-6 | The viewer on the engine, comparison runs, switch, deletion of hdStWgsl | Switch and deletion done (viewer on interim engine glue until UsdImagingGLEngine is ported) |

**Known failing tests in hdSt.** 22 of the library's 34 known failures are
here (README, "Known not to work"). Most run a GPU computation (smooth and flat
normals, quadrangulation) on the GPU-less test Hgi used in Node.

## How WebGPU differs, and what HgiWebGPU does about it

From `imaging-i1.md` section 4.2 and `imaging-i2.md` section 2.2:

| WebGPU lacks | HgiWebGPU today |
|---|---|
| Tessellation and geometry stages | Reports `MetalTessellation` and emulates Metal's post-tessellation draws with vertex pulling: the control stage as a compute dispatch, the fixed-function tessellator as WGSL kernels ported from the Direct3D 11 reference (imaging-i2.md section 2.2.1) |
| Built-in barycentrics | Every mesh takes the post-tessellation path, as on Metal |
| Multi-draw-indirect and indirect command buffers | Loops draws one by one, as hgiMetal does without indirect command buffers. Patch draws read the CPU copy of the indirect buffer, so GPU culling does not skip them |
| Push constants | A dynamic-offset uniform ring buffer for `SetConstantValues` |
| `gl_PointSize` | Not written (diagnosed). Points larger than 1 px need a quad expansion |
| Texture swizzles | Expanded at upload |
| Writable cube textures | Not done. Blocks the dome light computations |
| Synchronous submit-and-wait, readback and `IsValid()` | Awaitable completion. Texture loading is asynchronous: a texture whose load has not finished commits its fallback and is recommitted later |

## Risks

From `imaging-i2.md` section 5, in order:

1. Tessellation factors above 1 and point expansion need new emulation with no
   upstream template. Refined curves and points depend on it.
2. Draw-loop cost. Every draw is a JavaScript call. The chess set is the
   asset to watch.
3. Faithful MaterialX needs MaterialX's GLSL generator (GenShader, GenHw,
   GenGlsl), vendored from a TypeScript port, plus the translator on generated
   MaterialX GLSL, which no corpus covers yet.
4. The milestones depend on each other in series: the engine needs the stage
   path, and the usdImagingGL bar needs the engine.
5. Tooling. Browser runs are Safari-only, with the window visible, and slow.
   One asset (McUsd) renders differently about one run in five.
6. Asynchronous readback in picking and texture commit touches hdx tasks that
   upstream writes synchronously. It needs one design in Hgi and the engine.

## Questions for Pixar

These are questions this work raises. None of them has been raised upstream.

1. **A WebGPU Hgi backend.** Is reporting `MetalTessellation` and emulating
   Metal's post-tessellation draw a reasonable design? Or would upstream
   prefer a WebGPU-specific code path in `HdSt_CodeGen`? Is a GLSL-to-WGSL
   translator inside the Hgi backend the right place, rather than a WGSL
   variant of the glslfx sources?
2. **Asynchronous Hgi.** WebGPU makes submit-and-wait, GPU→CPU reads and
   shader validation asynchronous. Is there a preferred shape for an awaitable
   Hgi completion? Does anything upstream assume these are synchronous beyond
   tests, readback, picking and texture commit?
3. **Without multi-draw-indirect or tessellation.** How does Storm's own
   roadmap treat backends without indirect command buffers and without
   tessellation? Is per-draw looping expected to stay supported? Are there
   plans that would change how refined curves and points are tessellated?
4. **The entry path.** In 26.11 `HdRenderIndex::New` routes legacy delegates
   through scene index emulation. This port drives Storm from a stage through
   `UsdImagingCreateSceneIndices` and `InsertSceneIndex`, without
   `UsdImagingDelegate`. Is that the path to port first, and is the emulation
   layer expected to stay?
5. **Faithfulness bar.** Is matching the code generator's output byte for byte,
   and images within 2/255 of Storm on Metal, the right bar? Or would Pixar
   judge a port by upstream's own `idiff` thresholds?
6. **A Core question, outside imaging.** Spline `pre` padding: Core 1.1.0's
   grammar allows a comment as the only separator (`pre/*c*/(…)`). OpenUSD's
   `TokenSeparator` rejects it, and so does this library. Which is intended?
   The evidence is in [core-1.1.md](./core-1.1.md#known-disagreements).

## Reproduction

```sh
# from packages/usd; each opens Safari and stops its server when done
node tests/browser/storm-image/run.mjs --out <dir> --port <port>                # testHdStDepthBias
node tests/browser/storm-image/run-textures.mjs --out <dir> --port <port>       # texture tests
node tests/browser/storm-image/lighting/run.mjs --out <dir> --port <port> --test shaders
node tests/browser/storm-image/lighting/run.mjs --out <dir> --port <port> --test simple
# from apps/usdview: the asset report, either renderer
node scripts/asset-acceptance/run.mjs --out <dir> --renderer faithful
```
