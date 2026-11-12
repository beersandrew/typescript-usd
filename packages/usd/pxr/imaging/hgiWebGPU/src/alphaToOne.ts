// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/renderPassState.cpp,
//  pxr/imaging/hgiMetal/graphicsPipeline.mm
// Copyright 2016, 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// HgiMultiSampleState::alphaToOneEnable on WebGPU.
//
// hgiMetal/graphicsPipeline.mm:304-315 turns alphaToCoverageEnable and
// alphaToOneEnable into MTLRenderPipelineDescriptor.alphaToCoverageEnabled
// and .alphaToOneEnabled; HdStRenderPassState::_InitMultiSampleState
// (hdSt/renderPassState.cpp:1210-1220) always asks for both together. With
// alpha to one, the samples alpha to coverage keeps store an alpha of 1
// (the alpha of every color attachment is forced to the largest value
// after the coverage is taken from the first attachment's alpha).
//
// WebGPU has alpha to coverage (GPUMultisampleState.alphaToCoverageEnabled)
// but no alpha to one, and the stored alpha of a covered sample is always
// the fragment's alpha. So a fragment function of a pipeline that asks for
// both is generated as a variant (HgiWebGPUShaderGeneratorOptions.alphaToOne)
// whose entry point takes the coverage from the first color output's alpha
// itself, writes it as the fragment's sample_mask (ANDed with a sample mask
// the shader writes), and then sets the alpha of its float color outputs
// to 1; the pipeline then leaves WebGPU's alpha to coverage off (WebGPU
// rejects it with a sample_mask output anyway). This also gives alpha to
// coverage to fragment functions that write a sample mask (Storm's points),
// which WebGPU's alpha to coverage cannot (graphicsPipeline.ts).
//
// The coverage is the reference platform's: Metal's alpha to coverage on
// the Apple GPUs the native captures come from (and that WebGPU's alpha to
// coverage uses under Safari), measured there at 4 samples, the only
// multisample count WebGPU has. The alpha is clamped and quantized to 8
// bits, a8 = floor(255 a + 0.5); level = (a8 + 8) >> 4 (0..16) is spread
// over each 2x2 pixel quad in the order (0,0), (1,1), (1,0), (0,1) of the
// framebuffer coordinate's low bits, one sample per pixel per 4 levels:
// a pixel of rank r covers (level + 3 - r) / 4 samples; its covered samples
// are, by count, {0}, {0,3}, {0,1,3}, {0,1,2,3}. (For example, alpha 0.5
// covers 2 of 4 samples of every pixel.) WebGPU's alpha to coverage under
// Safari gives these masks for every alpha k/4096.

import { HgiStringStream } from 'typescript-usd/hgi'
import { HgiWebGPUShaderSection } from './shaderSection.ts'

/** The WGSL of the coverage mask (see above). */
const _maskFunction =
  'fn hgi_AlphaToCoverageMask(alpha: f32, fragCoord: vec2<f32>) -> u32 {\n' +
  '  let level = (u32(floor(clamp(alpha, 0.0, 1.0) * 255.0 + 0.5)) + 8u) >> 4u;\n' +
  '  let p = vec2<u32>(fragCoord) & vec2<u32>(1u, 1u);\n' +
  '  var rank = array<u32, 4>(0u, 2u, 3u, 1u);\n' +
  '  var masks = array<u32, 5>(0x0u, 0x1u, 0x9u, 0xBu, 0xFu);\n' +
  '  return masks[(level + 3u - rank[p.x + 2u * p.y]) / 4u];\n' +
  '}\n'

/** The entry point I/O of a fragment function the variant reads and
 *  writes, found by HgiWebGPUShaderGenerator among its stage I/O. */
export interface HgiWebGPUAlphaToOneIO {
  /** The entry point's input struct instance. */
  inputs: string
  /** The input struct member holding @builtin(position), or null when the
   *  function has none (the section declares one). */
  fragCoord: string | null
  /** The output struct member holding @builtin(sample_mask), or null when
   *  the function writes none (the section declares one). */
  sampleMask: string | null
  /** The output struct member at @location(0): the alpha the coverage is
   *  taken from. */
  firstColor: string
  /** The output struct members of the float color outputs whose alpha is
   *  set to 1. */
  colors: readonly string[]
}

/** Emits the coverage and alpha-to-one statements at the end of the
 *  fragment entry point (after every other output is copied out). */
export class HgiWebGPUAlphaToOneShaderSection extends HgiWebGPUShaderSection {
  constructor(private readonly _io: HgiWebGPUAlphaToOneIO) {
    super('hgi_alphaToOne')
  }

  override visitGlobalFunctionDefinitions(ss: HgiStringStream): boolean {
    ss.write(_maskFunction)
    return true
  }

  override visitEntryPointInputs(ss: HgiStringStream): boolean {
    if (this._io.fragCoord !== null) return false
    ss.write('  @builtin(position) hgi_alphaToCoverageFragCoord: vec4<f32>,\n')
    return true
  }

  override visitEntryPointOutputs(ss: HgiStringStream): boolean {
    if (this._io.sampleMask !== null) return false
    ss.write('  @builtin(sample_mask) hgi_alphaToCoverageMask: u32,\n')
    return true
  }

  override visitEntryPointOutputExecutions(ss: HgiStringStream, outputs: string): boolean {
    const io = this._io
    const fragCoord = `${io.inputs}.${io.fragCoord ?? 'hgi_alphaToCoverageFragCoord'}`
    const coverage = `hgi_AlphaToCoverageMask(${outputs}.${io.firstColor}.a, ${fragCoord}.xy)`
    if (io.sampleMask !== null) {
      ss.write('  ', outputs, '.', io.sampleMask, ' = ', outputs, '.', io.sampleMask, ' & ', coverage, ';\n')
    } else {
      ss.write('  ', outputs, '.hgi_alphaToCoverageMask = ', coverage, ';\n')
    }
    for (const color of io.colors) {
      ss.write('  ', outputs, '.', color, '.a = 1.0;\n')
    }
    return true
  }
}
