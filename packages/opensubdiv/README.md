# OpenSubdiv (partial TypeScript port)

A partial TypeScript port of [OpenSubdiv](https://github.com/PixarAnimationStudios/OpenSubdiv)
3.7.0, with additions from OpenSubdiv 3.6.1 (the version OpenUSD 26.11.1 builds
against), included in typescript-usd only because OpenUSD uses OpenSubdiv:
PxOsd and Storm (`hdSt/subdivision.cpp`) refine subdivision surfaces with it. It
is not a complete or standalone port of OpenSubdiv, is less faithful than the
OpenUSD port it supports, and is maintained here as part of this repository.

This package is not affiliated with or endorsed by Pixar Animation Studios or
the OpenSubdiv project. OpenSubdiv is the work of Pixar, DreamWorks Animation
and the other OpenSubdiv contributors; all credit for its design and code
belongs to them.

## What is ported

Package `@opensubdiv/core`, exports `./sdc`, `./vtr`, `./far` and `./osd`:

- **Sdc**: the Catmark, Loop and Bilinear schemes (position masks; no tangent
  limit masks), creases and options.
- **Vtr**: levels, face-varying levels and uniform refinement for quad and
  triangle splits.
- **Far**: `TopologyRefiner` with uniform refinement, the
  `TopologyRefinerFactory` template structure that `pxOsd/refinerFactory.cpp`
  specializes, `PrimvarRefiner`, stencil tables and their factories, uniform
  patch tables, `PatchMap`, `PtexIndices`, patch bases for every patch type,
  and `Far::Error`.
- **Osd**: the GLSL patch shader source only (`GLSLPatchShaderSource`), with the
  OpenSubdiv 3.6.1 shader files embedded verbatim.

## What is not ported

- Adaptive refinement (`TopologyRefiner::RefineAdaptive`) and everything that
  needs it: feature-adaptive patch construction (`PatchTableBuilder::BuildPatches`,
  `LocalPointHelper`, `LegacyGregoryHelper`, `SparseMatrix`), so Storm's
  adaptive subdivision does not run (`FAITHFULNESS-DEBT(hdst-osd-adaptive)` in
  `packages/usd`).
- Sparse refinement, `Vtr::Level::validateTopology`, tangent limit masks.
- Osd evaluators and draw contexts, Bfr and Hbr.

Known differences from native OpenUSD that involve OpenSubdiv are in
[KNOWN-GAPS.md](../../KNOWN-GAPS.md).

## Tests

`npx vitest run` in this directory. The Far tests compare with the native
OpenSubdiv 3.6.1 library that the OpenUSD 26.11.1 reference build links, on
OpenSubdiv's regression shapes; see [PROVENANCE.md](PROVENANCE.md) for how
each fixture was captured.

## Provenance and licence

[PROVENANCE.md](PROVENANCE.md) says which files come from which OpenSubdiv
version. Each ported source file names the upstream files it ports and their
copyright in its header.

- The 3.7.0 port is licensed under the Tomorrow Open Source Technology License
  1.0, OpenSubdiv 3.7.0's licence ([LICENSE](LICENSE)).
- Files ported from OpenSubdiv 3.6.1 are licensed under OpenSubdiv 3.6.1's
  Modified Apache 2.0 License ([LICENSE-OpenSubdiv-3.6.1.txt](LICENSE-OpenSubdiv-3.6.1.txt));
  their headers say so. Files that mix both name both.

Both licences are the Apache License 2.0 with a different Section 6
(Trademarks). See [NOTICE](NOTICE) for the upstream copyright notices.
