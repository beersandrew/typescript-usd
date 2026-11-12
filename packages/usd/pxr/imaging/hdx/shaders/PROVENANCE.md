# hdx glslfx shader resources

All 18 files of upstream `pxr/imaging/hdx/shaders/` are copied byte-for-byte
from OpenUSD 26.11.1 (tag `v26.11.1`, commit
`96c1989167d2aaab5bd34627f32a321a6b79866b`),
unmodified. Native `hdx/CMakeLists.txt` installs them as hdx plugin shader
resources (`hdx/plugInfo.json` `"ShaderResources": "shaders"`); the hdx tasks
open them through `HdxPackage*Shader()` (`hdx/package.cpp`), and Storm's
`hdSt/shaders/pointId.glslfx` imports `$TOOLS/hdx/shaders/selection.glslfx`.
Each file is byte-identical to the file of the native 26.11.1 install
(`lib/usd/hdx/resources/shaders/<file>`).

`scripts/generate-glslfx-resources.mjs` embeds them verbatim in
`../src/shaders.generated.ts`, which `../src/shaderResources.ts` attaches to the
hdx plugin registration; `../tests/shaderResources.test.ts` checks
the generated module against this directory.

They retain the upstream OpenUSD license (Tomorrow Open Source Technology
License 1.0, Copyright Pixar) and notice provided at the package root
(`LICENSE`, `NOTICE`).

SHA256:

    79ef79c2e27658b47d967ea0ae1ac1473d482f60babdae170096c5cebd67d28b  boundingBox.glslfx
    f807f2dbcd1025b01b7399aacf9cfcb0265d1008bc7fd4dc57e1c63babfe7fd5  colorChannel.glslfx
    8211a725e4b8010cedf6d9b2cd695028e33bcfbec5d1f89c42dc547466a33dfb  colorCorrection.glslfx
    0bb5bd0cb79e5fe7aa344b551cf3f6dee28cb04991f6f3b69800f03270205f0e  fullscreen.glslfx
    ec6d08df543bc47aebc36bb6dabd1ae0fd441009aab5f080ab8e1aa6ece7dd25  oitResolveImageShader.glslfx
    9d610804175bbf519fa698cd838e0dd1e4e827f210b4d535c7200af008790123  outline.glslfx
    d8a49ff94286ea87258041d65093f06421c39498886047b02d7488a00158aa98  renderPass.glslfx
    17891782f681366eb1be8b55960a4818f8f013dc46088b3c33d185948add8e33  renderPassColorAndSelectionShader.glslfx
    28f18696fa04d577dd0b3c3356bc4e30918d7340a970b02f97bcd26927a372d6  renderPassColorShader.glslfx
    c924543b695d2e75d817a787e32e33652ba828f7a115f2a849e5a5ce4b06bc38  renderPassColorWithOccludedSelectionShader.glslfx
    679f8e628f8b4fe9785f0a19ea11c0485f03b80a9209645e0b4f364d0db121b2  renderPassOitOpaqueShader.glslfx
    7ad0823275b90b473a81ab7030c28d005afea4f5a060bab08f97e4585bc5dddf  renderPassOitShader.glslfx
    62aa31191826949dc913daee36d09b225176e10f7e00db254e22cafb3060c82e  renderPassOitVolumeShader.glslfx
    746ed76471d216403bd87c4bd1aa2797857b1b5e11fbd754dc3f5ecd37219832  renderPassPickingShader.glslfx
    7c79badff5f2c00c23367b776c27f8ed99af4e37fc5cf6e2cc6c43689783360f  renderPassShadowShader.glslfx
    d02220271f2efc6164859faad9640dc00acd2346aea83d1208bc5ea6e53ea16f  selection.glslfx
    58af4bfeafc0040da9989d6e251d86cea3692d58f26243818c32e1fb02fbb4b1  skydome.glslfx
    c8b40544598666024e7d6ada7e5b6c14e7da82662f6c08f2f1911d1b073fa269  visualize.glslfx
