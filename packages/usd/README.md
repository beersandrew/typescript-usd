# typescript-usd

The library of this workspace: a port of OpenUSD
[v26.11.1](https://github.com/PixarAnimationStudios/OpenUSD/tree/v26.11.1)
(commit `96c1989167d2aaab5bd34627f32a321a6b79866b`) to TypeScript: the USDA and USDC file
formats, usdz, composition and value resolution, the domain schemas, imaging
(UsdImagingGLEngine → UsdImaging → Hydra → Storm → HgiWebGPU) and OpenExec. It
runs in Node and in the browser, with no WebAssembly and no native code. The
workspace [README](../../README.md) gives the purpose and current status; the
viewer in [apps/usdview](../../apps/usdview/README.md) is its consumer.

Ported modules cite the 26.11.1 source by `file:line`, and native test captures
come from a 26.11.1 build ([FIXTURES.md](../../FIXTURES.md)); no OpenUSD build
or source checkout is needed to use or test the library. Passing the ported tests is not a claim of complete
26.11.1 parity. There is no npm package; the package's `exports` point at the
TypeScript sources, which the workspace consumes as `workspace:*`.

## Scope

- **Core** (`sdf`, `pcp`, `usd`, `ar` and the base libraries) is independently
  importable: a Core-only bundle contains no imaging, OpenSubdiv or MaterialX
  code. Where the AOUSD Core specification and OpenUSD disagree, the decision
  is recorded in [docs/core-1.1.md](./docs/core-1.1.md).
- **Imaging** is one faithful implementation of upstream's structure:
  `UsdImagingGLEngine` drives the UsdImaging scene index chain
  (`UsdImagingCreateSceneIndices`), Hydra and Storm (`hdSt`, with the hdx
  tasks), on a WebGPU Hgi backend (`hgiWebGPU`). Storm's glslfx shaders are
  compiled by a GLSL-to-WGSL translator in `hgiWebGPU/src/glsl`, as hgiMetal and
  hgiVulkan translate for their APIs. WebGPU adaptations document their
  upstream counterparts. Scene features that cannot be drawn are diagnosed
  rather than drawn wrong. [docs/imaging-status.md](./docs/imaging-status.md)
  is the generated per-image ledger against native OpenUSD;
  [docs/imaging-i2.md](./docs/imaging-i2.md) holds the plan and decisions.
- **OpenExec** (`pxr/exec`) and `usdExecImaging` run on upstream's serial
  engine configuration. UsdImagingGLEngine merges the exec scene index only
  when `USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1`, as upstream
  (default off). Status: [docs/openexec-x1.md](./docs/openexec-x1.md) section 11.

Application UX (undo stacks, gizmos, document management) belongs in
consumers, not here ([AGENTS.md](./AGENTS.md)).

## Development

Requires Node 24 and pnpm 11. From the workspace root:

```sh
pnpm install
cd packages/usd
npx tsc --noEmit
npx vitest run
```

The tests are self-contained: they need only Node, not an OpenUSD install.
Imaging image tests run in a browser through the runners in `tests/browser/`
(`storm-image`, `hdx-image`, `usdimaging-gl-image`, `wgsl-check`; e.g.
`node tests/browser/storm-image/run.mjs`), which render with the TypeScript
renderer in real WebGPU and compare with committed native captures. They open
Safari by default, or a separate Chrome instance with `--browser chrome`;
`tests/browser/imaging-status/run.mjs` reruns them and regenerates the ledger.
`scripts/` holds `usdGenSchema.mjs` (the usdGenSchema port; it reads the
`schema.usda` files from an OpenUSD checkout given with `--openusd`), the two
resource build scripts (`generate-glslfx-resources.mjs`, `copy-resources.mjs`)
and `check.sh`. Before committing, `scripts/check.sh` typechecks, checks that
imports between libraries follow OpenUSD's CMake library graph, and runs the
full suite. The generated tables
(the library graph, the debt ledger, the naming map) are regenerated and
checked against their sources by the tooling kept outside this repository
(FIXTURES.md).

## Known failing tests

On November 12, 2026, `npx vitest run` loads all 882 test
files: **9,279 pass, 4 fail**, and 26 checks the platform rules out are
skipped. Every failure is a ported upstream test or a native-capture check
kept as a plain failing `it()` to expose a real gap:

- **OpenExec, 3** (`pxr/exec`): TraceReporter serialization in
  `testExecUsdBasicCompilation`, `TfSpan` and `execTest` (docs/openexec-x1.md
  section 11).
- **Storm, 1**: `testHdStBarAllocationLimit`, an image test with no native
  capture or runner yet.

The 26 skipped checks are Storm's GPU computations (smooth and flat normals,
quadrangulation, GPU subdivision refinement): Node has no WebGPU device and
the test Hgi has no compute pipelines
(`PLATFORM-DIVERGENCE(hdst-node-no-gpu-compute)`). They run in Safari over
HgiWebGPU in the `hdst-gpu` suite (`tests/browser/storm-image/hdst-gpu/run.mjs`).

None are in Core. Known divergences without a failing test are
`FAITHFULNESS-DEBT(<id>)` (to retire) and `PLATFORM-DIVERGENCE(<id>)`
(forced by the platform) comments at the code site. Upstream checks that
the platform makes impossible (double-precision shaders, C++ object sizes and
copy semantics, GPU compute in Node, synchronous GPU read-back and resolver
calls) are left out, skipped in Node or adapted at a `PLATFORM-DIVERGENCE` id,
not kept failing. All are listed with their end-states in
[docs/faithfulness-debt.md](docs/faithfulness-debt.md) (generated from those
comments). The upstream test coverage script, kept outside this repository,
reports 783 of OpenUSD's 1,906 registered tests with a detected port.

These failures, and the gaps that have no failing test, are listed with their evidence in [KNOWN-GAPS.md](../../KNOWN-GAPS.md).

## Entry points

The main entry, `typescript-usd`, is the surface: a modern TypeScript API in
which each member is one call into the core and names the OpenUSD symbol it
wraps (`@upstream` in its TSDoc; the full table is
[docs/naming-map.json](./docs/naming-map.json)). Failures throw `UsdError`,
absence is `undefined`, numeric arrays are typed arrays, and scopes are
`using` disposables with callback forms ([docs/style-guide.md](./docs/style-guide.md)).

```ts
import { Mesh, Stage, UsdError } from 'typescript-usd'

const stage = await Stage.open(new URL('./CubeModel.usda', import.meta.url))
const prim = [...stage.traverse()].find(prim => prim.isA('Mesh'))!
const mesh = new Mesh(prim)
const points = mesh.points.get()            // Float32Array, 3 floats per point

// Author in the session layer; one change notice for the block.
stage.addEventListener('objectschanged', e => console.log(e.changedInfoOnlyPaths))
stage.withEditTarget(stage.sessionLayer, () => stage.changeBlock(() => {
  mesh.points.set(points!.map(v => v * 2))
  mesh.points.set([[0, 0, 0], [1, 1, 1]], 24)  // a time sample
}))

try {
  await stage.export('doubled.usda')
} catch (error) {
  if (error instanceof UsdError) console.error(error.message, error.errors)
}
```

So far the surface covers Stage, Prim, Attribute, Layer and Mesh (see the
style guide's status section); everything else is reached through the core. Each object's `core` property is the
core object it wraps, and `Stage.fromCore(coreStage)` goes the other way.

The core is the file-by-file port, with OpenUSD's names (members lowercased at
the first letter). Each OpenUSD library is its own entry point, named as in
OpenUSD, so a web app loads only the modules it imports.

```ts
import { Stage } from 'typescript-usd/usd'
import { Layer } from 'typescript-usd/sdf'

const layer = Layer.createAnonymous()
layer.importFromString(`#usda 1.0
def Xform "World"
{
    def Sphere "Ball"
    {
        double radius = 2
    }
}
`)
const stage = await Stage.open(layer)
const ball = stage.getPrim('/World/Ball')!
console.log(ball.typeName, ball.getAttr('radius')!.getValue()) // Sphere 2
```

USDA needs a newline (or `;`) between statements, so a one-line
`{ double radius = 2 }` prim body is rejected, as it is by OpenUSD.

| Entry point | OpenUSD library |
|---|---|
| `typescript-usd/sdf` | Paths, layers, list ops, the USDA and USDC formats, usdz |
| `typescript-usd/pcp` | Prim indexing and composition arcs |
| `typescript-usd/usd` | Stages, value resolution, authoring, the schema registry |
| `typescript-usd/ar` | Asset resolution |
| `typescript-usd/usdGeom` | Geometry schemas, transforms and bounds |
| `typescript-usd/usdShade` | Shading schemas, connections, bindings and terminal resolution |
| `typescript-usd/sdr` | Shader discovery, parser and registry interfaces |
| `typescript-usd/usdMtlx` | MaterialX document reader and opt-in `.mtlx` file-format plugin |
| `typescript-usd/usdProfiles` | Capability profiles: the profile registry and ClaimsAPI ([docs/profiles.md](./docs/profiles.md)) |
| `typescript-usd/usdSkel` | Skeleton and skinning schemas |
| `typescript-usd/usdUtils`, `/usdValidation`, `/usdGeomValidators`, `/usdShadeValidators`, `/usdSkelValidators`, `/usdLuxValidators`, `/usdMediaValidators`, `/usdPhysicsValidators`, `/usdLodValidators`, `/usdUtilsValidators` | Stage utilities (flattening, dependencies, stitching, usdz packaging) and the validation framework with its validators |
| `typescript-usd/usdLux`, `/usdPhysics`, `/usdMedia`, `/usdLod`, `/usdUI`, `/usdRi`, `/usdRender`, `/usdProc`, `/usdHydra`, `/usdSemantics` | Domain schemas, most generated from upstream's `schema.usda`, with their custom code |
| `typescript-usd/usdShaders`, `/sdrGlslfx` | The usdShaders Sdr nodes and the glslfx Sdr parser plugin |
| `typescript-usd/hdMtlx` | Typed MaterialX graph reconstruction from Hydra networks |
| `typescript-usd/usdImagingGL` | `UsdImagingGLEngine`, the entry point applications render and pick through |
| `typescript-usd/usdImaging`, `/usdSkelImaging`, `/hd`, `/hdsi` | Scene indices from a stage, skinning, Hydra interfaces and scene index emulation |
| `typescript-usd/hdSt`, `/hdStorm`, `/hdx`, `/hgi`, `/hgiWebGPU`, `/hgiInterop`, `/glf`, `/cameraUtil` | Storm, the hdx tasks and the WebGPU Hgi backend with its GLSL-to-WGSL translator |
| `typescript-usd/hdSt/materialx` | Opt-in: turns on Storm's MaterialX support (the counterpart of `PXR_ENABLE_MATERIALX_SUPPORT`) |
| `typescript-usd/work`, `/vdf`, `/ef`, `/esf`, `/esfUsd`, `/exec`, `/execUsd`, `/execGeom`, `/execIr`, `/usdExecImaging` | OpenExec and its imaging scene index |
| `typescript-usd/hio`, `/pxOsd` | Image support and subdivision tags |
| `typescript-usd/geomUtil` | Mesh generators for implicit surfaces (sphere, cube, cone, cylinder, capsule, plane, disk) |
| `typescript-usd/usdVol` | Volume and field schemas (and the particle field schemas, not imaged) |
| `typescript-usd/usdVolImaging`, `/hioOpenVDB` | Opt-in OpenVDB field imaging: field prim adapters, and the `.vdb` field reader for Storm |
| `typescript-usd/arch`, `/gf`, `/tf`, `/vt`, `/plug`, `/trace`, `/ts`, `/kind` | Hashing, math, types and notices, values and arrays, plugins, tracing, splines, kinds |

### Values from reads are read-only

As in OpenUSD, where a read gives a `const` copy of a value the layer shares,
values handed out by reads are shared with the layer and are read-only:
`Layer.getField`, `Layer.queryTimeSample`, `Attribute.getValue`,
`getValueAtTime`, `getDefaultValue`, `getFallbackValue`, `AttributeQuery.get`,
and the prim, property and stage `getMetadata` reads (and the values in the
maps `getAllMetadata`/`getAllAuthoredMetadata` return). Plain arrays and
objects (dictionaries, list ops), Gf values and other value objects are
frozen, so writing to one throws a `TypeError`. A `VtArray` read this way is
frozen too: its mutating methods (`set`, `push_back`, `resize`, `data()`, ...)
throw, and `cdata()` is its shared storage, typed read-only (element storage
of strings and the like is frozen; typed storage is checked by the
compiler only). To change a value, copy it and write the copy back:

```ts
const points = attr.getValue() as VtArray<Vec3f>
const edited = points.Clone() // shares the storage until it is written
edited.set(0, new Vec3f(0, 0, 0))
attr.set(edited)
prim.setMetadata('customData', { ...(prim.getMetadata('customData') as object), note: 'x' })
```

`VtArray` and `VtDictionary` are copy-on-write: a copy (`Clone()`,
`new VtDictionary(other)`) shares its source's storage until either is
written. Values given to a set are copied when stored, so editing them
afterwards does not change the layer; a frozen value is stored as it is.

### Plugins loaded at runtime

A plugin can be registered from its `plugInfo.json` URL, as OpenUSD registers
one from its path. A `library` plugin's `LibraryPath` names an ES module,
imported the first time the plugin is needed; its top-level code defines the
types it declares. A file format plugin is loaded when a layer with one of its
extensions is first opened:

```ts
import { Registry } from 'typescript-usd/plug'
import { Stage } from 'typescript-usd/usd'

await Registry.GetInstance().registerPluginsAsync(
  new URL('/plugins/demo-file-format/plugInfo.json', location.href).href)
// Any .demo layer the stage's resolver finds now opens through the plugin.
const stage = await Stage.open('scene.demo')
```

The module imports the library by bare specifier (`typescript-usd/sdf`), so
the page's import map or bundler must resolve it to the instance the page
uses. [examples/demo-file-format](./examples/demo-file-format) is a complete
file format plugin.

### Asset resolver plugins

An Ar resolver is registered as OpenUSD registers one: `DefineResolver`
(`AR_DEFINE_RESOLVER`) defines its type with the factory Ar creates it with,
and its plugin's `plugInfo.json` declares the type under `Types` with the
metadata Ar reads. A type with `uriSchemes` resolves the paths with those
schemes; a type without them is a primary resolver candidate, chosen as
OpenUSD chooses (`SetPreferredResolver`, else the first by name, else
`ArDefaultResolver`). `implementsContexts` gives the resolver the stage's
`ResolverContext`; `DefinePackageResolver` with `extensions` registers a
package resolver.

```ts
import { DefineResolver, InMemoryAsset, ResolvedPath, Resolver } from 'typescript-usd/ar'
import { Registry } from 'typescript-usd/plug'
import { Stage } from 'typescript-usd/usd'

class FetchResolver extends Resolver {
  override createIdentifier(assetPath: string, anchor = new ResolvedPath()): string {
    return assetPath && new URL(assetPath, anchor.valid ? anchor.toString() : undefined).href
  }
  async resolve(assetPath: string) { return new ResolvedPath(assetPath) }
  async openAsset(resolvedPath: ResolvedPath) {
    const response = await fetch(resolvedPath.toString())
    return response.ok ? new InMemoryAsset(new Uint8Array(await response.arrayBuffer())) : undefined
  }
}

DefineResolver('FetchResolver', FetchResolver)
Registry.GetInstance().RegisterPlugins({ Plugins: [{
  Name: 'fetchResolver', Type: 'library',
  Info: { Types: { FetchResolver: { bases: ['ArResolver'], uriSchemes: ['http', 'https'] } } },
}] })
const stage = await Stage.open('https://example.com/scene.usda')
```

In a `library` plugin loaded from a URL, the module calls `DefineResolver`
and the plugin is loaded with `loadAsync()` before its resolver is used. A
resolver plugin registered after the first `GetResolver()` call still
resolves its schemes; the primary resolver is chosen once, at that call
(`PLATFORM-DIVERGENCE(ar-resolver-late-registration)`). The viewer's HTTP
resolver, [apps/usdview/src/http-resolver.ts](../../apps/usdview/src/http-resolver.ts),
is a complete URI resolver plugin with per-stage contexts.

## Repository layout

`pxr/` mirrors OpenUSD's `pxr/` tree, with the same library names and
placement. Each library's ported upstream tests are in its `tests/upstream/`
directory. Contributor rules are in [AGENTS.md](./AGENTS.md).

Native reference fixtures are captured from an OpenUSD 26.11.1 build by
capture tooling kept outside this repository
([FIXTURES.md](../../FIXTURES.md)). JSON fixtures carry a
`{release, commit, script, upstream, payload}` envelope, which
`pxr/testing/oracleFixture.ts` checks names 26.11.1.

## Dependencies on the other ported packages

These packages are partial ports maintained in this repository (not vendored
upstream code), each with its own licence and README.

- **OpenSubdiv.** `@opensubdiv/core` (`packages/opensubdiv`, see its
  `README.md`) is the library's one regular dependency; hdSt's subdivision
  (`hdSt/src/subdivision.ts`) builds Far stencil and patch tables with it.
  Adaptive refinement is not in that package
  (`FAITHFULNESS-DEBT(hdst-osd-adaptive)`).
- **MaterialX.** The `@mtlx/*` packages (`packages/materialx`,
  Apache-2.0) are optional peer dependencies, imported only by
  `typescript-usd/usdMtlx`, `typescript-usd/hdMtlx` and
  `typescript-usd/hdSt/materialx`. Importing `usdMtlx` registers the `.mtlx`
  file format, the MaterialX schemas and Sdr plugins; without it, opening a
  `.mtlx` layer fails with Sdf's unknown-format error, as when OpenUSD has no
  usdMtlx plugin. Importing `hdSt/materialx` turns on Storm's MaterialX shader
  generation, the runtime counterpart of `PXR_ENABLE_MATERIALX_SUPPORT`.
- **OpenVDB.** `@vdb/openvdb` and `@vdb/nanovdb` (`packages/openvdb`,
  Apache-2.0, with nine MPL-2.0 files derived from OpenVDB 10.1.0) are imported only by `typescript-usd/hioOpenVDB`, which registers `.vdb`
  field texture data with Hio as upstream's hioOpenVDB plugin does; Storm
  uploads the densified grids as 3D textures. `typescript-usd/usdVolImaging`
  registers the field prim adapters.

## License

Licensed under the Tomorrow Open Source Technology License 1.0, the same
license as OpenUSD (see [LICENSE](LICENSE)). Portions are derived from
[OpenUSD](https://github.com/PixarAnimationStudios/OpenUSD), © Pixar; each
ported file carries its upstream copyright header, and
[NOTICE](NOTICE) (the same as the workspace NOTICE) lists every upstream
project included. Independent project; not affiliated with Pixar, the ASWF or AOUSD.
