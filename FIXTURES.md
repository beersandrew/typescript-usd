# Fixtures

Expected values in this repository's tests come from OpenUSD itself: they are
ported from its testenv suites, or captured from a native build of
**OpenUSD 26.11.1** (tag `v26.11.1`, commit
`96c1989167d2aaab5bd34627f32a321a6b79866b`) and committed here as fixtures.
A few older viewer fixtures were captured from OpenUSD 26.08; each says so
where it sits (its README or its `native` field). Nothing in this repository
runs OpenUSD: cloning, testing and using it need no OpenUSD build or source
checkout.

The captures are made by capture tooling kept outside this repository, at its
commit `e49fdc90c87792714c7ec51ff0d6ce271a130760`. For each fixture directory
it holds the script that captured it, at the same path relative to the
repository root (an enveloped fixture's `script` field names that path
relative to `packages/usd`). It also holds:

- the native halves of the comparison tools: the prepared scenes and native
  renders the asset acceptance (`apps/usdview/scripts/asset-acceptance/run.mjs`)
  scores against, the native timings of the viewer performance run
  (`apps/usdview/scripts/viewer-perf/run.mjs`), and the ASWF corpus assessment;
- the real-asset benchmark (Node, Safari and native timings of the same jobs);
- the checks of generated files against OpenUSD's source: the schema libraries
  (`packages/usd/scripts/usdGenSchema.mjs --check --all`), the library graph
  table (`packages/usd/pxr/tests/architecture/libraryGraph.json`, read by the
  library layering test), the upstream test manifest
  (`packages/usd/pxr/testing/upstreamTestManifest.json`), the naming map's
  upstream symbols and the viewer's demo schema plugin;
- the generators of this repository's derived records, which write them here:
  the debt ledger (`packages/usd/docs/faithfulness-debt.md` and `.json`,
  regenerated from the `FAITHFULNESS-DEBT` and `PLATFORM-DIVERGENCE` code
  comments), the naming map (`packages/usd/docs/naming-map.json`, from the
  surface's `@upstream` tags), the never-executed report
  (`packages/usd/docs/never-executed.md`) and the upstream test coverage
  report.

A fixture changes only by being recaptured with that tooling; it is never
edited by hand. Enveloped JSON fixtures name the release and commit they were
captured from, and `packages/usd/pxr/testing/oracleFixture.ts` refuses any
other.
