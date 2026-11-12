// Ported from OpenUSD 26.11.1: pxr/base/tf/atomicOfstreamWrapper.cpp,
//  pxr/base/tf/atomicOfstreamWrapper.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Async filesystem adaptation of OpenUSD v26.08
// pxr/base/tf/atomicOfstreamWrapper.{h,cpp}. The sibling temporary is renamed
// over the destination only at Commit; Cancel removes it. JavaScript has no
// destructors, so the destructor's Cancel (atomicOfstreamWrapper.cpp:43-46)
// runs from Dispose() / [Symbol.asyncDispose] (`await using`).
interface NodeHandle {
  writeFile(data: Uint8Array | string): Promise<void>
  close(): Promise<void>
}
let serial = 0
interface NodeFsPromises {
  open(path: string, flags: string): Promise<NodeHandle>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  realpath(path: string): Promise<string>
  stat(path: string): Promise<{ mode: number }>
  chmod(path: string, mode: number): Promise<void>
}
async function fsPromises(): Promise<NodeFsPromises> {
  const specifier = `${['node', 'fs'].join(':')}/promises`
  return import(/* @vite-ignore */ specifier) as unknown as Promise<NodeFsPromises>
}

// TfRealPath(fileName, allowInaccessibleSuffix = true) as
// atomicRenameUtil.cpp:207-215 uses it: symlinks resolve so the temporary is
// written beside the real file; a missing final component is kept.
async function realFilePath(fs: NodeFsPromises, fileName: string): Promise<string> {
  try { return await fs.realpath(fileName) } catch { /* inaccessible suffix */ }
  const separator = fileName.lastIndexOf('/')
  const dir = separator < 0 ? '.' : fileName.slice(0, separator) || '/'
  return `${await fs.realpath(dir)}/${fileName.slice(separator + 1)}`
}

// atomicRenameUtil.cpp:162-181: DEFFILEMODE (0666) masked by an existing
// target's mode, or else by the process umask.
async function renameMode(fs: NodeFsPromises, dstFileName: string): Promise<number> {
  try { return (await fs.stat(dstFileName)).mode & 0o666 } catch { /* new file */ }
  const runtime = globalThis as unknown as { process?: { umask?: () => number } }
  const mask = typeof runtime.process?.umask === 'function' ? runtime.process.umask() : 0o022
  return 0o666 & ~mask
}

/** The `std::string *reason` out-parameter of Open, Commit and Cancel. */
export interface TfAtomicOfstreamReason { value: string }

const errorText = (error: unknown): string => error instanceof Error ? error.message : String(error)

export class TfAtomicOfstreamWrapper {
  #handle: NodeHandle | undefined
  #temporary = ''
  #target = ''
  #chunks: Array<Uint8Array | string> = []
  constructor(readonly filePath: string) {}
  // atomicOfstreamWrapper.cpp:48-87
  async Open(reason?: TfAtomicOfstreamReason): Promise<boolean> {
    if (this.#handle) {
      if (reason) reason.value = 'Stream is already open'
      return false
    }
    // atomicRenameUtil.cpp:202-205
    if (!this.filePath) {
      if (reason) reason.value = 'Empty fileName'
      return false
    }
    const fs = await fsPromises().catch(() => undefined)
    if (!fs) {
      if (reason) reason.value = `Unable to open '${this.filePath}' for writing: no filesystem`
      return false
    }
    const target = await realFilePath(fs, this.filePath).catch((error: unknown) => {
      // atomicRenameUtil.cpp:216-221
      if (reason) reason.value = `Unable to determine the real path for '${this.filePath}': ${errorText(error)}`
      return undefined
    })
    if (target === undefined) return false
    const temporary = `${target}.tmp.${Date.now()}.${serial++}`
    try {
      this.#handle = await fs.open(temporary, 'wx')
      this.#temporary = temporary
      this.#target = target
      return true
    } catch (error) {
      // atomicRenameUtil.cpp:259-264
      if (reason) reason.value = `Unable to create temporary file '${temporary}': ${errorText(error)}`
      return false
    }
  }
  getStream(): { write: (data: Uint8Array | string) => void, isOpen: () => boolean } {
    return {
      // std::ofstream::write copies the caller's bytes into the stream at
      // the call (atomicOfstreamWrapper.h:93 GetStream), so a buffer the
      // caller reuses afterwards does not change what is committed.
      write: data => { if (this.#handle) this.#chunks.push(typeof data === 'string' ? data : data.slice()) },
      isOpen: () => this.#handle !== undefined,
    }
  }
  // atomicOfstreamWrapper.cpp:89-106
  async commit(reason?: TfAtomicOfstreamReason): Promise<boolean> {
    const handle = this.#handle
    if (!handle) {
      if (reason) reason.value = 'Stream is not open'
      return false
    }
    try {
      for (const chunk of this.#chunks) await handle.writeFile(chunk)
      await handle.close()
      const fs = await fsPromises()
      try {
        await fs.chmod(this.#temporary, await renameMode(fs, this.#target))
      } catch { /* atomicRenameUtil.cpp:176-179 warns and continues */ }
      await fs.rename(this.#temporary, this.#target)
      this.#reset()
      return true
    } catch (error) {
      // atomicRenameUtil.cpp:184-190
      if (reason) {
        reason.value = `Failed to rename temporary file '${this.#temporary}' to '${this.#target}': ${errorText(error)}`
      }
      await this.cancel()
      return false
    }
  }
  // atomicOfstreamWrapper.cpp:108-138
  async cancel(reason?: TfAtomicOfstreamReason): Promise<boolean> {
    const handle = this.#handle
    if (!handle) {
      if (reason) reason.value = 'Buffer is not open'
      return false
    }
    try { await handle.close() } catch { /* best effort */ }
    let success = true
    try {
      await (await fsPromises()).unlink(this.#temporary)
    } catch (error) {
      if ((error as { code?: unknown }).code !== 'ENOENT') {
        if (reason) reason.value = `Unable to remove temporary file '${this.#temporary}': ${errorText(error)}`
        success = false
      }
    }
    this.#reset()
    return success
  }
  // atomicOfstreamWrapper.cpp:43-46: an uncommitted temporary is removed.
  async dispose(): Promise<void> { await this.cancel() }
  async [Symbol.asyncDispose](): Promise<void> { await this.dispose() }
  #reset(): void { this.#handle = undefined; this.#temporary = ''; this.#target = ''; this.#chunks = [] }
}
