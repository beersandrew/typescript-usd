// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/indirectCommandEncoder.cpp,
//  pxr/imaging/hgi/indirectCommandEncoder.h
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/indirectCommandEncoder.{h,cpp} (OpenUSD 26.11.1).

import { HgiCmds } from './cmds.ts'
import type { HgiBufferHandle } from './buffer.ts'
import type { HgiComputeCmds } from './computeCmds.ts'
import type { HgiGraphicsCmds } from './graphicsCmds.ts'
import type { HgiGraphicsPipelineHandle } from './graphicsPipeline.ts'
import type {
  HgiResourceBindingsHandle,
  HgiVertexBufferBindingVector,
} from './resourceBindings.ts'

/** indirectCommandEncoder.h:25-41: base indirect command structure. */
export class HgiIndirectCommands {
  constructor(
    public drawCount: number,
    public graphicsPipeline: HgiGraphicsPipelineHandle,
    public resourceBindings: HgiResourceBindingsHandle,
  ) {}
}
/** indirectCommandEncoder.h:43 */
export type HgiIndirectCommandsUniquePtr = HgiIndirectCommands

/** indirectCommandEncoder.h:56-106. The indirect command encoder is used to
 *  record the drawing primitives for a batch and is capable of encoding
 *  them into an indirect buffer. */
export abstract class HgiIndirectCommandEncoder extends HgiCmds {
  /** indirectCommandEncoder.cpp:12 */
  protected constructor() {
    super()
  }

  /** indirectCommandEncoder.h:66-74 */
  abstract encodeDraw(
    computeCmds: HgiComputeCmds,
    pipeline: HgiGraphicsPipelineHandle,
    resourceBindings: HgiResourceBindingsHandle,
    vertexBindings: HgiVertexBufferBindingVector,
    drawParameterBuffer: HgiBufferHandle,
    drawBufferByteOffset: number,
    drawCount: number,
    stride: number): HgiIndirectCommandsUniquePtr

  /** indirectCommandEncoder.h:80-90 */
  abstract encodeDrawIndexed(
    computeCmds: HgiComputeCmds,
    pipeline: HgiGraphicsPipelineHandle,
    resourceBindings: HgiResourceBindingsHandle,
    vertexBindings: HgiVertexBufferBindingVector,
    indexBuffer: HgiBufferHandle,
    drawParameterBuffer: HgiBufferHandle,
    drawBufferByteOffset: number,
    drawCount: number,
    stride: number,
    patchBaseVertexByteOffset: number): HgiIndirectCommandsUniquePtr

  /** indirectCommandEncoder.h:95-97 */
  abstract executeDraw(
    gfxCmds: HgiGraphicsCmds,
    commands: HgiIndirectCommands): void
}
