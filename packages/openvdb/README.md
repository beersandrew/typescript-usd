# OpenVDB and NanoVDB (partial TypeScript port)

A partial TypeScript port of [OpenVDB](https://github.com/AcademySoftwareFoundation/openvdb)
13.0.1 and NanoVDB 32.9.1, with additions from OpenVDB 10.1.0 (the version
OpenUSD 26.11.1's reference build links), included in typescript-usd only
because OpenUSD uses OpenVDB: `hioOpenVDB/vdbTextureData.cpp` reads `.vdb`
fields for volume rendering. It is used only through the
`typescript-usd/hioOpenVDB` entry. It is not a complete or standalone port of
OpenVDB or NanoVDB, is less faithful than the OpenUSD port it supports, and is
maintained here as part of this repository.

This package is not affiliated with or endorsed by the OpenVDB project or the
Academy Software Foundation. OpenVDB and NanoVDB are the work of the
contributors to the OpenVDB Project; all credit for their design and code
belongs to them.

## What is ported

- **`@vdb/openvdb`** (`openvdb/`): reading `.vdb` files (file version 222 and
  later; grids read on demand when the file has grid offsets), metadata,
  transforms and linear maps, zip and Blosc (LZ4) compression, float and
  Vec3f 5-4-3 trees, conversion to the NanoVDB layout (`createNanoGrid`), and
  from OpenVDB 10.1.0 the dense copy (`copyToDense`), the tree write path,
  `ValueAccessor` and resampling (`resampleToMatch<BoxSampler>`, serial).
- **`@vdb/nanovdb`** (`nanovdb/`): reading `.nvdb` files (uncompressed and
  zip), the grid and tree layout, nearest and trilinear sampling, HDDA ray
  marching with zero-crossing, and a WGSL port of the PNanoVDB reader for
  sampling and traversal in shaders.

## What is not ported

- Writing `.vdb` or `.nvdb` files, grid types other than float and Vec3f,
  `NonlinearFrustumMap`, delayed loading, threading, and the OpenVDB tools
  other than those above.
- Level-set resampling (`doLevelSetRebuild`) and the non-linear resampling
  path: they throw. The 3 failing tests in `openvdb/tests/gridTransformer.test.ts`
  are this gap.
- NanoVDB's write side (`GridBuilder`, checksums, statistics) and Blosc-coded
  `.nvdb` files. The unported cases of NanoVDB's `TestNanoVDB.cc` are listed
  as `it.todo` in `nanovdb/tests/upstream/TestNanoVDB.test.ts`.

Known differences from native OpenUSD that involve OpenVDB are in
[KNOWN-GAPS.md](../../KNOWN-GAPS.md).

## Provenance and licence

[PROVENANCE.md](PROVENANCE.md) says which files come from which OpenVDB
version and where the test fixtures come from. Each ported source file names
the upstream files it ports and their copyright in its header.

- Most of the package ports OpenVDB 13.0.1 / NanoVDB and is licensed under the
  Apache License 2.0, as OpenVDB 13 is ([LICENSE](LICENSE)).
- **Nine files contain code ported from OpenVDB 10.1.0, which is licensed
  under the Mozilla Public License 2.0, and are therefore licensed under the
  MPL 2.0** ([LICENSE-OpenVDB-10.1.0.txt](LICENSE-OpenVDB-10.1.0.txt)). Each
  says so in its header. The MPL applies file by file; the rest of the package
  stays Apache-2.0. The files, all under `openvdb/src/`:
  - wholly from 10.1.0: `math/Mat4.ts`, `tools/Dense.ts`,
    `tools/GridTransformer.ts`, `tools/Interpolation.ts`,
    `tree/ValueAccessor.ts`;
  - 13.0.1 ports with 10.1.0 additions, MPL-2.0 as a whole: `Grid.ts`,
    `math/Maps.ts`, `math/Transform.ts`, `tree/Tree.ts`.

  The source form of each is the file itself.
- `openvdb/src/math/Half.ts` follows OpenVDB's `math/Half.h` (Imath half,
  BSD 3-Clause License) and `openvdb/src/io/Blosc.ts` follows c-blosc (BSD
  3-Clause License) and LZ4 (BSD 2-Clause License).

See [NOTICE](NOTICE) for the upstream copyright notices.
