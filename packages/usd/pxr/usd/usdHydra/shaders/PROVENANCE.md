# usdHydra shader resources

The files in this directory are copied byte-for-byte from OpenUSD 26.11.1 (tag
`v26.11.1`, commit `96c1989167d2aaab5bd34627f32a321a6b79866b`, see
`FIXTURES.md` at the repository root), `pxr/usd/usdHydra/shaders/`: the definitions
of the deprecated Hydra shader nodes (`shaderDefs.usda`: HwPtexTexture_1,
HwUvTexture_1, HwFieldReader_*, HwPrimvar_1) and the empty glslfx their
`info:glslfx:sourceAsset` names. Native installs them as the usdHydra plugin's
resources, which `UsdHydraDiscoveryPlugin` reads
(`usdHydra/discoveryPlugin.cpp:29-40`).

`scripts/generate-glslfx-resources.mjs` embeds them verbatim in
`../src/shaders.generated.ts`.

They retain the upstream OpenUSD license (Tomorrow Open Source Technology
License 1.0, Copyright Pixar) and notice provided at the package root
(`LICENSE`, `NOTICE`).

SHA256:

    ecdfcca50b391ae761bf979e525d625f16b59b4cf3b6195ddc845799fbfa802b  empty.glslfx
    1ac9ccb54418938f986bec36a85d0d5f2a3f625c28a8896cd6207d52ad47c609  shaderDefs.usda
