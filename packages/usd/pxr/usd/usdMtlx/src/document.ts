// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/utils.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors the cached-document behavior in OpenUSD v26.08
// pxr/usd/usdMtlx/utils.cpp:428-460. The empty URI denotes all MaterialX
// standard-library resources rolled into one document.

import type { Document } from '@mtlx/core'
import { createDocument, Exception as MxException } from '@mtlx/core'
import {
  FilePath, FileSearchPath, XmlReadOptions, readFromXmlFile, readFromXmlString, flattenFilenames,
  getVirtualFileSystem,
} from '@mtlx/format'
import {
  GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath,
  IsPackageRelativePath as ArIsPackageRelativePath,
  JoinPackageRelativePath as ArJoinPackageRelativePath,
  SplitPackageRelativePathInner as ArSplitPackageRelativePathInner,
} from 'typescript-usd/ar'
import {
  _ArOpenAssetSync, _ArReadAhead, _cwd, _ArRegisterAssetPrefetcher, _ArResolveSync, normalizePath, normalizeRelative,
  type _ArAssetReader,
} from 'typescript-usd/ar/_internal'
import { TfDiagnosticType, Error as TfError } from 'typescript-usd/tf'
import { BROWSER_STDLIB_XML } from './generated/browserStdlibXml.ts'

const documentCache = new Map<string, Document | null>()
const stringDocumentCache = new Map<string, Document | null>()

// utils.cpp:336-373 (UsdMtlxReadDocument): a file is read with MaterialX's
// file reader (in a browser, its virtual file system, @mtlx/format), any
// other asset through Ar (see "Reading documents through Ar" below). Called
// from UsdMtlxGetDocument (utils.cpp:428-460), which reports failures only as
// TF_DEBUG(SDR_PARSING) messages: a failure is null.
function readDocument(resolvedUri: string): Document | null {
  try {
    const file = new FilePath(resolvedUri)
    if (file.exists() && !file.isDirectory()) {
      const doc = createDocument()
      readFromXmlFile(doc, resolvedUri)
      // Flatten all filenames in document
      flattenFilenames(doc)
      return doc
    }
    const asset = _ArOpenAssetSync(new ArResolvedPath(resolvedUri))
    if (!asset) return null
    return UsdMtlxReadDocumentFromAsset(resolvedUri, new TextDecoder().decode(asset.getBuffer()))
  } catch {
    return null
  }
}

/** TfGetenv */
function _Getenv(name: string): string {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name] ?? ''
}

/** utils.cpp:152-164 (_GetSearchPathsFromEnvVar) */
function _GetSearchPathsFromEnvVar(name: string): string[] {
  const paths = _Getenv(name)
  return paths !== '' ? paths.split(':') : []
}

let _customSearchPaths: string[] | null = null
/** utils.cpp:209-218 (UsdMtlxCustomSearchPaths): PXR_MTLX_PLUGIN_SEARCH_PATHS,
 *  read once. */
export function UsdMtlxCustomSearchPaths(): string[] {
  _customSearchPaths ??= _GetSearchPathsFromEnvVar('PXR_MTLX_PLUGIN_SEARCH_PATHS')
  return _customSearchPaths
}

/** The files with the "mtlx" extension in and beneath `searchPaths`, as
 *  SdrFsHelpersDiscoverFiles (sdr/filesystemDiscoveryHelpers.cpp:236-274)
 *  finds them: { uri, resolvedUri } per file, directories walked top-down.
 *  The walk and the files are MaterialX's file system (@mtlx/format
 *  FilePath: the host's files, or the virtual file system in a browser);
 *  a relative search path is relative to the working directory (in a
 *  browser, the virtual file system's root), and the resolved URI is the
 *  file's absolute path, as ArDefaultResolver resolves an existing file. */
export function UsdMtlx_DiscoverFiles(searchPaths: readonly string[]): Array<{ uri: string, resolvedUri: string }> {
  const found: Array<{ uri: string, resolvedUri: string }> = []
  for (const searchPath of searchPaths) {
    const dir = new FilePath(searchPath)
    if (!dir.isDirectory()) continue
    for (const sub of dir.getSubDirectories()) {
      for (const file of sub.getFilesInDirectory('mtlx').map(f => f.asString()).sort()) {
        const uri = normalizeRelative(`${sub.asString()}/${file}`)
        found.push({ uri, resolvedUri: _AbsPath(`${sub.asString()}/${file}`) })
      }
    }
  }
  return found
}

/** TfAbsPath: relative to the working directory (the host's, or in a browser
 *  the MaterialX virtual file system's root). */
function _AbsPath(path: string): string {
  if (path.startsWith('/')) return normalizePath(path)
  const cwd = _cwd() || getVirtualFileSystem()?.getRoot() || ''
  return normalizePath(`${cwd}/${path}`)
}

/** utils.cpp:401-426 (_ImportLibraries) */
function _ImportLibraries(searchPaths: readonly string[], document: Document): void {
  for (const fileResult of UsdMtlx_DiscoverFiles(searchPaths)) {
    // Read the file. If this fails due to an exception, a runtime
    // error will be raised so we can just skip to the next file.
    const doc = readDocument(fileResult.resolvedUri)
    if (!doc) continue
    try {
      // Merge this document into the global library
      document.importLibrary(doc)
    } catch {
      // TF_RUNTIME_ERROR, reported only as a TF_DEBUG message by
      // UsdMtlxGetDocument.
    }
  }
}

export function UsdMtlxGetDocument(resolvedUri = ''): Document | null {
  if (documentCache.has(resolvedUri)) return documentCache.get(resolvedUri) ?? null

  let doc: Document | null
  if (resolvedUri === '') {
    // Read the standard library files (bundled as one document; see
    // generated/browserStdlibXml.ts), then the custom search paths' files
    // (utils.cpp:443-447).
    doc = createDocument()
    try {
      readFromXmlString(doc, BROWSER_STDLIB_XML)
    } catch (err) {
      console.warn('usdMtlx: unable to parse the bundled MaterialX standard library:', err)
      doc = null
    }
    if (doc) _ImportLibraries(UsdMtlxCustomSearchPaths(), doc)
  } else {
    doc = readDocument(resolvedUri)
  }
  documentCache.set(resolvedUri, doc)
  return doc
}

export function UsdMtlxGetDocumentFromString(mtlxXml: string): Document | null {
  if (stringDocumentCache.has(mtlxXml)) return stringDocumentCache.get(mtlxXml) ?? null

  const doc = createDocument()
  try {
    readFromXmlString(doc, mtlxXml)
    flattenFilenames(doc)
    stringDocumentCache.set(mtlxXml, doc)
    return doc
  } catch (err) {
    console.warn('usdMtlx: unable to parse MaterialX XML:', err)
    stringDocumentCache.set(mtlxXml, null)
    return null
  }
}

// --- Reading documents through Ar (usdMtlx/utils.cpp:241-372) ---
//
// Upstream reads a MaterialX document that is not a plain file, and every
// XInclude it names, synchronously through ArResolver (Resolve, OpenAsset).
// Ar reads are asynchronous here, so the documents are read ahead
// (ar/src/prefetchedAssets.ts): UsdMtlx_PrefetchDocumentAsync reads the
// document and, recursively, the XIncludes the reads below will ask for, and
// _ReadFromString / _ReadFromAsset read them back with _ArResolveSync and
// _ArOpenAssetSync. Layers of the mtlx format are read ahead before the
// format's Read (sdf/src/layer.ts), and so are mtlx assets a stage's
// asset-valued attributes name (info:mtlx:sourceAsset), through the
// prefetcher registered at the end of this file.

/** TfGetPathName (tf/pathUtils.cpp): the directory part, with its slash. */
function _TfGetPathName(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i + 1)
}

/** TfNormPath (tf/pathUtils.cpp) of a '/'-separated path. */
function _TfNormPath(path: string): string {
  return path.startsWith('/') ? normalizePath(path) : normalizeRelative(path) || '.'
}

/** The identifier of the XInclude `newFilename` read from the document at
 *  `resolvedPath` (utils.cpp:263-288). */
function _AnchorXInclude(newFilename: string, resolvedPath: string): string {
  if (ArIsPackageRelativePath(resolvedPath)) {
    // If the source file is a package like foo.usdz[a/b/doc.mx], we want
    // to anchor the new filename to the packaged path, so we'd wind up
    // with foo.usdz[a/b/included.mx].
    const [packagePath, packagedPath] = ArSplitPackageRelativePathInner(resolvedPath)
    const packagedDir = _TfGetPathName(packagedPath)
    const newPackagedPath = _TfNormPath(packagedDir === '' ? newFilename : packagedDir + newFilename)
    return ArJoinPackageRelativePath([packagePath, newPackagedPath])
  }
  // Otherwise use ArResolver to anchor newFilename to the source file.
  return ArGetResolver().createIdentifier(newFilename, new ArResolvedPath(resolvedPath))
}

/** utils.cpp:248-303 */
function _ReadFromString(doc: Document, s: string, resolvedPath = '',
  searchPath: FileSearchPath = new FileSearchPath(), readOptionsIn: XmlReadOptions | null = null): void {
  // Set up an XmlReadOptions with a callback to this function so that we
  // can also handle any XInclude paths using the ArAsset API.
  const readOptions = readOptionsIn ? readOptionsIn.copy() : new XmlReadOptions()
  readOptions.readXIncludeFunction = (newDoc: Document, newFilename: FilePath | string,
    newSearchPath?: FileSearchPath, newReadOptions?: XmlReadOptions | null) => {
    // MaterialX does not anchor XInclude'd file paths to the source
    // document's path, so we need to do that ourselves to pass to Ar.
    const newFilePath = _AnchorXInclude(String(typeof newFilename === 'string'
      ? newFilename : newFilename.asString()), resolvedPath)
    const newResolvedPath = _ArResolveSync(newFilePath)
    if (!newResolvedPath.valid) {
      // TF_RUNTIME_ERROR; thrown, so the read (and the document) fails as
      // upstream's TfErrorMark makes UsdMtlxReadDocument return null.
      throw new TfError(`Unable to open MaterialX document '${newFilePath}'`, TfDiagnosticType.RuntimeError)
    }
    _ReadFromAsset(newDoc, newResolvedPath, newSearchPath, newReadOptions ?? null)
  }

  // The source URI MaterialX's readFromXmlFile stores on the document it
  // reads (MaterialXFormat/XmlIo.cpp readFromXmlFile): the outermost
  // XInclude's href when reading an XInclude, else the file's path. Upstream
  // reads the reference's documents, plain files, with readFromXmlFile
  // (utils.cpp:344-351), and UsdMtlxGetSourceURI (utils.cpp:503-513) finds
  // custom nodedefs' files through these URIs (reader.cpp:416-454); the
  // asset branch read here (readFromXmlString) would leave them empty.
  doc.setSourceUri(readOptions.parentXIncludes[0] ?? resolvedPath)
  readFromXmlString(doc, s, searchPath, readOptions)

  // Flatten all filenames in document
  flattenFilenames(doc)
}

/** utils.cpp:308-334 */
function _ReadFromAsset(doc: Document, resolvedPath: ArResolvedPath,
  searchPath: FileSearchPath = new FileSearchPath(), readOptionsIn: XmlReadOptions | null = null): void {
  const asset = _ArOpenAssetSync(resolvedPath)
  if (!asset) {
    throw new TfError(`Unable to open MaterialX document '${resolvedPath.toString()}'`, TfDiagnosticType.RuntimeError)
  }
  const s = new TextDecoder().decode(asset.getBuffer())
  _ReadFromString(doc, s, resolvedPath.toString(), searchPath, readOptionsIn)
}

/** utils.cpp:336-373 (the asset branch; see the header above): the
 *  document read from `text`, the contents of the asset at
 *  `resolvedPath`; a failure is thrown as the TfError upstream posts before
 *  returning null. */
export function UsdMtlxReadDocumentFromAsset(resolvedPath: string, text: string): Document {
  try {
    const doc = createDocument()
    _ReadFromString(doc, text, resolvedPath)
    return doc
  } catch (x) {
    if (x instanceof TfError) {
      throw x
    }
    if (x instanceof MxException) {
      throw new TfError(`MaterialX error reading '${resolvedPath}': ${x.message}`, TfDiagnosticType.RuntimeError)
    }
    throw x
  }
}

/**
 * Reads the MaterialX document at `resolvedPath`, and the documents its
 * XIncludes name (recursively, anchored as _ReadFromString anchors them),
 * through Ar ahead of a synchronous read. Never rejects; what cannot be read
 * is missing to the synchronous read, which reports it.
 */
export async function UsdMtlx_PrefetchDocumentAsync(resolvedPath: ArResolvedPath,
  reader: _ArAssetReader): Promise<void> {
  await _PrefetchDocument(resolvedPath.toString(), reader, new Set())
}

async function _PrefetchDocument(assetPath: string, reader: _ArAssetReader,
  seen: Set<string>): Promise<void> {
  let read: Awaited<ReturnType<typeof _ArReadAhead>>
  try {
    read = await _ArReadAhead(assetPath, reader)
  } catch {
    return
  }
  if (!read) return
  const anchor = read.resolvedPath.toString()
  if (seen.has(anchor)) return
  seen.add(anchor)
  // The XIncludes MaterialX's reader hands to readXIncludeFunction
  // (MaterialXFormat XmlIo.cpp documentFromXml), collected by a read whose
  // function only records them.
  const includes: string[] = []
  const options = new XmlReadOptions()
  options.readXIncludeFunction = (_doc, filename) => {
    includes.push(typeof filename === 'string' ? filename : filename.asString())
  }
  try {
    readFromXmlString(createDocument(), new TextDecoder().decode(read.bytes), new FileSearchPath(), options)
  } catch {
    return
  }
  await Promise.all(includes.map(include =>
    _PrefetchDocument(_AnchorXInclude(include, anchor), reader, seen)))
}

// usdMtlx's file extension (UsdMtlxStandardFileExtensions, utils.cpp:235-240).
_ArRegisterAssetPrefetcher(['mtlx'],
  (resolvedPath, reader) => UsdMtlx_PrefetchDocumentAsync(resolvedPath, reader))
