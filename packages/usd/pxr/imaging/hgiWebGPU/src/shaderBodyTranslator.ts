// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderGenerator.mm,
//  pxr/imaging/hgiVulkan/shaderGenerator.cpp,
//  pxr/imaging/hgiVulkan/shaderSection.cpp
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The seam between HgiWebGPUShaderGenerator and a translator of shader
// bodies into WGSL.
//
// Upstream, a backend's shader generator wraps the GLSL body of an
// HgiShaderFunctionDesc in declarations its compiler understands: hgiVulkan
// prepends GLSL declarations (hgiVulkan/shaderGenerator.cpp:561-619) and
// hgiMetal turns the body into a member function of a scope struct whose
// prelude #defines GLSL types and builtins as MSL
// (hgiMetal/shaderGenerator.mm:415-635, 1464-1657). WGSL has no preprocessor
// and a different syntax, so the body itself has to be translated. That
// translation is a separate piece of work; the generator calls it through
// this interface and declares, from the descriptor, every module-scope name
// the body may use (listed in `globals`).
//
// Contract for a translation:
// - `code` must define `fn main()` (no parameters, no result). The generated
//   entry point (vertexEntryPoint / fragmentEntryPoint / computeEntryPoint)
//   copies the stage inputs into the module-scope variables, calls main(),
//   then copies the outputs out, as hgiMetal's entry point calls the scope's
//   main() (shaderGenerator.mm:1646-1656).
// - Stage inputs/outputs, constant parameters and global members are
//   module-scope `var<private>` variables named as in the descriptor
//   (nameInShader), with the WGSL types in `globals`. Interstage blocks are a
//   module-scope struct instance named by the block's instanceName.
// - Buffers are module-scope bindings named nameInShader. Textures are reached
//   through the generated accessors HgiGet_<name>, HgiGetSize_<name>,
//   HgiTextureLod_<name>, HgiTexelFetch_<name> and HgiSet_<name> (the names
//   hgiVulkan/shaderSection.cpp:319-435 defines), or directly as
//   textureBind_<name> / samplerBind_<name>.
// - `declarations` is emitted where the descriptor's shaderCodeDeclarations
//   would be (hgiVulkan/shaderGenerator.cpp:573).

import type { HgiShaderFunctionDesc, HgiShaderStage } from 'typescript-usd/hgi'

/** A module-scope name the generated WGSL declares for the body. */
export interface HgiWebGPUShaderGlobal {
  /** The name the body uses (nameInShader, block instance name, or the
   *  generated accessor name for a texture). */
  name: string
  /** The WGSL type of the declaration ('' for texture accessors). */
  wgslType: string
  kind: 'stageInput' | 'stageOutput' | 'constantParam' | 'globalMember' |
    'interstageBlock' | 'buffer' | 'texture'
  /** For a writable buffer the generator binds read-only (vertex stages). */
  readOnly?: boolean
}

export interface HgiWebGPUShaderBodyTranslatorInput {
  stage: HgiShaderStage
  /** descriptor.shaderCodeDeclarations, or '' */
  declarations: string
  /** descriptor.shaderCode, or '' */
  code: string
  descriptor: HgiShaderFunctionDesc
  globals: readonly HgiWebGPUShaderGlobal[]
}

export interface HgiWebGPUShaderBodyTranslation {
  declarations: string
  code: string
  /** Translation errors; a non-empty string makes the shader function
   *  invalid, reported through HgiShaderFunction::GetCompileErrors. */
  errors: string
  /** The globals the body writes (assigns, passes as out/inout arguments or
   *  updates atomically) anywhere in its code; absent when the translator
   *  does not know, and then every writable buffer stays read_write. */
  writtenGlobals?: readonly string[]
}

export interface HgiWebGPUShaderBodyTranslator {
  Translate(input: HgiWebGPUShaderBodyTranslatorInput): HgiWebGPUShaderBodyTranslation
}

/** The translator HgiWebGPU starts with: shader bodies are taken to be WGSL
 *  already and pass through unchanged. */
export const HgiWebGPUWgslPassThroughTranslator: HgiWebGPUShaderBodyTranslator = {
  Translate(input) {
    return { declarations: input.declarations, code: input.code, errors: '' }
  },
}
