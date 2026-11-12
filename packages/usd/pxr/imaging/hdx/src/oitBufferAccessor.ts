// Ported from OpenUSD 26.11.1: pxr/imaging/hdx/oitBufferAccessor.cpp,
//  pxr/imaging/hdx/oitBufferAccessor.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hdx/oitBufferAccessor.{h,cpp} (OpenUSD 26.11.1).
//
// Divergences:
// - The task context's VtValues are the held objects (HdTaskContext is a
//   Map); a missing entry is undefined.
// - HDX_ENABLE_OIT / HDX_ENABLE_OIT_PACKED_DATA are TfEnvSettings read from
//   the environment where one exists (the browser has none: their
//   defaults).

import { TfEnvSetting, TfGetEnvSetting } from 'typescript-usd/tf'
import type { BufferArrayRange as HdBufferArrayRange, TaskContext as HdTaskContext } from 'typescript-usd/hd'
import { HgiShaderStageBits, type Hgi } from 'typescript-usd/hgi'
import {
  BindingRequest as HdStBindingRequest,
  BindingType as HdStBindingType,
  type RenderPassShader as HdStRenderPassShader,
} from 'typescript-usd/hdSt'
import { HdxTokens } from './tokens.ts'
import { TF_CODING_ERROR } from './tfDiagnostic.ts'

/** oitBufferAccessor.cpp:21-22 */
const HDX_ENABLE_OIT = new TfEnvSetting<boolean>('HDX_ENABLE_OIT', true,
  'Enable order independent translucency')

/** oitBufferAccessor.cpp:24-27 */
const HDX_ENABLE_OIT_PACKED_DATA = new TfEnvSetting<boolean>('HDX_ENABLE_OIT_PACKED_DATA', false,
  'Pack color, transmission and depth into smaller ' +
  'buffers, trading accuracy for memory.')

/** The members of HdStBufferArrayRange / HdStBufferResource used here. */
interface _StBar extends HdBufferArrayRange {
  getResource(name?: string): { getHandle(): unknown } | null
}

/** oitBufferAccessor.h:30-64. Class for OIT render tasks to access the OIT
 *  buffers. */
export class HdxOitBufferAccessor {
  /** oitBufferAccessor.cpp:29-34 */
  static isOitEnabled(): boolean {
    return TfGetEnvSetting(HDX_ENABLE_OIT)
  }

  /** oitBufferAccessor.cpp:36-41. This method helps improve the footprint
   *  of the OIT buffers by packing the color, transmission and depth into
   *  smaller buffers. This compression results in a 4x reduction in the
   *  memory footprint of the OIT buffers at the cost of accuracy. */
  static isOitPackedDepthEnabled(): boolean {
    return TfGetEnvSetting(HDX_ENABLE_OIT_PACKED_DATA)
  }

  /** oitBufferAccessor.cpp:43-46 */
  constructor(private readonly _ctx: HdTaskContext) {}

  /** oitBufferAccessor.cpp:48-52 */
  requestOitBuffers(): void {
    this._ctx.set(HdxTokens.oitRequestFlag, true)
  }

  /** oitBufferAccessor.cpp:54-65 */
  private _getBar(name: string): HdBufferArrayRange | null {
    const v = this._ctx.get(name)
    return (v as HdBufferArrayRange | undefined) ?? null
  }

  /** oitBufferAccessor.cpp:67-123 */
  addOitBufferBindings(shader: HdStRenderPassShader): boolean {
    const counterBar = this._getBar(HdxTokens.oitCounterBufferBar)
    const dataBar = this._getBar(HdxTokens.oitDataBufferBar)
    const jointBar = this._getBar(HdxTokens.oitJointBufferBar)
    const uniformBar = this._getBar(HdxTokens.oitUniformBar)

    if (counterBar && dataBar && jointBar && uniformBar) {
      shader.addBufferBinding(
        new HdStBindingRequest(HdStBindingType.SSBO,
          HdxTokens.oitCounterBufferBar,
          counterBar,
          /*interleave = */ false,
          /*writable = */ true,
          /*arraySize = */ 0,
          /*concatenateNames = */ false,
          /*visibility = */ HgiShaderStageBits.HgiShaderStageFragment))

      shader.addBufferBinding(
        new HdStBindingRequest(HdStBindingType.SSBO,
          HdxTokens.oitDataBufferBar,
          dataBar,
          /*interleave = */ false,
          /*writable = */ true,
          /*arraySize = */ 0,
          /*concatenateNames = */ false,
          /*visibility = */ HgiShaderStageBits.HgiShaderStageFragment))

      shader.addBufferBinding(
        new HdStBindingRequest(HdStBindingType.SSBO,
          HdxTokens.oitJointBufferBar,
          jointBar,
          /*interleave = */ true,
          /*writable = */ true,
          /*arraySize = */ 0,
          /*concatenateNames = */ false,
          /*visibility = */ HgiShaderStageBits.HgiShaderStageFragment))

      shader.addBufferBinding(
        new HdStBindingRequest(HdStBindingType.UBO,
          HdxTokens.oitUniformBar,
          uniformBar,
          /*interleave = */ true))
      return true
    } else {
      shader.removeBufferBinding(HdxTokens.oitCounterBufferBar)
      shader.removeBufferBinding(HdxTokens.oitDataBufferBar)
      shader.removeBufferBinding(HdxTokens.oitJointBufferBar)
      shader.removeBufferBinding(HdxTokens.oitUniformBar)
      return false
    }
  }

  /** oitBufferAccessor.cpp:125-172 */
  initializeOitBuffersIfNecessary(hgi: Hgi): void {
    // If the OIT buffers were already cleared earlier, skip and do not
    // clear them again.
    if (this._ctx.get(HdxTokens.oitClearedFlag) !== undefined) {
      return
    }

    // Mark OIT buffers as cleared.
    this._ctx.set(HdxTokens.oitClearedFlag, true)

    // Clear counter buffer.

    // The shader determines what elements in each buffer are used based on
    // finding -1 in the counter buffer. We can skip clearing the other buffers.

    const stCounterBar = this._getBar(HdxTokens.oitCounterBufferBar) as _StBar | null

    if (!stCounterBar || typeof stCounterBar.getResource !== 'function') {
      TF_CODING_ERROR(
        'No OIT counter buffer allocateed when trying to clear it')
      return
    }

    const stCounterResource = stCounterBar.getResource(HdxTokens.hdxOitCounterBuffer)

    // We want to fill the buffer with int -1 but the FillBuffer interface
    // supports uint8_t (due to a limitation in the Metal API which we can later
    // revisit to find a workaround). A buffer filled with uint8_t 0xff is the
    // same as a buffer filled with int 0xffffffff.
    const clearCounter = 0xff

    const blitCmds = hgi.createBlitCmds()
    blitCmds.pushDebugGroup('Clear OIT buffers')
    blitCmds.fillBuffer(stCounterResource!.getHandle() as never, clearCounter)
    blitCmds.popDebugGroup()
    void hgi.submitCmds(blitCmds)
  }
}
