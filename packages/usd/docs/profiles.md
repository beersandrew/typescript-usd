# Capability profiles (usdProfiles)

OpenUSD 26.11.1 adds `pxr/usd/usdProfiles`. This page says what it is, what
`typescript-usd/usdProfiles` ports, and what the viewer's profile claims and
why.

## What usdProfiles is

- **Capabilities** are named USD features, such as `usd.core.colorspace`.
  Plugins declare them in the `Profiles.Capabilities` block of their
  `plugInfo.json`. Each capability lists its predecessors, so together they
  form a directed acyclic graph with a single root, `usd`. An edge can be
  marked deprecated.
- A **profile** is a capability marked `"isProfile": true`. A profile covers a
  capability when the capability is reachable from it through predecessors.
- **`UsdProfileRegistry`** loads the graph from every registered plugin and
  answers queries such as `HasPredecessor` and `CoversCapabilities`.
- **`UsdProfilesClaimsAPI`** is an applied schema. It records two things in
  the prim's `customData["profilesInfo"]`:
  - the capabilities the prim uses, each with a degradation class (`hard`,
    `soft` or `enhancement`);
  - the profiles the prim claims to be compatible with, each with an optional
    list of excepted capabilities.

A claim is a statement by whoever authored the layer. It is not computed from
the scene. Upstream's overview says so: capabilities "are not a ground truth
algebraic solve of composition". `PopulateCapabilityUsages` can fill in the
capabilities that applied schemas and layer file formats imply.

## What is ported

| Upstream | Here | Notes |
|---|---|---|
| `profileRegistry.{h,cpp}` | `ProfileRegistry` | All queries, versioned names (`_vN`), validation warnings |
| `claimsAPI.{h,cpp}` | `ClaimsAPI` | Same storage layout, token types included |
| `profilesDocUtils.{h,cpp}` | `ProfilesMarkdown`, `ProfilesMermaid`, `ProfilesDot` | Output is byte-identical on the tested graphs |
| `plugInfo.json`, `generatedSchema.usda` | `src/plugin/plugData.ts` | Verbatim |

Tests: the five C++ and five Python testenv tests are ported (10 / 10
registrations). In addition, a capture from the pinned 26.11.1 build
(`tests/fixtures/profiles/`, captured by the capture tooling kept outside
this repository; `FIXTURES.md`) checks every query and rendering over
the production graph and every testenv graph.

Differences from upstream, each noted at the code site:

- **Late plugins.** Upstream builds the registry once, after every plugin has
  been discovered. Here, plugins can register later, from a `plugInfo.json`
  URL or a lazily imported module. Their `Profiles` data is added when they
  register, and the graph is validated again.
- **Cycle error order.** Upstream lists the nodes of a cycle in hash-map order,
  which is unspecified. Here they are sorted.
- **Test loading.** The registry's test-only loader takes the file's text,
  because the library does not read files itself.
- **Untyped strings.** `GetCapabilityUsage` returns a plain JavaScript string
  set through `SetCapabilityUsages`. Upstream requires a `TfToken` value, and
  JavaScript cannot tell the two apart. A layer that declares an entry as
  `string` reads as `''`, as it does upstream.

The library changes that support the port are all OpenUSD API:
`UsdObject::GetMetadataByDictKey` and `ClearMetadataByDictKey` on `Prim`,
`includeClipLayers` on `Stage.getUsedLayers`, and the format's `TfType` for
file-format implications.

## The viewer's profile: `typescript-usd.web`

`apps/usdview/public/plugins/typescript-usd-web-profile/plugInfo.json` is a
resource plugin, in the form upstream's overview describes. usdview registers
it from its URL at startup, as `?plugin=` registers others.

**Why it lives in the viewer.** The library contains only what OpenUSD
contains, and OpenUSD ships no implementation or platform profiles: in its
design, a studio or platform declares those. The profile also describes the
renderer and the browser, not only the library.

**Names.** OpenUSD 26.11.1 defines six capabilities: `usd`, `usd.core`,
`usd.core.colorspace`, `usd.core.fileformat`, `usd.mtlx` and
`usd.mtlx.fileformat`. The profile uses those names where they apply. Upstream
names nothing finer, so everything else is under `typescript-usd.`.

| Capability | Claimed | Basis |
|---|---|---|
| `usd.core` | yes, partially | Layers, composition and value resolution work. Many upstream usd tests are not ported, and stages open asynchronously |
| `usd.core.fileformat` | yes | File format plugins load as ES modules from `plugInfo.json` URLs |
| `usd.mtlx.fileformat` (and `usd.mtlx`) | yes | `.mtlx` layers open through usdMtlx, which the viewer loads |
| `usd.core.colorspace` | **no** | ColorSpaceAPI opinions are authored and resolved, but the Storm port does not apply them when shading |
| `typescript-usd.imaging.geom` | yes, with limits | Uniform subdivision only. NURBS, Hermite curves, TetMesh and volumes are not imaged |
| `typescript-usd.imaging.previewSurface` | yes, with limits | No displacement, connected opacity or multiple UV sets. Limited texture formats |
| `typescript-usd.imaging.mtlx` | yes, with limits | One UV set and one sampler per material |
| `typescript-usd.imaging.lux` | yes, with limits | Dome, Sphere, Rect and Distant lights. Shadows from the first distant light only |
| `typescript-usd.imaging.skel` | yes, with limits | CPU skinning. Some combinations are rejected |

Each capability's docstring states its limits, and the imaging ledger
([imaging-status.md](./imaging-status.md)) has the per-image detail. The graph says only that a capability is covered; it cannot express
"covered with limits". A scene that claims a covered capability can still use
an unsupported part of it. The viewer's other diagnostics report those cases
when it meets them.

The plugin was also loaded into the pinned native build
(`apps/usdview/tests/fixtures/webProfile/`, captured by the capture tooling
kept outside this repository; `FIXTURES.md`). The native registry
accepts it without warnings and gives the same coverage answers.

## What the viewer reports

When a stage opens, usdview reads every prim that has `ClaimsAPI` applied. It
adds a warning to its usual diagnostics for:

- each claimed capability that `typescript-usd.web` does not cover, giving the
  strongest degradation class claimed for it and the claiming prims;
- each claimed profile that is not registered, or whose requirements the web
  profile does not fully cover.

A scene that makes no claims, or whose claims are all covered, gets no
message. The check does not infer capabilities from the scene's content.
