# usdSkelImaging shader resources

`skinning.glslfx` is copied byte-for-byte from OpenUSD 26.11.1 (tag
`v26.11.1`, commit `96c1989167d2aaab5bd34627f32a321a6b79866b`, see
`FIXTURES.md` at the repository root), `pxr/usdImaging/usdSkelImaging/shaders/`, the
only file of that directory, unmodified. Native `usdSkelImaging/CMakeLists.txt`
installs it as the usdSkelImaging plugin's shader resource; it is
byte-identical to the file of the pinned native install
(`lib/usd/usdSkelImaging/resources/shaders/skinning.glslfx`).

`scripts/generate-glslfx-resources.mjs` embeds it verbatim in
`../src/shaders.generated.ts`, which `../src/shaderResources.ts` attaches to the
usdSkelImaging plugin registration; `../src/package.ts` resolves it as
upstream `package.cpp` does.

It retains the upstream OpenUSD license (Tomorrow Open Source Technology
License 1.0, Copyright Pixar) and notice provided at the package root
(`LICENSE`, `NOTICE`).

SHA256:

    117ed5b4d97883d3c0a78ddd9a7b7410837a89108018ef9d98edad4eaa8e828c  skinning.glslfx
