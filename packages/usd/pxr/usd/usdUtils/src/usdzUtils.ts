// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/usdzUtils.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The Python-only usdzUtils module of UsdUtils (usdzUtils.py): extracting a
// .usdz package to a directory, scanning its entries in place, and updating
// it through an extracted copy that is repacked on success.
//
// Python's context managers are explicit here: `with UsdzScanIterator(p) as
// it` is `using it = await new UsdzScanIterator(p).enter()` (or enter() and
// exit() called directly), as the scopes of docs/style-guide.md rule 9.
// UsdzUpdateIterator's exit decides whether to repack from whether the block
// raised, which a `using` disposal cannot see, so its scope is the callback
// form `await new UsdzUpdateIterator(p).with(async upd => { ... })`, or
// enter() and exit(error) called directly. Reading and writing the host's
// files is asynchronous, so UsdUtilsExtractUsdzPackage, enter(), exit() and
// the update iterator's asset generators are asynchronous.
//
// PLATFORM-DIVERGENCE(usdutils-usdz-scan-detached-view): upstream's scan
// yields memoryviews over an mmap that raise ValueError once the iterator
// exits (usdzUtils.py:127-145). JavaScript typed arrays do not raise: exit()
// detaches the buffer the views share, so a view held past it reads as an
// empty array (length 0, every index undefined).

import { TfErrorMark, TfNormPath } from 'typescript-usd/tf'
import { UsdZipFile as SdfZipFile, ZipFileWriter as SdfZipFileWriter } from 'typescript-usd/sdf'
import { _sdfCrc32 } from 'typescript-usd/sdf/_internal'
import {
  _chmod, _chown, _cwd, _deleteFile, _isDir, _listDir, _makeDirs, _makeTmpSubdir, _pathExists, _readFile,
  _removeTree, _rename, _stat, _writeFile, type FilesystemStat,
} from 'typescript-usd/ar/_internal'

// _Print and _Err (usdzUtils.py:15-19).
function _print(msg: string): void { console.log(msg) }
function _err(msg: string): void { console.error(msg) }

// _AllowedUsdzExtensions and _AllowedUsdExtensions (usdzUtils.py:21-25).
const allowedUsdzExtensions = ['.usdz']
const allowedUsdExtensions = ['.usd', '.usda', '.usdc']

// os.path.splitext(path)[1]: the extension of the last component, with its
// dot; leading dots do not start one.
function splitExt(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1)
  const stem = base.replace(/^\.+/, '')
  const dot = stem.lastIndexOf('.')
  return dot < 0 ? '' : stem.slice(dot)
}

// os.getpid().
function pid(): number { return typeof process !== 'undefined' ? process.pid : 0 }

// os.name == 'nt'.
function isWindows(): boolean { return typeof process !== 'undefined' && process.platform === 'win32' }

// os.path.abspath: `path` joined to the working directory when relative,
// normalized.
function absPath(path: string): string {
  return TfNormPath(path.startsWith('/') ? path : `${_cwd()}/${path}`)
}

// os.path.dirname.
function dirName(path: string): string {
  const slash = path.lastIndexOf('/')
  if (slash < 0) return ''
  return slash === 0 ? '/' : path.slice(0, slash)
}

// The path an archive entry extracts to under `dir`: the entry name with its
// empty, '.' and '..' components dropped, so no entry lands outside `dir`
// (the archive extraction of usdzUtils.py:77); empty when nothing is left.
function extractRelativePath(name: string): string {
  return name.split('/').filter(part => part !== '' && part !== '.' && part !== '..').join('/')
}

// The archive extraction of usdzUtils.py:73-77: every entry of the zip
// archive in `bytes` written under `dir`, directory entries as directories.
// A stored or deflated entry is checked against its CRC-32; any other
// compression, a bad CRC or a malformed archive rejects.
async function extractAll(bytes: Uint8Array, dir: string): Promise<void> {
  const zipFile = SdfZipFile.fromBytes(bytes)
  for (const name of zipFile.getFileNames()) {
    const relative = extractRelativePath(name)
    if (relative === '') continue
    const target = `${dir}/${relative}`
    if (name.endsWith('/')) {
      await _makeDirs(target)
      continue
    }
    const data = await zipFile.extract(name)
    const info = zipFile.getFileInfo(name)
    if (info && _sdfCrc32(data) !== info.crc) throw new Error(`Bad CRC-32 for file '${name}'`)
    await _makeDirs(dirName(target))
    await _writeFile(target, data)
  }
}

/**
 * ExtractUsdzPackage (usdzUtils.py:28-83): extracts the .usdz package
 * `usdzFile` to `extractDir`.
 *
 * Entries are written at their archive-relative paths verbatim. Nested .usdz
 * files are left as-is inside the extract dir; callers that need to walk
 * their contents should use UsdzScanIterator, which handles nesting natively.
 * The package is extracted to a sibling temporary directory that is renamed
 * to `extractDir` only once every entry is written.
 *
 * Resolves true on success, false on any error.
 */
export async function UsdUtilsExtractUsdzPackage(
  usdzFile: string, extractDir: string, verbose = false, force = false,
): Promise<boolean> {
  if (!usdzFile.endsWith('.usdz')) {
    if (verbose) _print(`'${usdzFile}' does not have .usdz extension`)
    return false
  }

  if (!_pathExists(usdzFile)) {
    if (verbose) _print(`usdz file '${usdzFile}' does not exist.`)
    return false
  }

  if (!extractDir) {
    if (verbose) _print('No extract dir specified')
    return false
  }

  const absExtractDir = absPath(extractDir)

  if (_pathExists(absExtractDir) && !_isDir(absExtractDir)) {
    if (verbose) _print(`Extract path '${extractDir}' exists and is not a directory.`)
    return false
  }

  if (force && _isDir(absExtractDir)) await _removeTree(absExtractDir)

  if (_isDir(absExtractDir)) {
    if (verbose) _print(`Extract Dir: '${extractDir}' already exists.`)
    return false
  }

  // tempfile.mkdtemp(dir=parent), whose default prefix is 'tmp'.
  const parent = dirName(absExtractDir) || '.'
  let tmpExtractPath: string | undefined
  try {
    tmpExtractPath = await _makeTmpSubdir(parent, 'tmp')
    const bytes = await _readFile(usdzFile)
    if (verbose) _print(`Extracting usdz file '${usdzFile}' to '${absExtractDir}'`)
    await extractAll(bytes, tmpExtractPath)
    await _rename(tmpExtractPath, absExtractDir)
    return true
  } catch (e) {
    _err(`Failed to extract usdz '${usdzFile}': ${e instanceof Error ? e.message : String(e)}`)
    if (tmpExtractPath !== undefined) await _removeTree(tmpExtractPath)
    return false
  }
}

/** The options of UsdzScanIterator (usdzUtils.py:104). */
export interface UsdUtilsUsdzScanIteratorOptions {
  /** Whether nested .usdz packages are walked into (default true). */
  recurse?: boolean
  verbose?: boolean
}

/**
 * UsdzScanIterator (usdzUtils.py:85-197): a read-only iterator over the
 * entries of a .usdz package.
 *
 * Within enter() and exit(), iterating yields [arcname, view] pairs for each
 * file entry. Nested .usdz packages are recursed into transparently;
 * arcnames inside nested packages use '/' to join boundaries (e.g.
 * 'inner.usdz/foo.usdc').
 *
 * The view is a zero-copy slice of the outermost package's bytes, read once
 * on enter(). It is empty after exit() (see
 * PLATFORM-DIVERGENCE(usdutils-usdz-scan-detached-view)); to retain bytes
 * past the scope, copy them explicitly (`view.slice()`).
 *
 * Nested packages are read in place: upstream spills each to a temporary
 * file only to open it with Sdf.ZipFile.Open (usdzUtils.py:183-197), and the
 * bytes it yields are slices of the outer mmap either way.
 */
export class UsdUtilsUsdzScanIterator implements Disposable {
  private readonly _path: string
  private readonly _recurse: boolean
  private readonly _verbose: boolean
  private _buffer: ArrayBuffer | undefined

  // __init__ (usdzUtils.py:104-111).
  constructor(usdzPath: string, { recurse = true, verbose = false }: UsdUtilsUsdzScanIteratorOptions = {}) {
    this._path = usdzPath
    this._recurse = recurse
    this._verbose = verbose
  }

  /** __enter__ (usdzUtils.py:113-125): reads the package. Rejects when the
   *  file cannot be read or is empty. */
  async enter(): Promise<this> {
    const bytes = await _readFile(this._path)
    if (bytes.byteLength === 0) throw new Error(`'${this._path}' is empty`)
    // A buffer of this iterator's own, so detaching it on exit() touches no
    // other reader of the file's bytes.
    this._buffer = bytes.slice().buffer
    return this
  }

  /** __exit__ (usdzUtils.py:127-145): releases the package's bytes and every
   *  view yielded from them. */
  exit(): void {
    if (this._buffer === undefined) return
    // Transferring the buffer detaches it, and every view over it.
    structuredClone(this._buffer, { transfer: [this._buffer] })
    this._buffer = undefined
  }

  [Symbol.dispose](): void { this.exit() }

  /** __iter__ (usdzUtils.py:147-154). Throws outside enter() and exit(). */
  *[Symbol.iterator](): Generator<[string, Uint8Array]> {
    if (this._buffer === undefined) throw new Error('UsdzScanIterator used outside of its context')
    const bytes = new Uint8Array(this._buffer)
    const zipFile = openZip(bytes)
    if (zipFile) yield* this._walk(bytes, zipFile, 0, '')
  }

  // _Walk (usdzUtils.py:156-181).
  private *_walk(
    bytes: Uint8Array, zipFile: SdfZipFile, baseOffset: number, prefix: string,
  ): Generator<[string, Uint8Array]> {
    for (const name of zipFile.getFileNames()) {
      if (name.endsWith('/')) continue
      const info = zipFile.getFileInfo(name)
      if (info === undefined) continue
      if (info.encrypted) {
        if (this._verbose) _print(`Skipping encrypted entry: ${name}`)
        continue
      }
      if (info.compressionMethod !== 0) {
        if (this._verbose) _print(`Skipping non-stored entry (method ${info.compressionMethod}): ${name}`)
        continue
      }
      const dataAbs = baseOffset + info.dataOffset
      const full = prefix + name
      if (this._recurse && name.toLowerCase().endsWith('.usdz')) {
        if (this._verbose) _print(`Recursing into nested usdz: ${full}`)
        yield* this._walkNested(bytes, dataAbs, info.size, full)
      } else {
        yield [full, bytes.subarray(dataAbs, dataAbs + info.size)]
      }
    }
  }

  // _WalkNested (usdzUtils.py:183-197).
  private *_walkNested(
    bytes: Uint8Array, dataAbs: number, size: number, arcname: string,
  ): Generator<[string, Uint8Array]> {
    let nested: SdfZipFile | undefined
    try {
      nested = openZip(bytes.subarray(dataAbs, dataAbs + size))
    } catch {
      if (this._verbose) _print(`Could not open nested usdz: ${arcname}`)
      return
    }
    if (nested) yield* this._walk(bytes, nested, dataAbs, `${arcname}/`)
  }
}

// Sdf.ZipFile.Open over bytes already read; undefined for a buffer that is
// not a zip archive, which Sdf.ZipFile.Open opens as a zip file with no files
// (sdf/src/zipFile.ts UsdZipFile.open). Throws for a malformed archive.
function openZip(bytes: Uint8Array): SdfZipFile | undefined {
  return SdfZipFile.isZip(bytes) ? SdfZipFile.fromBytes(bytes) : undefined
}

/** The options of UsdzUpdateIterator (usdzUtils.py:238-240). */
export interface UsdUtilsUsdzUpdateIteratorOptions {
  /** Where the repacked package is written (default: the input package). */
  outputPath?: string
  /** Give the rewrite the original's permission bits. */
  preserveMode?: boolean
  /** Give the rewrite the original's group. */
  preserveGroup?: boolean
  /** Give the rewrite the original's owner (effectively needs root). */
  preserveOwner?: boolean
  /** The directory the package is extracted in (default: the output's). */
  parentDir?: string
  /** A marker embedded in the temporary names (letters, digits, dashes and
   *  underscores). */
  tag?: string
  verbose?: boolean
}

/**
 * UsdzUpdateIterator (usdzUtils.py:200-387): extracts a .usdz package on
 * enter(); on a clean exit(), atomically rewrites the package (optionally to
 * a different output path) from the (possibly modified) extracted contents.
 *
 * Atomic rewrite: pack to a sibling temporary file (see naming below),
 * optionally chmod/chown it to match the original, then rename it into
 * place. The original is left untouched on any failure along the way.
 *
 * Attribute preservation is opt-in per axis via preserveMode, preserveGroup
 * and preserveOwner. They are independent because they need different
 * privileges: chmod needs only ownership of the temporary (which we always
 * have), setting the group needs membership in the original's group, and
 * setting the owner effectively needs root.
 *
 * If the block raises, the rewrite is skipped entirely.
 *
 * Temporary names:
 *   extract dir:  .usdzExtract[.<tag>].<pid>.<random>/
 *   rewrite temp: <output>[.<tag>].<pid>.tmp.usdz
 *
 * The preserve flags are POSIX-only and rejected on Windows.
 */
export class UsdUtilsUsdzUpdateIterator {
  private readonly _inputPath: string
  private readonly _outputPath: string
  private readonly _preserveMode: boolean
  private readonly _preserveGroup: boolean
  private readonly _preserveOwner: boolean
  private readonly _parentDir: string | undefined
  private readonly _tag: string | undefined
  private readonly _verbose: boolean
  private _extractDir: string | undefined

  // __init__ (usdzUtils.py:238-254).
  constructor(usdzPath: string, {
    outputPath, preserveMode = false, preserveGroup = false, preserveOwner = false,
    parentDir, tag, verbose = false,
  }: UsdUtilsUsdzUpdateIteratorOptions = {}) {
    if ((preserveMode || preserveGroup || preserveOwner) && isWindows()) {
      throw new Error('preserveMode, preserveGroup and preserveOwner are not supported on Windows')
    }
    this._inputPath = absPath(usdzPath)
    this._outputPath = outputPath ? absPath(outputPath) : this._inputPath
    this._preserveMode = preserveMode
    this._preserveGroup = preserveGroup
    this._preserveOwner = preserveOwner
    this._parentDir = parentDir
    this._tag = tag
    this._verbose = verbose
  }

  // _TaggedInfix (usdzUtils.py:256-258): '.<tag>.' if tagged, else '.'.
  private _taggedInfix(): string {
    return this._tag ? `.${this._tag}.` : '.'
  }

  /** __enter__ (usdzUtils.py:260-278): extracts the package to a new
   *  directory. Rejects when it cannot be extracted. */
  async enter(): Promise<this> {
    // A fresh directory each time, so two same-stem nested packages (e.g.
    // dirA/nested.usdz and dirB/nested.usdz inside the same outer) get
    // distinct extract dirs.
    const prefix = `.usdzExtract${this._taggedInfix()}${pid()}.`
    const parent = this._parentDir ?? (dirName(this._outputPath) || '.')
    this._extractDir = await _makeTmpSubdir(parent, prefix)

    if (!await UsdUtilsExtractUsdzPackage(this._inputPath, this._extractDir, this._verbose, true)) {
      throw new Error(`Failed to extract usdz package '${this._inputPath}' to '${this._extractDir}'`)
    }
    return this
  }

  /** __exit__ (usdzUtils.py:280-323): repacks the extracted contents to the
   *  output path unless `error` (what the block raised) is given, then
   *  removes the extracted contents. */
  async exit(error?: unknown): Promise<void> {
    try {
      if (error !== undefined) {
        if (this._verbose) {
          const name = error instanceof Error ? error.name : typeof error
          _print(`UsdzUpdateIterator: skipping rewrite due to exception (${name})`)
        }
        return
      }

      if (!this._extractDir || !_isDir(this._extractDir)) return

      const preserveAny = this._preserveMode || this._preserveGroup || this._preserveOwner
      let origStat: FilesystemStat | undefined
      if (preserveAny && _pathExists(this._inputPath)) origStat = await _stat(this._inputPath)

      const tmpPath = `${this._outputPath}${this._taggedInfix()}${pid()}.tmp.usdz`

      await this._writePackage(tmpPath)

      if (origStat !== undefined) {
        try {
          // chown first: on some platforms it clears setuid/setgid, so the
          // mode has to be applied after it, not before.
          if (this._preserveGroup || this._preserveOwner) {
            await _chown(tmpPath,
              this._preserveOwner ? origStat.uid : -1,
              this._preserveGroup ? origStat.gid : -1)
          }
          if (this._preserveMode) await _chmod(tmpPath, origStat.mode & 0o7777)
        } catch (e) {
          await _deleteFile(tmpPath)
          throw e
        }
      }

      await _rename(tmpPath, this._outputPath)
    } finally {
      if (this._extractDir && _isDir(this._extractDir)) await _removeTree(this._extractDir)
    }
  }

  /** The `with` statement over this iterator: enter(), then `body`, then
   *  exit() with what `body` raised, which is rethrown. */
  async with<T>(body: (iterator: this) => Promise<T> | T): Promise<T> {
    await this.enter()
    let result: T
    try {
      result = await body(this)
    } catch (e) {
      await this.exit(e ?? new Error(String(e)))
      throw e
    }
    await this.exit()
    return result
  }

  // _WritePackage (usdzUtils.py:325-336). A Tf error posted by AddFile is
  // the Tf.ErrorException the Python binding raises; the writer is saved when
  // every file is added and discarded otherwise, as its context manager does.
  private async _writePackage(outPath: string): Promise<void> {
    const usdzWriter = await SdfZipFileWriter.createNew(outPath)
    try {
      for (const [absPath, arcname] of this.entries()) {
        if (this._verbose) _print(`.. adding: ${arcname}`)
        const mark = new TfErrorMark()
        try {
          usdzWriter.addFile(absPath, arcname)
          if (!mark.isClean()) {
            _err(`Failed to add file '${absPath}' (as '${arcname}') to package. Discarding.`)
            throw new Error(`Failed to add file '${absPath}' to package`)
          }
        } finally {
          mark.dispose()
        }
      }
    } catch (e) {
      if (usdzWriter.isValid()) await usdzWriter.discard()
      throw e
    }
    await usdzWriter.save()
  }

  /** Entries (usdzUtils.py:338-349): [absPath, arcname] for every regular
   *  file under the extract dir, top-down. Flat: nested .usdz packages appear
   *  as a single file entry, not their contents. Arcnames use '/'
   *  separators. Nothing before enter(). */
  *entries(): Generator<[string, string]> {
    if (!this._extractDir || !_isDir(this._extractDir)) return
    yield* walk(this._extractDir, '')
  }

  /** UsdAssets (usdzUtils.py:351-370): absolute paths to all
   *  usd/usda/usdc/usdz assets under the extract dir. Nested .usdz packages
   *  are recursed into via a fresh nested iterator. */
  async *usdAssets(): AsyncGenerator<string> {
    const allowed = [...allowedUsdzExtensions, ...allowedUsdExtensions]
    for (const [absPath, arcname] of [...this.entries()]) {
      const ext = splitExt(arcname)
      if (!allowed.includes(ext)) continue
      if (allowedUsdzExtensions.includes(ext)) {
        if (this._verbose) _print(`Iterating nested usdz asset: ${arcname}`)
        yield* this._nested(absPath, nested => nested.usdAssets())
      } else {
        if (this._verbose) _print(`Iterating usd asset: ${arcname}`)
        yield absPath
      }
    }
  }

  /** AllAssets (usdzUtils.py:372-387): absolute paths to every asset under
   *  the extract dir, recursing transparently into nested .usdz packages. */
  async *allAssets(): AsyncGenerator<string> {
    for (const [absPath, arcname] of [...this.entries()]) {
      const ext = splitExt(arcname)
      if (allowedUsdzExtensions.includes(ext)) {
        if (this._verbose) _print(`Iterating nested usdz asset: ${arcname}`)
        yield* this._nested(absPath, nested => nested.allAssets())
      } else {
        if (this._verbose) _print(`Iterating usd asset: ${arcname}`)
        yield absPath
      }
    }
  }

  // `with UsdzUpdateIterator(absPath, parentDir=self._extractDir,
  // verbose=self._verbose) as nested: yield from ...` (usdzUtils.py:363-366,
  // 380-383). A consumer that stops early closes the generator, which Python
  // raises as GeneratorExit inside the block, so the nested package is not
  // rewritten then.
  private async *_nested(
    absPath: string, assets: (nested: UsdUtilsUsdzUpdateIterator) => AsyncGenerator<string>,
  ): AsyncGenerator<string> {
    const nested = new UsdUtilsUsdzUpdateIterator(absPath, {
      ...(this._extractDir !== undefined ? { parentDir: this._extractDir } : {}),
      verbose: this._verbose,
    })
    await nested.enter()
    let completed = false
    let raised: unknown
    try {
      yield* assets(nested)
      completed = true
    } catch (e) {
      raised = e ?? new Error(String(e))
      throw e
    } finally {
      await nested.exit(completed ? undefined : raised ?? new Error('GeneratorExit'))
    }
  }
}

// os.walk(dir) top-down: the files of each directory, then its
// subdirectories in listing order; [absPath, arcname] pairs.
function* walk(dir: string, prefix: string): Generator<[string, string]> {
  const names = _listDir(dir)
  const subdirs: string[] = []
  for (const name of names) {
    const absPath = `${dir}/${name}`
    if (_isDir(absPath)) subdirs.push(name)
    else yield [absPath, prefix + name]
  }
  for (const name of subdirs) yield* walk(`${dir}/${name}`, `${prefix}${name}/`)
}

/**
 * UsdzAssetIterator (usdzUtils.py:390-401). Deprecated: use
 * UsdzUpdateIterator for new code. Keeps the legacy positional signature
 * UsdzAssetIterator(usdzFile, verbose, parentDir); behaves like
 * UsdzUpdateIterator writing back to usdzFile with no attribute
 * preservation.
 */
export class UsdUtilsUsdzAssetIterator extends UsdUtilsUsdzUpdateIterator {
  constructor(usdzFile: string, verbose: boolean, parentDir?: string) {
    super(usdzFile, { ...(parentDir !== undefined ? { parentDir } : {}), verbose })
  }
}
