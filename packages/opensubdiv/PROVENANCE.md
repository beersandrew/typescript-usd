# Provenance

Upstream: OpenSubdiv (https://github.com/PixarAnimationStudios/OpenSubdiv),
Copyright Pixar, DreamWorks Animation LLC and the other holders named in each
upstream file.

- **OpenSubdiv 3.7.0** (tag `v3_7_0`, `9dab8a47`): Sdc, Vtr and the Far
  refiner, factory and primvar refiner (the files whose header says
  "Ported from OpenSubdiv 3.7.0"). Tomorrow Open Source Technology License
  1.0 (`LICENSE`).
- **OpenSubdiv 3.6.1** (tag `v3_6_1`, `f26d0ded`), the version OpenUSD 26.11.1
  builds against: the additions below. Modified Apache 2.0 License
  (`LICENSE-OpenSubdiv-3.6.1.txt`).

The two releases differ in licence, not in the code this port uses: every
upstream file the sources here cite (66 files under `opensubdiv/far`, `sdc`,
`vtr` and `osd`) is identical in v3_6_1 and v3_7_0 apart from its licence
comment (checked November 12, 2026). Their `NOTICE.txt` files are identical
too (`NOTICE-OpenSubdiv-3.6.1.txt`).

Packaging: `package.json` is private, its `exports` point at `src/*.ts`, and
`vitest.config.ts` runs `tests/`. `types/globals.d.ts` declares the few host
globals the sources use, so the package compiles without the DOM or Node
type libraries.

## OpenSubdiv 3.6.1 additions: Far stencil and patch tables

Ported here from OpenSubdiv 3.6.1 (the version OpenUSD 26.11.1 builds against:
`build_scripts/build_usd.py:1531`; source checkout tag `v3_6_1`, commit
`f26d0ded`), file per upstream file, each citing upstream file:line. These
files were added after the 3.7.0 port, which had no stencil or patch tables.
They are under the OpenSubdiv 3.6.1 licence, OpenSubdiv's Modified Apache 2.0
License (`LICENSE-OpenSubdiv-3.6.1.txt`, `NOTICE-OpenSubdiv-3.6.1.txt`), and
their headers say so.

| File | Upstream (opensubdiv/) | Scope |
|---|---|---|
| `src/far/types.ts` | `far/types.h` | full; adds the `Real` precision tag |
| `src/far/primvarRefinerReal.ts` | `far/primvarRefiner.h` (`PrimvarRefinerReal<REAL>`) | full except `Limit` with tangents |
| `src/far/stencilTable.ts` | `far/stencilTable.{h,cpp}` | full |
| `src/far/stencilBuilder.ts` | `far/stencilBuilder.{h,cpp}` | full |
| `src/far/stencilTableFactory.ts` | `far/stencilTableFactory.{h,cpp}` | full |
| `src/far/patchDescriptor.ts` | `far/patchDescriptor.{h,cpp}` | full |
| `src/far/patchParam.ts` | `far/patchParam.h` | full |
| `src/far/patchBasis.ts` | `far/patchBasis.{h,cpp}` | full (all patch types) |
| `src/far/patchTable.ts` | `far/patchTable.{h,cpp}` | full |
| `src/far/patchMap.ts` | `far/patchMap.{h,cpp}` | full |
| `src/far/ptexIndices.ts` | `far/ptexIndices.{h,cpp}` | full |
| `src/far/patchBuilder.ts` | `far/patchBuilder.{h,cpp}` | Create, options, patch types, ComputePatchParam |
| `src/far/{catmark,loop,bilinear}PatchBuilder.ts` | `far/*PatchBuilder.{h,cpp}` | constructors and patch types only |
| `src/far/patchTableFactory.ts` | `far/patchTableFactory.{h,cpp}` | Options, Create, uniform build |
| `src/sdc/bilinearScheme.ts` | `sdc/bilinearScheme.h` | full except tangent limit masks |

Not ported: feature-adaptive patch construction (`PatchTableBuilder::
BuildPatches`, `LocalPointHelper`, `LegacyGregoryHelper`, the irregular
patch conversion of `PatchBuilder` and the scheme builders, `SparseMatrix`),
because this port's `TopologyRefiner` has no `RefineAdaptive`.

Changes to the 3.7.0 port's files for these additions (their headers name both versions):

- `src/far/topologyRefiner.ts`: `_isUniform` starts `true` as upstream
  (`far/topologyRefiner.cpp:47`); adds `AdaptiveOptions` and the upstream
  accessors `GetMaxValence`, `GetNumVerticesTotal`, `GetNumEdgesTotal`,
  `GetNumFacesTotal`, `GetNumFaceVerticesTotal`, `GetAdaptiveOptions`,
  `GetNumFVarChannels`, `GetFVarLinearInterpolation`, `GetNumFVarValuesTotal`.
- `src/far/index.ts`, `src/sdc/index.ts`: export the additions.

### Loop (tri-split) face-varying refinement

`src/far/topologyRefiner.ts` `RefineUniform` no longer rejects Loop meshes
with face-varying channels; as upstream (`far/topologyRefiner.cpp:257-268`,
`vtr/refinement.cpp:128,165-167,1070-1088`) every split type refines its
channels through the shared `FVarRefinement`. Upstream's face-varying
refinement is split-agnostic except the child faces per edge in
`propagateValueCreases` (`vtr/fvarRefinement.cpp:455-464`), which
`src/vtr/fvarRefinement.ts` already has, and the child vertex-face
order of `TriRefinement` (`vtr/triRefinement.cpp:539-604`), which
`src/vtr/triRefinement.ts` already matches. The Loop branches of
`PrimvarRefinerReal::interpFVarFromEdges` (`far/primvarRefiner.h:706-830`)
used by `PrimvarRefiner`, `StencilTableFactory` and `PatchTableFactory` were
already ported. Verified by `loop_cube` in `tests/far/hdStIntegration.test.ts`
(face-varying seams: 14 vertices, 20 values). The regression-shape fixtures
were captured with Loop UVs stripped, so they do not cover Loop face-varying.

### Factory specialization and non-manifold tagging

`src/far/topologyRefinerFactory.ts` now follows the template structure of
`far/topologyRefinerFactory.{h,cpp}`: `CreateTopologyRefiner(spec, mesh,
options)` is `TopologyRefinerFactory<MESH>::Create` (`.h:427-441`), with the
client hooks (`resizeComponentTopology`, `assignComponentTopology`,
`assignComponentTags`, `assignFaceVaryingTopology`, `reportInvalidTopology`)
passed as a `TopologyRefinerFactorySpecialization<MESH>` object and the
protected base-level accessors exposed as `TopologyRefinerFactoryAccess`
(`.h:245-310, 481-664`). `populateBaseLevel` (`.h:452-479`) and the base-class
steps `prepareComponentTopologySizing`, `prepareComponentTopologyAssignment`,
`prepareComponentTagsAndSharpness` and `prepareFaceVaryingChannels`
(`.cpp:46-445`) are ported, including the non-manifold crease test of
`prepareComponentTagsAndSharpness` (`.cpp:282-302`, and
`Vtr::Level::testVertexNonManifoldCrease`, `vtr/level.cpp:2032-2101`, kept in
the factory file). The previous version sharpened every non-manifold vertex;
with the upstream test the `catmark_fan` stencil and patch tests pass. The
`TopologyDescriptor` specialization keeps this port's descriptor contract and
throws where upstream returns null. `Vtr::Level::validateTopology` is not
ported: `validateFullTopology` fails with a coding error. `src/far/error.ts`
ports `far/error.{h,cpp}` (`FarError`/`FarWarning`, callbacks). This is what
`pxr/imaging/pxOsd/refinerFactory.cpp`'s `TopologyRefinerFactory<Converter>`
specialization needs.

Tests (`tests/far/`) compare with the native OpenSubdiv 3.6.1 library that
the OpenUSD 26.11.1 reference build links (`libosdCPU.3.6.1.dylib`),
captured by the capture tooling kept outside this repository
(`FIXTURES.md` at the repository root). The regression shapes in the fixtures are OpenSubdiv's
`regression/shapes` (same license).

## Test fixtures

- `tests/far/fixtures/`: captured from the native OpenSubdiv 3.6.1 library by
  the programs in `tests/far/capture/` (above).
- `tests/oracle/fixtures/` (`catmark.json`, `loop.json`, `faceUniform.json`):
  captured from a native OpenSubdiv 3.7.0 build by capture programs the
  tests name (`tools/oracle/dump.cpp`, `faceUniform.cpp`) that are not in
  this repository; only their output is committed.
