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

/** The host filesystem the default resolver reads: Node's, or one a page
 *  installs with _ArSetHostFilesystem. */
export interface FilesystemRuntime {
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
  writeFile(path: string, data: Uint8Array): Promise<void>
  removeTree(path: string): Promise<void>
  makeTmpDir(prefix: string): Promise<string>
  stat(path: string): Promise<FilesystemStat | undefined>
  chmod(path: string, mode: number): Promise<void>
  chown(path: string, uid: number, gid: number): Promise<void>
}

/** The parts of stat(2) the port reads: the mode bits and the owner. */
export interface FilesystemStat {
  mode: number
  uid: number
  gid: number
}

export interface FilesystemFileHandle {
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
      writeFile(path: string, data: Uint8Array): Promise<void>
      rm(path: string, options: { recursive: boolean, force: boolean }): Promise<void>
      mkdtemp(prefix: string): Promise<string>
      stat(path: string): Promise<FilesystemStat>
      chmod(path: string, mode: number): Promise<void>
      chown(path: string, uid: number, gid: number): Promise<void>
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
    writeFile: (path, data) => promises.writeFile(path, data),
    removeTree: path => promises.rm(path, { recursive: true, force: true }),
    makeTmpDir: prefix => promises.mkdtemp(prefix),
    stat: async path => {
      try {
        const { mode, uid, gid } = await promises.stat(path)
        return { mode, uid, gid }
      } catch { return undefined }
    },
    chmod: (path, mode) => promises.chmod(path, mode),
    chown: (path, uid, gid) => promises.chown(path, uid, gid),
  }
}

export function _filesystemAvailable(): boolean { return filesystem !== undefined }

/** @internal PLATFORM-DIVERGENCE(tf-host-filesystem): installs the
 *  filesystem the default resolver and the file helpers here read and write
 *  where there is no Node (a browser page), e.g. one kept in memory; Tf's
 *  file writers take theirs from _TfSetHostFilesystem. */
export function _ArSetHostFilesystem(runtime: FilesystemRuntime | undefined): void {
  filesystem = runtime
}

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

/** TfMakeDirs(path, -1, existOk = true) (tf/fileUtils.cpp:354-359) over
 *  the host file system: creates `path` and any missing parents. Rejects when
 *  there is no host file system or a directory cannot be made. */
export async function _makeDirs(path: string): Promise<void> {
  if (!filesystem) throw new Error('Filesystem assets are unavailable')
  await filesystem.mkdir(path)
}

/** Writes `data` as the whole file at `path`, replacing any file there. */
export async function _writeFile(path: string, data: Uint8Array): Promise<void> {
  if (!filesystem) throw new Error('Filesystem assets are unavailable')
  await filesystem.writeFile(path, data)
}

/** TfRmTree(path, onError = {}) (tf/fileUtils.cpp:638-646) over the host
 *  file system: removes `path` and everything under it, ignoring errors. */
export async function _removeTree(path: string): Promise<void> {
  if (!filesystem) return
  try { await filesystem.removeTree(path) } catch { /* ignored, as with no onError */ }
}

/** ArchMakeTmpSubdir(tmpdir, prefix) (arch/fileSystem.cpp:799-828): a new,
 *  empty directory in `parent` whose name is `prefix` followed by random
 *  characters, made only by this call. Rejects when there is no host file
 *  system or it cannot be made. */
export async function _makeTmpSubdir(parent: string, prefix: string): Promise<string> {
  if (!filesystem) throw new Error('Filesystem assets are unavailable')
  return filesystem.makeTmpDir(`${parent.replace(/\/+$/, '')}/${prefix}`)
}

/** rename(2) over the host file system: moves `from` to `to`. */
export async function _rename(from: string, to: string): Promise<void> {
  if (!filesystem) throw new Error('Filesystem assets are unavailable')
  await filesystem.rename(from, to)
}

/** stat(2) over the host file system (ArchStatType, arch/fileSystem.h): the
 *  mode bits and owner of `path`, or undefined when it cannot be read. */
export async function _stat(path: string): Promise<FilesystemStat | undefined> {
  return filesystem?.stat(path)
}

/** chmod(2) over the host file system. Rejects on failure or when there is
 *  no host file system. */
export async function _chmod(path: string, mode: number): Promise<void> {
  if (!filesystem) throw new Error('Filesystem assets are unavailable')
  await filesystem.chmod(path, mode)
}

/** chown(2) over the host file system; -1 leaves the uid or gid unchanged.
 *  Rejects on failure or when there is no host file system. */
export async function _chown(path: string, uid: number, gid: number): Promise<void> {
  if (!filesystem) throw new Error('Filesystem assets are unavailable')
  await filesystem.chown(path, uid, gid)
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

/** Whether the module at `moduleUrl` (its import.meta.url) is the script
 *  Node was started with, as Python's `__name__ == '__main__'` and a C++
 *  program's main(); always false without a host process. */
export async function _isMainScript(moduleUrl: string): Promise<boolean> {
  if (!filesystem || typeof process === 'undefined' || process.argv[1] === undefined) return false
  const urlSpecifier = ['node', 'url'].join(':')
  const fsSpecifier = ['node', 'fs'].join(':')
  const [{ pathToFileURL }, { realpathSync }] = await Promise.all([
    import(/* @vite-ignore */ urlSpecifier), import(/* @vite-ignore */ fsSpecifier),
  ]) as unknown as [{ pathToFileURL(path: string): URL }, { realpathSync(path: string): string }]
  try {
    return moduleUrl === pathToFileURL(realpathSync(process.argv[1])).href
  } catch { return false }
}

export function _cwd(): string {
  return typeof process !== 'undefined' && typeof process.cwd === 'function'
    ? process.cwd()
    : ''
}
