// Ported from OpenUSD 26.11.1: pxr/usd/sdf/zipFile.cpp, pxr/usd/sdf/zipFile.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/usd/sdf/zipFile.h — SdfZipFile / SdfZipFileWriter
// Zip archive reading for USDZ packages, plus a minimal writer that produces
// spec-conformant packages (stored entries, file data aligned to 64 bytes).
//
// USDZ packages store entries uncompressed, so extraction is a subarray.
// Non-conformant zips with deflate entries are handled via
// DecompressionStream('deflate-raw') when the runtime provides it.

import {
  Error as TfError, TfDiagnosticType, TfEnvSetting, TfGetEnvSetting, TfErrorMark,
  TfNormPath, TfSafeOutputFile, TfStringTrimLeft, TF_CODING_ERROR, TF_RUNTIME_ERROR,
} from 'typescript-usd/tf'
import { _modificationTime, _readFileSync } from 'typescript-usd/ar/_internal'
import { GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath } from 'typescript-usd/ar'

const LOCAL_HEADER_SIG = 0x04034b50
const CENTRAL_DIR_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50

export interface ZipEntry {
  name: string
  compressionMethod: number   // 0 = stored, 8 = deflate
  compressedSize: number
  uncompressedSize: number
  // Offset of the entry's file DATA (past the local header)
  dataOffset: number
  // Offset of the entry's local file header.
  localHeaderOffset: number
}

// SdfZipFile::FileInfo (zipFile.h:67-95).
export interface SdfZipFileInfo {
  // Offset of the beginning of this file's data from the start of the archive.
  dataOffset: number
  // Size of this file as stored in the archive (its compressed size).
  size: number
  uncompressedSize: number
  // CRC-32 value of the uncompressed file.
  crc: number
  // Section 4.4.5 of the zip file specification; 0 is stored.
  compressionMethod: number
  encrypted: boolean
}

export class UsdZipFile {
  private constructor(
    private readonly _bytes: Uint8Array,
    private readonly _entries: Map<string, ZipEntry>,
  ) {}

  // SdfZipFile::Open (zipFile.cpp:589-617): the zip file at the resolved
  // path `filePath`, read through ArGetResolver(); undefined (an invalid
  // SdfZipFile) when the asset cannot be opened or read. A buffer that is not
  // a zip archive is a zip file with no files, as upstream's iteration of it
  // finds no local file header (zipFile.cpp:679-690). Asynchronous: ArAsset
  // reads are (ar/src/asset.ts).
  static async open(filePath: string): Promise<UsdZipFile | undefined> {
    const asset = await ArGetResolver().openAsset(new ArResolvedPath(filePath))
    if (!asset) return undefined
    let bytes: Uint8Array
    try {
      bytes = await asset.getBuffer()
    } catch {
      TF_RUNTIME_ERROR('Could not retrieve buffer from asset')
      return undefined
    }
    if (!UsdZipFile.isZip(bytes)) return new UsdZipFile(bytes, new Map())
    return UsdZipFile.fromBytes(bytes)
  }

  static isZip(bytes: Uint8Array): boolean {
    return bytes.length >= 4 &&
      bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
  }

  static fromBytes(bytes: Uint8Array): UsdZipFile {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    // Find the end-of-central-directory record (scan back past any comment)
    let eocd = -1
    for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65535; i--) {
      if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break }
    }
    if (eocd < 0) throw new Error('UsdZipFile: end-of-central-directory record not found')

    const entryCount = view.getUint16(eocd + 10, true)
    const cdOffset = view.getUint32(eocd + 16, true)

    const entries = new Map<string, ZipEntry>()
    let pos = cdOffset
    const decoder = new TextDecoder()

    for (let i = 0; i < entryCount; i++) {
      if (view.getUint32(pos, true) !== CENTRAL_DIR_SIG) {
        throw new Error('UsdZipFile: malformed central directory')
      }
      const compressionMethod = view.getUint16(pos + 10, true)
      const compressedSize = view.getUint32(pos + 20, true)
      const uncompressedSize = view.getUint32(pos + 24, true)
      const nameLen = view.getUint16(pos + 28, true)
      const extraLen = view.getUint16(pos + 30, true)
      const commentLen = view.getUint16(pos + 32, true)
      const localOffset = view.getUint32(pos + 42, true)
      const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLen))

      // The local header's name/extra lengths can differ from the central
      // directory's — read them to find the data start.
      if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIG) {
        throw new Error(`UsdZipFile: bad local header for '${name}'`)
      }
      const localNameLen = view.getUint16(localOffset + 26, true)
      const localExtraLen = view.getUint16(localOffset + 28, true)
      const dataOffset = localOffset + 30 + localNameLen + localExtraLen

      entries.set(name, {
        name, compressionMethod, compressedSize, uncompressedSize, dataOffset, localHeaderOffset: localOffset,
      })
      pos += 46 + nameLen + extraLen + commentLen
    }

    return new UsdZipFile(bytes, entries)
  }

  get entryNames(): string[] { return [...this._entries.keys()] }
  has(name: string): boolean { return this._entries.has(name) }
  getEntry(name: string): ZipEntry | undefined { return this._entries.get(name) }
  getFileNames(): string[] { return [...this._entries.keys()] }

  // SdfZipFile::Iterator::GetFileInfo (zipFile.cpp:781-796): read from the
  // entry's local file header. Undefined for a missing entry, as the Python
  // binding's _GetFileInfo returns None (wrapZipFile.cpp:39-47).
  getFileInfo(name: string): SdfZipFileInfo | undefined {
    const entry = this._entries.get(name)
    if (!entry) return undefined
    const view = new DataView(this._bytes.buffer, this._bytes.byteOffset, this._bytes.byteLength)
    const h = entry.localHeaderOffset
    return {
      dataOffset: entry.dataOffset,
      size: view.getUint32(h + 18, true),
      uncompressedSize: view.getUint32(h + 22, true),
      crc: view.getUint32(h + 14, true),
      compressionMethod: view.getUint16(h + 8, true),
      // Per 4.4.4, bit 0 is set if encrypted.
      encrypted: (view.getUint16(h + 6, true) & 0x1) !== 0,
    }
  }

  // The file's bytes as stored in the archive (GetFileInfo().size bytes at
  // its data offset; wrapZipFile.cpp:29-37 _GetFile), a view into the
  // archive. Undefined for a missing entry.
  getFile(name: string): Uint8Array | undefined {
    const info = this.getFileInfo(name)
    if (!info) return undefined
    return this._bytes.subarray(info.dataOffset, info.dataOffset + info.size)
  }

  // The package's default layer: the first .usd/.usda/.usdc entry in zip
  // order (the USDZ spec requires the root layer to be the first file).
  defaultLayerName(): string | undefined {
    for (const name of this._entries.keys()) {
      if (/\.(usd|usda|usdc)$/i.test(name)) return name
    }
    return undefined
  }

  /** @internal A stored (uncompressed) entry's bytes, read synchronously;
   * undefined for a missing or compressed entry. */
  _extractStored(name: string): Uint8Array | undefined {
    const entry = this._entries.get(name)
    if (!entry || entry.compressionMethod !== 0) return undefined
    return this._bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
  }

  // Extracts an entry's bytes. Stored entries return a view into the package
  // buffer; deflate entries are inflated via DecompressionStream.
  async extract(name: string): Promise<Uint8Array> {
    const entry = this._entries.get(name)
    if (!entry) throw new Error(`UsdZipFile: no entry '${name}'`)

    const raw = this._bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize)
    if (entry.compressionMethod === 0) return raw

    if (entry.compressionMethod === 8) {
      if (typeof DecompressionStream === 'undefined') {
        throw new Error(`UsdZipFile: '${name}' is deflate-compressed and DecompressionStream is unavailable`)
      }
      const stream = new Blob([raw as BlobPart]).stream()
        .pipeThrough(new DecompressionStream('deflate-raw'))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    }

    throw new Error(`UsdZipFile: unsupported compression method ${entry.compressionMethod} for '${name}'`)
  }
}

// ---- Writer ----

// CRC-32 (table-driven), required by the zip format.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface UsdzPackageFile {
  name: string
  data: Uint8Array
  /** @internal Filesystem timestamp used by the OpenUSD-compatible writer. */
  _modificationTime?: Date
}

function dosTimeAndDate(date: Date | undefined): { time: number; date: number } {
  if (!date) return { time: 0, date: 0 }
  const year = Math.min(2107, Math.max(1980, date.getFullYear()))
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

// zipFile.cpp:32-56. A negative value means the Zip32 maximum, UINT32_MAX.
const SDF_MAX_ZIPFILE_ENTRY_SIZE = new TfEnvSetting('SDF_MAX_ZIPFILE_ENTRY_SIZE', -1,
  'When writing SdfZipFiles, ensure that the length of a single entry does not ' +
  'exceed this size.  If a file to be added exceeds this size, an error will ' +
  'be generated. A negative value indicates that the maximum allowable size, ' +
  'which is UINT32_MAX, should be used. ' +
  'This setting is usually only modified for testing purposes. ' +
  'The default value is -1')
const SDF_MAX_ZIPFILE_SIZE = new TfEnvSetting('SDF_MAX_ZIPFILE_SIZE', -1,
  'When writing SdfZipFiles, ensure that the length of the archive does not ' +
  'exceed this size.  If adding a file or saving the archive would push the size ' +
  'over this value an error will be generated. A negative value indicates that ' +
  'the maximum allowable size, which is UINT32_MAX, should be used. ' +
  'This setting is usually only modified for testing purposes. ' +
  'The default value is -1')
const UINT32_MAX = 0xffffffff
function sdfGetMaxZipFileEntrySize(): number {
  const value = TfGetEnvSetting(SDF_MAX_ZIPFILE_ENTRY_SIZE)
  return value < 0 ? UINT32_MAX : value
}
function sdfGetMaxZipFileSize(): number {
  const value = TfGetEnvSetting(SDF_MAX_ZIPFILE_SIZE)
  return value < 0 ? UINT32_MAX : value
}

// Creates a USDZ-conformant zip: entries stored (no compression) with file
// data aligned to 64-byte boundaries via the local header's extra field.
// The first file must be the package's root layer.
//
// This is SdfZipFileWriter::AddFile for each file, then Save, in one call.
// Upstream reports a Zip32 limit violation as a runtime error and returns
// from that AddFile or Save (zipFile.cpp:973-988, 1029-1036, 1066, 1121,
// 1150); here the error is thrown, so the whole package fails rather than
// continuing without the file.
export function createUsdzPackage(files: UsdzPackageFile[]): Uint8Array {
  const maxEntrySize = sdfGetMaxZipFileEntrySize()
  const maxSize = sdfGetMaxZipFileSize()
  // _OutputStream::_CheckLimit (zipFile.cpp:154-158) through
  // Sdf_CheckZipFileWriteOperation (zipFile.cpp:973-988).
  const checkLimit = () => {
    if (offset > maxSize) {
      throw new TfError(
        `Zipfile is larger than maximum size allowed by Zip32 (${maxSize})`,
        TfDiagnosticType.RuntimeError)
    }
  }
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: {
    nameBytes: Uint8Array
    crc: number
    size: number
    localOffset: number
    extra: Uint8Array
    time: number
    date: number
  }[] = []
  let offset = 0

  const push = (chunk: Uint8Array) => { chunks.push(chunk); offset += chunk.length }

  for (const file of files) {
    // zipFile.cpp:1029-1036: reject an entry too large for its header's
    // size fields before writing anything.
    if (file.data.length > maxEntrySize) {
      throw new TfError(
        `'${file.name}' exceeds maximum allowable single file size ` +
        `(${file.data.length} > ${maxEntrySize})`, TfDiagnosticType.RuntimeError)
    }
    const nameBytes = encoder.encode(file.name)
    const localOffset = offset

    // OpenUSD v26.08 pxr/usd/sdf/zipFile.cpp:448-486 pads only when the
    // unextended local header would leave file data misaligned.
    const headerEnd = offset + 30 + nameBytes.length
    let extraLen = (64 - (headerEnd % 64)) % 64
    if (extraLen > 0 && extraLen < 4) extraLen += 64
    const { time, date } = dosTimeAndDate(file._modificationTime)

    const header = new Uint8Array(30)
    const hv = new DataView(header.buffer)
    hv.setUint32(0, LOCAL_HEADER_SIG, true)
    hv.setUint16(4, 10, true)                    // version needed
    hv.setUint16(8, 0, true)                     // method: stored
    hv.setUint16(10, time, true)
    hv.setUint16(12, date, true)
    hv.setUint32(14, crc32(file.data), true)
    hv.setUint32(18, file.data.length, true)     // compressed size
    hv.setUint32(22, file.data.length, true)     // uncompressed size
    hv.setUint16(26, nameBytes.length, true)
    hv.setUint16(28, extraLen, true)
    push(header)
    push(nameBytes)

    const extra = new Uint8Array(extraLen)
    if (extraLen > 0) {
      const ev = new DataView(extra.buffer)
      ev.setUint16(0, 0x1986, true)              // OpenUSD padding field ID
      ev.setUint16(2, extraLen - 4, true)
    }
    push(extra)

    if (offset % 64 !== 0) {
      throw new Error(`createUsdzPackage: alignment error for '${file.name}' (offset ${offset})`)
    }
    push(file.data)
    checkLimit()

    central.push({
      nameBytes, crc: crc32(file.data), size: file.data.length, localOffset,
      extra, time, date,
    })
  }

  const cdStart = offset
  for (const e of central) {
    const rec = new Uint8Array(46)
    const rv = new DataView(rec.buffer)
    rv.setUint32(0, CENTRAL_DIR_SIG, true)
    rv.setUint16(4, 0, true)                     // version made by
    rv.setUint16(6, 10, true)                    // version needed
    rv.setUint16(10, 0, true)                    // method: stored
    rv.setUint16(12, e.time, true)
    rv.setUint16(14, e.date, true)
    rv.setUint32(16, e.crc, true)
    rv.setUint32(20, e.size, true)
    rv.setUint32(24, e.size, true)
    rv.setUint16(28, e.nameBytes.length, true)
    rv.setUint16(30, e.extra.length, true)
    rv.setUint32(42, e.localOffset, true)
    push(rec)
    push(e.nameBytes)
    push(e.extra)
    checkLimit()
  }

  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, EOCD_SIG, true)
  ev.setUint16(8, central.length, true)
  ev.setUint16(10, central.length, true)
  ev.setUint32(12, offset - cdStart, true)       // central directory size
  ev.setUint32(16, cdStart, true)                // central directory offset
  push(eocd)
  checkLimit()

  const out = new Uint8Array(offset)
  let o = 0
  for (const chunk of chunks) { out.set(chunk, o); o += chunk.length }
  return out
}

// _ZipFilePath (zipFile.cpp:895-906): the path conformed to the zip file
// specification, with drive letters and initial slashes stripped.
function zipFilePath(filePath: string): string {
  // TfNormPath will flip all backslashes to forward slashes and
  // strip drive letters.
  return TfStringTrimLeft(TfNormPath(filePath, /* stripDriveSpecifier = */ true), '/')
}

/**
 * SdfZipFileWriter (zipFile.h:240-299; zipFile.cpp:910-1166): writes a zip
 * archive of stored (uncompressed) files whose data is 64-byte aligned, as
 * usdz requires. The archive is written by createUsdzPackage when it is
 * saved.
 *
 * CreateNew opens the destination with TfSafeOutputFile::Replace, which is
 * asynchronous here, so createNew returns a Promise; so does save, which
 * closes the file. JavaScript has no destructors: a writer that is neither
 * saved nor discarded leaves its temporary file unrenamed instead of being
 * saved by ~SdfZipFileWriter (zipFile.cpp:965-970); call save() or discard().
 */
export class SdfZipFileWriter {
  #outputFile: TfSafeOutputFile | undefined
  // _Impl::addedFiles (zipFile.cpp:920-926): each file's path in the archive
  // and contents.
  #addedFiles: UsdzPackageFile[] = []
  #size = 0

  private constructor(outputFile?: TfSafeOutputFile) { this.#outputFile = outputFile }

  /** SdfZipFileWriter::CreateNew (zipFile.cpp:928-940): a writer for a new
   *  archive at filePath, or an invalid writer when the file cannot be
   *  opened for writing. */
  static async createNew(filePath: string): Promise<SdfZipFileWriter> {
    const mark = new TfErrorMark()
    try {
      const outputFile = await TfSafeOutputFile.Replace(filePath)
      if (!mark.isClean() || !outputFile) return new SdfZipFileWriter()
      return new SdfZipFileWriter(outputFile)
    } finally {
      mark.dispose()
    }
  }

  /** Whether this writer is open for writing (explicit operator bool,
   *  zipFile.h:268). */
  isValid(): boolean { return this.#outputFile !== undefined }

  /**
   * SdfZipFileWriter::AddFile (zipFile.cpp:990-1074): adds the file at
   * filePath to the archive at filePathInArchive (filePath when empty), and
   * returns the path the file has in the archive, or empty on error. A path
   * already added is skipped.
   */
  addFile(filePath: string, filePathInArchiveIn = ''): string {
    if (!this.#outputFile) {
      TF_CODING_ERROR('File is not open for writing')
      return ''
    }
    const filePathInArchive = filePathInArchiveIn === '' ? filePath : filePathInArchiveIn

    // Conform the file path we're writing into the archive to make sure
    // it follows zip file specifications.
    const archivePath = zipFilePath(filePathInArchive)

    // Check if this file has already been written to this zip archive; if so,
    // just skip it.
    if (this.#addedFiles.some(file => file.name === archivePath)) return archivePath

    const data = _readFileSync(filePath)
    if (!data) {
      TF_RUNTIME_ERROR(`Failed to map '${filePath}': No such file or directory`)
      return ''
    }

    // Trigger an error early if the file size is larger then the max
    // entry size (zipFile.cpp:1029-1036).
    const maxEntrySize = sdfGetMaxZipFileEntrySize()
    if (data.length > maxEntrySize) {
      TF_RUNTIME_ERROR(`'${filePath}' exceeds maximum allowable single file size ` +
        `(${data.length} > ${maxEntrySize})`)
      return ''
    }

    // The local file header, its padding and the data
    // (zipFile.cpp:1038-1066); writing them past the maximum archive size is
    // the error Sdf_CheckZipFileWriteOperation reports (zipFile.cpp:973-988).
    const nameLength = new TextEncoder().encode(archivePath).length
    const headerEnd = this.#size + 30 + nameLength
    let extraLength = (64 - (headerEnd % 64)) % 64
    if (extraLength > 0 && extraLength < 4) extraLength += 64
    const size = headerEnd + extraLength + data.length
    if (size > sdfGetMaxZipFileSize()) {
      TF_RUNTIME_ERROR(`Zipfile is larger than maximum size allowed by Zip32 (${sdfGetMaxZipFileSize()})`)
      return ''
    }
    this.#size = size
    const modificationTime = _modificationTime(filePath)
    this.#addedFiles.push(modificationTime ? { name: archivePath, data, _modificationTime: modificationTime } : { name: archivePath, data })
    return archivePath
  }

  /** SdfZipFileWriter::Save (zipFile.cpp:1075-1152): writes the central
   *  directory and closes the archive; false on error. */
  async save(): Promise<boolean> {
    const outputFile = this.#outputFile
    if (!outputFile) {
      TF_CODING_ERROR('File is not open for writing')
      return false
    }
    this.#outputFile = undefined
    let bytes: Uint8Array
    try {
      bytes = createUsdzPackage(this.#addedFiles)
    } catch (error) {
      if (!(error instanceof TfError)) throw error
      TF_RUNTIME_ERROR(error.getCommentary())
      await outputFile.discard()
      return false
    }
    outputFile.Get()!.write(bytes)
    await outputFile.close()
    return true
  }

  /** SdfZipFileWriter::Discard (zipFile.cpp:1153-1166): closes the archive
   *  without saving it. */
  async discard(): Promise<void> {
    const outputFile = this.#outputFile
    if (!outputFile) {
      TF_CODING_ERROR('File is not open for writing')
      return
    }
    this.#outputFile = undefined
    await outputFile.discard()
  }
}
