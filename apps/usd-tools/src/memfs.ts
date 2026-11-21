// The pages' filesystem: kept in memory and installed as the host filesystem
// TypeScript USD reads and writes where there is no Node
// (PLATFORM-DIVERGENCE(tf-host-filesystem): _ArSetHostFilesystem for the
// default resolver and file helpers, _TfSetHostFilesystem for
// TfSafeOutputFile). Tools that write files through them, like usdzip
// creating a package, write here; the page reads the result back.
// Samples and picked files are copied in (preload) before a tool that reads
// them synchronously runs.
import { _ArSetHostFilesystem, normalizePath, type FilesystemFileHandle, type FilesystemRuntime } from 'typescript-usd/ar/_internal'
import { _TfSetHostFilesystem, type Tf_HostFileHandle, type Tf_HostFilesystem } from 'typescript-usd/tf'

interface Entry { data: Uint8Array, mtime: Date }
const files = new Map<string, Entry>()
const dirs = new Set<string>(['/', '/tmp'])

const norm = (path: string) => normalizePath(path).replace(/\/+$/, '') || '/'
const parent = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/'
function enoent(path: string): Error {
  return Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), { code: 'ENOENT' })
}
function addDirs(path: string): void {
  for (let dir = path; !dirs.has(dir); dir = parent(dir)) dirs.add(dir)
}
function put(path: string, data: Uint8Array): void {
  const p = norm(path)
  addDirs(parent(p))
  files.set(p, { data, mtime: new Date() })
}

/** Writes `data` at `path` (making its folders). */
export function writeMemFile(path: string, data: Uint8Array): void { put(path, data) }
/** Makes the folder `path` and its parents. */
export function makeMemDir(path: string): void { addDirs(norm(path)) }
/** The file at `path`, if any. */
export function readMemFile(path: string): Uint8Array | undefined { return files.get(norm(path))?.data }
/** Removes `path` and everything under it. */
export function removeMemTree(path: string): void {
  const p = norm(path)
  for (const f of [...files.keys()]) if (f === p || f.startsWith(`${p}/`)) files.delete(f)
  for (const d of [...dirs]) if (d === p || d.startsWith(`${p}/`)) dirs.delete(d)
}

/** A handle that grows the file as it is written, as fs/promises' does. */
function handle(path: string, initial: Uint8Array): FilesystemFileHandle & Tf_HostFileHandle {
  let bytes = initial
  let length = initial.byteLength
  const store = () => put(path, bytes.slice(0, length))
  store()
  return {
    async write(buffer, offset, count, position) {
      const end = position + count
      if (end > bytes.byteLength) {
        const grown = new Uint8Array(Math.max(end, bytes.byteLength * 2, 1024))
        grown.set(bytes.subarray(0, length))
        bytes = grown
      }
      bytes.set(buffer.subarray(offset, offset + count), position)
      length = Math.max(length, end)
      store()
      return { bytesWritten: count }
    },
    async writeFile(data) {
      const encoded = typeof data === 'string' ? new TextEncoder().encode(data) : data.slice()
      bytes = encoded
      length = encoded.byteLength
      store()
    },
    async close() { store() },
  }
}

async function open(path: string, flags: string): Promise<FilesystemFileHandle & Tf_HostFileHandle> {
  const p = norm(path)
  const existing = files.get(p)
  if (flags.includes('x') && (existing || dirs.has(p))) {
    throw Object.assign(new Error(`EEXIST: file already exists, '${p}'`), { code: 'EEXIST' })
  }
  if (flags.startsWith('r') && !existing) throw enoent(p)
  if (!dirs.has(parent(p))) throw enoent(p)
  return handle(p, flags.startsWith('r') ? existing!.data : new Uint8Array(0))
}

// rename(2): a file, or a folder with everything under it.
async function rename(from: string, to: string): Promise<void> {
  const a = norm(from), b = norm(to)
  const entry = files.get(a)
  if (entry) {
    files.delete(a)
    put(b, entry.data)
    return
  }
  if (!dirs.has(a)) throw enoent(a)
  for (const [path, e] of [...files]) {
    if (path.startsWith(`${a}/`)) { files.delete(path); put(b + path.slice(a.length), e.data) }
  }
  for (const dir of [...dirs]) {
    if (dir === a || dir.startsWith(`${a}/`)) { dirs.delete(dir); addDirs(b + dir.slice(a.length)) }
  }
  addDirs(b)
}

let tmpSerial = 0
const runtime: FilesystemRuntime = {
  existsSync: path => files.has(norm(path)) || dirs.has(norm(path)),
  isDirectorySync: path => dirs.has(norm(path)),
  isFileSync: path => files.has(norm(path)),
  isWritableSync: path => files.has(norm(path)) || dirs.has(norm(path)),
  readdirSync: path => {
    const p = norm(path)
    const prefix = p === '/' ? '/' : `${p}/`
    const names = new Set<string>()
    for (const name of [...files.keys(), ...dirs]) {
      if (name !== p && name.startsWith(prefix)) names.add(name.slice(prefix.length).split('/')[0]!)
    }
    return [...names].sort()
  },
  modificationTimeSync: path => files.get(norm(path))?.mtime,
  tmpdir: () => '/tmp',
  readFileSync: path => {
    const entry = files.get(norm(path))
    if (!entry) throw enoent(path)
    return entry.data.slice() as Uint8Array<ArrayBuffer>
  },
  readFile: async path => runtime.readFileSync(path),
  open,
  mkdir: async path => addDirs(norm(path)),
  rename,
  unlink: async path => { if (!files.delete(norm(path))) throw enoent(path) },
  writeFile: async (path, data) => put(path, data.slice()),
  removeTree: async path => removeMemTree(path),
  makeTmpDir: async prefix => {
    const dir = norm(`${prefix}${Date.now().toString(36)}${(tmpSerial++).toString(36)}`)
    addDirs(dir)
    return dir
  },
  stat: async path => {
    const p = norm(path)
    if (files.has(p)) return { mode: 0o100644, uid: 0, gid: 0 }
    if (dirs.has(p)) return { mode: 0o40755, uid: 0, gid: 0 }
    return undefined
  },
  chmod: async () => {},
  chown: async () => {},
}

const tf: Tf_HostFilesystem = {
  open,
  rename,
  unlink: runtime.unlink,
  realpath: async path => {
    const p = norm(path)
    if (!files.has(p) && !dirs.has(p)) throw enoent(p)
    return p
  },
  stat: async path => {
    const s = await runtime.stat(path)
    if (!s) throw enoent(path)
    return s
  },
  chmod: async () => {},
}

_ArSetHostFilesystem(runtime)
_TfSetHostFilesystem(tf)
