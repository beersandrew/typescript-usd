# hdsi glslfx shader resources

The one file of upstream `pxr/imaging/hdsi/shaders/` (`unlitShader.glslfx`)
is copied byte-for-byte from OpenUSD 26.11.1 (tag `v26.11.1`, commit
`96c1989167d2aaab5bd34627f32a321a6b79866b`),
unmodified. Native `hdsi/CMakeLists.txt` installs it as an hdsi plugin
resource; `HdsiBackPlateSceneIndex` names it with `PlugFindPluginResource`
(`hdsi/backPlateSceneIndex.cpp`) as the back plate material's
`glslfx:sourceAsset`.

`scripts/generate-glslfx-resources.mjs` embeds it verbatim in
`../src/shaders.generated.ts`, which `../src/shaderResources.ts` attaches to the
hdsi plugin registration; `../tests/shaderResources.test.ts` checks
the generated module against this directory.

It retains the upstream OpenUSD license (Tomorrow Open Source Technology
License 1.0, Copyright Pixar) and notice provided at the package root
(`LICENSE`, `NOTICE`).
