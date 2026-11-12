# typescript-usd style guide

**Written November 7, 2026.** This guide decides TypeScript idiom for the port, with reasons.
The bar is behaviour and performance: the port behaves and performs like OpenUSD, and its
usdview plays scenes the same way usdview C++ does. Equivalence is never traded for style.
The guide is adapted to what modern TypeScript on the web expects.

## Two layers

- **Core** (`pxr/`, imported as `typescript-usd/<lib>`): the file-by-file port. Keeps upstream's
  file and type names (`UsdStage`) and member names with a lowercase first letter
  (`getPrimAtPath` for `GetPrimAtPath`), so new OpenUSD releases merge file by file.
  Core-marked rules apply here without breaking that correspondence.
- **Surface** (the package root, `import { Stage } from "typescript-usd"`): what apps use. Thin:
  each member is one visible call into the core, no logic of its own. Reads like a modern web
  library. Importing the root brings in the surface only; core libraries are imported explicitly.

## Rules

| # | Rule | Applies to | Example |
|---|---|---|---|
| 1 | Two layers, two naming rules. The core keeps upstream names, with members (methods, accessors, callable properties) lowercased at the first letter: `GetPrimAtPath` → `getPrimAtPath`, `_GetFoo` → `_getFoo`; a leading acronym is lowered up to the capital that starts the next word (`URLForFoo` → `urlForFoo`, `XAxis` → `xAxis`; plural `IDs` → `ids`), later acronyms stay (`GetURL` → `getURL`). Type, enum and enum-member names, nested-enum constants (`HdChangeTracker.AllDirty`), library-prefixed free functions and constants (`UsdImagingCreateSceneIndices`), module exports and JSON/file-format keys keep upstream's spelling. The surface follows TypeScript conventions. | both | core `stage.getPrimAtPath(p)` · surface `stage.prim("/World")` |
| 2 | Surface names are derived by rule, not invented: methods and properties camelCase; a `Get…` with no arguments becomes a getter (`stage.rootLayer`), with arguments drops `Get` (`stage.prim(path)`); `Has…`/`Is…` with no arguments become boolean getters (`prim.isActive`), with arguments methods (`prim.isA(type)`); `Set…` becomes a method (`setActive`); a schema's `Get…Attr` becomes the attribute's property (`mesh.points`, rule 10); an options field is named for the upstream parameter it replaces (`load` for `UsdStage::Open(…, load)`). | surface | core `getAttribute(name)` → `attribute(name)` |
| 3 | Surface type names drop the library prefix: `Stage`, `Prim`, `Attribute`, `Layer`, `TimeCode`. A name that clashes with a DOM or JS global apps use (`Selection`, `Range`, `Node`, `Path2D`-adjacent `Path`) takes `Usd`: `UsdPath`, `UsdSelection`. | surface | `const prim: Prim \| undefined = stage.prim("/World")` |
| 4 | No TypeScript `enum` at the surface. Enumerations are string-literal unions with an `as const` object of values; the upstream name is recorded in the naming map. Bit flags are a `ReadonlySet` of literals or an options object, never bit arithmetic. Core enums keep upstream values. | surface | `prim.specifier === "def"` · `{ load: "all" }` |
| 5 | Failure throws one error class: `UsdError extends Error`, with `errors` (the posted Tf errors) and `cause`. No `errors?: string[]` out-parameters and no `null`-for-failure at the surface. Programmer errors the core reports as coding errors throw too. The core keeps posting upstream's diagnostics. | surface | `try { await Stage.open(url) } catch (e) { if (e instanceof UsdError) … }` |
| 6 | Absence is `undefined`, never `null`, typed as `T \| undefined` so optional chaining works. The core's invalid objects stay for upstream semantics. `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on. | surface | `stage.prim(p)?.attribute("radius")` |
| 7 | I/O is async, computation is sync. Opening, exporting, resolving and loading return `Promise`s and take an optional `{ signal: AbortSignal }`; reading values, composition queries and traversal of a loaded stage are synchronous. No `…Sync` twins. | surface | `const stage = await Stage.open(url, { signal })` |
| 8 | Options are objects, not positional flags: anything beyond the one or two obvious arguments goes in a typed options object with defaults. | surface | `Stage.open(url, { load: "none", mask })` |
| 9 | Scopes use explicit resource management: change blocks, edit contexts and error marks return a `Disposable` for `using`, and have a callback form. | both | `using _ = stage.changeBlock()` · `stage.withEditTarget(t, () => { … })` |
| 10 | Typed attributes: generated schemas declare each attribute with its value type; numeric arrays are typed arrays (`Float32Array`, …) with zero-copy access; setters accept any `Iterable` of the element type or the typed array itself. Vectors are readonly tuples at the surface (`readonly [number, number, number]`). | surface (generated) | `mesh.points: Attribute<Float32Array>` · `await mesh.points.set([[0,0,0],[1,0,0]], t)` |
| 11 | Paths and tokens are strings at the surface (JS strings are already interned); `UsdPath` objects are returned only where path algebra is needed. Hot paths in the core use prebuilt token sets. | both | `prim.attribute("radius")` |
| 12 | Files are `URL \| string`; a resolver identifier that may not be a file takes `{ identifier }`. Works with `fetch`, `File` and `Blob` sources in the browser. | surface | `Stage.open(new URL("./hero.usda", import.meta.url))` |
| 13 | Traversal and children are iterables (generators), so `for…of`, spread and iterator helpers work; predicates are values (`"default"`, `"all"`), not flag arithmetic. | surface | `for (const prim of stage.traverse()) { … }` |
| 14 | Change is observed through `EventTarget`: the stage dispatches typed events named for the notice (`UsdNotice::ObjectsChanged` is an `ObjectsChangedEvent` of type `objectschanged`); removal uses `AbortSignal`. An async-iterator form is offered for consumers that want one. No arrays of callbacks. | surface | `stage.addEventListener("objectschanged", e => …, { signal })` |
| 15 | No `any` in a public signature; `unknown` plus a type guard where a value's type is open (`VtValue`). Generics carry value types (`Attribute<T>`). | both | `const v = attr.get(t)` is typed by the schema |
| 16 | ESM only, named exports, no default exports; `sideEffects: false` except plugin registration modules; the surface tree-shakes. | both | `import { Stage, UsdError } from "typescript-usd"` |
| 17 | Access says what is API: core internals shared across libraries live in `/internal` paths not exported from `package.json` `exports`; no exported name starts with `_`. | core | `exports: { ".": …, "./usd": …, "./internal/*": null }` |
| 18 | TSDoc on every surface member, with an `@upstream` tag naming the C++ symbol (or `@upstream none` for surface-only names, listed in the exceptions table). | both | `/** @upstream UsdStage::GetPrimAtPath */` |
| 19 | Speed tricks need a number: manual object pooling, typed-array aliasing, skipping validation, or a sync fast path is allowed only where a benchmark (`bench/`) shows the gain, recorded in the comment. This is the escape hatch for every rule above. | core | `// P1: 18 % of first-open time without the pool` |
| 20 | Tests: one Vitest test per upstream test method, parameterised over inputs; existing assertions never change to fit a refactor; every surface member is tested against the core call it wraps. | tests | `test.each(formats)("Basic %s", …)` |
| 21 | App commands in usdview are a string-literal union whose values are upstream usdview's action names. | app | `"actionReopen_Stage"` |
| 22 | Lint enforces it: typescript-eslint `strict-type-checked` plus a `naming-convention` rule for the surface; the naming-map check (below) runs with the tooling kept outside this repository. | both | `pnpm lint` |

## Keeping upstream traceable

- The core keeps upstream names (members lowercased at the first letter, rule 1); merges of new
  OpenUSD releases happen there, file by file.
- Member mapping for merges: an upstream member `Foo::GetBar` / `_GetBar` is `getBar` / `_getBar`
  in the core, by rule 1 (a leading acronym is lowered up to the capital that starts the next
  word: `URLForFoo` → `urlForFoo`, plural `IDs` → `ids`). When porting new upstream code, write
  members in that form. Members a mechanical rename cannot prove safe keep upstream spelling:
  names reached by string (duck-typing checks such as `'GetValue' in v`, `obj['Get…']`, the viewer-perf probe's
  monkeypatching by method name, code inside strings), collisions with an existing lowercase
  member, and names reserved by JavaScript (`toString`, static `apply`). Upstream citations in
  comments keep the C++ spelling (`UsdStage::GetPrimAtPath`, `stage.cpp:123`).
- `docs/naming-map.json` (upstream C++ symbol → core TS symbol → surface TS symbol) is generated
  from the surface's TSDoc `@upstream` tags and the compiler's type information by a check
  script, which fails if a surface member has no tag, names a core symbol that no longer exists,
  or has a name not derived by rule 2/3 and not in `docs/naming-map-exceptions.md`.
- Generated schema surfaces regenerate from the same generator as the core.

## Order of work

The port is past Core and Viewer, so this guide is a retrofit. It does not
start before the Monday, November 9 showcase.

1. **Pilot:** "open a stage, find a mesh, read and author its points" through the surface, with
   `UsdError`, typed attributes, `using` change blocks and the naming-map check; move three
   usdview features onto it.
2. **Module batches:** Sdf authoring; errors and events; enums and options; imaging-facing
   types. Each gated by the full tests, the compliance and asset harnesses, and the benchmarks.
3. **Audit:** a fresh independent TypeScript idiom audit; the target is 10/10.

## Where the repo is today (baseline, November 7, 2026)

Measured on `main` at `564ad2cd`, before any retrofit. Rough overall estimate against a typical
TypeScript library: about 5/10. The build and module setup are modern; the API reads like C++.

**Already typical:** `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on;
ESM only, named exports, no default exports (0); `any` is rare (15 uses in `pxr/**/src`); I/O that
the browser requires to be async is async.

**Gaps, largest first:**

1. **No surface layer.** Apps call the core directly; the package root only re-exports core
   classes (`Stage`, `Layer`, `Path` from `pxr/index.ts`). Rules 2–14 describe what is missing.
   **Pilot in, November 7** (below).
2. **Core naming is split by origin, against rule 1** (the rule as first written: upstream
   names throughout). Methods declared in `src/` files at `564ad2cd`: `usd/usd` 967 camelCase /
   42 PascalCase and `usd/sdf` 1,442 / 77 (the older camelCase line, `stage.getPrimAtPath`);
   `imaging/hdSt` 179 / 1,129, `usdImaging/usdImaging` 34 / 776, `exec/vdf` 35 / 917, `base/tf`
   44 / 358, `imaging/hgiWebGPU` 48 / 272 (upstream names). **Resolved November 7** by changing
   rule 1 to upstream names with a lowercase first letter and running a one-off rename over
   the core: method declarations in `pxr/**/src` went from 6,314 /
   11,769 to 17,044 / 1,036 (`usd/usd` 1,083 / 11, `usd/sdf` 1,498 / 8, `imaging/hdSt` 1,540 /
   68, `usdImaging/usdImaging` 997 / 150, `exec/vdf` 1,301 / 133, `base/tf` 413 / 43,
   `imaging/hgiWebGPU` 462 / 13). The remaining PascalCase members are the ones the rename
   could not prove safe (largest: `Get` and `GetValue`, reached by duck-typing checks such as `'GetValue' in v`;
   `Equals`, `Clone` and `Reset`, which collide with an existing lowercase member; the methods
   the viewer-perf probe wraps by name).
3. **C++ calling patterns:** boolean return plus out-parameter, e.g. `getMetadata(key, value):
   boolean` and `getConnections(paths): boolean` (rule 5/6 surface target: return the value or
   `undefined`).
4. **Failure is posted, not thrown:** Tf diagnostics and `false`/`null` returns; no `UsdError`
   (rule 5).
5. **Values are untyped containers:** attribute values come back as `VtValue`, not typed by the
   schema (`Attribute<Float32Array>`, rule 10).
6. **Internal names are exported:** underscore classes such as `HdSt_BasisCurvesIndexBuilderComputation`
   and `Vdf_BoxedRanges` are reachable (rule 17).
7. **Mixed absence values and enums:** 631 `return null` vs 855 `return undefined` in `pxr/**/src`;
   158 `enum` declarations (core enums are allowed; the surface uses string unions, rules 4 and 6).
8. **No lint configured** (rule 22).

Gaps 2 (partly) and 6 follow from keeping upstream's structure for file-by-file merges; the plan
above keeps the core and fixes the rest in the surface layer.

## Status: the surface pilot (November 7, 2026)

Order-of-work step 1 is in. The package root (`typescript-usd`) is the surface: its entry,
`pxr/index.ts`, re-exports `surface/index.ts`, and the core is imported from its subpaths only
(`typescript-usd/usd`, `/sdf`, …; nothing in the repo imported the old root re-exports except
the README). Core files did not move.

- **API** (`surface/`): `Stage` (`open(url | string | Layer, { load, mask, signal })`,
  `createInMemory`, `prim`, `traverse({ predicate, instanceProxies })`, `definePrim`,
  `rootLayer`, `sessionLayer`, `pseudoRoot`, `defaultPrim`, time codes, `editTarget` /
  `setEditTarget`, `editContext` / `withEditTarget`, `changeBlock`, `flatten`,
  `exportToString`, `export`, `save`, `close`, `objectschanged` events), `Prim`, `Attribute<T>`
  (`get(time?)` / `set(value, time?)`, numeric arrays as read-only typed-array views of the
  core's storage), `Layer`, a hand-written `Mesh` schema (the generated schema surface is
  step 2), `ChangeBlock`, `EditContext`, `ObjectsChangedEvent`, `UsdError`, and the
  `InitialLoadSet`, `PrimFlagsPredicate` and `Specifier` unions. 120 symbols, each with TSDoc
  and `@upstream`.
- **Errors** (rule 5): every surface call runs under a `TfErrorMark`; posted errors and thrown
  exceptions become a `UsdError` (as OpenUSD's Python bindings raise `Tf.ErrorException`),
  and `false`/`undefined` failure results throw. The core still posts upstream's diagnostics.
- **Traceability**: the naming-map check (run by the tooling kept outside this repository) writes
  `docs/naming-map.json` (upstream → core symbols reached → surface) from the `@upstream`
  tags and the compiler, and fails on an untagged member, a surface that no longer
  type-checks against the core, a tagged member with no core call, an upstream symbol not in
  OpenUSD 26.11.1's headers (when the source tree is present), or a name neither derived by
  rule nor in `docs/naming-map-exceptions.md` (25 exceptions, 13 of them the surface-only
  `core` / `fromCore` bridges).
- **Tests** (rule 20): `surface/tests/members.test.ts` checks every member against the core
  call it wraps; `surface/tests/pilot.test.ts` runs the pilot scenario on OpenUSD's
  `testUsdGeomPointInstancer/CubeModel.usda`.
- **usdview**: the HUD's prim/geometry counts, the camera list and the session/flattened
  exports go through the surface (`Stage.fromCore` at the boundary).

Next (step 2): generate the schema surface from the core's generator; value shapes for Gf
types (readonly tuples, rule 10); `UsdEditTarget` with path mapping at the surface; layer
events (`layerschanged`) and the async-iterator form (rule 14); relationships, metadata and
variant sets; `{ identifier }` sources (rule 12); `/internal` subpaths (rule 17); lint (rule 22).
