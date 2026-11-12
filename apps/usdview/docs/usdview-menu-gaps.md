# usdview menu parity

This page compares every non-File menu with the actual pinned OpenUSD 26.11.1 Qt application. Matching inventory is distinct from complete native feature support.

Reference: usdviewq/mainWindowUI.ui and dynamic setup in appController.py; an OpenUSD 26.11.1 reference build, native source commit 96c1989167d2aaab5bd34627f32a321a6b79866b. [Actual QAction inventory](../tests/fixtures/menu-parity/native/menus.json), captured by the capture tooling kept outside this repository ([FIXTURES.md](../../../FIXTURES.md)).

## Inventory and supported actions

| Menu | Current result |
|---|---|
| File | Explicit web exception: existing five-action menu and Open dialog's local file/files/folder/URL/examples remain. Browser owns Quit; no new web-only commands added. |
| Edit | Native order, separators, interpolation, session visibility, load/unload and activation actions retained. |
| Window | Native inventory retained. Viewer-only mode and preferences work; unavailable native tools remain disabled. |
| Navigation | Complete native inventory: Find Prims, stage root, enclosing model, preview/full bound materials and preview/full binding relationships; native shortcut labels. Relationship actions select the owning prim and property, including multiple selected prims. |
| Show | Native depth and prim filters; Columns submenu. All five columns work. Draw Mode is hidden by default; eligible models have native inheritance display and session editor. Extra Composition / Visibility menu action removed. |
| Renderer | Storm, Hydra Settings/AOVs/Commands, Pause and Stop in native order. Dome visibility works; color is the presentation AOV. Other unavailable settings/AOV outputs disabled. Commands/Pause/Stop are also disabled in the captured native Storm application. |
| Display | Exact native grouping, action order, labels, separators and shortcut labels. Exclusive complexity/background radios, bounds/purpose controls, extents hints, HUD sections, authored subtree counts, highlighting, scene materials, backfaces and dome texture visibility are wired. Basic rollover path/type inspection does not change selection. |
| Select | All four native selection modes retained. |
| Camera | Native guides/masking/reticles, color-picker actions, camera submenu, separators, framing/reset/image actions and settings. Select Camera is disabled/empty with no cameras; authored cameras and Free Camera are exclusive actions. Full automatic clipping remains disabled. |
| Lights | Scene lights, default camera light and default dome light in native order. All three work; the default dome resolves the native packaged StinsonBeach HDR. Dome texture visibility moved to Display. |

Default popup action height is 13 px, captured from Qt at the default 10 px font and verified in actual Safari/Chrome. Nested menus support hover, arrow navigation and parent restoration on Escape. Browser/system-reserved shortcuts and physical OS clipboard/file activation remain separate acceptance checks.

## Capability results and remaining limits

These are capability records, not automatically adopted release blockers. Matching menu presence does not imply their native behavior is implemented.

| ID | Native behavior | TypeScript viewer today |
|---|---|---|
| M01 | Color Management can disable correction or use an OCIO display/view. | Output fixed to sRGB; alternate modes disabled. Native OCIO is disabled in the pinned default capture too. |
| M02 | GPU stats, renderer settings and alternate AOV presentation. | GPU stats, tiny-prim culling/exposure, additional settings and primId/depth/Neye presentation disabled. Picking still uses its own ID buffers. |
| M03 — implemented | Enable Default Dome Light adds a Glf.SimpleLight dome; native Hdx resolves its empty asset to the packaged StinsonBeach HDR. | Implemented with native resource/orientation, independent app light ownership, ordering and live texture readiness. |
| M04 | Auto Compute Clipping Planes performs native automatic clipping. | Disabled; free-camera near/far overrides remain available. |
| M05 — implemented | Draw Mode column inspects inherited modes and supplies the native editor. | Enabled, hidden by default; native eligibility/inheritance and session-only default/cards/bounds/origin editor/X clear. |
| M06 | Rollover provides the native rich metadata/asset tooltip. | Path and type implemented; detailed native tooltip content remains partial. |
| M07 | Python interpreter, USD Validation, TfDebug and Hydra scene debugger. | The interpreter remains visible and disabled with its reason. USD Validation (`src/validation-window.ts`), Debug Flags (`src/debug-flags.ts`) and the Hydra Scene Debugger (`src/hydra-observer.ts`, `src/hydra-scene-debugger.ts`, `src/hydra-scene-debugger-view.ts`) are implemented as panels inside the viewer (November 10, 2026); remaining differences are in KNOWN-GAPS.md. |

## Library issue observed during verification: L01 (repaired)

On [the self-authored fixture](../tests/fixtures/menu-parity/native/scene.usda), native
Usd.PrimRange.Stage visits 7 paths and traversal from the pseudo-root visits 8
([native paths](../tests/fixtures/menu-parity/native/ranges.json)). JavaScript iteration
of PrimRange once returned only the top-level prims; the library now iterates, prunes and
post-visits as native does (usd/primRange.h, primRange.cpp, wrapPrimRange.cpp). The subtree
HUD uses public Prim.getChildren() traversal and matches native counts for pseudo-root,
model, mesh and abstract class selections.

## Web-only proposals, not implemented

- Copy a review link for URL-backed scenes, including camera/frame/view state.
- Copy/export a compact diagnostics report for sharing a reproducible problem.

Neither proposal was added to a menu. Local files would still require explicit asset sharing.
