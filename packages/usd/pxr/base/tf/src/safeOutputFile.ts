// Ported from OpenUSD 26.11.1: pxr/base/tf/safeOutputFile.cpp,
//  pxr/base/tf/safeOutputFile.h
// Copyright 2017 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// TfSafeOutputFile, ported from OpenUSD v26.08 pxr/base/tf/safeOutputFile.h:23-91
// and safeOutputFile.cpp:27-133. Replace writes a sibling temporary
// (TfAtomicOfstreamWrapper) renamed over the target by Close; Update opens the
// existing file in place ("rb+") and Close only closes it. JavaScript has no
// destructors, so the destructor's Close runs from Dispose() /
// [Symbol.asyncDispose] (`await using`). Writes are buffered and reach the
// file when it is closed.

import { TfAtomicOfstreamWrapper } from './atomicOfstreamWrapper.ts'
import { TfDiagnosticMgr, TfDiagnosticType, TfError } from './diagnostic.ts'

interface NodeUpdateHandle {
  write(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesWritten: number }>
  close(): Promise<void>
}

async function openForUpdate(path: string): Promise<NodeUpdateHandle> {
  const specifier = `${['node', 'fs'].join(':')}/promises`
  const fs = await import(/* @vite-ignore */ specifier) as unknown as {
    open(path: string, flags: string): Promise<NodeUpdateHandle>
  }
  return fs.open(path, 'r+')
}

/** The stream Get() returns: FILE * writes, buffered until close. */
export interface TfSafeOutputFileStream {
  write(data: Uint8Array | string): void
  isOpen(): boolean
}

/**
 * The FILE * of a file opened for update: positioned writes (fseek with
 * SEEK_SET via Seek) into the existing file, which keeps every byte not
 * written. Close flushes and closes it.
 */
export class TfSafeOutputFileUpdateStream implements TfSafeOutputFileStream {
  #handle: NodeUpdateHandle | undefined
  #position = 0
  #pending: Array<{ position: number, bytes: Uint8Array }> = []

  /** @internal */
  constructor(handle: NodeUpdateHandle) { this.#handle = handle }

  write(data: Uint8Array | string): void {
    if (!this.#handle) return
    // fwrite copies the caller's bytes into the FILE buffer at the call, so
    // a buffer the caller reuses afterwards does not change the file.
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data.slice()
    this.#pending.push({ position: this.#position, bytes })
    this.#position += bytes.length
  }
  seek(position: number): void { this.#position = position }
  tell(): number { return this.#position }
  isOpen(): boolean { return this.#handle !== undefined }

  async flush(): Promise<void> {
    const handle = this.#handle
    if (!handle) return
    for (const { position, bytes } of this.#pending.splice(0)) {
      for (let offset = 0; offset < bytes.length;) {
        const { bytesWritten } = await handle.write(bytes, offset, bytes.length - offset, position + offset)
        offset += bytesWritten
      }
    }
  }

  // fclose
  async close(): Promise<void> {
    const handle = this.#handle
    if (!handle) return
    try {
      await this.flush()
    } finally {
      this.#handle = undefined
      await handle.close()
    }
  }
}

export class TfSafeOutputFile {
  // safeOutputFile.h:86-88: _file is the update stream or the temporary's
  // wrapper; _tempFileName is non-empty exactly when replacing.
  #update: TfSafeOutputFileUpdateStream | undefined
  #replace: TfAtomicOfstreamWrapper | undefined
  #targetFileName = ''

  private constructor() {}

  // safeOutputFile.cpp:96-109
  static async update(fileName: string): Promise<TfSafeOutputFile | undefined> {
    const result = new TfSafeOutputFile()
    result.#targetFileName = fileName
    try {
      result.#update = new TfSafeOutputFileUpdateStream(await openForUpdate(fileName))
    } catch {
      TfDiagnosticMgr.GetInstance().postError(new TfError(`Unable to open file '${fileName}' for writing`))
      return undefined
    }
    return result
  }

  // safeOutputFile.cpp:111-133
  static async Replace(fileName: string): Promise<TfSafeOutputFile | undefined> {
    const wrapper = new TfAtomicOfstreamWrapper(fileName)
    const error = { value: '' }
    if (!await wrapper.Open(error)) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(error.value))
      return undefined
    }
    const result = new TfSafeOutputFile()
    result.#targetFileName = fileName
    result.#replace = wrapper
    return result
  }

  // safeOutputFile.h:74
  Get(): TfSafeOutputFileStream | undefined {
    return this.#update ?? this.#replace?.getStream()
  }

  // safeOutputFile.cpp:32-36
  isOpenForUpdate(): boolean { return this.#update !== undefined }

  // safeOutputFile.cpp:38-51: the caller takes ownership and closes it.
  releaseUpdatedFile(): TfSafeOutputFileUpdateStream | undefined {
    if (!this.isOpenForUpdate()) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        'Invalid output file (failed to open, or opened for replace)', TfDiagnosticType.CodingError))
      return undefined
    }
    const ret = this.#update
    this.#update = undefined
    this.#targetFileName = ''
    return ret
  }

  // safeOutputFile.cpp:53-74
  async close(): Promise<void> {
    const update = this.#update
    if (update) {
      this.#update = undefined
      this.#targetFileName = ''
      await update.close()
      return
    }
    const replace = this.#replace
    if (!replace) return
    this.#replace = undefined
    const error = { value: '' }
    if (!await replace.commit(error)) TfDiagnosticMgr.GetInstance().postError(new TfError(error.value))
    this.#targetFileName = ''
  }

  // safeOutputFile.cpp:76-94
  async discard(): Promise<void> {
    if (this.isOpenForUpdate()) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        'Invalid output file (failed to open, or opened for update)', TfDiagnosticType.CodingError))
      return
    }
    const replace = this.#replace
    this.#replace = undefined
    this.#targetFileName = ''
    if (replace) await replace.cancel()
  }

  // safeOutputFile.cpp:27-30
  async dispose(): Promise<void> { await this.close() }
  async [Symbol.asyncDispose](): Promise<void> { await this.close() }
}
