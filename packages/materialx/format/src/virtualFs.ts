// Virtual file system support for browser environments.
//
// Upstream's JsMaterialX builds run the file-based APIs against Emscripten's
// packaged virtual file system; this module plays the same role for the
// TypeScript port. An application (typically a bundler-driven web app)
// registers file contents under a virtual root, and the FilePath /
// readFile / XML-reading operations consult the registry before falling
// back to the real file system. When a virtual file system is active,
// getDefaultDataSearchPath() returns its root, so library loading and
// shader-source include resolution work unchanged in the browser.

// Normalize to a slash-separated path with no trailing slash.
function normalize(path: string): string {
  let result = path.replace(/\\/g, '/')
  while (result.endsWith('/') && result.length > 1) {
    result = result.substring(0, result.length - 1)
  }
  return result
}

export class VirtualFileSystem {
  private _root: string
  private _files = new Map<string, string>()

  constructor(root = '/mtlx') {
    this._root = normalize(root)
  }

  static create(root = '/mtlx'): VirtualFileSystem {
    return new VirtualFileSystem(root)
  }

  getRoot(): string {
    return this._root
  }

  // The key of a path: relative paths are under the virtual root, which
  // plays the working directory (as a relative path names a file relative
  // to the working directory on a real file system).
  private _key(path: string): string {
    let normalized = normalize(path)
    if (normalized.startsWith('/')) return normalized
    while (normalized.startsWith('./')) normalized = normalized.substring(2)
    return normalized === '.' || normalized === '' ? this._root : this._root + '/' + normalized
  }

  // Register a file. Relative paths are placed under the virtual root.
  addFile(path: string, contents: string): void {
    this._files.set(this._key(path), contents)
  }

  has(path: string): boolean {
    return this._files.has(this._key(path))
  }

  read(path: string): string | null {
    return this._files.get(this._key(path)) ?? null
  }

  // A directory exists when any registered file lives beneath it.
  isDirectory(path: string): boolean {
    const prefix = this._key(path) + '/'
    for (const key of this._files.keys()) {
      if (key.startsWith(prefix)) {
        return true
      }
    }
    return false
  }

  // Base names of the files directly inside a directory, optionally
  // filtered by extension, sorted for deterministic iteration.
  getFilesInDirectory(path: string, extension = ''): string[] {
    const prefix = this._key(path) + '/'
    const names: string[] = []
    for (const key of this._files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.substring(prefix.length)
        if (!rest.includes('/') && (extension === '' || rest.endsWith('.' + extension))) {
          names.push(rest)
        }
      }
    }
    return names.sort()
  }

  // Absolute paths of the immediate subdirectories of a directory, sorted.
  getSubDirectories(path: string): string[] {
    const prefix = this._key(path) + '/'
    const dirs = new Set<string>()
    for (const key of this._files.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.substring(prefix.length)
        const slash = rest.indexOf('/')
        if (slash > 0) {
          dirs.add(prefix + rest.substring(0, slash))
        }
      }
    }
    return [...dirs].sort()
  }
}

let _activeVirtualFileSystem: VirtualFileSystem | null = null

// Install (or clear) the active virtual file system.
export function setVirtualFileSystem(vfs: VirtualFileSystem | null): void {
  _activeVirtualFileSystem = vfs
}

export function getVirtualFileSystem(): VirtualFileSystem | null {
  return _activeVirtualFileSystem
}
