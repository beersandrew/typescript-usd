# MaterialX (partial TypeScript port)

A partial TypeScript port of [MaterialX](https://github.com/AcademySoftwareFoundation/MaterialX)
1.39.5, included in typescript-usd only because OpenUSD uses MaterialX: usdMtlx
reads `.mtlx` documents with it, and Storm (`hdSt/materialXFilter.cpp`,
`hdSt/materialXShaderGen.cpp`) generates shaders with its GLSL generators. It is
not a complete or standalone port of MaterialX, is less faithful than the OpenUSD
port it supports, and is maintained here as part of this repository.

This package is not affiliated with or endorsed by the MaterialX project or the
Academy Software Foundation. MaterialX is the work of the contributors to the
MaterialX Project; all credit for its design and code belongs to them.

## What is ported

| Package | Upstream | Scope |
|---|---|---|
| `@mtlx/core` (`core/`) | `source/MaterialXCore` | Documents, elements, values, traversal, units; version upgrade from 1.38 only |
| `@mtlx/format` (`format/`) | `source/MaterialXFormat` | File paths, environment, XML read and write (a small XML reader and writer in place of the embedded PugiXML), a virtual file system for browsers |
| `@mtlx/genshader` (`genshader/`) | `source/MaterialXGenShader` | Shader graph, generator base, default colour management, unit system |
| `@mtlx/genhw` (`genhw/`) | `source/MaterialXGenHw` | The hardware generator base and its node implementations |
| `@mtlx/genglsl` (`genglsl/`) | `source/MaterialXGenGlsl` | GLSL, ESSL and Vulkan GLSL generators |
| `@mtlx/render` (`render/`) | `source/MaterialXRender` | `LightHandler` and `Image` only, the two classes `hdSt/materialXFilter.cpp` uses |
| `@mtlx/libraries` (`libraries/`) | `libraries/` | The 1.39.5 data libraries, embedded verbatim (`.mtlx` and the `genglsl` sources) |

## What is not ported

- The MSL, OSL, MDL, Slang and WGSL generators, the rest of MaterialXRender,
  MaterialXRenderGlsl and the other render back ends, MaterialXView, the
  Python and JavaScript bindings, and OCIO colour management.
- Document upgrades from versions older than 1.38.
- MaterialX's own test suites. The port is checked through OpenUSD: the
  generated glslfx is compared byte for byte with OpenUSD 26.11.1's native build
  by `packages/usd/pxr/imaging/hdSt/tests/upstream/testHdStMaterialXShaderGen.test.ts`,
  and rendering by the `usdimaging-gl-materialx` image suite.

Known differences from native OpenUSD that involve MaterialX are in the
MaterialX section of [KNOWN-GAPS.md](../../KNOWN-GAPS.md).

## Provenance and licence

[PROVENANCE.md](PROVENANCE.md) records the upstream revision and where this
port differs in layout from upstream. Each ported source file names the
upstream files it ports and their copyright in its header.

Licensed under the Apache License 2.0, as MaterialX is ([LICENSE](LICENSE));
see [NOTICE](NOTICE) for the upstream copyright notices.
