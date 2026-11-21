// PLATFORM-DIVERGENCE(tf-host-filesystem): upstream TfAtomicOfstreamWrapper
// and TfSafeOutputFile (atomicOfstreamWrapper.cpp, safeOutputFile.cpp) write
// through the C library's files. Here they write through Node's
// fs/promises, or, where there is no Node (a browser page), through a
// filesystem the host installs with _TfSetHostFilesystem, e.g. one kept in
// memory. Without either, opening a file for writing fails, as on a
// read-only filesystem.

/** A file opened by Tf_HostFilesystem.open. */
export interface Tf_HostFileHandle {
  writeFile(data: Uint8Array | string): Promise<void>
  write(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesWritten: number }>
  close(): Promise<void>
}

/** The fs/promises calls Tf's file writers make. */
export interface Tf_HostFilesystem {
  open(path: string, flags: string): Promise<Tf_HostFileHandle>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  realpath(path: string): Promise<string>
  stat(path: string): Promise<{ mode: number }>
  chmod(path: string, mode: number): Promise<void>
}

let installed: Tf_HostFilesystem | undefined

/** @internal Installs the filesystem Tf writes files through where there is
 *  no Node. */
export function _TfSetHostFilesystem(filesystem: Tf_HostFilesystem | undefined): void {
  installed = filesystem
}

/** @internal The installed filesystem, else Node's fs/promises; rejects
 *  when there is neither. */
export async function _TfHostFilesystem(): Promise<Tf_HostFilesystem> {
  if (installed) return installed
  const specifier = `${['node', 'fs'].join(':')}/promises`
  return import(/* @vite-ignore */ specifier) as unknown as Promise<Tf_HostFilesystem>
}
