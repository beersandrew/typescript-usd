# usdview (TypeScript)

A browser port of OpenUSD 26.11.1's usdview over the workspace library
(`packages/usd`, consumed as `typescript-usd: workspace:*`). It is the only
viewer in this repository. Rendering, picking and selection highlighting go
through the library's `UsdImagingGLEngine` (UsdImaging scene indices → Hydra →
Storm → HgiWebGPU), as usdview's StageView drives them; the viewer owns the UI.
Contributor rules: [AGENTS.md](AGENTS.md).

## What it does

- Opens `.usd`, `.usda`, `.usdc` and `.usdz` scenes from a URL (`?scene=`), from
  the examples menu, or from local files and folders (File menu or drag and
  drop). Payloads stream in after the first frame (unless `?progressive=0`),
  also during playback, with their progress in the status bar.
- Follows usdview's layout and menus: prim tree, viewport, property view and
  the Meta Data, Layer Stack and Composition inspectors, the HUD, the timeline
  and playback, camera selection and free-camera controls, render modes,
  complexity, purposes, lighting and display options, draw modes, session
  edits (visibility, variant selection, activation, payload loading, layer
  muting) and export of the session edits, the overrides or the flattened stage.
- Picks and selects prims and instances in the viewport, also during playback.
- Window > Hydra Scene Debugger browses the Hydra scene indices as usdview's
  debugger does: choose a registered scene index or one of its inputs, browse
  its prims and their data sources and values, and follow (and record) the
  added, removed and dirtied notices live. Window > Debug Flags lists and
  sets the TfDebug flags. Window > USD Validation runs the registered
  validators over the stage, as usdview's validation widget does; double-click
  a result to select its prim. All three open as panels inside the viewer.
- Reports scene features it cannot draw as diagnostics (`src/storm-coverage.ts`,
  currently none) and writes scene warnings to the browser console, where
  native usdview writes to the terminal.

It needs a browser with WebGPU. The image suites and the real-asset checks run
in Safari 27.3 and Chrome 156 on a Mac (Chrome's lower binding limits: see
[KNOWN-GAPS.md](../../KNOWN-GAPS.md), "Platform and runtime").

Where it differs from usdview by default:

- A scene whose root layer has a payload load schedule plays by it
  (`?loadSchedule=0` loads every payload, as usdview does).
- In Safari, Storm's alpha to coverage is off
  (`?env=TF_DEBUG=-HDX_DISABLE_ALPHA_TO_COVERAGE` turns it back on): WebKit's
  shader compiler makes it very slow (KNOWN-GAPS.md, "Performance against native").
- A **Licenses** link in the menubar opens the notices and licence texts of
  everything the build bundles (`licenses/`, written by `scripts/licenses.ts`).
- A "TypeScript Edition" sticker in the window's bottom-left corner marks it as
  this port, not OpenUSD's usdview. It is not drawn into the rendered image.

## Run it

Needs Node 24 and pnpm 11.

```sh
pnpm install            # at the workspace root
cd apps/usdview
npx vite                # serves http://127.0.0.1:5173/ (or the next free port)
```

A *tour* is a USD scene that plays itself: a camera path through the scene and a
schedule for loading its payloads as the camera reaches them. The
[USD Museum](https://github.com/beersandrew/usd-museum), a walk through exhibits
of OpenUSD's features, is one; it is a separate scene, not part of this
repository, so a build points at it with a URL (below).

With no `?scene=`, the page opens the configured tour (below), playing, through its
tour camera; with no tour configured it opens `./assets/torus.usda`, a green
wireframe torus drawn as linear curves. Both show a banner across the top of the
viewport saying a USD file can be dropped onto the window; the torus page also
offers **Start Museum Tour** when a tour is configured. The banner's ✕, opening a
file or opening another scene dismisses it, and it is not shown with `?follow=` or
`?viewerOnly=1` (`src/welcome.ts`; usdview itself has no start page).
**File > Close Stage**, which usdview also lacks, returns to the torus
(`?empty=1`) and keeps the tour configuration.

A tour is a USD scene meant to be played from start to finish. The viewer opens
it (by default, or from the tour button) in the same page, set up from what the
tour's root layer says: through its tour camera
(`/<defaultPrim>/tour/tour_cam`, `/Museum/Cameras/tour_cam`, `/Wing/Cameras/tour_cam`
or `/Tour/Cameras/main_cam`) at `complexity=high`, `loadSchedule=1` when it has a
load schedule, OpenExec when its `customLayerData` `museum`/`museumRoute` `exec`
asks, alpha to coverage off, its plugins registered, and `play=1`. The tour is
configured by:

| Setting | Effect |
|---|---|
| `?tour=<url>`, `?tourPlugin=<plugInfo.json url>` (repeatable) | The tour's root layer and the plugins it needs (wins over the build setting) |
| `VITE_MUSEUM_TOUR_URL`, `VITE_MUSEUM_TOUR_PLUGINS` (comma-separated) | The same, set when building or serving |

Unset, the page opens the torus and the button is hidden. The dev server (`pnpm dev`) serves a local museum
checkout under `/museum/` and configures the button to its `tour.usda` and
`config/*/plugInfo.json`: `USDVIEW_MUSEUM_ROOT` names the checkout (set it in the
environment or in a git-ignored `apps/usdview/.env.local`; unset, nothing is
served). That mount is dev-server only
(`scripts/museum-server.ts`); a build never contains it.

URL parameters:

| Parameter | Effect |
|---|---|
| `?scene=<url>` | The scene to open |
| `?plugin=<plugInfo.json url>` (repeatable) | Registers plugins before the scene opens, as `PXR_PLUGINPATH_NAME` does for usdview. Examples: `plugins/demo-schema/plugInfo.json` (a usdGenSchema-generated API schema) and `plugins/demo-file-format/plugInfo.json` (a `.demo` file format) |
| `?env=NAME=VALUE` (repeatable) | Sets an environment setting (`TfGetEnvSetting`) before anything reads it, e.g. `?env=USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1` to evaluate transforms through OpenExec, as usdview does with that variable set |
| `?follow=ws://host:port` | Follows a sync leader over a WebSocket (e.g. upstream usdview driven by a sync relay): each message sets the frame and play state, and a changed camera or file switches or reopens (`src/follow.ts`). An optional `complexity` (`low`/`medium`/`high`/`veryhigh`) sets Display > Complexity; absent, the follower keeps its own. At most one seek is in flight: frames arriving meanwhile are dropped except the newest, and when the leader pauses the follower lands on its exact frame. Play and frame stepping are disabled while following; the HUD's performance lines show `leader · shown · behind <n> frames · render <ms>` and, in Playback, the follower's own rate of frames shown. Specification: [docs/viewer-contracts.md](docs/viewer-contracts.md) |
| `?loadSchedule=0` | The scene's payload load schedule (root layer `customLayerData["tourLoad"]`) is applied by default when it has one: the stage opens unloaded, and each frame loads the carriers scheduled at it and unloads the rest (`src/load-schedule.ts`). `0` loads every payload, as usdview does; `1` warns when the scene has no schedule. Specification: [docs/viewer-contracts.md](docs/viewer-contracts.md) |
| `?viewerOnly=1`, `?cameraMask=full\|partial\|none` | Set Window > Toggle Viewer-Only Mode and Camera > Camera Masking once the first scene opens (saved like the menu settings) |
| `?camera=`, `?select=`, `?complexity=`, `?ff=`, `?lf=`, `?cf=`, `?mask=` | usdview's `--camera`, `--select`, `--complexity`, `--ff`, `--lf`, `--cf` and `--mask` startup options |
| `?progressive=0` | Load every payload before the first frame, as usdview does |
| `?play=1` | Plays once the scene is open (a web addition; the tour page uses it) |
| `?start=tour` | Marks the tour page: once it has read its setup, the address bar goes back to the page it was opened from |

`npx vite build` (or `pnpm build`, which typechecks first) writes a static build
with a relative base, so it works from any path.

## Embed

```ts
import { defineUsdViewer } from './src/usd-viewer'
import { createRuntime } from './src/runtime'

defineUsdViewer()
const viewer = document.createElement('usd-viewer')
viewer.runtimeFactory = createRuntime
viewer.src = './assets/cube.usda'
document.body.append(viewer)
```

`<usd-viewer>` is one autonomous Web Component with no UI-framework dependency.
Give it an explicit height and set `runtimeFactory` before connecting it; it
creates a runtime on connection and disposes it on removal, and changing `src`
cancels the previous load. Events bubble across the shadow boundary:
`scene-loaded`, `prim-selected`, `viewer-error`, `display-settings-changed`,
`time-changed`, `prim-tree-settings-changed` and `diagnostics-changed`. Styling
can use `--usd-viewer-text`, `--usd-viewer-background` and the parts `shell`,
`toolbar`, `hierarchy`, `viewport`, `inspector`, `properties` and `status`.

## Tests

```sh
npx tsc --noEmit
npx tsc --noEmit -p tsconfig.ui.json
npx vitest run
```

On November 12, 2026: both typechecks pass and vitest runs **69 test files,
691 tests, all passing**. These are jsdom and controller
tests with fake or Node-side runtimes; they check UI behaviour and USD
semantics against native captures from the 26.11.1 build
([FIXTURES.md](../../FIXTURES.md)), not GPU rendering.

Rendering is checked in Safari against native OpenUSD by the asset-acceptance
harness, `node scripts/asset-acceptance/run.mjs` (see its header for options).
It needs the native renders and the external assets described below, so it
cannot be run from a clone alone.
It renders each asset through the viewer runtime and compares it with the
reference build's `usdrecord` and usdview renders, which the capture tooling
kept outside this repository writes into its output directory first
([FIXTURES.md](../../FIXTURES.md)), and scores the median significant pixels over the runs
(packages/usd/docs/imaging-i2.md section 1.3). Its results are recorded in the
imaging ledger, [packages/usd/docs/imaging-status.md](../../packages/usd/docs/imaging-status.md):
the curated set (`assets.json`) passes **28 of 28** and the corpus
(`assets-corpus.json`) **190 of 191** (1 error: the native reference crashes
on it), both on Safari runs of November 12, 2026. Reports and renders are written to `scripts/asset-acceptance/out/`
and are not committed. The asset roots it reads from outside the repository (the
ASWF assets and the OpenUSD source) are named
in the manifests' `roots` and can be moved with environment variables.

## Assets and licences

The viewer is under the Tomorrow Open Source Technology License 1.0
([LICENSE](LICENSE), [NOTICE](NOTICE)). A build also bundles the ported
MaterialX (Apache-2.0), OpenSubdiv and OpenVDB (Apache-2.0, with MPL-2.0 files)
packages and the Roboto fonts (Apache-2.0); the menubar's **Licenses** link
serves all their notices and licence texts. Bundled sample scenes are listed with
their sources and licences in [public/assets/provenance.json](public/assets/provenance.json).
Third-party assets used only for local checks are never committed or
redistributed.
