// Ported from MaterialX 1.39.5: source/MaterialXFormat/File.h,
//  source/MaterialXFormat/File.cpp
// Copyright Contributors to the MaterialX Project. Apache License 2.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors source/MaterialXFormat/File.h and File.cpp
//
// File system operations use node:fs; browser bundles should rely on the
// string-based XML APIs (readFromXmlString/writeToXmlString) or alias this
// module.

import * as fs from 'node:fs'
import { getVirtualFileSystem } from './virtualFs.ts'
import * as nodeProcess from 'node:process'
import { Exception, EMPTY_STRING, splitString } from '@mtlx/core'
import { getEnviron } from './environ.ts'

const VALID_SEPARATORS = '/\\'

const PREFERRED_SEPARATOR_WINDOWS = '\\'
const PREFERRED_SEPARATOR_POSIX = '/'

const CURRENT_PATH_STRING = '.'
const PARENT_PATH_STRING = '..'

const IS_WINDOWS = nodeProcess.platform === 'win32'

export const PATH_LIST_SEPARATOR = IS_WINDOWS ? ';' : ':'
export const MATERIALX_SEARCH_PATH_ENV_VAR = 'MATERIALX_SEARCH_PATH'

export enum FilePathType {
  TypeRelative = 0,
  TypeAbsolute = 1,
  TypeNetwork = 2,
}

export enum FilePathFormat {
  FormatWindows = 0,
  FormatPosix = 1,
}

export const FORMAT_NATIVE: FilePathFormat = IS_WINDOWS ? FilePathFormat.FormatWindows : FilePathFormat.FormatPosix

function hasWindowsDriveSpecifier(val: string): boolean {
  return val.length > 1 && /[A-Za-z]/.test(val[0]!) && val[1] === ':'
}

// A generic file path, supporting both syntactic and file system operations.
export class FilePath {
  static readonly TypeRelative = FilePathType.TypeRelative
  static readonly TypeAbsolute = FilePathType.TypeAbsolute
  static readonly TypeNetwork = FilePathType.TypeNetwork

  static readonly FormatWindows = FilePathFormat.FormatWindows
  static readonly FormatPosix = FilePathFormat.FormatPosix
  static readonly FormatNative = FORMAT_NATIVE

  private _vec: string[] = []
  private _type: FilePathType = FilePathType.TypeRelative

  constructor(str = '') {
    this.assign(str)
  }

  equals(rhs: FilePath): boolean {
    return (
      this._type === rhs._type && this._vec.length === rhs._vec.length && this._vec.every((v, i) => v === rhs._vec[i])
    )
  }

  // --- Syntactic Operations ---

  // Assign a path from a standard string.
  assign(str: string): void {
    this._type = FilePathType.TypeRelative
    this._vec = splitString(str, VALID_SEPARATORS)
    if (str !== '') {
      if (str[0] === PREFERRED_SEPARATOR_POSIX) {
        this._type = FilePathType.TypeAbsolute
      } else if (str.length >= 2) {
        if (hasWindowsDriveSpecifier(str)) {
          this._type = FilePathType.TypeAbsolute
        } else if (str[0] === '\\' && str[1] === '\\') {
          this._type = FilePathType.TypeNetwork
        }
      }
    }
  }

  // Return this path as a standard string with the given format.
  asString(format: FilePathFormat = FORMAT_NATIVE): string {
    let str = ''

    if (format === FilePathFormat.FormatPosix && this.isAbsolute()) {
      // Don't prepend a POSIX separator on a Windows absolute path.
      if (this._vec.length === 0 || !hasWindowsDriveSpecifier(this._vec[0]!)) {
        str += '/'
      }
    } else if (format === FilePathFormat.FormatWindows && this._type === FilePathType.TypeNetwork) {
      str += '\\\\'
    }

    const sep = format === FilePathFormat.FormatPosix ? PREFERRED_SEPARATOR_POSIX : PREFERRED_SEPARATOR_WINDOWS
    str += this._vec.join(sep)

    return str
  }

  toString(): string {
    return this.asString()
  }

  // Return true if the given path is empty.
  isEmpty(): boolean {
    return this._vec.length === 0
  }

  // Return true if the given path is absolute.
  isAbsolute(): boolean {
    return this._type !== FilePathType.TypeRelative
  }

  // Return the base name of the given path, with leading directory
  // information removed.
  getBaseName(): string {
    if (this.isEmpty()) return EMPTY_STRING
    return this._vec[this._vec.length - 1]!
  }

  // Return the parent directory of the given path, if any.
  getParentPath(): FilePath {
    const parent = this.copy()
    if (!parent.isEmpty()) {
      parent._vec.pop()
    }
    return parent
  }

  // Return the file extension of the given path.
  getExtension(): string {
    const baseName = this.getBaseName()
    const i = baseName.lastIndexOf('.')
    return i !== -1 ? baseName.slice(i + 1) : EMPTY_STRING
  }

  // Add a file extension to the given path.
  addExtension(ext: string): void {
    this.assign(this.asString() + '.' + ext)
  }

  // Remove the file extension, if any, from the given path.
  removeExtension(): void {
    if (!this.isEmpty()) {
      const baseName = this._vec[this._vec.length - 1]!
      const i = baseName.lastIndexOf('.')
      if (i !== -1) {
        this._vec[this._vec.length - 1] = baseName.slice(0, i)
      }
    }
  }

  // Concatenate two paths with a directory separator, returning the
  // combined path (C++ operator/).
  join(rhs: FilePath | string): FilePath {
    const rhsPath = typeof rhs === 'string' ? new FilePath(rhs) : rhs
    if (rhsPath.isAbsolute()) {
      throw new Exception('Appended path must be relative.')
    }
    const combined = this.copy()
    combined._vec.push(...rhsPath._vec)
    return combined
  }

  // Return the number of strings in the path.
  size(): number {
    return this._vec.length
  }

  // Return the string at the given index.
  getItem(index: number): string {
    return this._vec[index] ?? EMPTY_STRING
  }

  // Return a normalized version of the given path, collapsing current path
  // and parent path references.
  getNormalized(): FilePath {
    const res = new FilePath()
    for (const str of this._vec) {
      if (str === CURRENT_PATH_STRING) {
        continue
      }
      if (str === PARENT_PATH_STRING && !res.isEmpty() && res._vec[res._vec.length - 1] !== PARENT_PATH_STRING) {
        res._vec.pop()
        continue
      }
      res._vec.push(str)
    }
    res._type = this._type
    return res
  }

  copy(): FilePath {
    const res = new FilePath()
    res._vec = [...this._vec]
    res._type = this._type
    return res
  }

  // --- File System Operations ---

  // Return true if the given path exists on the file system.
  exists(): boolean {
    const vfs = getVirtualFileSystem()
    if (vfs && (vfs.has(this.asString()) || vfs.isDirectory(this.asString()))) {
      return true
    }
    try {
      return fs.existsSync(this.asString())
    } catch {
      return false
    }
  }

  // Return true if the given path is a directory on the file system.
  isDirectory(): boolean {
    const vfs = getVirtualFileSystem()
    if (vfs && vfs.isDirectory(this.asString())) {
      return true
    }
    try {
      return fs.statSync(this.asString()).isDirectory()
    } catch {
      return false
    }
  }

  // Return all files in the given directory with the given extension; all
  // files when the extension is empty.
  getFilesInDirectory(extension: string = EMPTY_STRING): FilePath[] {
    const files: FilePath[] = []
    const vfs = getVirtualFileSystem()
    if (vfs && vfs.isDirectory(this.asString())) {
      for (const name of vfs.getFilesInDirectory(this.asString(), extension)) {
        files.push(new FilePath(name))
      }
      return files
    }
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(this.asString(), { withFileTypes: true })
    } catch {
      return files
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && (extension === '' || new FilePath(entry.name).getExtension() === extension)) {
        files.push(new FilePath(entry.name))
      }
    }
    return files
  }

  // Return all directories at or beneath the given path.
  getSubDirectories(): FilePath[] {
    if (!this.isDirectory()) {
      return []
    }

    const dirs: FilePath[] = [this.copy()]
    const vfs = getVirtualFileSystem()
    if (vfs && vfs.isDirectory(this.asString())) {
      for (const dir of vfs.getSubDirectories(this.asString())) {
        dirs.push(...new FilePath(dir).getSubDirectories())
      }
      return dirs
    }
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(this.asString(), { withFileTypes: true })
    } catch {
      return dirs
    }
    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue
      const newDir = this.join(entry.name)
      if (entry.isDirectory() || (!entry.isFile() && newDir.isDirectory())) {
        dirs.push(...newDir.getSubDirectories())
      }
    }
    return dirs
  }

  // Create a directory on the file system at the given path; with recursive
  // set, any missing parent directories are created as well.
  createDirectory(recursive = false): void {
    try {
      fs.mkdirSync(this.asString(), { recursive })
    } catch {
      // Mirrors the C++ behavior of ignoring mkdir failures.
    }
  }

  // Set the current working directory of the file system.
  setCurrentPath(): boolean {
    try {
      nodeProcess.chdir(this.asString())
      return true
    } catch {
      return false
    }
  }

  // Return the current working directory of the file system.
  static getCurrentPath(): FilePath {
    return new FilePath(nodeProcess.cwd())
  }

  // Return the directory containing the executing module. (The C++ version
  // returns the executable's directory; here the module URL is used.)
  static getModulePath(): FilePath {
    const url = import.meta.url
    if (url.startsWith('file://')) {
      return new FilePath(decodeURIComponent(url.slice('file://'.length))).getParentPath()
    }
    return FilePath.getCurrentPath()
  }
}

// A sequence of file paths, which may be queried to find the first instance
// of a given filename on the file system.
export class FileSearchPath implements Iterable<FilePath> {
  private _paths: FilePath[] = []

  // Construct a search path from a string containing a sequence of file
  // paths joined by separator characters.
  constructor(searchPath = '', sep: string = PATH_LIST_SEPARATOR) {
    for (const path of splitString(searchPath, sep)) {
      if (path !== '') {
        this.append(new FilePath(path))
      }
    }
  }

  // Convert this sequence to a string using the given separator.
  asString(sep: string = PATH_LIST_SEPARATOR): string {
    return this._paths.map((p) => p.asString()).join(sep)
  }

  // Append the given path or search path to the sequence.
  append(path: FilePath | FileSearchPath): void {
    if (path instanceof FileSearchPath) {
      for (const p of path._paths) {
        this._paths.push(p)
      }
    } else {
      this._paths.push(path)
    }
  }

  // Prepend the given path to the sequence.
  prepend(path: FilePath): void {
    this._paths.unshift(path)
  }

  // Clear all paths from the sequence.
  clear(): void {
    this._paths = []
  }

  // Return the number of paths in the sequence.
  size(): number {
    return this._paths.length
  }

  // Return true if the search path is empty.
  isEmpty(): boolean {
    return this._paths.length === 0
  }

  // Return the path at the given index.
  getItem(index: number): FilePath {
    return this._paths[index] ?? new FilePath()
  }

  // Given an input filename, iterate through each path in this sequence,
  // returning the first combined path found on the file system. On success
  // the combined path is returned; otherwise the original filename.
  find(filename: FilePath | string): FilePath {
    const file = typeof filename === 'string' ? new FilePath(filename) : filename
    if (this._paths.length === 0 || file.isEmpty()) {
      return file
    }
    if (!file.isAbsolute()) {
      for (const path of this._paths) {
        const combined = path.join(file)
        if (combined.exists()) {
          return combined
        }
      }
    }
    return file
  }

  [Symbol.iterator](): Iterator<FilePath> {
    return this._paths[Symbol.iterator]()
  }

  copy(): FileSearchPath {
    const res = new FileSearchPath()
    res._paths = this._paths.map((p) => p.copy())
    return res
  }
}

// Return a FileSearchPath object from the search path environment variable.
export function getEnvironmentPath(sep: string = PATH_LIST_SEPARATOR): FileSearchPath {
  const searchPathEnv = getEnviron(MATERIALX_SEARCH_PATH_ENV_VAR)
  return new FileSearchPath(searchPathEnv, sep)
}
