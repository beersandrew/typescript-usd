// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/graphicsCmds.cpp,
//  pxr/imaging/hgi/graphicsCmds.h
// Copyright 2019 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/graphicsCmds.{h,cpp} (OpenUSD 26.11.1).

import type { Vec4f as GfVec4f, Vec4i as GfVec4i } from 'typescript-usd/gf'
import { HgiCmds } from './cmds.ts'
import type { HgiMemoryBarrier, HgiShaderStage } from './enums.ts'
import type { HgiBufferHandle, HgiCpuData } from './buffer.ts'
import type { HgiGraphicsPipelineHandle } from './graphicsPipeline.ts'
import type {
  HgiResourceBindingsHandle,
  HgiVertexBufferBindingVector,
} from './resourceBindings.ts'

/** graphicsCmds.h:30-203. A graphics API independent abstraction of graphics
 *  commands. */
export abstract class HgiGraphicsCmds extends HgiCmds {
  /** graphicsCmds.cpp:11 */
  protected constructor() {
    super()
  }

  /** graphicsCmds.h:38-39 */
  abstract pushDebugGroup(label: string, color?: GfVec4f): void
  /** graphicsCmds.h:43 */
  abstract popDebugGroup(): void
  /** graphicsCmds.h:47-49 */
  abstract insertDebugMarker(label: string, color?: GfVec4f): void
  /** graphicsCmds.h:53 */
  abstract setViewport(vp: GfVec4i): void
  /** graphicsCmds.h:58 */
  abstract setScissor(sc: GfVec4i): void
  /** graphicsCmds.h:65 */
  abstract bindPipeline(pipeline: HgiGraphicsPipelineHandle): void
  /** graphicsCmds.h:71 */
  abstract bindResources(resources: HgiResourceBindingsHandle): void
  /** graphicsCmds.h:84-89 */
  abstract setConstantValues(
    pipeline: HgiGraphicsPipelineHandle,
    stages: HgiShaderStage,
    bindIndex: number,
    byteSize: number,
    data: HgiCpuData): void
  /** graphicsCmds.h:93-94 */
  abstract bindVertexBuffers(bindings: HgiVertexBufferBindingVector): void
  /** graphicsCmds.h:105-109 */
  abstract draw(
    vertexCount: number,
    baseVertex: number,
    instanceCount: number,
    baseInstance: number): void
  /** graphicsCmds.h:126-130 */
  abstract drawIndirect(
    drawParameterBuffer: HgiBufferHandle,
    drawBufferByteOffset: number,
    drawCount: number,
    stride: number): void
  /** graphicsCmds.h:144-150 */
  abstract drawIndexed(
    indexBuffer: HgiBufferHandle,
    indexCount: number,
    indexBufferByteOffset: number,
    baseVertex: number,
    instanceCount: number,
    baseInstance: number): void
  /** graphicsCmds.h:182-189 */
  abstract drawIndexedIndirect(
    indexBuffer: HgiBufferHandle,
    drawParameterBuffer: HgiBufferHandle,
    drawBufferByteOffset: number,
    drawCount: number,
    stride: number,
    drawParameterBufferUInt32: readonly number[],
    patchBaseVertexByteOffset: number): void
  /** graphicsCmds.h:194 */
  abstract insertMemoryBarrier(barrier: HgiMemoryBarrier): void
}

/** graphicsCmds.h:21 */
export type HgiGraphicsCmdsUniquePtr = HgiGraphicsCmds
