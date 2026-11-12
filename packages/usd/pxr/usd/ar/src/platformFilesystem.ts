// Ported from OpenUSD 26.11.1: pxr/base/plug/plugin.cpp,
//  pxr/usd/ar/defaultResolver.cpp, pxr/usd/ar/filesystemAsset.cpp
// Copyright 2016, 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The filesystem ArDefaultResolver and ArFilesystemAsset read
// (ar/defaultResolver.cpp, ar/filesystemAsset.cpp): the host's files where
// there is one (Node), plus the plugin resource files of this build.
//
// Plugin resource files: upstream a plugin's resources are files installed
// under its resource directory (plugInfo.json "ResourcePath"; PlugPlugin::
// FindPluginResource, plug/plugin.cpp:388-396), which the default resolver
// resolves and opens like any other file (defaultResolver.cpp:189-225,242-247,
// filesystemAsset.cpp:19-34). A browser has no installed files, so a plugin
// registered with its resources attached (PlugRegistry.RegisterPlugins)
// provides them as the files at <ResourcePath>/<name> here.
import { Registry as PlugRegistry, type Plugin as PlugPlugin } from 'typescript-usd/plug'

interface FilesystemRuntime {
  existsSync(path: string): boolean
  isDirectorySync(path: string): boolean
  isFileSync(path: string): boolean
  isWritableSync(path: string): boolean
  readdirSync(path: string): string[]
  modificationTimeSync(path: string): Date | undefined
  tmpdir(): string
  readFileSync(path: string): Uint8Array<ArrayBuffer>
  readFile(path: string): Promise<Uint8Array<ArrayBuffer>>
  open(path: string, flags: string): Promise<FilesystemFileHandle>
  mkdir(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
}

interface FilesystemFileHandle {
  write(buffer: Uint8Array, offset: number, length: number, position: number): Promise<{ bytesWritten: number }>
  close(): Promise<void>
}

let filesystem: FilesystemRuntime | undefined

if (typeof process !== 'undefined' && process.versions?.node) {
  const fsSpecifier = ['node', 'fs'].join(':')
  const promisesSpecifier = `${['node', 'fs'].join(':')}/promises`
  const osSpecifier = ['node', 'os'].join(':')
  const [fs, promises, os] = await Promise.all([
    import(/* @vite-ignore */ fsSpecifier),
    import(/* @vite-ignore */ promisesSpecifier),
    import(/* @vite-ignore */ osSpecifier),
  ]) as unknown as [
    {
      existsSync(path: string): boolean, readFileSync(path: string): Uint8Array<ArrayBuffer>
      statSync(path: string, options: { throwIfNoEntry: false }): { isDirectory(): boolean, mtime: Date } | undefined
      lstatSync(path: string, options: { throwIfNoEntry: false }): { isFile(): boolean } | undefined
      accessSync(path: string, mode: number): void
      constants: { W_OK: number }
      readdirSync(path: string): string[]
    },
    {
      readFile(path: string): Promise<Uint8Array<ArrayBuffer>>
      open(path: string, flags: string): Promise<FilesystemFileHandle>
      mkdir(path: string, options: { recursive: boolean }): Promise<unknown>
      rename(from: string, to: string): Promise<void>
      unlink(path: string): Promise<void>
    },
    { tmpdir(): string },
  ]
  filesystem = {
    existsSync: path => fs.existsSync(path),
    isDirectorySync: path => {
      try { return fs.statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false } catch { return false }
    },
    isFileSync: path => {
      try { return fs.lstatSync(path, { throwIfNoEntry: false })?.isFile() ?? false } catch { return false }
    },
    isWritableSync: path => {
      try { fs.accessSync(path, fs.constants.W_OK); return true } catch { return false }
    },
    readdirSync: path => {
      try { return fs.readdirSync(path) } catch { return [] }
    },
    modificationTimeSync: path => {
      try { return fs.statSync(path, { throwIfNoEntry: false })?.mtime } catch { return undefined }
    },
    tmpdir: () => os.tmpdir(),
    readFileSync: path => fs.readFileSync(path),
    readFile: path => promises.readFile(path),
    open: (path, flags) => promises.open(path, flags),
    mkdir: async path => { await promises.mkdir(path, { recursive: true }) },
    rename: (from, to) => promises.rename(from, to),
    unlink: path => promises.unlink(path),
  }
}

export function _filesystemAvailable(): boolean { return filesystem !== undefined }

/** The plugin and resource name of the plugin resource file at `path`. */
function _findPluginResourceFile(path: string): { plugin: PlugPlugin, name: string } | undefined {
  if (!path.startsWith('/')) return undefined
  for (const plugin of PlugRegistry.GetInstance().getAllPlugins()) {
    const base = plugin.GetResourcePath().replace(/\/+$/, '')
    if (base === '' || !path.startsWith(`${base}/`)) continue
    const name = path.slice(base.length + 1)
    if (plugin.hasResource(name)) return { plugin, name }
  }
  return undefined
}

export function _pathExists(path: string): boolean {
  return _findPluginResourceFile(path) !== undefined || (filesystem?.existsSync(path) ?? false)
}

export async function _readFile(path: string): Promise<Uint8Array<ArrayBuffer>> {
  const resource = _findPluginResourceFile(path)
  if (resource) {
    const bytes = await resource.plugin._getResourceBytes(resource.name)
    if (bytes) return new Uint8Array(bytes)
  }
  if (!filesystem) throw new Error('Filesystem assets are unavailable')
  return filesystem.readFile(path)
}

/** The whole file at `path` read synchronously (std::ifstream), or undefined
 *  when it cannot be read that way: a plugin resource attached as an async
 *  loader, or no host filesystem. */
export function _readFileSync(path: string): Uint8Array | undefined {
  const resource = _findPluginResourceFile(path)
  if (resource) return resource.plugin._getResourceBytesSync(resource.name)
  if (!filesystem?.existsSync(path)) return undefined
  try { return filesystem.readFileSync(path) } catch { return undefined }
}

/** TfIsDir (tf/fileUtils.cpp:177-189) over the host file system: whether
 *  `path` names a directory (following links). */
export function _isDir(path: string): boolean {
  return filesystem?.isDirectorySync(path) ?? false
}

/** TfIsFile(path, resolveSymlinks = false) (tf/fileUtils.cpp:195-210)
 *  over the host file system: whether `path` names a regular file. */
export function _isFile(path: string): boolean {
  return filesystem?.isFileSync(path) ?? false
}

/** TfIsWritable (tf/fileUtils.cpp:227-242) over the host file system:
 *  whether `path` exists and is writable by this process. */
export function _isWritable(path: string): boolean {
  return filesystem?.isWritableSync(path) ?? false
}

/** The entry names of the directory at `path` (opendir/readdir, as TfGlob's
 *  glob(3) and TfListDir read it, tf/fileUtils.cpp), or none when it
 *  cannot be read. */
export function _listDir(path: string): string[] {
  return filesystem?.readdirSync(path) ?? []
}

/** The modification time of the file at `path` (ArchGetModificationTime,
 *  arch/fileSystem.cpp:295-309), or undefined when it has none. */
export function _modificationTime(path: string): Date | undefined {
  return filesystem?.modificationTimeSync(path)
}

/** TfDeleteFile (tf/fileUtils.cpp:294-306): whether the file was removed. */
export async function _deleteFile(path: string): Promise<boolean> {
  if (!filesystem) return false
  try { await filesystem.unlink(path); return true } catch { return false }
}

let tmpFileCalls = 1

/** ArchMakeTmpFileName (arch/fileSystem.cpp:686-705): a file name in the
 *  host's temporary directory built from `prefix`, the process id, a call
 *  count after the first call, and `suffix`; empty when there is no host
 *  file system. */
export function _makeTmpFileName(prefix: string, suffix = ''): string {
  if (!filesystem) return ''
  const tmpDir = filesystem.tmpdir().replace(/\/+$/, '')
  const n = tmpFileCalls++
  const pid = typeof process !== 'undefined' ? process.pid : 0
  return n === 1 ? `${tmpDir}/${prefix}.${pid}${suffix}` : `${tmpDir}/${prefix}.${pid}.${n}${suffix}`
}

let temporaryFileSerial = 0

export async function _openFileForWrite(path: string, replace: boolean): Promise<FilesystemFileHandle> {
  if (!filesystem) return Promise.reject(new Error('Filesystem assets are unavailable'))
  const separator = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (separator > 0) await filesystem.mkdir(path.slice(0, separator))
  if (!replace) return filesystem.open(path, 'r+')

  // ArFilesystemWritableAsset::Create uses TfSafeOutputFile::Replace
  // (filesystemWritableAsset.cpp:25-51), which writes a sibling temporary and
  // atomically renames it on close (safeOutputFile.cpp:110-132).
  const runId = Date.now()
  let temporaryPath = ''
  let handle: FilesystemFileHandle | undefined
  for (let attempt = 0; attempt < 100 && !handle; attempt++) {
    temporaryPath = `${path}.tmp.${runId}.${temporaryFileSerial++}`
    try { handle = await filesystem.open(temporaryPath, 'wx') } catch { /* collision */ }
  }
  if (!handle) throw new Error(`Unable to create sibling temporary for '${path}'`)
  let open = true
  return {
    write: (buffer, offset, length, position) => handle!.write(buffer, offset, length, position),
    close: async () => {
      if (!open) return
      open = false
      await handle!.close()
      try {
        await filesystem!.rename(temporaryPath, path)
      } catch (error) {
        try { await filesystem!.unlink(temporaryPath) } catch { /* best effort */ }
        throw error
      }
    },
  }
}

export function _cwd(): string {
  return typeof process !== 'undefined' && typeof process.cwd === 'function'
    ? process.cwd()
    : ''
}
