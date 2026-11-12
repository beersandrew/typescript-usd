# usdShaders shader resources

The files in this directory are copied byte-for-byte from OpenUSD 26.11.1 (tag
`v26.11.1`, commit `96c1989167d2aaab5bd34627f32a321a6b79866b`, see
`FIXTURES.md` at the repository root), `pxr/usd/plugin/usdShaders/shaders/`: the
shader definitions (`shaderDefs.usda`) and the glslfx implementations they
reference. The OSL implementations of that directory are not copied (no OSL
parser is ported). Native installs them as the usdShaders plugin's shader
resources (`usdShaders/plugInfo.json` `"ShaderResources": "shaders"`).

`scripts/generate-glslfx-resources.mjs` embeds them verbatim in
`../src/shaders.generated.ts`; `../tests/usdShaders.test.ts` checks the generated
module against these files.

They retain the upstream OpenUSD license (Tomorrow Open Source Technology
License 1.0, Copyright Pixar) and notice provided at the package root
(`LICENSE`, `NOTICE`).

SHA256:

    de60e7f6dd4ab26b9941fffe3814aacf0194dd7d65bd2136ad0e022f12c16e79  previewSurface.glslfx
    ecdfcca50b391ae761bf979e525d625f16b59b4cf3b6195ddc845799fbfa802b  primvarReader.glslfx
    299c943671e189c25334f264cfd7d6988dea08bf68d46d4d63002b56fa5502ff  transform2d.glslfx
    ecdfcca50b391ae761bf979e525d625f16b59b4cf3b6195ddc845799fbfa802b  uvTexture.glslfx
    db9ae851fea7181aaf9bf296be8f0e6d894fa0fbc06a4c837a01985a5d0f5e70  shaderDefs.usda
