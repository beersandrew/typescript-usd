// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/computeCmds.cpp,
//  pxr/imaging/hgi/computeCmds.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/computeCmds.{h,cpp} (OpenUSD 26.11.1).

import type { Vec4f as GfVec4f } from 'typescript-usd/gf'
import { HgiCmds } from './cmds.ts'
import type { HgiComputeDispatch, HgiMemoryBarrier } from './enums.ts'
import type { HgiCpuData } from './buffer.ts'
import type { HgiComputePipelineHandle } from './computePipeline.ts'
import type { HgiResourceBindingsHandle } from './resourceBindings.ts'

/** computeCmds.h:28-98. A graphics API independent abstraction of compute
 *  commands. */
export abstract class HgiComputeCmds extends HgiCmds {
  /** computeCmds.cpp:11 */
  protected constructor() {
    super()
  }

  /** computeCmds.h:36-37 */
  abstract pushDebugGroup(label: string, color?: GfVec4f): void
  /** computeCmds.h:41 */
  abstract popDebugGroup(): void
  /** computeCmds.h:45-47 */
  abstract insertDebugMarker(label: string, color?: GfVec4f): void
  /** computeCmds.h:54 */
  abstract bindPipeline(pipeline: HgiComputePipelineHandle): void
  /** computeCmds.h:60 */
  abstract bindResources(resources: HgiResourceBindingsHandle): void
  /** computeCmds.h:71-75 */
  abstract setConstantValues(
    pipeline: HgiComputePipelineHandle,
    bindIndex: number,
    byteSize: number,
    data: HgiCpuData): void
  /** computeCmds.h:80 */
  abstract Dispatch(dimX: number, dimY: number): void
  /** computeCmds.h:85 */
  abstract insertMemoryBarrier(barrier: HgiMemoryBarrier): void
  /** computeCmds.h:89 */
  abstract getDispatchMethod(): HgiComputeDispatch
}

/** computeCmds.h:19 */
export type HgiComputeCmdsUniquePtr = HgiComputeCmds
