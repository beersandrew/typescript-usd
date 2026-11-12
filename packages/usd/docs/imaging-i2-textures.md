# Imaging I-2: Storm's texture and material system (result)

Written 2026-11-05. This page records what the texture and material port
under `pxr/imaging/hdSt` covers and how it was checked. The I-1 plan and its
tolerance are in `imaging-i1.md`.

## What is ported

Each file follows its upstream counterpart in `pxr/imaging/hdSt`:

- **Identifiers and data:** texture identifiers, subtexture identifiers
  (including the field ones), texture CPU data, asset UV CPU data and texture
  utilities.
- **Texture objects:** UV asset, dynamic UV / cubemap, UDIM and field.
  - Field textures committed their fallback texture when this was written
    (debt `hdst-field-texture`, retired in 58b2992c: field textures now load).
  - Ptex is ported as built without `PXR_PTEX_SUPPORT_ENABLED`
    (`FAITHFULNESS-DEBT(hdst-ptex)`).
- **Registries and binding:** sampler objects, the texture object, sampler
  object and texture handle registries, texture handles, and
  `HdSt_TextureBinder`.
- **Materials:** `HdStMaterialNetwork`, and the material sync's texture
  descriptors.
- **Test driver:** `HdSt_TextureTestDriver` (`textureTestDriver.ts`).

Supporting ports outside hdSt:

- **hio:** `HioImage` and `Hio_StbImage`, with byte-exact ports of
  stb_image's PNG decoder and stb_image_resize2.
- **hd:** `HdMaterialNetwork2`, `HdConvertToHdMaterialNetwork2` and
  `HdGetSamplerParameters`.
- **Sdr:** the usdShaders nodes, the sdrGlslfx parser plugin and
  `SdrRegistry::GetShaderNodeFromSourceCode`.

## Deliberate divergences

These are also noted in the source.

- **Loading is asynchronous.**
  - `HdSt_TextureObjectRegistry.LoadAsync()` runs the load phase of
    `Commit()`. `HdStResourceRegistry.LoadTexturesAsync()` runs it for the
    next resource commit.
  - A texture whose load has not finished when `Commit()` runs is committed
    with its fallback texture. It stays dirty, and a later commit replaces
    the fallback once the data has loaded.
  - `SetTextureLoadCompletionCallback` reports a finished background load.
- **Shared-pointer lifetimes are explicit.** Texture handles, texture
  objects and sampler objects have `Release()`. Shader code sets `_expired`
  when it is dropped.
- **HgiWebGPU emulates texture swizzles.** WebGPU has no texture swizzle, so
  a texture with a component mapping is allocated in the four-channel format
  and its texels are expanded at upload. The texture descriptor keeps the
  requested format.

## Results

| Test | Kind | Result |
|---|---|---|
| `testHdStTextureObjectRegistry` (5 images) | Safari | identical |
| `testHdStTextureHandleRegistry` (9 images) | Safari | identical |
| `testHdStSamplerObjectRegistry` (3 images) | Safari | 2 identical; `outHiResSampler.png` max 1/255 on 10 pixels |
| `testHdStDynamicUvTexture` (2 images) | Safari | identical |
| textured material scene image | Safari | max 1/255 on 27 pixels |
| textured material program text (compute, VS, PTVS, FS) | Node | byte-identical |

How each was run:

- The upstream texture tests were ported from their testenv sources. The
  native images come from the reference build's test binaries
  (`hdSt/tests/fixtures/textureImages/`, captured by the capture tooling kept
  outside this repository; `FIXTURES.md`).
- The textured material scene and its native program text come from a C++
  capture (`hdSt/tests/fixtures/texturedCodegen/`, made by the capture tooling
  kept outside this repository; `FIXTURES.md`). It uses the
  testHdStDepthBias driver pattern with a glslfx surface whose diffuseColor
  texture comes from UsdUVTexture and UsdPrimvarReader_float2.
- The Safari runs use `node tests/browser/storm-image/run-textures.mjs --out <dir>
  --port 8801`.

The 2/255 tolerance is the one from `imaging-i1.md` section 6.3.
