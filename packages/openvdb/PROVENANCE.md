# Provenance

Upstream: OpenVDB and NanoVDB (https://github.com/AcademySoftwareFoundation/openvdb),
Copyright Contributors to the OpenVDB Project.

- **OpenVDB 13.0.1 / NanoVDB 32.9.1**, Apache License 2.0 (`LICENSE`): the
  read path, both packages. These are the version numbers the upstream
  sources declared when they were ported; the OpenVDB repository has no
  `v13.0.1` tag (its `v13.0.0` declares OpenVDB 13.0.0 and NanoVDB 32.9.0),
  and the exact upstream commit was not recorded. The copyright and licence
  lines in the headers were checked against `v13.0.0`, where they are the
  same in every cited file.
- **OpenVDB 10.1.0** (tag `v10.1.0`), Mozilla Public License 2.0
  (`LICENSE-OpenVDB-10.1.0.txt`): the additions below.

| Here | Upstream | Package |
|---|---|---|
| `nanovdb/` | `nanovdb/nanovdb/` | `@vdb/nanovdb` |
| `openvdb/` | `openvdb/openvdb/` (and `nanovdb/nanovdb/tools/CreateNanoGrid.h`) | `@vdb/openvdb` |

The read path covers `.vdb` and `.nvdb` files, converting VDB grids to the
NanoVDB layout, and a WGSL PNanoVDB reader for in-shader sampling and HDDA
traversal. Each ported source file names the upstream files it ports in its
header; `openvdb/src/io/Stream.ts` and the `index.ts` barrels have no
upstream counterpart. `openvdb/src/math/Half.ts` follows OpenVDB's
`math/Half.h`, which is Imath's half (Copyright Contributors to the OpenEXR
Project, BSD 3-Clause License); `openvdb/src/io/Blosc.ts` decodes the Blosc
1.x chunk format after c-blosc 1.21 (`blosc/blosc.c`, BSD 3-Clause License)
with an LZ4 block decoder (BSD 2-Clause License).

Points where the read path differs from upstream, each marked at its site:

- `nanovdb/src/io/IO.ts` and `openvdb/src/io/Compression.ts` inflate zip
  data with the platform's `DecompressionStream`, so those reads are async.
- `openvdb/src/io/File.ts`: as upstream `io::File` (File.cc `open`,
  `readGridDescriptors`, `readGridByName`, `getGrids`), `open()` reads only
  the grid descriptors of a file with grid offsets, and `readGrid(name)` and
  `getGrids()` read grids on demand (async). A grid of a type this port
  cannot read (e.g. `Tree_int32_5_4_3`, as in OpenUSD's
  `testUsdImagingGLVdbVolume` `smoke_000001.vdb`) fails only when it is
  itself read. Files without grid offsets are read whole at `open()`.
- `openvdb/src/tools/CreateNanoGrid.ts` writes the float map mirror's
  `mTaperF` at Map offset 84 (`mVecF` is at 72, three floats; `mMatD` at 88,
  per `testdata/fixtures/layout.json`).

`testdata/fixtures/layout.json` holds NanoVDB's struct sizes and offsets,
dumped from a native upstream build by a capture program
(`tools/oracle/layout_dump.cc`) that is not in this repository; only its
output is committed. `nanovdb/tests/upstream/TestNanoVDB.test.ts` ports
NanoVDB's `unittest/TestNanoVDB.cc`, with the cases not yet ported listed as
`it.todo`.

Packaging: both `package.json` files are private and point `exports` at
`src/*.ts`; `types/globals.d.ts` declares the few host globals the sources
use. The packages are optional at runtime: only the `typescript-usd/hioOpenVDB`
entry imports them, and Storm renders volumes only when a host registers that
grid provider.

## OpenVDB 10.1.0 additions: dense copy and resampling (MPL-2.0)

Ported, for `typescript-usd/hioOpenVDB`'s port of
OpenUSD's `pxr/imaging/hioOpenVDB/vdbTextureData.cpp`, from OpenVDB 10.1.0
(`openvdb/openvdb/` in the OpenVDB 10.1.0 source release), the version
OpenUSD 26.11.1's reference build links (`libopenvdb.10.1.dylib`), rather
than the 13.0.1 the read path tracks. Comments cite 10.1.0 file:line.
OpenVDB 10.1.0 is licensed under the Mozilla Public License 2.0, so every file
below is MPL-2.0 and says so in its header; the four that also hold 13.0.1
code (`Grid.ts`, `math/Maps.ts`, `math/Transform.ts`, `tree/Tree.ts`) are
MPL-2.0 as a whole.

| Here (`openvdb/src/`) | OpenVDB 10.1.0 source |
|---|---|
| `tools/Dense.ts` (`copyToDense`) | `tools/Dense.h` (`copyToDense`, `CopyToDense`, `DenseBase<ValueT, LayoutXYZ>`); `tree/RootNode.h`, `InternalNode.h`, `LeafNode.h` `copyToDense` |
| `tools/GridTransformer.ts` (`resampleToMatchBox`, `GridTransformer`, `changeBackground`) | `tools/GridTransformer.h` (`resampleToMatch`, `doResampleToMatch`, `ABTransform`, `local_util::decompose`, `GridTransformer`, `GridResampler::applyTransform`/`transformBBox`, `TileSampler`); `tools/ChangeBackground.h` |
| `tools/Interpolation.ts` (`BoxSampler`, `boxSample`) | `tools/Interpolation.h` (`BoxSampler`) |
| `math/Mat4.ts` | `math/Mat4.h`, `Mat3.h`, `Mat.h`, `Vec3.h`, `Math.h`, `BBox.h` (the functions above use) |
| `math/Maps.ts` additions (`isLinear`, `getAffineMap`, `isEqual`, `ScaleMap.create`, `ScaleTranslateMap.create`, `AffineMap.fromMat4`, `simplify`) | `math/Maps.h`, `math/Maps.cc` |
| `math/Transform.ts` additions (`createLinearTransform`, `isLinear`, `equals`) | `math/Transform.cc`, `Transform.h` |
| `tree/Tree.ts` write path (`setValueOn`, `setValueOff`, `isValueOn`, `probeValue`, node creation, `setBackground`, `copy`, `leafNodesInOrder`, `forEachTile`) | `tree/Tree.h`, `RootNode.h`, `InternalNode.h`, `LeafNode.h`, `TreeIterator.h` |
| `tree/ValueAccessor.ts` | `tree/ValueAccessor.h` |
| `Grid.ts` `VdbGrid.create` | `Grid.h` `Grid::create` |

Divergences (also in the source comments): resampling runs upstream's
serial path (`GridTransformer::setThreaded(false)`); OpenUSD calls the
threaded `resampleToMatch`, whose results vary from run to run in voxels that
two input leaves or tiles both write. Level-set resampling
(`doLevelSetRebuild`) and the non-linear `GridResampler` path are not ported
(they throw). `math/Mat4.ts` rounds every operation; the native library's
clang build may fuse multiply-adds (`-ffp-contract=on`), which can only
change matrices with rotation, in the last bit.

Tests: `openvdb/tests/dense.test.ts` and `openvdb/tests/gridTransformer.test.ts`
compare bit for bit with a native capture,
`openvdb/tests/fixtures/gridTransformer/` (`expected.json`, captured against
the OpenVDB 10.1.0 headers and library of OpenUSD 26.11.1's reference build by
the capture tooling kept outside this repository; `FIXTURES.md` at the
repository root). Fixture inputs:

- `smoke_000002.vdb`, `densityAndHeat.vdb`: verbatim copies of
  `pxr/usdImaging/usdImagingGL/testenv/testUsdImagingGLVdbVolume/` in
  OpenUSD v26.11.1 (`96c1989167d2aaab5bd34627f32a321a6b79866b`), licensed
  under OpenUSD's Tomorrow Open Source Technology License 1.0 (Apache 2.0
  with a different section 6, Trademarks). SHA-256
  `dfac28d4433be1c8315b4119c150ef4632f50d0c0a71f6b69e0d4d700f9e4200` and
  `216a7f82d5c4d059d59812a9274483a99ba069cb2dfc0002759c21b02d83d9ac`.
- `generated.vdb`: written by `capture.cpp` (`capture write`): a Vec3f grid
  with tiles, a float grid under a rotated affine map, a level-set sphere.
