// Ported from OpenUSD 26.11.1: pxr/usd/sdf/fileFormat.cpp,
//  pxr/usd/sdf/fileFormat.h, pxr/usd/sdf/fileFormatRegistry.cpp,
//  pxr/usd/sdf/fileFormatRegistry.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfFileFormat and its registry, following fileFormat.{h,cpp} and the private
// fileFormatRegistry.{h,cpp}. Plug/TfType discovery calls the internal
// registration seam; public callers discover formats through the class API.

import type { SdfAbstractData } from './abstractData.ts'
import { SdfData } from './data.ts'
import type { SdfLayerForWrite } from './usdaFileFormat.ts'
import type { Layer } from './layer.ts'
import { joinPackagePath, splitPackagePath } from 'typescript-usd/ar/_internal'
import { parseCrateLazy, serializeUsdc } from './crateFile.ts'
import { dataFromCrateContents, dataFromParserScene } from './crateDataTypes.ts'
import { Sdf_CrateData } from './crateData.ts'
import { parseUsda } from './textFileFormatParser.ts'
import { _withSdfTraceSync, type SdfTraceContext } from './traceContext.ts'
import { UsdZipFile } from './zipFile.ts'
import { Registry as PlugRegistry, type Plugin as PlugPlugin } from 'typescript-usd/plug'
import {
  Type as TfType, TfDiagnosticMgr, TfDiagnosticType, Error as TfError, TfEnvSetting, TfGetEnvSetting,
  RaiseWarning as TfRaiseWarning,
} from 'typescript-usd/tf'

export type SdfFileFormatArguments = Map<string, string>
export type LayerFileFormatReader = (
  bytes: Uint8Array, layer: Layer, args: ReadonlyMap<string, string>,
) => void

interface FormatCapabilities { reading: boolean; writing: boolean; editing: boolean }

export abstract class SdfFileFormat {
  static readonly typeName: string = 'SdfFileFormat'
  abstract readonly formatId: string
  abstract readonly extensions: readonly string[]
  readonly capabilities: FormatCapabilities = {
    reading: true, writing: false, editing: false,
  }
  read?(
    bytes: Uint8Array, layer: Layer, args: ReadonlyMap<string, string>,
    traceContext?: SdfTraceContext, metadataOnly?: boolean,
  ): void
  writeToBytes?(_layer: SdfLayerForWrite): Uint8Array
  getExternalAssetDependencies(_layer: Layer): string[] { return [] }
  // SdfFileFormat::InitData (fileFormat.cpp): the data object a layer of this
  // format holds, with its pseudo-root spec.
  initData(_args: ReadonlyMap<string, string>): SdfAbstractData {
    const data = new SdfData()
    data.createSpec('/', 'pseudoRoot')
    return data
  }
  /** @internal Whether a subclass supplies its own InitData. */
  _overridesInitData(): boolean { return this.initData !== SdfFileFormat.prototype.initData }
  // SdfFileFormat::IsPackage (fileFormat.h:88).
  isPackage(): boolean { return false }
  // SdfFileFormat::GetPackageRootLayerPath (fileFormat.h:97): the path of
  // the root layer within the package at resolvedPath.
  getPackageRootLayerPath(_resolvedPath: string): string { return '' }

  static findByExtension(
    path: string, traceContext?: SdfTraceContext,
  ): SdfFileFormat | undefined {
    return _withSdfTraceSync(
      traceContext, 'typescript-usd:SdfFileFormat.findByExtension',
      () => findFormatForPath(path),
    )
  }

  // SdfFileFormat::FindByExtension(path, target) with a target
  // (fileFormat.cpp:474-480, Sdf_FileFormatRegistry::_GetFormatInfo,
  // fileFormatRegistry.cpp:120-152): the format for the extension whose
  // target matches; an empty target is the extension's primary format.
  static findByExtensionAndTarget(path: string, target: string): SdfFileFormat | undefined {
    if (target === '') return SdfFileFormat.findByExtension(path)
    const infos = pluginFormatIndex().fullByExtension.get(extensionForPath(path)) ?? []
    const info = infos.find(candidate => targetOf(candidate) === target)
    if (!info) return undefined
    return info instanceof SdfFileFormat ? info : getFileFormat(info)
  }

  // SdfFileFormat::FindByExtension(path, args) (fileFormat.cpp:482-508): the
  // first of the comma-separated 'target' argument's targets with a format
  // for the extension; none when the argument names no such target. Without
  // a 'target' argument, the primary format.
  static findByExtensionForArgs(
    path: string, args: ReadonlyMap<string, string>, traceContext?: SdfTraceContext,
  ): SdfFileFormat | undefined {
    const targets = args.get('target')
    if (targets === undefined) return SdfFileFormat.findByExtension(path, traceContext)
    for (const raw of targets.split(',')) {
      const target = raw.trim()
      if (target === '') continue
      const format = SdfFileFormat.findByExtensionAndTarget(path, target)
      if (format) return format
    }
    return undefined
  }

  // SdfFileFormat::FindById (fileFormat.h:338; fileFormat.cpp:467-471).
  static findById(formatId: string): SdfFileFormat | undefined {
    for (const format of formats.values()) {
      if (format.formatId === formatId) return format
    }
    const info = pluginFormatIndex().byId.get(formatId)
    return info ? getFileFormat(info) : undefined
  }
}

/** Sdf_FileFormatFactoryBase (fileFormat.h:536-541): the TfType factory a
 *  file format plugin's type manufactures its format with. */
export interface SdfFileFormatFactoryBase {
  'new'(): SdfFileFormat
}

/**
 * SDF_DEFINE_FILE_FORMAT (fileFormat.h:552-584): defines the format's TfType
 * with its bases and sets the factory Sdf uses to manufacture it. A file
 * format plugin's module calls this at its top level, where upstream calls
 * it from a TF_REGISTRY_FUNCTION; the type name is the one its plugInfo
 * declares.
 */
export function SdfDefineFileFormat(
  typeName: string, formatClass: new () => SdfFileFormat,
  baseTypeNames: readonly string[] = ['SdfFileFormat'],
): TfType {
  const type = TfType.define(typeName, baseTypeNames.map(name => TfType.declare(name)))
  type.setFactory({ new: () => new formatClass() } satisfies SdfFileFormatFactoryBase)
  definedFormatTypes.set(formatClass, type)
  return type
}

// The TfType each SdfDefineFileFormat class defines.
const definedFormatTypes = new WeakMap<object, TfType>()

/**
 * @internal TfType::Find(*fileFormat) (tf/type.h:146-160): the TfType of a
 * format object's most-derived class. JavaScript has no typeid, so a class
 * names its type with SdfDefineFileFormat or its own static typeName; a class
 * that does neither has no TfType (Unknown), as an undeclared C++ type does.
 */
export function _fileFormatType(format: SdfFileFormat): TfType {
  const ctor = format.constructor
  const defined = definedFormatTypes.get(ctor)
  if (defined) return defined
  return Object.prototype.hasOwnProperty.call(ctor, 'typeName')
    ? TfType.findByName((ctor as typeof SdfFileFormat).typeName)
    : TfType.getUnknownType()
}

// usdaFileFormat.cpp:40-46.
const SDF_FILE_FORMAT_LEGACY_IMPORT = new TfEnvSetting<string>('SDF_FILE_FORMAT_LEGACY_IMPORT', 'warn',
  'By default, we warn when imported strings are encounted with the legacy ' +
  '`#sdf 1.4.32` header format; these legacy strings are read in as ' +
  '.usda version 1.0`. When this environment variable is set to ' +
  "'error', strings imported with the sdf header will no longer be ingested " +
  "and an error will be emitted. This environment variable can be set to " +
  "'allow' to silence warnings and allow legacy sdf header ingestion.")

/** @internal The text SdfUsdaFileFormat::ReadFromString parses
 * (usdaFileFormat.cpp:565-600): `str` with leading whitespace trimmed and a
 * legacy `#sdf 1.4.32` cookie rewritten to `#usda 1.0` when
 * SDF_FILE_FORMAT_LEGACY_IMPORT is "allow" or "warn" (warning for "warn").
 * Otherwise the import fails with a runtime error, thrown here. */
export function sdfUsdaReadFromStringText(str: string): string {
  const legacyCookie = '#sdf 1.4.32'
  const modernCookie = '#usda 1.0'
  const trimmed = str.replace(/^[ \t\n\v\f\r]+/, '')
  if (!trimmed.startsWith(legacyCookie)) return trimmed
  // Upstream reads the setting once (a function-local static); it is read
  // per import here so tests can set it.
  const readSdf = TfGetEnvSetting(SDF_FILE_FORMAT_LEGACY_IMPORT)
  if (readSdf === 'allow' || readSdf === 'warn') {
    if (readSdf === 'warn') {
      TfRaiseWarning(`'${legacyCookie}' is a deprecated format for reading. Use '${modernCookie}' instead.`)
    }
    return modernCookie + trimmed.slice(legacyCookie.length)
  }
  throw new TfError(
    `'${legacyCookie}' is not a supported format for reading. Use '${modernCookie}' instead.`,
    TfDiagnosticType.RuntimeError)
}

export class SdfUsdaFileFormat extends SdfFileFormat {
  static readonly typeName: string = 'SdfUsdaFileFormat'
  // Derived text formats supply their own id and extensions.
  readonly formatId: string = 'usda'
  readonly extensions: readonly string[] = ['usda']
  override readonly capabilities = { reading: true, writing: true, editing: true }
  read(
    bytes: Uint8Array, layer: Layer, _args: ReadonlyMap<string, string>,
    traceContext?: SdfTraceContext, metadataOnly = false,
  ): void {
    _withSdfTraceSync(traceContext, 'typescript-usd:SdfUsdaFileFormat.read', context => {
      const parsed = readUsdaData(bytes, context, layer.filePath, `#${this.formatId}`, metadataOnly)
      // SdfUsdaFileFormat::Read parses into InitData's data object.
      if (this._overridesInitData()) {
        const data = this.initData(_args)
        data.copyFrom(parsed)
        layer._setDataFromFileFormat(data)
      } else {
        layer._setDataFromFileFormat(parsed)
      }
    })
  }
}

export class SdfUsdcFileFormat extends SdfFileFormat {
  static readonly typeName: string = 'SdfUsdcFileFormat'
  readonly formatId = 'usdc'
  readonly extensions = ['usdc']
  override readonly capabilities = { reading: true, writing: true, editing: true }
  read(
    bytes: Uint8Array, layer: Layer, _args: ReadonlyMap<string, string>,
    traceContext?: SdfTraceContext, metadataOnly = false,
  ): void {
    _withSdfTraceSync(traceContext, 'typescript-usd:SdfUsdcFileFormat.read', context => {
      layer._setDataFromFileFormat(readCrateData(bytes, context, layer.isDetached(), layer.resolvedPath || layer.identifier))
    })
  }
  /** @internal SdfUsdcFileFormat::_ReadFromAsset (usdcFileFormat.cpp:106). */
  _readFromAsset(bytes: Uint8Array, layer: Layer, traceContext?: SdfTraceContext): void {
    _withSdfTraceSync(traceContext, 'typescript-usd:SdfUsdcFileFormat.readFromAsset', context => {
      layer._setDataFromFileFormat(readCrateData(bytes, context, layer.isDetached(), layer.resolvedPath || layer.identifier))
    })
  }
  writeToBytes(layer: SdfLayerForWrite, writeVersion?: readonly [number, number, number]): Uint8Array {
    return serializeUsdc(layer, writeVersion)
  }
  // SdfUsdcFileFormat::InitData: crate data.
  override initData(_args: ReadonlyMap<string, string>): SdfAbstractData {
    const data = new Sdf_CrateData()
    data.createSpec('/', 'pseudoRoot')
    return data
  }
}

export class SdfUsdFileFormat extends SdfFileFormat {
  static readonly typeName: string = 'SdfUsdFileFormat'
  readonly formatId = 'usd'
  readonly extensions = ['usd']
  override readonly capabilities = { reading: true, writing: true, editing: true }
  private readonly usdc = new SdfUsdcFileFormat()
  // SdfUsdFileFormat::InitData: the data of the format the arguments name,
  // or of the default format (usdc).
  override initData(args: ReadonlyMap<string, string>): SdfAbstractData {
    return args.get('format') === 'usda' ? super.initData(args) : this.usdc.initData(args)
  }
  /**
   * SdfUsdFileFormat::GetUnderlyingFormatForLayer (usdFileFormat.h:57-62;
   * usdFileFormat.cpp:66-83,270-287): the 'format' argument naming the
   * format backing a .usd layer's data ('usdc' for crate data, 'usda' for
   * text data), or empty for a layer of another format. A layer of neither
   * kind of data takes the default underlying format, usdc
   * (USD_DEFAULT_FILE_FORMAT is not ported; usdFileFormat.cpp:86-103).
   */
  static getUnderlyingFormatForLayer(layer: Layer): string {
    if (layer.getFileFormat()?.formatId !== 'usd') return ''
    const data = layer['_data']
    if (data instanceof Sdf_CrateData) return 'usdc'
    if (data instanceof SdfData) return 'usda'
    return 'usdc'
  }

  read(
    bytes: Uint8Array, layer: Layer, args: ReadonlyMap<string, string>,
    traceContext?: SdfTraceContext, metadataOnly = false,
  ): void {
    _withSdfTraceSync(traceContext, 'typescript-usd:SdfUsdFileFormat.read', context => {
      if (isCrate(bytes)) this.usdc._readFromAsset(bytes, layer, context)
      else layer._setDataFromFileFormat(readUsdaData(bytes, context, layer.filePath, '#usda', metadataOnly))
    })
  }
}

export class SdfUsdzFileFormat extends SdfFileFormat {
  static readonly typeName: string = 'SdfUsdzFileFormat'
  readonly formatId = 'usdz'
  readonly extensions = ['usdz']
  override readonly capabilities = { reading: true, writing: false, editing: false }
  override isPackage(): boolean { return true }

  // SdfUsdzFileFormat::GetPackageRootLayerPath (usdzFileFormat.cpp:65-71):
  // the package's root layer, as read from the package at resolvedPath,
  // which may itself be nested in another package.
  override getPackageRootLayerPath(resolvedPath: string): string {
    return packageEntries.get(resolvedPath)?.[0] ?? ''
  }

  // SdfUsdzFileFormat::_ReadHelper (usdzFileFormat.cpp:125-158): the layer
  // is read by the format of the package's first file. When that file is
  // itself a package, its format's Read runs on the joined package-relative
  // path, so the read recurses into the nested package until it reaches a
  // non-package layer.
  read(
    bytes: Uint8Array, layer: Layer, args: ReadonlyMap<string, string>,
    traceContext?: SdfTraceContext, metadataOnly = false,
  ): void {
    let packagePaths = [layer.identifier, layer.resolvedPath]
    let zip = UsdZipFile.fromBytes(bytes)
    for (;;) {
      _recordPackageEntries(packagePaths, zip)
      // _GetFirstFileInZipFile (usdzFileFormat.cpp:49-60): the first entry,
      // whatever it is, is the package's root layer.
      const firstFile = zip.getFileNames()[0]
      if (!firstFile) throw new Error(`'${packagePaths[0]}' contains no usd layer`)
      const rootBytes = zip._extractStored(firstFile)
      if (!rootBytes) throw new Error(`'${packagePaths[0]}[${firstFile}]' is not stored uncompressed`)
      if (!SdfFileFormat.findByExtension(firstFile)?.isPackage() || !UsdZipFile.isZip(rootBytes)) {
        this._readPackageRoot(firstFile, rootBytes, layer, args, traceContext, metadataOnly)
        return
      }
      packagePaths = packagePaths.map(path => joinPackagePath(path, firstFile))
      zip = UsdZipFile.fromBytes(rootBytes)
    }
  }

  /** @internal Reads an already-extracted, non-package root layer into layer. */
  _readPackageRoot(
    firstFile: string, rootBytes: Uint8Array, layer: Layer, args: ReadonlyMap<string, string>,
    traceContext?: SdfTraceContext, metadataOnly = false,
  ): void {
    const packagedFileFormat = SdfFileFormat.findByExtension(firstFile)
    if (!packagedFileFormat?.read) {
      throw new Error(`Could not determine file format for packaged layer: ${firstFile}`)
    }
    packagedFileFormat.read(rootBytes, layer, args, traceContext, metadataOnly)
  }
}

// The entry names of each package read, in zip order, by package path (both
// the identifier and the resolved form; nested packages by their
// package-relative path). Upstream reopens the zip through
// Sdf_UsdzResolverCache for each query (_GetFirstFileInZipFile,
// usdzFileFormat.cpp:49-60; Sdf_UsdzResolver::Resolve, usdzResolver.cpp:
// 108-123); Ar reads are asynchronous here, so the names are kept from the
// read so GetPackageRootLayerPath and packaged-path anchoring
// (layerUtils.cpp:117-180) can answer synchronously.
const packageEntries = new Map<string, readonly string[]>()

/** @internal Records the entries of a package that has been opened. */
export function _recordPackageEntries(packagePaths: readonly string[], zip: UsdZipFile): void {
  const names = zip.getFileNames()
  for (const path of packagePaths) if (path) packageEntries.set(path, names)
}

/** @internal Whether a previously opened package holds packagedPath; undefined
 * when the package has not been opened. */
export function _packageHasEntry(packagePath: string, packagedPath: string): boolean | undefined {
  return packageEntries.get(packagePath)?.includes(packagedPath)
}

// Formats that are part of this build, by extension. They are the formats
// upstream's sdf and usdMtlx plugInfo.json declare with target "usd" and
// primary true; their classes register here directly.
const formats = new Map<string, SdfFileFormat>()
const normalizeExtension = (ext: string): string => ext.replace(/^\./, '').toLowerCase()

/** @internal Plug/TfType file-format discovery boundary. */
export function _registerFileFormat(format: SdfFileFormat): void {
  for (const extension of format.extensions) {
    formats.set(normalizeExtension(extension), format)
  }
  pluginIndex = undefined
}

// Sdf_FileFormatRegistry::_Info (fileFormatRegistry.cpp:61-88) for a format
// a plugin declares.
interface PluginFormatInfo {
  readonly formatId: string
  readonly type: TfType
  readonly target: string
  readonly plugin: PlugPlugin
  readonly capabilities: FormatCapabilities
  format?: SdfFileFormat
}

interface PluginFormatIndex {
  readonly byId: Map<string, PluginFormatInfo>
  // The primary format for each extension, when a plugin's format is primary.
  readonly byExtension: Map<string, PluginFormatInfo>
  // Every format for each extension (_fullExtensionIndex).
  readonly fullByExtension: Map<string, (PluginFormatInfo | SdfFileFormat)[]>
  // Extensions whose primary format could not be determined.
  readonly unresolved: Set<string>
}

const BUILT_IN_TARGET = 'usd'
const fileFormatType = TfType.declare('SdfFileFormat')
let pluginIndex: PluginFormatIndex | undefined
const reportedPluginErrors = new Set<string>()

// Upstream builds the index once, on first use (_RegisterFormatPlugins,
// fileFormatRegistry.cpp:257-529), because every plugin is registered at
// startup. Plugins can be registered at any time on the web, so the index is
// rebuilt when PlugRegistry registers more.
PlugRegistry.GetInstance().addDidRegisterPluginsListener(() => { pluginIndex = undefined })

function reportPluginError(message: string): void {
  if (reportedPluginErrors.has(message)) return
  reportedPluginErrors.add(message)
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

// _FormatCapabilityIsSupported (fileFormatRegistry.cpp:43-57): capabilities
// are on unless the plugin metadata opts out.
function pluginCapabilities(metadata: Record<string, unknown>): FormatCapabilities {
  return {
    reading: metadata.supportsReading !== false,
    writing: metadata.supportsWriting !== false,
    editing: metadata.supportsEditing !== false,
  }
}

// _RegisterFormatPlugins (fileFormatRegistry.cpp:257-529).
function pluginFormatIndex(): PluginFormatIndex {
  if (pluginIndex) return pluginIndex
  const registry = PlugRegistry.GetInstance()
  const byId = new Map<string, PluginFormatInfo>()
  const builtInIds = new Set([...formats.values()].map(format => format.formatId))
  // Each extension's formats: a built-in format is its own entry.
  const fullExtensionIndex = new Map<string, (PluginFormatInfo | SdfFileFormat)[]>()
  for (const [extension, format] of formats) fullExtensionIndex.set(extension, [format])

  const formatTypes = [...new Set(fileFormatType.getAllDerivedTypes())]
    .sort((a, b) => a.getTypeName() < b.getTypeName() ? -1 : a.getTypeName() > b.getTypeName() ? 1 : 0)
  for (const formatType of formatTypes) {
    const plugin = registry.getPluginForType(formatType)
    if (!plugin) continue
    const typeName = formatType.getTypeName()
    const metadata = plugin.getMetadataForType(formatType)
    const formatId = metadata.formatId
    if (formatId === undefined) continue
    if (typeof formatId !== 'string') {
      reportPluginError(`Unexpected value type for key 'formatId' in plugin meta data for file format type '${typeName}'`)
      continue
    }
    if (formatId === '') {
      reportPluginError(`File format '${typeName}' plugin meta data 'formatId' is empty`)
      continue
    }
    const rawExtensions = metadata.extensions
    if (rawExtensions === undefined) continue
    if (!Array.isArray(rawExtensions) || rawExtensions.some(ext => typeof ext !== 'string')) {
      reportPluginError(`Unexpected value type for key 'extensions' in plugin meta data for file format type '${typeName}'`)
      continue
    }
    if (rawExtensions.length === 0) {
      reportPluginError(`File format '${typeName}' plugin meta data 'extensions' is empty`)
      continue
    }
    // 'target' may be inherited from a base format type; SdfFileFormat's is
    // "sdf" (sdf/plugInfo.json).
    let target: unknown
    for (const type of formatType.getAllAncestorTypes()) {
      target = type === fileFormatType ? 'sdf' : registry.getMetadataForType(type).target
      if (target !== undefined) break
    }
    if (target === undefined) continue
    if (typeof target !== 'string') {
      reportPluginError(`Unexpected value type for key 'target' in plugin meta data for file format type '${typeName}'`)
      continue
    }
    if (target === '') {
      reportPluginError(`File format '${typeName}' plugin meta data 'target' is empty`)
      continue
    }
    // A format of this build whose plugin's plugInfo also declares it (as
    // usdMtlx's does) is already registered: its metadata describes that
    // format and there is nothing to load or manufacture.
    if (builtInIds.has(formatId) && plugin.isLoaded() && !formatType.getFactory()) continue
    if (byId.has(formatId) || builtInIds.has(formatId)) {
      reportPluginError(`Duplicate registration for file format '${formatId}'`)
      continue
    }
    const info: PluginFormatInfo = { formatId, type: formatType, target, plugin, capabilities: pluginCapabilities(metadata) }
    byId.set(formatId, info)
    for (let ext of (rawExtensions as string[]).map(ext => ext.toLowerCase())) {
      if (ext === '') continue
      if (ext.startsWith('.')) ext = ext.slice(1)
      const infos = fullExtensionIndex.get(ext) ?? []
      if (infos.some(other => targetOf(other) === target)) {
        reportPluginError(`Multiple file formats with target '${target}' registered for extension '${ext}', skipping.`)
        continue
      }
      infos.push(info)
      fullExtensionIndex.set(ext, infos)
    }
  }

  // The primary format of each extension.
  const byExtension = new Map<string, PluginFormatInfo>()
  const unresolved = new Set<string>()
  for (const [ext, infos] of fullExtensionIndex) {
    let primary: PluginFormatInfo | SdfFileFormat | undefined
    if (infos.length === 1) primary = infos[0]
    else {
      for (const info of infos) {
        const isPrimary = info instanceof SdfFileFormat ? true
          : registry.getMetadataForType(info.type).primary
        if (isPrimary === undefined) continue
        if (typeof isPrimary !== 'boolean') {
          reportPluginError(`Unexpected value type for key 'primary' in plugin meta data for file format type '${(info as PluginFormatInfo).type.getTypeName()}'`)
          continue
        }
        if (!isPrimary) continue
        if (!primary) { primary = info; continue }
        primary = undefined
        reportPluginError(`Multiple primary file formats specified for extension '${ext}', skipping.`)
        unresolved.add(ext)
        break
      }
      if (!primary && !unresolved.has(ext)) {
        reportPluginError(`No primary file format specified for extension '${ext}', skipping.`)
        unresolved.add(ext)
      }
    }
    if (primary && !(primary instanceof SdfFileFormat)) byExtension.set(ext, primary)
  }
  return pluginIndex = { byId, byExtension, fullByExtension: fullExtensionIndex, unresolved }
}

function targetOf(info: PluginFormatInfo | SdfFileFormat): string {
  return info instanceof SdfFileFormat ? BUILT_IN_TARGET : info.target
}

// _Info::GetFileFormat (fileFormatRegistry.cpp:61-88): load the plugin, then
// manufacture the format with its type's factory, once. Loading is
// asynchronous here, so a synchronous lookup of an unloaded plugin's format
// reports the plugin as unloaded (PlugPlugin.Load) and finds nothing; the
// layer-opening path loads it first (_loadFileFormatPluginForPath).
function getFileFormat(info: PluginFormatInfo, load = true): SdfFileFormat | undefined {
  if (info.format) return info.format
  if (!info.plugin.isLoaded() && (!load || !info.plugin.Load())) return undefined
  const format = info.type.getFactory<SdfFileFormatFactoryBase>()?.new()
  if (format) info.format = format
  return info.format
}

function pluginFormatInfoForPath(filePath: string): PluginFormatInfo | undefined {
  const ext = extensionForPath(filePath)
  return ext ? pluginFormatIndex().byExtension.get(ext) : undefined
}

/** @internal Loads the plugin providing the file format for filePath, if a
 *  plugin provides it, so synchronous lookups then find the format. */
export async function _loadFileFormatPluginForPath(filePath: string): Promise<void> {
  const info = pluginFormatInfoForPath(filePath)
  if (info && !info.plugin.isLoaded()) await info.plugin.loadAsync()
}

/** @internal The file format for filePath if it needs no plugin load. */
export function _loadedFileFormatForPath(filePath: string): SdfFileFormat | undefined {
  const ext = extensionForPath(filePath)
  if (!ext || pluginFormatIndex().unresolved.has(ext)) return undefined
  const info = pluginFormatIndex().byExtension.get(ext)
  return info ? getFileFormat(info, false) : formats.get(ext)
}

for (const format of [
  new SdfUsdaFileFormat(),
  new SdfUsdcFileFormat(),
  new SdfUsdFileFormat(),
  new SdfUsdzFileFormat(),
]) _registerFileFormat(format)

function extensionForPath(filePath: string): string {
  let path = filePath.split(':SDF_FORMAT_ARGS:', 1)[0]!
  // ArResolver::GetExtension selects the innermost packaged asset
  // (resolver.cpp:611-629), not merely the first packaged component.
  for (let pkg = splitPackagePath(path); pkg; pkg = splitPackagePath(path)) {
    path = pkg.innerPath
  }
  const dot = path.lastIndexOf('.')
  // SdfFileFormat::GetFileExtension (fileFormat.cpp:414-424): a string with
  // no extension is itself the extension ("usda").
  return dot < 0 ? normalizeExtension(path) : normalizeExtension(path.slice(dot + 1))
}

function findFormatForPath(filePath: string): SdfFileFormat | undefined {
  const ext = extensionForPath(filePath)
  if (pluginFormatIndex().unresolved.has(ext)) return undefined
  const info = pluginFormatIndex().byExtension.get(ext)
  return info ? getFileFormat(info) : formats.get(ext)
}

function capabilitiesForExtension(ext: string): FormatCapabilities | undefined {
  const normalized = normalizeExtension(ext)
  if (pluginFormatIndex().unresolved.has(normalized)) return undefined
  return pluginFormatIndex().byExtension.get(normalized)?.capabilities ?? formats.get(normalized)?.capabilities
}

export function formatForPath(filePath: string): SdfFileFormat | undefined {
  return SdfFileFormat.findByExtension(filePath)
}

export const _sdfFileFormatForPath = formatForPath

export function FormatSupportsReading(ext: string): boolean {
  return capabilitiesForExtension(ext)?.reading ?? false
}
export function FormatSupportsWriting(ext: string): boolean {
  return capabilitiesForExtension(ext)?.writing ?? false
}
export function FormatSupportsEditing(ext: string): boolean {
  return capabilitiesForExtension(ext)?.editing ?? false
}

function isCrate(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x58 && bytes[2] === 0x52 && bytes[3] === 0x2d
}

// Values decode lazily from the file bytes, so the layer keeps its own copy
// rather than a caller's buffer that could change underneath it.
function readCrateData(
  bytes: Uint8Array, traceContext?: SdfTraceContext, detached = false, assetPath = '',
): SdfAbstractData {
  return _withSdfTraceSync(traceContext, 'typescript-usd:parseCrate', () =>
    dataFromCrateContents(parseCrateLazy(bytes.slice(), assetPath), detached, assetPath))
}

function readUsdaData(
  bytes: Uint8Array,
  traceContext?: SdfTraceContext,
  sourceName = '',
  formatCookie = '#usda',
  metadataOnly = false,
): SdfAbstractData {
  // SdfUsdaFileFormat::_CheckBOM, usdaFileFormat.cpp:183-220. Check bytes
  // before TextDecoder silently consumes an otherwise-invalid UTF-8 BOM.
  let bom: string | undefined
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) bom = 'UTF-8 BOM'
  else if ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0xff && bytes[1] === 0xfe)) bom = 'UTF-16 BOM marker'
  else if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff) bom = 'UTF-32 BOM marker'
  if (bom) throw new Error(`Asset starts with ${bom} which is not supported, please convert the file to UTF-8 without the BOM.`)
  let text = new TextDecoder().decode(bytes)
  // Formats derived from SdfUsdaFileFormat read their own cookie
  // ('#' + format id, usdaFileFormat.cpp _CanReadImpl).
  if (formatCookie !== '#usda') {
    const start = text.length - text.trimStart().length
    if (text.startsWith(`${formatCookie} `, start)) {
      text = text.slice(0, start) + '#usda' + text.slice(start + formatCookie.length)
    }
  }
  const cookie = /^\s*(#(?:usda|sdf)\s+[^\s]+)/.exec(text)?.[1]
  // _CanReadImpl (usdaFileFormat.cpp:180-203).
  if (!cookie) throw new Error('Not a USDA file: missing #usda header')
  if (!cookie.startsWith('#usda ') && !cookie.startsWith('#sdf 1.4.32')) {
    throw new Error(`Unable to parse layer version from '${cookie?.split(/\s+/, 2)[1] ?? ''}'.`)
  }
  if (cookie.startsWith('#usda ')) {
    // SdfUsdaData::ValidateLayerVersionString (usdaData.cpp:28-56): usda
    // versions 1.0 through 1.4 (usdaFileFormat.cpp:66-77) can be read.
    const version = cookie.slice('#usda '.length)
    const components = /^(\d+)\.(\d+)(?:\.(\d+))?$/.exec(version)
    if (!components || components.slice(1).some(component =>
      component !== undefined && Number(component) > 255)) {
      throw new Error(`Unable to parse layer version from '${version}'.`)
    }
    const [major, minor] = [Number(components[1]), Number(components[2])]
    if (major < 1) {
      throw new Error(`Cannot parse layer version '${version}'. The minimum supported version is '1.0'.`)
    }
    if (major !== 1 || minor > 4) {
      throw new Error(`Cannot parse layer version '${version}'. The maximum supported version is '1.4'.`)
    }
  }
  if (!metadataOnly && /\b(?:add|append|prepend|delete|reorder)\s+[^=\r\n]*\.connect\s*=\s*None\b/.test(text)) {
    throw new Error('Setting connection paths to None is only allowed for explicit connection paths')
  }
  return _withSdfTraceSync(traceContext, 'typescript-usd:parseUsda', () =>
    dataFromParserScene(parseUsda(text, sourceName, metadataOnly)))
}
