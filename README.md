# typescript-usd

## What
[OpenUSD 26.11.1](https://github.com/PixarAnimationStudios/OpenUSD/tree/v26.11.1),
ported to TypeScript: Core, the schemas, imaging (Hydra and Storm on WebGPU) and
OpenExec, with a browser port of usdview. Includes partial TypeScript ports of
MaterialX, OpenSubdiv and OpenVDB, which the library uses.

**See it running:** [andrew.beer/s/usdview](https://andrew.beer/s/usdview/) in the
browser (WebGPU: Safari or Chrome): start the
[USD Museum](https://github.com/beersandrew/usd-museum) tour, or drop your own USD
file or folder onto it.

Independent project; not affiliated with Pixar, the ASWF or AOUSD.

### Why
A personal project: a second, independent implementation of OpenUSD, as my own
contribution toward AOUSD's specification work.

### How
The code was written by AI agents (Claude Code and Codex), porting OpenUSD's
source file by file and checking the results against OpenUSD's own tests and
native captures.

The test I relied on most was watching: the
[USD Museum](https://github.com/beersandrew/usd-museum), a walk through exhibits
of OpenUSD's features, played in this viewer side by side with Pixar's usdview
on one clock, looking for anywhere the two differ.

### Run it

Needs Node 24, pnpm 11 and a browser with WebGPU (tested: Safari 27.3 and
Chrome 156 on an Apple-silicon Mac).

```sh
pnpm install
pnpm --filter typescript-usdview dev     # the viewer at http://127.0.0.1:5173/
pnpm test                                # every package's tests
```

With no scene named, the viewer opens a green wireframe torus with a banner
saying a USD file can be dropped onto the window (and, if a tour is configured,
a button that starts it). Open a scene with `?scene=<url>`; the viewer's other options are in
[apps/usdview/README.md](apps/usdview/README.md).

No OpenUSD build or source checkout is needed: the expected values the tests
compare against are committed fixtures captured from OpenUSD 26.11.1
([FIXTURES.md](FIXTURES.md)).

### Tests

| What | Result |
|---|---|
| Upstream tests ported | 783 of OpenUSD's 1,906 registered tests have a detected port, including all of sdf, pcp, usd, ar and the schema libraries ([what is not ported](KNOWN-GAPS.md#upstream-tests-not-ported)) |
| Library unit tests (Node) | 9,279 pass, 4 fail (real gaps: OpenExec 3, hdSt 1; none in Core); 26 checks the platform rules out, at PLATFORM-DIVERGENCE ids, not counted ([details](KNOWN-GAPS.md#failing-library-tests)) |
| Viewer unit tests (Node, jsdom) | 691 pass, 0 fail ([apps/usdview](apps/usdview/README.md#tests)) |
| OpenVDB package tests | 3 known failures: level-set resampling is not ported ([packages/openvdb](packages/openvdb/README.md#what-is-not-ported)) |
| Upstream image tests against native | 295 of 446 pass in Safari 27.3, 285 in Chrome 156; most of the rest are platform differences, and 14 are real ([breakdown](packages/usd/docs/imaging-status.md#failures-by-class)) |

### Layout

| Path | Package | What it is |
|---|---|---|
| [`packages/usd/`](packages/usd/README.md) | `typescript-usd` | The library: Core (Sdf, Pcp, Usd, Ar and the base libraries), the domain schemas, imaging and OpenExec |
| [`apps/usdview/`](apps/usdview/README.md) | `typescript-usdview` | The only viewer: a browser port of usdview over the library |
| [`packages/materialx/`](packages/materialx/README.md) | `@mtlx/core`, `@mtlx/format`, `@mtlx/genshader`, `@mtlx/genhw`, `@mtlx/genglsl`, `@mtlx/render`, `@mtlx/libraries` | Partial TypeScript port of MaterialX 1.39.5, only what OpenUSD's usdMtlx and Storm use (optional) |
| [`packages/opensubdiv/`](packages/opensubdiv/README.md) | `@opensubdiv/core` | Partial TypeScript port of OpenSubdiv 3.7.0 (with 3.6.1 additions): Sdc, Vtr, uniform Far and the Osd GLSL patch source, used by hdSt |
| [`packages/openvdb/`](packages/openvdb/README.md) | `@vdb/openvdb`, `@vdb/nanovdb` | Partial TypeScript port of OpenVDB 13.0.1/NanoVDB reading (with OpenVDB 10.1.0 dense copy and resampling), used only through `typescript-usd/hioOpenVDB` |


### Imaging

Ported: UsdImagingGLEngine → UsdImaging scene indices →
Hydra → Storm → HgiWebGPU. Storm's glslfx shaders are translated to WGSL inside
HgiWebGPU (`pxr/imaging/hgiWebGPU/src/glsl`).

### OpenExec

Ported in upstream's serial engine configuration. As in 26.11.1, Hydra uses it
only when `USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1` is set (in the viewer:
`?env=USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1`).

## Gaps

Not ported yet:

| Area | Gap | What you see |
|---|---|---|
| Tools | Command-line tools (usdcat, usddiff, usdtree, usdzip, usdchecker, usdrecord, ...) | The library has the APIs; the tools are not there |
| Utilities | usdUtils Python modules (usdzUtils, updateSchemaWithSdrNode) | The usdz extract and iterator helpers and schema updates from Sdr nodes are not there; the C++ library is ported |
| Hydra | Procedurals (hdGp, usdProcImaging) | Generative procedural prims are not expanded |
| Hydra | Adaptive subdivision | The 14 adaptive rows of testHdStBasicDrawing are not run |
| Hydra | Particle fields (Gaussian splats): usdVolImaging's adapter, Hydra's particle field schema, hdsi's points conversion, the hdParticleField example delegate | The UsdVol splat schemas are ported; nothing draws them. Native Storm draws nothing for them either |
| File formats | Alembic (usdAbc), Draco (usdDraco) | `.abc` and Draco assets fail to open, as in a native build without the plugins |
| Textures | Ptex; TIFF, AVIF and other ImageIO/OIIO formats; image writing | Those textures do not load; nothing writes images |
| Color | OpenColorIO | Color management is sRGB only |
| Shading | Parts of MaterialX | 10 of 27 MaterialX image tests pass; most of the rest are near matches |

[KNOWN-GAPS.md](KNOWN-GAPS.md) lists every gap and difference from OpenUSD
with its evidence. In the code, each stand-in for an upstream mechanism is a
`FAITHFULNESS-DEBT` comment and each difference the browser forces is a
`PLATFORM-DIVERGENCE` comment; [the generated debt ledger](packages/usd/docs/faithfulness-debt.md)
lists all of them (48 and 54 ids today).

## Licences

Tomorrow Open Source Technology License 1.0, as OpenUSD ([LICENSE](LICENSE)).
The ports in `packages/opensubdiv` (TOST; OpenSubdiv 3.6.1 additions under its
Modified Apache 2.0 License), `packages/materialx` (Apache-2.0) and
`packages/openvdb` (Apache-2.0; the nine files with OpenVDB 10.1.0 code are
MPL-2.0) carry their own licences, as their upstream projects do; each
package's README says what it ports and credits its upstream authors. These
packages are maintained in this repository, not vendored copies of upstream.
A few files in `packages/usd` follow other permissive upstream code (Microsoft's
Direct3D 11 reference tessellator, MIT; LZ4, RapidJSON and others carried in
OpenUSD's tree), and the viewer bundles the Roboto fonts (Apache-2.0).
[NOTICE](NOTICE) lists every upstream project included and reproduces its
notices; each ported source file names its upstream files, their copyright and
licence in its header. The viewer's menubar links to the same notices
(**Licenses**). Bundled sample scenes, all authored here or copied
from OpenUSD, are listed in
[provenance.json](apps/usdview/public/assets/provenance.json).
