// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/capabilities.cpp,
//  pxr/imaging/hgi/capabilities.h
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/capabilities.{h,cpp} (OpenUSD 26.11.1).

import type { HgiDeviceCapabilities } from './enums.ts'

/** capabilities.h:22-99. Reports the capabilities of the Hgi device. */
export abstract class HgiCapabilities {
  protected _maxUniformBlockSize = 0
  protected _maxShaderStorageBlockSize = 0
  protected _uniformBufferOffsetAlignment = 0
  protected _maxClipDistances = 0
  protected _pageSizeAlignment = 1
  protected _maxSamplersPerShaderStage = 0

  private _flags: HgiDeviceCapabilities = 0

  /** capabilities.h:69-77 */
  protected constructor() {}

  /** capabilities.h:28-30 */
  isSet(mask: HgiDeviceCapabilities): boolean {
    return (this._flags & mask) !== 0
  }

  /** capabilities.h:33 */
  abstract getAPIVersion(): number

  /** capabilities.h:36 */
  abstract getShaderVersion(): number

  /** capabilities.h:39-41 */
  getMaxUniformBlockSize(): number {
    return this._maxUniformBlockSize
  }

  /** capabilities.h:44-46 */
  getMaxShaderStorageBlockSize(): number {
    return this._maxShaderStorageBlockSize
  }

  /** capabilities.h:49-51 */
  getUniformBufferOffsetAlignment(): number {
    return this._uniformBufferOffsetAlignment
  }

  /** capabilities.h:54-56 */
  getMaxClipDistances(): number {
    return this._maxClipDistances
  }

  /** capabilities.h:59-61 */
  getPageSizeAlignment(): number {
    return this._pageSizeAlignment
  }

  /** capabilities.h:64-66 */
  getMaxSamplersPerShaderStage(): number {
    return this._maxSamplersPerShaderStage
  }

  /** capabilities.h:79-85 */
  protected _setFlag(mask: HgiDeviceCapabilities, value: boolean): void {
    if (value) {
      this._flags |= mask
    } else {
      this._flags &= ~mask
    }
  }
}
