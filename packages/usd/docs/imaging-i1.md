# Imaging I-1: a faithful WebGPU path for Storm (design notes)

Written 2026-11-04 as the plan for this stage of the port. The decisions and
the result at the end record what was adopted and built.

I-1 tests one question: can Storm's own shaders and code generator drive
WebGPU? This page plans how. Today's renderer uses hand-written WGSL instead.
The faithful path has three parts:

- port Hgi with an HgiWebGPU backend;
- translate upstream's glslfx GLSL to WGSL with a translator written in
  TypeScript;
- port Storm's code generation toward upstream.

This page holds the evidence for that plan: what upstream does, what the
shaders contain, what WebGPU in Safari allows, and what to build first.

Pins and sources:

- Upstream: OpenUSD 26.11.1 at `$OPENUSD_SOURCE` (an OpenUSD 26.11.1 checkout). Paths below are
  relative to `pxr/imaging/` unless they say otherwise.
- Reference build: the OpenUSD 26.11.1 reference build (`FIXTURES.md`), which
  runs Storm on Metal on an Apple M4 Pro. Captures on this page come from its `tests/` binaries.
- Browser: Safari 27.2 (WebKit 605.1.15) on the same Mac, opened with
  `open -a Safari`.

The measurements were recorded in machine-readable form outside the
repository. The appendix lists the commands that produce them.

| File | Content |
|---|---|
| `glsl-survey.json` | Per-section and per-feature counts for all 271 glsl sections. |
| `programs.json` | Codegen-assembled programs from the reference build. |
| `sections-used.json` | Which sections those programs contain. |
| `probe/*.json` | Safari WebGPU features, limits and compile checks. |
| `i1-survey.json` | The combined summary, including Hgi line counts. |

## Summary

**Shaders.** There are 57 glslfx files, with 271 `-- glsl` sections and 6,530
code lines (non-blank lines, comments stripped):

| Directory | Files | glsl sections | Code lines |
|---|---|---|---|
| hdSt | 38 | 243 | 5,691 |
| hdx | 18 | 27 | 831 |
| hdsi | 1 | 1 | 8 |

Of the 243 hdSt sections, 33 belong to stages WebGPU does not have:

| Stage | Sections |
|---|---|
| geometry | 9 |
| tessellation control | 6 |
| tessellation evaluation | 5 |
| post-tessellation control | 6 |
| post-tessellation vertex | 7 |

**Features WGSL lacks.** 54 sections use a non-preprocessor feature with no
direct WGSL form. 65 sections use `#if`/`#ifdef`.

**Assembled programs.** The GLSL that Storm hands to Hgi is not the sections
alone. For each stage, Storm's code generator emits defines, declarations and
accessor functions, then appends the sections. The assembled programs measured
from the reference build have these sizes:

- vertex: 852–966 non-blank lines;
- fragment: 693–2,529 lines;
- compute: 418–434 lines.

Each assembled program defines 23–74 overloaded function names and contains up
to 68 `#if` directives.

**How Metal copes.** On Metal, these bodies compile as MSL through a macro and
template prelude, with no translation step. WGSL has:

- no preprocessor;
- no overloading;
- no implicit conversions;
- no reference parameters;
- no multi-component swizzle stores.

A WebGPU backend therefore needs a real GLSL front end with type checking.

**Hgi.** Upstream's interface is 56 files and 8,353 lines. The backends that
model HgiWebGPU are hgiMetal (39 files, 10,605 lines) and hgiVulkan (57 files,
12,872 lines). typescript-usd's `hgi` has 9 files and 525 lines. It covers
buffers, textures and blits only. Its pipelines, bind groups and shader modules
are created directly in hdSt and hdx.

**Safari 27.2 WebGPU on this Mac** (measured):

- The adapter offers `primitive-index`, `clip-distances`, `shader-f16` and
  `indirect-first-instance`.
- With the adapter's limits requested, the device allows 44 storage buffers per
  stage, 44 sampled textures, 12 vertex buffers and 31 inter-stage variables.
- `textureSample` in non-uniform control flow is rejected unless
  `diagnostic(off, derivative_uniformity)` is set.
- Swizzle stores and pointers to vector components are rejected.

WebGPU has no geometry or tessellation stage, no barycentrics, no
multi-draw-indirect and no push constants.

**Recommendation.**

1. Take Storm's Metal route: claim post-tessellation support in HgiWebGPU and
   emulate it by vertex pulling.
2. Translate the codegen-assembled GLSL per stage inside
   `HgiWebGPUShaderGenerator`. This is the same place where hgiMetal turns the
   same text into MSL.
3. Make the first image target `testHdStDepthBias`: two cubes, two images, an
   upstream registered test. `testHdStBasicDrawing --repr hull` is next. It
   needs points larger than one pixel and curves.

I-1 is realistic only with that cut (section 8).

## 1. How upstream turns glslfx into a shader

### 1.1 glslfx and Storm's code generator

`hio/glslfx.cpp` parses `.glslfx` files:

- `--` starts a section and `---` starts a comment (`glslfx.cpp:49-50`);
- section lines are parsed in `_ParseSectionLine` (`glslfx.cpp:406`);
- the section kinds are `glsl`, `layout`, `configuration` and `#import`.

A `configuration` section maps a technique to an ordered list of glsl sections
per stage. The geometric shader's key picks those sections. For meshes,
`meshShaderKey.cpp` (767 lines with its header) builds the VS/PTCS/PTVS/GS/FS
lists.

`HdSt_CodeGen::Compile` (`codeGen.cpp:2062-2726`) builds each program.

1. It reads the Hgi capabilities (`codeGen.cpp:2077-2094`): bindless,
   barycentrics, Metal tessellation, primitive-ID emulation, base-primitive
   offset and double precision.
2. It takes the geometric shader's source for each stage. Post-tessellation
   stages exist only with `HgiDeviceCapabilitiesBitsMetalTessellation`, and a
   geometry stage only without it (`codeGen.cpp:2123-2125`).
3. It emits a defines block (`#define HD_SHADER_API`, `MAT4`, `HD_HAS_*`,
   `HD_NUM_*`; `codeGen.cpp:2154-2340`).
4. It emits packed-type helpers. These are already overloaded pairs such as
   `hd_vec3_get(hd_vec3)` and `hd_vec3_get(vec3)` (`codeGen.cpp:409-483`).
5. It emits declarations, and `HdGet_<name>()` / `HdGet_<name>(int)` accessor
   overloads per primvar.
6. It emits the interstage plumbing (`ProcessPrimvarsIn` and the like) and the
   drawing-coordinate code (`codeGen.cpp:4808-5060`).
7. On Metal, Vulkan and WebGPU, Hgi resource generation is on
   (`codeGen.cpp:189-197`). `_CompileWithGeneratedHgiResources`
   (`codeGen.cpp:3097-`) then fills one `HgiShaderFunctionDesc` per stage, in
   these fields:

   | Field | Content |
   |---|---|
   | `shaderCodeDeclarations` | defines + decl (+ OpenSubdiv source) |
   | `shaderCode` | accessors + stage source |
   | `stageInputs` / `stageOutputs` | built-ins carry a role: `hd_VertexID`, `gl_PrimitiveID` → `hdPrimitiveID` (`codeGen.cpp:3480-3482`), `gl_FrontFacing`, … |
   | blocks, buffers, textures, constant params | resource declarations |

   The backend's shader generator turns that description into source code.

Two details matter for WebGPU:

- **OpenSubdiv source.** The code generator inserts OpenSubdiv's patch shader
  source. On Metal it is `Osd::MTLPatchShaderSource`, otherwise the GLSL
  version (`codeGen.cpp:1958-2060`). `packages/opensubdiv` (far/sdc/vtr)
  has no GPU patch shader source. Refined and adaptive representations are
  therefore outside I-1.
- **Primitive IDs on the post-tessellation path.** With
  `HgiDeviceCapabilitiesBitsPrimitiveIdEmulation`, the post-tessellation vertex
  stage writes `patch_id` to a flat varying `hd_patchID` that the fragment stage
  reads (`codeGen.cpp:2491-2503, 2610-2612`). `GetBasePrimitiveOffset` corrects
  for draws that start at a non-zero patch (`codeGen.cpp:4997-5058`).

### 1.2 hgiMetal: GLSL bodies compiled as MSL

`hgiMetal/shaderGenerator.mm` (1,666 lines, plus `shaderSection` 510/1,243)
does not translate GLSL. It relies on MSL being C++14. It prepends this header
(`_ComputeHeader`, `shaderGenerator.mm:416-633`):

- **Type macros:** `#define vec3 float3`, `mat4 float4x4`, and `double float`
  (no doubles on Metal).
- **Declaration macros** (`_GetDeclarationDefinitions`,
  `shaderGenerator.mm:305-343`):
  - `REF(space,type)` becomes a C++ reference;
  - `FORWARD_DECL(...)` is empty;
  - the `ATOMIC_*` macros map to `atomic_*_explicit`.
- **Function-like macros:** `lessThan(a,b) ((a)<(b))`,
  `radians(d) (d * 0.01745329252)`, and `dFdx` renamed to `dfdx`.
- **Templates:** `mod` (which `fmod`s), two-argument `atan`, `texelFetch`,
  `texture`, `textureSize` and `imageStore`. There is also a `constexpr` default
  sampler, because GLSL's combined samplers have no MSL counterpart.

GLSL relies on globals: stage inputs and outputs, buffers and textures. MSL has
no mutable global scope. `_Execute` (`shaderGenerator.mm:1464-1658`) therefore:

1. wraps the whole program in a `struct ProgramScope`;
2. makes inputs, outputs and resources members of it;
3. emits an entry point that constructs the scope from `[[stage_in]]`, buffer
   and texture arguments, calls `main()`, and returns the output struct.

Built-in roles map to MSL attributes in `_GetBuiltinInputKeyword`
(`shaderGenerator.mm:153-188`). For example, `hdPrimitiveID` maps to
`primitive_id`, `hdPositionInPatch` to `position_in_patch`, and `hdPatchID` to
`patch_id`.

The captured MSL bears this out. For `testHdStDepthBias`, each stage binds an
argument buffer with 5 buffers. The post-tessellation vertex entry point is
`[[patch(triangle, 3)]] vertex` and takes
`patch_control_point<MSLTvInput> [[stage_in]]`, `[[patch_id]]` and
`[[position_in_patch]]`.

### 1.3 hgiVulkan: GLSL 4.50 plus layouts

`hgiVulkan/shaderGenerator.cpp` (676 lines, plus `shaderSection` 321/605) emits
the following, then the original shader code verbatim, and compiles with
shaderc (`shaderGenerator.cpp:562-619`):

- `#version` and extensions;
- macros (`shaderGenerator.cpp:238-256`): `REF(space,type) inout type`,
  `FORWARD_DECL(f) f`, `ATOMIC_*`;
- `layout(binding=…)` declarations, in/out blocks, and descriptor-set layouts.

Its section-visitor structure is the simpler model. Its output language is the
input language.

### 1.4 Consequence for WebGPU

hgiMetal's approach gets C++ for free: macros, overloading, implicit
conversions, references and templates. hgiVulkan's gets GLSL for free. WGSL
provides none of these, so HgiWebGPU needs a translator.

The translator runs where hgiMetal compiles its MSL: in
`HgiWebGPUShaderGenerator`, on the stage's full declarations and code. It runs
after the code generator has fixed defines and accessors. Section 3 gives the
reasons and the design.

## 2. GLSL survey

Method:

- `survey.py` (scratch) parses glslfx as `glslfx.cpp` does and strips comments.
- It counts regex matches per section. The counts are lexical occurrences, not
  type-checked uses.
- A section's stage is inferred from its name (`…Vertex`, `…Fragment`,
  `…PostTessVertex`, …). 96 sections are library code with no stage in their
  name.

### 2.1 Files

hdSt has 38 files, 10,227 lines and 243 glsl sections. Two of the files,
`fallbackLightingShader.glslfx` and `renderPassShader.glslfx`, contain only a
configuration. There are 46 `layout` and 11 `configuration` sections.

The column "sections w/ no-direct feature" counts preprocessor conditionals too.
Those are resolved before translation.

| File | Lines | glsl | layout | Code lines | Sections w/ no-direct feature | Main ones |
|---|---|---|---|---|---|---|
| basisCurves | 1,381 | 50 | 11 | 758 | 12 | `#if` 15, `gl_InvocationID` 13 |
| capsule | 279 | 3 | 0 | 171 | 0 | |
| compute | 439 | 14 | 0 | 213 | 1 | `double` 1 |
| conicalFrustum | 291 | 6 | 0 | 171 | 0 | |
| coordUtils | 186 | 3 | 0 | 98 | 1 | `#if`/`#else` |
| domeLight | 357 | 6 | 0 | 218 | 1 | `mod()` |
| edgeId | 237 | 8 | 0 | 139 | 0 | |
| fallbackLighting | 59 | 2 | 0 | 33 | 1 | `#if` |
| fallbackLightingShader | 27 | 0 | 0 | 0 | – | configuration only |
| fallbackMaterialNetwork | 47 | 2 | 0 | 9 | 1 | swizzle store |
| fallbackVolume | 97 | 1 | 0 | 24 | 0 | |
| frustumCull | 448 | 9 | 5 | 160 | 2 | `#undef` |
| imageShader | 103 | 2 | 2 | 21 | 1 | `#if` |
| implicitSurface | 456 | 7 | 2 | 254 | 1 | swizzle store, `#if` |
| implicitSurfaceFaceCull | 39 | 3 | 0 | 15 | 0 | |
| implicitSurfaceNormal | 28 | 2 | 0 | 8 | 0 | |
| instancing | 223 | 1 | 0 | 179 | 1 | `#if` 15, `#elif` 12 |
| invalidMaterialNetwork | 53 | 2 | 0 | 11 | 1 | `mod()` |
| mesh | 1,530 | 29 | 17 | 897 | 16 | `gl_TessCoord` 10, `gl_TessLevelOuter` 7, `gl_PointSize` 6 |
| meshFaceCull | 40 | 3 | 0 | 15 | 0 | |
| meshNormal | 201 | 10 | 0 | 121 | 4 | `defined()`, geometry stage |
| meshWire | 332 | 21 | 0 | 171 | 5 | swizzle store 5 |
| overlayShader | 66 | 2 | 0 | 25 | 1 | swizzle store |
| pcfShader | 124 | 3 | 0 | 75 | 2 | `#if` |
| pointDisk | 103 | 4 | 0 | 50 | 2 | `gl_PointCoord` |
| pointId | 87 | 4 | 2 | 34 | 0 | |
| points | 155 | 2 | 2 | 62 | 2 | `gl_PointSize` |
| ptexTexture | 371 | 1 | 0 | 274 | 1 | combined `sampler2DArray` 23 |
| renderPass | 328 | 13 | 3 | 219 | 4 | `#if` 24, `defined()` 21 |
| renderPassShader | 53 | 0 | 0 | 0 | – | configuration only |
| simpleLighting | 534 | 3 | 0 | 381 | 3 | `#if` 16, swizzle store 5 |
| simpleLightingShader | 41 | 1 | 0 | 8 | 0 | |
| skinning | 280 | 1 | 0 | 191 | 1 | `defined()` 23 |
| sphere | 132 | 6 | 0 | 67 | 0 | |
| surfaceHelpers | 80 | 2 | 0 | 39 | 0 | |
| terminals | 458 | 13 | 0 | 292 | 10 | `#if` 22, swizzle store 6 |
| visibility | 80 | 2 | 0 | 47 | 1 | `#if` |
| volume | 484 | 2 | 2 | 241 | 1 | `#if` |

hdx has 18 files, 2,000 lines and 27 glsl sections (831 code lines). Eight of
the files contain only a configuration. Its largest files are `selection`
(319 code lines), `renderPass` (230) and `oitResolveImageShader` (81). hdsi has
`unlitShader.glslfx`, with 1 section.

### 2.2 Features, all 271 sections

Each cell gives occurrences, then the number of sections in brackets. "Direct"
means a 1:1 or renamed WGSL form exists.

**Types**

| Feature | Count (sections) | WGSL form |
|---|---|---|
| `vec4` | 771 (161) | direct |
| `vec3` | 679 (154) | direct |
| `vec2` | 323 (80) | direct |
| `float` | 610 (120) | direct |
| `int` | 522 (92) | direct |
| `bool` | 111 (56) | direct; not host-shareable in buffers. The code generator already converts bool members (`codeGen.cpp:647`). |
| `uint` | 61 (21) | direct |
| `ivec*`, `uvec*`, `bvec*` | 93 | direct |
| `mat2`–`mat4` | 26 (7) | direct |
| `MAT4`/`MAT3` macro | 141 (51) | the code generator defines it as `mat4` |
| `double` | 1 (1) | none (no f64) |
| `struct` | 26 (15) | rewrite (`,` vs `;` member separators) |
| combined samplers (`sampler2DArray`) | 23 (1, ptexTexture) | none: split into texture + sampler |

**Qualifiers and Storm macros**

| Feature | Count (sections) | WGSL form |
|---|---|---|
| `const` | 402 (79) | GLSL `const` locals are often runtime values: WGSL `let` |
| `REF(space,type)` | 40 (8) | none: `ptr<function,T>` plus `&` at call sites |
| `inout` parameter | 2 (1, `mesh.glslfx:302`) | none: as above |
| `out` parameter (bare) | 0 | |
| `FORWARD_DECL(...)` | 68 (28) | drop |
| `HdGet_*` / `HdGetScalar_*` / `HdGetSampler_*` | 224 / 2 / 7 | calls to generated accessors |
| `HD_HAS_*` | 179 (48) | resolved by the preprocessor |
| `ATOMIC_*` | 26 (5) | `atomicLoad`, `atomicStore`, `atomicAdd`, … |
| `hd_*` built-in aliases | 28 (22) | entry-point plumbing |

**Built-ins**

| Feature | Count (sections) | WGSL form |
|---|---|---|
| `gl_Position` | 25 (23) | direct |
| `gl_FragCoord` | 19 (11) | direct |
| `gl_FrontFacing` | 5 (4) | direct |
| `gl_FragDepth` | 3 (3) | direct |
| `gl_PrimitiveID` | 5 (4) | `primitive_index`, an optional feature (Safari has it) |
| `gl_PrimitiveIDIn` | 5 (4) | none: geometry stage |
| `gl_PointSize` | 9 (9) | none: WebGPU points are 1 px |
| `gl_PointCoord` | 2 (1) | none |
| `gl_ClipDistance` | 2 (1) | `clip_distances`, an optional feature (Safari has it) |
| `gl_TessCoord` | 14 (10) | none: tessellation |
| `gl_InvocationID` | 19 (5) | none: tessellation |
| `gl_TessLevelOuter` / `gl_TessLevelInner` | 11 / 5 | none: tessellation |

**Functions**

| Feature | Count (sections) | WGSL form |
|---|---|---|
| `texelFetch` | 24 (6) | `textureLoad` |
| `texture` | 2 | `textureSample` + sampler |
| `textureSize` | 3 | `textureDimensions` |
| `dFdx` / `dFdy` / `fwidth` | 5 / 4 / 5 | `dpdx` / `dpdy` / `fwidth`, uniformity rules apply |
| `discard` | 21 (18) | direct (demote semantics) |
| `mix`, `normalize`, `cross`, `dot`, … | 431 | direct |
| `lessThan`, `greaterThan`, `equal`, `notEqual`, `not` | 17 | operators |
| `mod` | 3 | none: floored; WGSL `%` truncates |
| `inverse` | 2 (1) | none: helper |
| `frexp` | 1 | returns a struct |
| two-argument `atan` | 2 | `atan2` |
| `barrier` | 2 | `workgroupBarrier` |
| `EmitVertex` / `EndPrimitive` | 4 / 5 | none: geometry stage |

**Preprocessor**

| Feature | Count (sections) |
|---|---|
| `#if`/`#ifdef`/`#ifndef` | 165 (54) |
| `#elif`/`#else` | 65 |
| `defined()` | 111 |
| `#define` (object-like) | 48 (28) |
| `#define` (function-like) | 0 |
| `#undef` | 2 |
| `##` | 0 |

**Syntax**

| Feature | Count (sections) | WGSL form |
|---|---|---|
| `for` | 58 (37) | rewrite |
| `while` | 9 | direct |
| `do`-`while` | 3 (2) | `loop { … continuing { break if … } }` |
| `switch` | 1 (no fallthrough candidates) | |
| ternary `?:` | 22 (12) | `select` or `if` |
| `++`/`--` (includes loop updates) | 62 (39) | statements only |
| multi-component swizzle store (`v.xy = …`) | 36 (22) | none: rejected by Safari |
| array declarations | 64 (27) | `array<T,N>` |
| shifts | 40 (11) | shift amount must be `u32` |
| non-const globals | 8 (3) | `var<private>` |

**Functions defined and overloading**

- There are 523 function definitions with 262 distinct names.
- 85 names are defined more than once:
  - 72 of them keep the same signature in alternative sections (Storm's variant
    mechanism; only one is in any program);
  - 13 have more than one signature. These are overload candidates:
    `GetNormal`, `GetPatchCoord`, `InterpolatePrimvar`,
    `GetInstanceTransform`, `simpleLighting`, `ClampTessLevels`,
    `PtexLookupFast`, …

**Totals.** 54 sections (49 in hdSt) use a non-preprocessor feature with no
direct WGSL form. 33 of them are only there because of the stage
(geometry/tessellation). 22 have a swizzle store.

### 2.3 Programs Storm actually assembles (reference build)

These were captured with
`TF_DEBUG="HDST_DUMP_SHADER_SOURCE HDST_DUMP_SHADER_SOURCEFILE"`.
`HDST_DUMP_SHADER_SOURCE` prints the code generator's GLSL per stage
(`glslProgram.cpp`). `HDST_DUMP_SHADER_SOURCEFILE` writes the generated MSL
(`glslProgram.cpp:176-189`). Line counts are non-blank lines.

| Test | Programs | GLSL into Hgi, per stage | MSL out | Overloaded names per program | `#if` per program |
|---|---|---|---|---|---|
| `testHdStDepthBias` | 1 compute (GPU frustum cull) + 1 VS/PTVS/FS | CS 425, VS 859, PTVS 784, FS 1,012 | 4 files, 5,161 lines | 25–74 | up to 49 |
| `testHdStBasicDrawing --repr hull` | 12 compute + 17 VS/FS | VS 852–966, FS 693–2,529, CS 418–434 | 50 files, 64,261 lines (max 3,792) | 23–74 | up to 68 |

- Storm takes the post-tessellation path on Metal even for `testHdStDepthBias`'s
  plain cubes. That is the VS + PTVS + FS program.
- The overloads come mainly from the code generator: `HdGet_x()` / `HdGet_x(int)`
  and `hd_*_get` / `hd_*_set`. The `basic_lv0_hull` programs also carry
  OpenSubdiv functions (`OsdEvalBezier`, …).
- The code generator emits no function-like macros. The function-like macros
  come from each backend's prelude (`REF`, `ATOMIC_*`, `FORWARD_DECL`).
- The built-ins used are `gl_Position`, `gl_PointSize`, `gl_FragCoord`,
  `gl_FrontFacing`, `gl_PrimitiveID`, `gl_ClipDistance`, `gl_TessCoord` and
  `gl_PointCoord`.
- Section membership was matched by line content (at least 80 % of a section's
  lines present). By that match, the depthBias programs contain about 51 glsl
  sections and the hull programs about 72, from 18–19 files.

### 2.4 Safari WebGPU, measured

The probe page is `probe/index.html`. It posted its results to a local server
that was stopped afterwards.

**Adapter features:**

- `primitive-index`
- `clip-distances`
- `shader-f16`
- `indirect-first-instance`
- `float32-filterable`
- `float32-blendable`
- `depth-clip-control`
- `texture-compression-bc`, `-etc2`, `-astc`
- `timestamp-query`
- `texture-formats-tier1/2`

The adapter does not offer `dual-source-blending`, `subgroups` or any
multi-draw.

**Limits:**

| Limit | Adapter | Default device |
|---|---|---|
| maxStorageBuffersPerShaderStage | 44 | 8 |
| maxSampledTexturesPerShaderStage | 44 | 16 |
| maxSamplersPerShaderStage | 22 | 16 |
| maxUniformBuffersPerShaderStage | 44 | 12 |
| maxBindGroups | 11 | 4 |
| maxVertexBuffers | 12 | 8 |
| maxVertexAttributes | 30 | 16 |
| maxInterStageShaderVariables | 31 | 16 |
| maxStorageBufferBindingSize | 2 GiB − 4 | 128 MiB |
| maxUniformBufferBindingSize | 2 GiB − 4 | 64 KiB |
| min{Uniform,Storage}BufferOffsetAlignment | 32 | 256 |

The 2 GiB − 4 values are 2,147,483,644 bytes. HgiWebGPU must request the
adapter's limits, as `hgiMetal/capabilities.mm` reads the device's.

**WGSL language features:**

- `pointer_composite_access`
- `unrestricted_pointer_parameters`
- `readonly_and_readwrite_storage_textures`
- `packed_4x8_integer_dot_product`

**Compile checks** (`createShaderModule` + `getCompilationInfo`, with all
features requested):

| Check | Result |
|---|---|
| `enable primitive_index` | ok |
| `enable clip_distances` | ok |
| `enable f16` | ok |
| `ptr<function>` params | ok |
| `ptr<private>` params | ok |
| `ptr<storage>` params | ok |
| `var<private>` globals | ok |
| read-write storage texture | ok |
| `v.xy = …` | error: "cannot assign to a value of type 'vec2<f32>'" |
| `&v.x` | error: "cannot take the address of a vector component" |
| `textureSample` under a branch on storage data | error: "requires uniform control flow" |
| the same with `diagnostic(off, derivative_uniformity)` | ok |

Without the features requested, `primitive_index`, `clip_distances` and `f16`
fail with "requires feature … which is not enabled".

## 3. Translator design (track B)

### 3.1 Input: after the code generator, per stage

The translator should take what `HgiShaderFunctionDesc` carries: the
declarations, the code, and the stage interface (inputs, outputs, blocks,
buffers, textures, constant params). It should not take raw glslfx sections.
The reasons:

- `#if` depends on the code generator's defines (`HD_HAS_*`, `HD_NUM_*`, the
  material tag, `HD_SHADER_SUPPORTS_DOUBLE_PRECISION`). There are 165 `#if` in
  the sections and up to 68 per program.
- Sections call functions defined in other sections and in generated code
  (`FORWARD_DECL`, `HdGet_*`). Type checking and overload resolution need the
  whole program.
- This is where upstream adapts GLSL to a backend: hgiMetal's
  `shaderGenerator.mm` compiles the same text. A faithful HgiWebGPU keeps the
  code generator backend-neutral and puts the language work in the backend.

The I-1 bar asks that every hdSt section parse. That needs a section mode
alongside the program mode:

- translate one section with a prelude of stub declarations;
- the stubs are the prototypes collected from all sections plus the
  code-generator accessors the section calls;
- run under named define sets: the empty set, plus each set observed in
  captured programs that contain the section;
- report coverage per define set.

Sections for stages WebGPU lacks (the 33 geometry and tessellation sections)
are translated as library functions. Stage built-ins become diagnostic stubs.
They are reported as unsupported, not hidden.

### 3.2 Pipeline

1. **Preprocess.** This is a C-preprocessor subset: object-like and
   function-like `#define`, `#undef`, `#if`/`#ifdef`/`#ifndef`/`#elif`/`#else`,
   `defined`, integer expressions, and `// line N "file"` markers. The markers
   are kept so diagnostics map back to the glslfx file and line.
2. **Parse** GLSL 4.50 (the subset found here) to an AST. No preprocessor text
   remains at this point.
3. **Type-check.** This step needs:
   - scopes;
   - a built-in function table over GLSL's genType families;
   - user overload resolution by GLSL rules (exact match, then implicit
     conversion);
   - implicit conversions made explicit, for example `int * vec3` at
     `volume.glslfx:223`;
   - constant folding for array sizes.
4. **Lower GLSL constructs WGSL lacks.** Section 3.3 lists them.
5. **Emit the WGSL module** in the shape hgiMetal uses:
   - module-scope `var<private>` for GLSL globals and stage inputs and outputs.
     This plays the role of hgiMetal's `ProgramScope`, because WGSL has private
     globals and MSL does not.
   - `@group/@binding` declarations for buffers and textures, emitted by the
     shader generator from the Hgi descriptors;
   - one entry point that copies `@location`/`@builtin` inputs into privates,
     calls `main()`, and returns an output struct.

   The translator owns the bodies and the lowering. `HgiWebGPUShaderGenerator`
   (track C) owns bindings, entry points and the stage interface, mirroring
   `HgiMetalShaderSection` and its visitors.
6. **Validate** at two levels. In unit tests (Node), the output parses with
   `wgsl_reflect`. In browser tests, Safari's `getCompilationInfo` reports no
   errors.

`wgsl_reflect` is not a workspace dependency today.
`packages/openvdb/PROVENANCE.md` records that it was dropped with the test
that used it. Version 1.4.0 is present in the OpenVDB port's install, but
adding it here changes the lockfile. That would need an offline-install
check. It parses and reflects but does not type-check, so
Safari remains the real compiler check.

Size estimate, with no upstream counterpart to port:

| Part | TypeScript lines |
|---|---|
| Preprocessor | ~600 |
| Lexer and parser | ~2,000 |
| Type checker and built-in table | ~1,500–2,000 |
| Lowering and emitter | ~2,000 |
| Total | 6–7k, plus tests |

Using an existing GLSL parser package would need a network install. Native and
WebAssembly translators (Tint, Naga, glslang) are excluded by the
no-WebAssembly rule.

### 3.3 Hard cases and proposed handling

| Case | Evidence | Handling |
|---|---|---|
| Overloading | 13 names in glslfx; 23–74 per assembled program | Mangle by parameter types after resolution (`HdGet_points` vs `HdGet_points_i32`). Keep a name map for diagnostics. |
| Implicit conversions | `int * vec3` (`volume.glslfx:223`); int/uint mixing; `uint(bool)` | The type checker inserts explicit `f32()`/`i32()`/`u32()`. Abstract literals need none. |
| `out`/`inout`/`REF` parameters | 40 `REF`, 1 `inout` | Use `ptr<function,T>` (or `private`/`storage` per argument; Safari accepts these). Pass `&x` at call sites. An argument that is a vector component or swizzle (Safari rejects `&v.x`) gets a temporary with copy-in/copy-out, as GLSL's semantics already are. |
| Swizzle stores | 36 (22 sections), e.g. `meshWire`, `terminals`, `simpleLighting` | Rewrite `v.xy = e` as `let t = e; v.x = t.x; v.y = t.y;`. Compound assignments read first. |
| Ternary | 22 | `select(f, t, c)` when both arms are side-effect free and cheap; otherwise a `var` + `if`. |
| `++`/`--` in expressions, comma expressions | 62 (most are loop updates, which are legal) | Hoist to statements with temporaries; keep loop updates. |
| `const` with runtime initialisers | 402 | `let` unless constant-foldable (then `const`). |
| Function-like macros | backend preludes only | Expand in the preprocessor. The HgiWebGPU prelude defines `REF`, `FORWARD_DECL`, `ATOMIC_*` as the Vulkan prelude does (`hgiVulkan/shaderGenerator.cpp:238-256`). |
| `#if` on code-generator defines | 165 / up to 68 per program | Program mode: the real defines. Section mode: named define sets, with coverage reported. |
| Globals | 8 in glslfx; all stage I/O and blocks in assembled code | `var<private>` + entry-point copy-in/out (the WGSL form of hgiMetal's `ProgramScope`). |
| Combined samplers | `ptexTexture` (23); the code generator's texture accessors | The shader generator declares texture + sampler pairs from `HgiShaderFunctionTextureDesc`, as hgiMetal does, and emits `HgiGet_*`/`HgiTextureLod_*` accessors. `sampler2DArray` parameters become two parameters. |
| Derivatives / `textureSample` in non-uniform flow | `dFdx` 5, `dFdy` 4, `fwidth` 5; texture sampling in material code | Emit `diagnostic(off, derivative_uniformity);`. Safari accepts it (measured), and GLSL has no such rule. |
| `mod`, `inverse`, `frexp`, `atan(y,x)`, `lessThan` family | 3, 2, 1, 2, 17 | Helpers in the prelude (`mod` floored, `inverse` for mat2–4), or operator rewrites. |
| Matrices | 26 + `MAT4` 141; `mat3(m4)`-style constructors | Same column-major convention. Constructor forms GLSL allows and WGSL does not (truncation, scalar diagonal) become explicit columns. |
| `switch` fallthrough | 1 `switch`, 0 fallthrough candidates | Grouped `case a, b:`; report real fallthrough as unsupported. |
| `do`-`while` | 3 | `loop { body; continuing { break if !(cond); } }` |
| Uniform address-space layout | blocks via `HgiBindingTypeUniformValue` | WGSL requires a 16-byte array stride in `uniform`. Map uniform blocks containing scalar arrays to read-only `storage`. Keep std430-equivalent packing (`CppShaderPadding` off, `interleavedMemoryManager.cpp:255-325`). |
| `double` / `dvec` / `dmat` | 1 in glslfx; the code generator's `hd_dvec3` helpers | Report `ShaderDoublePrecision` false (as hgiMetal does). The code generator then uses float types. The helpers become `f32` aliases, as Metal's `#define dvec3 float3`. |
| Atomics | `ATOMIC_*` 26 (frustum cull, OIT) | `atomic<i32/u32>` in `storage`; the buffer's element type must be atomic. The shader generator types the binding. |
| Geometry/tessellation built-ins | 33 sections | Never selected under HgiWebGPU's capabilities (section 4.3). Section mode only. |
| `gl_PointSize` > 1 | 9 sections; `testHdStBasicDrawing` points | Not supported by WebGPU. Proposed for I-2: expand points to quads in the vertex stage by vertex pulling. In I-1, a plain failing test. |

## 4. Hgi and HgiWebGPU (track C)

### 4.1 Surface to port

Line counts are header/implementation. Upstream `hgi` has 56 files and 8,353
lines. Track C has started from this interface. This page describes it; it does
not edit track C's files.

The `Hgi` class (`hgi.h`) has about 37 methods. Factory functions exist for
textures, views, samplers, buffers, shader functions and programs, resource
bindings, and graphics and compute pipelines. Command objects are created
through `CreateGraphicsCmds`, `CreateBlitCmds` and `CreateComputeCmds`. Work is
submitted with `SubmitCmds(cmds, wait)`. Frames are bracketed by `StartFrame`
and `EndFrame`.

| Class | hgi | hgiMetal | hgiVulkan | HgiWebGPU needs |
|---|---|---|---|---|
| Hgi | 390/387 | 242/536 | 199/411 | Own `GPUDevice`/queue. Request adapter features (`primitive-index`, `clip-distances`, `indirect-first-instance`, `float32-filterable`) and limits. `SubmitCmds` → `queue.submit`. |
| Capabilities | 103/13 | 50/179 | 114/570 | Section 4.3. |
| Buffer | 140/45 | 56/70 | 141/258 | `GPUBuffer`. `GetCPUStagingAddress` returns a JS-side shadow `ArrayBuffer`; the copy is `queue.writeBuffer`. |
| Texture / TextureView | 307/121 | 70/293 | 164/748 | `GPUTexture`/`createView`. Three-channel formats are absent, as on Metal (`hgiMetal/conversions.mm`). |
| Sampler | 148/48 | 53/80 | 67/114 | `GPUSampler`. WebGPU has no border colour (Metal has, `sampler.mm:34`): deliberate divergence, clamp-to-edge. |
| ShaderFunction / Desc | 84/24, 581/462 | 67/133 | 97/161 | Generator + translator → `createShaderModule`. Errors arrive asynchronously. |
| ShaderProgram | 122/44 | 96/81 | 76/69 | Container. |
| ShaderGenerator / Section | 74/72, 111/84 | 78/1,666, 510/1,243 | 96/676, 321/605 | Section visitors as in hgiMetal. Emit the WGSL module (section 3.2 step 5). Host the translator. |
| ResourceBindings | 233/96 | 92/314 | 72/402 | `GPUBindGroup` + layouts. `SetConstantValues` (push constants on Vulkan, `setVertexBytes` on Metal, `graphicsCmds.mm:482-493`) → a ring buffer bound with dynamic offsets. |
| GraphicsPipeline | 470/262 | 55/489 | 110/829 | `GPURenderPipeline`. Depth bias is pipeline state in both Hgi and WebGPU. `lineWidth` must be 1, as hgiMetal verifies (`graphicsPipeline.mm:485`). `numClipDistances` → `clip_distances`. Tessellation state → PTVS emulation. |
| ComputePipeline | 120/64 | 51/67 | 73/164 | `GPUComputePipeline`. |
| GraphicsCmds | 209/15 | 172/885 | 151/708 | Render pass encoder. `DrawIndexedIndirect` loops draw by draw with per-draw vertex-buffer offsets, as hgiMetal does (`graphicsCmds.mm:672-760`, `stepFunctions` 115/106). There is no multi-draw-indirect. |
| ComputeCmds | 104/15 | 98/235 | 99/231 | Compute pass encoder. |
| BlitCmds / ops | 117/17, 319 | 101/549 | 103/891 | copyBufferToBuffer, writeBuffer, copyTextureToBuffer (256-byte row pitch), clearBuffer. Mipmaps need a render pass. GPU→CPU copies are asynchronous. |
| IndirectCommandEncoder | 110/16 | 124/810 | – (returns null) | Return null, as hgiVulkan does (`hgiVulkan/hgi.cpp:290-293`). |
| Enums / Types / Handle / Tokens | 843, 193/411, 69, 57/16 | – | – | Port as is. |
| AttachmentDesc, GraphicsCmdsDesc, ComputeCmdsDesc | 104/64, 87/67, 47/30 | – | – | Port as is. |
| unitTestHelper | 96/465 | – | – | Port for the Hgi tests. |
| Vulkan only: device, instance, command buffer/queue, garbage collector, descriptor-set layouts, pipeline cache | – | – | ~2,900 | Only a garbage collector analogue: destroy after submitted work completes. |

### 4.2 WebGPU constraints and how Storm on Metal already handles them

**No geometry stage.** Storm on Metal never uses one. It sets
`MetalTessellation`, so `_hasGS` is false (`codeGen.cpp:2125`). The work moves
to the post-tessellation vertex stage when the mesh needs any of:

- patches;
- custom displacement;
- uniform or face-varying scene normals;
- flat geometric normals;
- no built-in barycentrics.

(`meshShaderKey.cpp:278-292`.) WebGPU has no barycentrics, so every non-point
mesh takes this path, as measured for `testHdStDepthBias` on Metal.

**No tessellation stage.** Proposal: HgiWebGPU reports `MetalTessellation` and
emulates Metal's post-tessellation draw for tessellation factor 1:

- Draw non-indexed, with 3 vertices per triangle patch and 6 per quad patch.
- Derive `patch_id` and `position_in_patch` from `vertex_index`.
- Fetch control-point indices from the index buffer bound as storage, and
  control-point attributes from storage buffers (vertex pulling).
- The generator emits this in the post-tessellation vertex entry point. That
  is the role of `patch_control_point<…> [[stage_in]]` in hgiMetal.

Factors above 1 are out of scope for I-1. They cover refined curves, adaptive
subdivision and OpenSubdiv patches.

**Primitive ID in the fragment stage.** Safari offers `primitive_index`. Under
emulation, one quad patch spans two triangles. Report `PrimitiveIdEmulation`,
so the fragment stage reads the `hd_patchID` varying the code generator
already plumbs (`codeGen.cpp:2491-2503`). Report `BasePrimitiveOffset` if the
emulated `vertex_index` includes `firstVertex` (`codeGen.cpp:4997-5007`).

**No multi-draw-indirect.** Loop draws as hgiMetal does when it has no indirect
command buffers. `indirect-first-instance` is available, so `baseInstance`
works in indirect draws. The risk is cost: per-draw encoder calls in
JavaScript.

**No push constants.** Use a dynamic-offset uniform ring buffer for
`SetConstantValues`.

**Binding limits.** The measured Metal programs bind 5 buffers per stage, well
under even the default 8 storage buffers. Materials with many textures need the
adapter's 44, so request adapter limits.

**Asynchronous API.** Three upstream behaviours are synchronous:

- `SubmitCmds(..., HgiSubmitWaitTypeWaitUntilCompleted)`;
- GPU→CPU reads (for example `HdStRenderBuffer::Map` for `WriteToFile`);
- `HgiShaderFunction::IsValid()`.

WebGPU resolves all three through promises. This needs a documented divergence:
an `await`-able completion on the Hgi object, used by tests and readback. It
must not use busy waits.

### 4.3 Proposed HgiWebGPU capability bits (`hgi/enums.h:60-90`)

| Bit | Value | Reason |
|---|---|---|
| MetalTessellation | true (emulated) | Section 4.2. |
| PrimitiveIdEmulation | true | Section 4.2. |
| BasePrimitiveOffset | true | Section 4.2 (to confirm in testing). |
| BuiltinBarycentrics | false | Not in WebGPU. |
| MultiDrawIndirect | false | Not in WebGPU. |
| IndirectCommandBuffers | false | Not in WebGPU. |
| BindlessBuffers | false | Not in WebGPU. |
| BindlessTextures | false | Not in WebGPU. |
| ShaderDoublePrecision | false | No f64. |
| DepthRangeMinusOnetoOne | false | WebGPU depth is 0..1. |
| CppShaderPadding | false | WGSL storage layout matches the GL rules for vec3 members. |
| SingleSlotResourceArrays | false | As hgiGL: WebGPU has no binding arrays, so each texture of an array of textures (Storm's shadowCompareTextures) is its own binding at consecutive bind indices, with index-taking accessors that switch on the index (hgiWebGPU/src/shaderGenerator.ts `_WriteArrayOfTextures`). |
| RoundPoints | false | |
| ConcurrentDispatch | false | |
| UnifiedMemory | false | |
| StencilReadback | false | |
| ConservativeRaster | false | |
| CustomDepthRange | false | |
| Presentation | false for I-1 (offscreen) | |

## 5. Today's typescript-usd imaging against upstream

TypeScript line counts exclude tests.

| Module | typescript-usd | Upstream |
|---|---|---|
| hgi | 9 files, 525 | 56 files, 8,353 |
| hdSt | 53 files, 11,168 | 256 files, 76,886 |
| hd | 73 files, 9,470 | 435 files, 91,026 |
| hdx | 5 files, 629 | 78 files, 25,678 |
| hio | 6 files, 514 | 22 files, 4,832; no glslfx parser in TS |

**Close to upstream.** These files follow upstream and are densely cited:
`material.ts` (28 citations), `dynamicUvTextureObject.ts` (20),
`textureHandleRegistry.ts` (19) and `mesh.ts` (31; partial: 1,340 against
3,747 upstream lines). In hd, `changeTracker`, `dirtyBitsTranslator` and
`renderIndex`, and the scene-index and schema files, are partial ports.

**Rewrites.**

- `codeGen.ts` (1,092 lines against 7,481) assembles one mesh VS/FS pair from
  WGSL snippets. It has no glslfx, no resource binder and no
  `HgiShaderFunctionDesc`. It has a `FAITHFULNESS-DEBT` marker at
  `codeGen.ts:553` for lighting.
- `renderPass.ts` (756 lines, bigger than upstream's 446) and `drawItem.ts`
  drive WebGPU directly.
- `pointCurveShader.ts`, `domeLightComputations.ts`, `volume.ts` and
  `hdx/pickTask.ts` carry their own WGSL.
- All WGSL is in template strings, about 1,050 lines across 7 files, with 23
  `@vertex`/`@fragment`/`@compute` entry points. Nothing reads upstream glslfx.
- `glslProgram.ts` is a 31-line name shim.
- `renderPassState.ts` (160 lines against 1,655), `resourceRegistry.ts` (277
  against 2,211) and `drawBatch.ts`/`indirectDrawBatch.ts` (291 against
  2,246 for `pipelineDrawBatch` + 798 for `drawBatch`) keep upstream names at
  much reduced scope.

**Viewer entry point.** `apps/usdview/src/runtime.ts` constructs
`RenderDelegate.New(device, format, sampleCount)` and calls `Render`. There is
no engine or task controller, and only one hdSt file imports `hgi`.

### 5.1 Migration path: new path beside the current one

1. **Hgi.** Upgrade `pxr/imaging/hgi` in place to upstream's interface
   (track C). Keep the few calls the current hdSt makes working through
   HgiWebGPU, or a thin adapter, so the default renderer is untouched. Add
   `pxr/imaging/hgiWebGPU` as a new module and export.
2. **glslfx.** Add `HioGlslfx`, `HioGlslfxConfig` and
   `HioGlslfxResourceLayout` to `pxr/imaging/hio` (upstream 1,034 + 852 + 505
   lines). Bundle the 57 glslfx files verbatim with provenance.
3. **Faithful Storm, beside the current hdSt.** The current hdSt keeps its
   paths and exports. The faithful port needs upstream file names (`codeGen`,
   `glslProgram`, `renderPass`, `drawItem`, …), and several of those names are
   already taken by the current hdSt files.

   Recommendation: a sibling module with a separate export, for example
   `pxr/imaging/hdStFaithful/` exported as `typescript-usd/hdSt-faithful`
   (name to be decided). It uses upstream file names and citations inside.
   Shared pieces that are already faithful (texture registry, material network
   processing) are imported, not copied. A one-line comment at the module root
   records the divergence (a second module name).

   When the faithful path wins on the asset report, it takes the `hdSt` name
   and the rewrite is retired.
4. **Viewer.** It keeps `RenderDelegate` until the faithful path passes the
   asset report. A switch (query parameter) selects the faithful delegate for
   comparison runs. There is no default change in I-1.

## 6. Test bar

### 6.1 First targets

**`testHdStDepthBias`** is upstream's registered test (`hdSt/CMakeLists.txt:2441`,
source `testenv/testHdStDepthBias.cpp`, 204 lines).

- It draws two `AddCube`s (white and black, `smoothHull`), with and without
  depth bias, and writes `testHdStDepthBias_disabled.png` and
  `testHdStDepthBias_enabled.png` at 640×480.
- On Metal it builds one VS/PTVS/FS program and one GPU frustum-cull compute
  program.
- It therefore exercises the post-tessellation emulation, the compute path,
  the code generator, resource binding, the indirect draw loop and AOV
  readback, with no lighting, textures, curves or points.

**`testHdStBasicDrawing --offscreen --repr hull --write
testHdStBasicDrawing_lv0_hull.png`** (`PopulateBasicTestSet`,
`hd/unitTestDelegate.cpp:1919`) is the next target. Upstream registers it twice:

- `testHdStBasicDrawing_Immediate_lv0_hull` (`hdSt/CMakeLists.txt:852`) turns
  off multi-draw-indirect on GL and Vulkan. That is the closest analogue to
  HgiWebGPU.
- `testHdStBasicDrawing_MDI_lv0_hull` (`CMakeLists.txt:1494`) keeps it on.

The scene contains:

- grids with face, vertex and face-varying colour;
- polygons and cubes;
- linear and cubic curves (drawn as wire in `hull`);
- points with widths.

On Metal it builds 12 compute and 17 VS/FS programs.

Points render larger than one pixel in the native image, so the image cannot
match without point expansion. Until then that is a plain failing test.

**Text-level tests.** `testHdStCodeGen` exists upstream, but its registered
variants (`CMakeLists.txt:2347-2350`) are GL and Vulkan only, and they force a
geometry-shader configuration. Run on the Metal reference build, `--mesh`
fails to compile its fragment shader. So it has no Metal or WebGPU baseline.

The code-generator test for I-1 should instead compare the TypeScript code
generator's `HgiShaderFunctionDesc` text with the reference build's
`HDST_DUMP_SHADER_SOURCE` output for the depthBias programs. For that test,
Hgi capabilities are set to the reference device's values (hgiMetal on this
Mac). A second set
of fixtures under HgiWebGPU's own capabilities has no native oracle. It is
checked only by translation and Safari compilation.

### 6.2 Native capture

The upstream binaries run unchanged (now with the capture tooling kept
outside this repository, `FIXTURES.md`), with `<build>` the OpenUSD 26.11.1
reference build:

```
cd <tmp> && DYLD_LIBRARY_PATH=<build>/lib \
  <build>/tests/testHdStDepthBias --offscreen
```

The same form, with `TF_DEBUG="HDST_DUMP_SHADER_SOURCE HDST_DUMP_SHADER_SOURCEFILE"`,
gives the code-generator text and the MSL. This plan ran both tests that way.

The registered tests also set `TF_DEBUG=HD_SAFE_MODE`. The committed capture
script should add it to the debug flags; this plan's capture did not.

The colour AOV is `Float16Vec4`. `WriteToFile` quantises to 8-bit PNG
(`unitTestHelper.h:407-440`). The capture should also write `.exr`, which uses
the same `WriteToFile` path with another extension, so the comparison can be
made before quantisation where useful.

### 6.3 Tolerance

Upstream's bar is `FAIL 1 FAIL_PERCENT 1` (`PERCEPTUAL` for most tests, but not
`testHdStDepthBias`), run through `idiff` (`cmake/macros/testWrapper.py:199-230`).

- `-fail 1` is a per-pixel threshold of 1.0 on a 0–1 scale, which an 8-bit
  image cannot exceed.
- In practice upstream accepts up to 1 % of pixels failing, and the perceptual
  test where it is set.

Proposal for I-1: compare 8-bit RGBA from Safari against the native PNG with
the same quantisation.

- **Pass:** every channel within 2/255 and at most 0.5 % of pixels differing
  at all.
- **Report:** maximum difference and the count of differing pixels, and keep
  a difference image locally.

Reasons:

- Same GPU and the same rasteriser. Remaining differences should come from
  shader compilation and AOV readback. WebKit compiles WGSL to MSL with its own
  floating-point settings (contraction, fast-math). The AOV readback is
  float16.
- 2/255 is far stricter than upstream's bar, and loose enough for last-bit
  shading differences.

Exact equality should be recorded when it happens, not required.

### 6.4 Browser tests vs controller tests

**Browser tests (Safari).**

- The test page runs the ported test driver on HgiWebGPU, reads back the AOV
  with `copyTextureToBuffer` (not the canvas, to avoid colour management), and
  POSTs pixels and diagnostics to a local server started for the run.
- The page is opened with `open -a Safari`, and the server is stopped after
  the run. The probe in section 2.4 used this pattern. It is the only automation
  the rules allow.
- These tests are listed separately and are not part of `vitest`.

**Controller tests (Node, no GPU):**

- translator unit tests: translation plus `wgsl_reflect` parse, per section
  and per define set;
- glslfx parser tests;
- code-generator text against the captured `HDST_DUMP_SHADER_SOURCE` fixtures;
- Hgi descriptor and conversion tests against a mock device.

### 6.5 Capture scripts of an earlier port

| Script (in an earlier, unpublished port) | Reference build only? | Reproduced here? | Use |
|---|---|---|---|
| `Tests/HdStTests/capture_hdStTestenvImages.sh` (last changed `0d00307`) | Yes. It runs the reference build's `tests/*` with the `pxr_register_test` arguments. | Yes, for 3 images: `testHdStBasicDrawing_lv0_hull.png`, `testHdStDepthBias_disabled.png` and `testHdStDepthBias_enabled.png` are byte-identical to that port's baselines (`cmp`). | Adapt as `scripts/oracle` capture with provenance "capture script adapted from capture_hdStTestenvImages.sh". Add `--check`. |
| `Tests/HdStTests/capture_hdStTestenvStdout.sh` | Yes | Not run | Candidate for stdout tests. |
| `Tests/HdStTests/capture_firstImage.sh` + `firstImageOracle.cpp` | C++ against the reference build, plus `USD_SRC` for the uninstalled `hdSt/unitTestHelper.h` | Not run | Not an upstream test (cube_n). Smoke check only, not part of the bar. |
| `Tests/HgiMetalTests/capture_hgiMetal.sh` | Yes | Not run | Metal-specific; not for HgiWebGPU. |
| `scripts/asset-acceptance/{prepare.py, refRender.cpp, report.py, run.sh}` | Python and C++ against the reference build | Not run here | For the asset report (bar 5). `prepare.py` writes a framing camera; `refRender.cpp` mirrors usdrecord; `report.py` uses `TOL = 2`. |

The fixtures are not copied by this plan. Track E re-runs the script into
`scripts/oracle` form and commits the fixtures. (That capture form now lives
in the capture tooling kept outside this repository; `FIXTURES.md`.) It writes the ported test from
`testenv/testHdStDepthBias.cpp`.

## 7. Work breakdown

### Track B: translator

Files are proposed in `packages/usd/pxr/imaging/hgiWebGPU/glsl/`, owned by
track B. Track C's generator calls them through one function:

```
translate({stage, declarations, code, interface}) → {wgsl, diagnostics, nameMap}
```

| File | Content | Estimate |
|---|---|---|
| `preprocessor.ts` | Preprocessor and line mapping | ~600 |
| `lexer.ts`, `parser.ts`, `ast.ts` | GLSL 4.50 subset | ~2,000 |
| `builtins.ts`, `types.ts`, `checker.ts` | genType built-in table, overload resolution, conversions | ~1,500–2,000 |
| `lower.ts` | Section 3.3 | ~1,200 |
| `emit.ts` | WGSL emitter | ~800 |
| `prelude.wgsl.ts` | `mod`, `inverse`, packing helpers, macros | ~200 |
| Tests | Section-mode sweep over the 243 hdSt sections (and hdx, hdsi) under define sets; program mode on the captured depthBias and hull programs | |

Risks:

- semantic gaps found only in Safari;
- define-set coverage in section mode;
- nobody has ported this before, so there is no line-by-line oracle. The
  oracles are parse success, Safari compilation, and final images.

### Track C: Hgi + HgiWebGPU

Upstream sizes: hgi 8,353 lines (port as is); hgiMetal 10,605 and hgiVulkan
12,872 (models). Per-class needs are in section 4.1.

Estimate:

| Part | TypeScript lines |
|---|---|
| hgi | 3–4k (enums, types and descriptors dominate) |
| HgiWebGPU, without the translator | 5–7k |
| of which the shader generator and sections, including the post-tessellation emulation | ~2.5k |

Interfaces track C must expose for tracks B and E:

- the stage interface given to the translator (inputs, outputs, blocks, buffers
  and textures with binding slots);
- the capability bits in section 4.3;
- `await`-able completion and readback;
- per-draw indirect looping with vertex-buffer offsets.

Risks:

- the emulation's correctness (`patch_id`, quads, base offsets);
- the asynchronous divergence;
- the current hdSt's dependence on the existing `hgi` exports.

### Track E: code generator, Storm draw path, first image test

Upstream files (header + implementation lines). "TS today" is the current state
in typescript-usd.

| Area | Upstream files | Lines | TS today |
|---|---|---|---|
| glslfx | `hio/glslfx`, `glslfxConfig`, `glslfxResourceLayout` | 2,391 | none |
| Shaders and code generation | `hdSt/codeGen` 7,481; `resourceBinder` 2,627; `glslProgram` 710; `geometricShader` 675; `meshShaderKey` 767; `shaderKey` 413; `shaderCode` 396; `glslfxShader` 88; `renderPassShader` 497; `fallbackLightingShader` 140; `materialNetworkShader` 648; `package` 179 | 14,621 | rewrite (`codeGen.ts` 1,092) |
| Draw path | `pipelineDrawBatch` 2,246; `drawBatch` 798; `commandBuffer` 741; `renderPassState` 1,655; `renderPass` 446; `drawItem` 277; `drawItemInstance` 125; `hgiConversions` 487; `binding` 374; `resourceRegistry` 2,211; `bufferArrayRange` 201; `vboMemoryManager` 1,128; `vboSimpleMemoryManager` 859; `interleavedMemoryManager` 1,232; `bufferResource` 124 | 13,104 | partial/rewrite |
| Mesh | `mesh` 3,747; `meshTopology` 1,255; `quadrangulate` 916; `triangulate` 239; `smoothNormals` 559; `flatNormals` 589; `renderDelegate` 936; `renderBuffer` 430; `drawItemsCache` 337 | 9,008 | partial |
| Test harness | `hdSt/unitTestHelper` 1,401; `unitTestGLDrawing` 408; `hd/unitTestDelegate` 2,754; `hd/engine` 313 | 4,876 | none |
| Test | `testenv/testHdStDepthBias.cpp` 204 | | none |

The total is about 44k upstream lines on the path to the first image. Some of it
can reuse today's faithful pieces (hd change tracking, topology utilities,
texture registry).

Risks:

- size;
- the code-generator text depends on every upstream-faithful input (binder
  metadata, buffer specs, shader keys);
- `pipelineDrawBatch`'s GPU culling and indirect paths need the emulated
  multi-draw.

## 8. Is I-1 realistic as scoped?

| Bar | Assessment |
|---|---|
| 1. This plan | Delivered here, for adoption. |
| 2. Translator: every hdSt section parses; sections in real programs compile in Safari | Feasible. "Every section" needs the section mode with stated define sets. The 33 geometry and tessellation sections parse but cannot run. Real programs means the depthBias set first: 2 programs, 4 stage functions, about 3,080 GLSL lines. |
| 3. Hgi + HgiWebGPU | Feasible for the interface. The new design work is the post-tessellation emulation and the asynchronous divergence. |
| 4. One upstream image test in Safari | The critical path: it needs tracks B, C and the ~44k-line track E together. `testHdStBasicDrawing` additionally needs point expansion and curves. |
| 5. Asset report against today's renderer | Independent of B, C and E, and feasible. |

Recommendation: adopt I-1 with these cuts.

1. **Bar 4 target is `testHdStDepthBias`**, both images, at the section 6.3
   tolerance. Commit `testHdStBasicDrawing_lv0_hull` as a plain failing test.
   Its known gaps are points over 1 px and curves wire, until they pass.
2. **Bar 2 is stated per define set**, with geometry and tessellation sections
   reported as parse-only.
3. **Out of I-1:**
   - tessellation factors above 1 (refined curves, OpenSubdiv adaptive patches);
   - point expansion;
   - textures and Ptex;
   - MaterialX through the faithful path;
   - simple lighting and shadows;
   - hdx tasks and shaders (the depthBias driver needs none);
   - presentation to a canvas.
4. **Order:**
   1. Track C's interface and the glslfx parser.
   2. Translator section mode, alongside the code-generator text test against
      the `HDST_DUMP_SHADER_SOURCE` fixtures.
   3. HgiWebGPU with post-tessellation emulation.
   4. Program mode in Safari.
   5. The depthBias image.

   The asset-report baseline (bar 5) runs in parallel throughout.

## 9. Top risks

1. **Track E's size.** The first image needs the code generator, resource binder,
   buffer arrays and pipeline draw batch at upstream fidelity: about 44k
   upstream lines where today's hdSt is a rewrite. The code generator's output
   is only right when all its inputs are.
2. **Post-tessellation emulation.** WebGPU has no geometry or tessellation
   stage and no barycentrics, so every non-point mesh takes Storm's
   post-tessellation route (`meshShaderKey.cpp:278-292`). Emulating Metal's
   patch pipeline by vertex pulling has no upstream template. Errors show up as
   wrong primitive IDs, normals or patch coordinates.
3. **Translator semantics.** Real programs carry 23–74 overloaded names, implicit
   conversions, reference parameters, swizzle stores and derivative-uniformity
   violations. Safari rejects several of these outright (measured). A type
   checker is required, and the only full oracle is Safari plus the final
   image.
4. **Synchronous Hgi against asynchronous WebGPU.** Submission waits, readback
   and shader validity are synchronous upstream. The divergence must be designed
   once in HgiWebGPU, not patched in Storm.
5. **Parity and tooling.** WebKit's WGSL-to-MSL compiler and float16 readback
   may move pixels. Safari-only browser testing with `open -a Safari` makes
   iteration slow. `wgsl_reflect` is not yet a workspace dependency. Drawing
   without multi-draw-indirect loops in JavaScript, which matters for the asset
   report on large scenes.

## Appendix: reproduction

Scripts and outputs were kept outside the repository (`<build>` is the
OpenUSD 26.11.1 reference build):

```
python3 -I survey.py "$OPENUSD_SOURCE" glsl-survey.json
for t in depthBias:"testHdStDepthBias --offscreen" \
         basic_lv0_hull:"testHdStBasicDrawing --offscreen --repr hull --write testHdStBasicDrawing_lv0_hull.png"; do
  (cd native/${t%%:*} && TF_DEBUG="HDST_DUMP_SHADER_SOURCE HDST_DUMP_SHADER_SOURCEFILE" \
     DYLD_LIBRARY_PATH=<build>/lib <build>/tests/${t#*:} > stdout.txt)
done
python3 -I analyze_programs.py native/depthBias native/basic_lv0_hull > programs.json
python3 -I sections_used.py glsl-survey.json "$OPENUSD_SOURCE" native/depthBias native/basic_lv0_hull > sections-used.json
# Safari probe: python3 -I probe/server.py; open -a Safari http://127.0.0.1:8794/index.html
```

Limits of the method:

- Feature counts are lexical. They include matches inside inactive `#if`
  branches, and loop-update `++` that WGSL accepts.
- Section membership in captured programs is matched by line content, so it is
  approximate.
- Stage attribution follows section names.

## Decisions (November 4, 2026)

- **Scope:** the cut above is adopted. The first image test is `testHdStDepthBias`;
  tessellation above factor 1, point expansion, textures, MaterialX, lighting
  and hdx are deferred past I-1.
- **Module name:** the faithful port takes the upstream name now. It lives in
  `pxr/imaging/hdSt/` and is exported as `typescript-usd/hdSt`. Today's
  hand-written WebGPU Storm is renamed `pxr/imaging/hdStWgsl/` (export
  `typescript-usd/hdStWgsl`) and stays the viewer's default renderer until the
  faithful port does better on the asset-acceptance report. This replaces the
  `hdStFaithful` placeholder used above.
- **WGSL validation:** no new dependency and no home-grown WGSL parser.
  Translator output is checked by Safari's own WebGPU compiler
  (`createShaderModule` + `getCompilationInfo`) through a batch harness page,
  which is authoritative for what WebKit accepts. Node tests compare the
  translator's output against reviewed expected WGSL for small inputs.
- **The hand-written renderer is frozen (November 4, 2026).** `hdStWgsl`
  gets no further work, fixes included; imaging effort goes into the faithful
  `hdSt`. It remains the viewer's renderer only until the faithful port renders
  the asset-acceptance set at least as well (`apps/usdview/scripts/asset-acceptance/`),
  and is then deleted outright, with no long-lived switch between the two.

## Result: testHdStDepthBias in Safari (November 4, 2026)

`testHdStDepthBias` (`hdSt/testenv/testHdStDepthBias.cpp`) runs through the
ported Storm path (`pxr/imaging/hdSt`: HdUnitTestDelegate, render index,
HdStMesh, resource registry, HdSt_PipelineDrawBatch with GPU frustum
culling, HdSt_CodeGen) on HgiWebGPU with the GLSL-to-WGSL translator and the
emulated post-tessellation draw, in Safari 27.2 on the reference Mac.

- **Code generator text.** For both programs (frustum-cull compute; VS +
  post-tessellation VS + FS) the GLSL handed to Hgi is byte-identical to the
  reference build's `HDST_DUMP_SHADER_SOURCE` output under the reference
  device's capabilities, with no normalisation, both with hand-built inputs
  (`hdSt/tests/upstream/depthBiasCodegen.test.ts`) and through the real mesh
  sync (`depthBiasDriver.test.ts`). Fixtures: `hdSt/tests/fixtures/depthBiasCodegen`.
- **Images.** `testHdStDepthBias_disabled.png` and `_enabled.png` read back
  from the color AOV and quantised as `HioImage` writes PNGs are identical to
  the native captures (`hdSt/tests/fixtures/depthBiasImages`): maximum channel
  difference 0, 0 differing pixels, inside the section 6.3 tolerance. Run:
  `node tests/browser/storm-image/run.mjs --out <dir>` (opens Safari, stops its
  server). This is a browser test, separate from the Node suite.
- **Known differences.** On Metal the reference build draws through an
  indirect command buffer; HgiWebGPU has no multi-draw-indirect, so the
  batch takes upstream's per-draw path.
- **Scene index emulation (i2).** As in OpenUSD 26.11, `HdRenderIndex::New`
  now routes the HdUnitTestDelegate's prims through scene index emulation
  (HdLegacyPrimSceneIndex, HdLegacyGeomSubsetSceneIndex, HdMergingSceneIndex,
  HdSceneIndexAdapterSceneDelegate). The first-sync dirty bits now match the
  native captures (`hd/tests/upstream/unitTestDelegate.test.ts`), the
  generated programs are still byte-identical, and both images are still
  identical to the native captures (0 differing pixels).
