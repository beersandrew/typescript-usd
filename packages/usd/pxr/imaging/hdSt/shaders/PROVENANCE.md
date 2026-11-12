# Storm glslfx shader resources

The `.glslfx` files in this directory are copied byte-for-byte from OpenUSD
26.11.1 (tag `v26.11.1`, commit `96c1989167d2aaab5bd34627f32a321a6b79866b`),
`pxr/imaging/hdSt/shaders/`: all 38 files
of that directory, unmodified. Native `hdSt/CMakeLists.txt` installs them as
the hdSt plugin's shader resources (`hdSt/plugInfo.json` `"ShaderResources":
"shaders"`); they are byte-identical to the files of the native 26.11.1 install
(`lib/usd/hdSt/resources/shaders/`).

`scripts/generate-glslfx-resources.mjs` embeds them verbatim in
`../src/shaders.generated.ts`, which `../src/shaderResources.ts` attaches to the
hdSt plugin registration; `../tests/shaderResources.test.ts`
checks the generated module against these files.

They retain the upstream OpenUSD license (Tomorrow Open Source Technology
License 1.0, Copyright Pixar) and notice provided at the package root
(`LICENSE`, `NOTICE`).

SHA256:

    1627e5991f4503aca72d1d70e5dd34f270096a19e97a56b5e3a167c89a292329  basisCurves.glslfx
    b9f1b5ab9f5f9f2ba2b5fc39da1e5c477fe17bd68437edf787c399e5b7d9b4c3  capsule.glslfx
    0d28b982fc2abd1399323c889fe91a243a2992c0916aa0a8830f13ae799b79a8  compute.glslfx
    d57345d9c5fa3c4b212e437ce30d229f146fb490ff9f0f851dedb9d54db35ede  conicalFrustum.glslfx
    e22cafbb0b3e7eeb7d23ea73dfa5f7f2fd23ad9a0f575dc628d2ed84a57b9b23  coordUtils.glslfx
    d6f6fb2eb94d02d9c6c2130a6da03876b2ea648e2fbb6982b77946682d4c1f6e  domeLight.glslfx
    c829d5fd589ea0bc2cfe108e52ae39f95ca7738d1d4ea306a72ec8224adcb960  edgeId.glslfx
    19d00539f2e997a287511e101e7daeedc9c2b2210c6bc62d8de47c4ba00e5926  fallbackLighting.glslfx
    97ca87a51bffb41cac1a759e75ccb538ef51d255db6f256f930682ec59b8e99c  fallbackLightingShader.glslfx
    34bfbf341ff9977a844463648dc9182a7d190f9bc45b2dbafde80c054b47cc3c  fallbackMaterialNetwork.glslfx
    45a154e8feb36484bec64b5746f0db14ef8e6886d2c34f4e88d87cdf9479d80d  fallbackVolume.glslfx
    51b59453a09c4a43687b865bf6fe94cfc556470d93fadadf595e936744d0927d  frustumCull.glslfx
    e43416b3ba0da629c592f55b96b4f81888f9b349d34d9b5b07adf6992eef9198  imageShader.glslfx
    099e9b422bdfc24339931a93e8517765101286ede444570cd48a89a32f7bc2f6  implicitSurface.glslfx
    eadedcab63ad87c20727e4eec03c5da52fcfca86b9babc3c4e8947dcb12ac4d7  implicitSurfaceFaceCull.glslfx
    786de78d66446212ef462e308929e56f7b2a5d802dd7d00e1ef26a65e10c714d  implicitSurfaceNormal.glslfx
    d58c0f94e6ceaa41d72e310016ec8f1be36d8c6c65d7720eb7927d01b4323a5a  instancing.glslfx
    776d874fb4b0ac3af52fd19d03dab60a1eb1e004cfc501ae9f7b80101e64b4b6  invalidMaterialNetwork.glslfx
    6eb8fb64ea886c974fac91c84db1291dd33cce93a7bfa7884c54afb6f3718c0b  mesh.glslfx
    2a295502af80e924a2fb8803f1e4a63c930e4c9751b905bae4ff2aa257339513  meshFaceCull.glslfx
    f96b61000675600d39b0ce8d1af889540653b1a005343c9e36b9fba38e85e32e  meshNormal.glslfx
    e6aecdde9ae175826f58484db0cd77ea16114bf985068779b9d261e31369fb02  meshWire.glslfx
    a5178e06eda4294b2b41dfb4f0dbfd162d8b35b214ab99cc8a3d931593ae39c7  overlayShader.glslfx
    75d3a0ec4b0f3a039e36a110923ccaf22cd1c108dd1ca736ad92da6de2d8e4ae  pcfShader.glslfx
    2cc26d3f044dfe5711b4426b7c811b608f2bb0d48f53236b434fa168e3dac777  pointDisk.glslfx
    bba0c97e977ccaeebe28ebf539aede0a0d29069dacdb0b7d19df0704f2d8ac86  pointId.glslfx
    c3429b2bac8ef35e066a86a2fc6066cd979f79e96ff11b103363cf42fd9d3904  points.glslfx
    4a4131e53a624a848e0b331bb073d8b8f542c6b2acceabc81c944304b1628c87  ptexTexture.glslfx
    33032746bc74ff692bb02cb4f51842681686a3b55dc0804891360fcc368f2e98  renderPass.glslfx
    95a5637664dc3359b76e796dd19d7f5e9fc728dcee3c0dcc143ba378329de7f2  renderPassShader.glslfx
    b61deda1e98edae526f224e6db6df0b0dde81b548b642c1298749449ce1b0171  simpleLighting.glslfx
    abbbcc2f10d2a7128c9e6ceb03d235cab4fd32910eb2b89fe67004b3e8142e52  simpleLightingShader.glslfx
    88e365d2aae72ec97e636ed937ed6b99bb95da25fbe14673119cc75dae23d806  skinning.glslfx
    ccc3ad9966002ef6d713a113e05b06d3871d985f962be5247902ddd28b473fa5  sphere.glslfx
    2f2e768def95ff902b25d9061d2373e71daf26093c7cc67b101fb5c124c3134c  surfaceHelpers.glslfx
    1050df3ef59402e7b274617e70a060f65bb53ab4b6a251a256a3b4004379d534  terminals.glslfx
    2acd83ec12384f71701161fc0f41ffd03e5074766edb1b259ccb5b331bd18df3  visibility.glslfx
    9503470c6841a39b94e556fc74147edcfd106c783eacd297ade00a8c1d423799  volume.glslfx
