// Ported from OpenUSD 26.11.1: pxr/usd/sdf/usdaFileFormat.cpp,
//  pxr/usd/sdf/usdaFileFormat.h, pxr/usd/sdf/fileIO_Common.cpp,
//  pxr/usd/sdf/fileIO_Common.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// USDA text format writer — spec ch. 16.2
// Serializes an authored Layer's specs and fields back to .usda text.
//
// Formatting is a faithful port of the upstream text writer
// (pxr/usd/sdf/fileIO_Common.{h,cpp} + usdaFileFormat.cpp _WriteLayer):
//   * string quoting via Sdf_FileIOUtility::Quote (double quote preferred,
//     single quote when the string contains '"' but no "'", triple quotes for
//     strings containing newlines),
//   * VtValue bools print as 1/0 (C++ ostream form used by StringFromVtValue),
//     while metadata bools (active, hidden, ...) print true/false
//     (Sdf_WriteSimpleField's IsHolding<bool> special case -> TfStringify),
//   * asset-typed values print as @path@ (_StringFromAssetPath),
//   * matrices (incl. frame4d) print in GfMatrix stream form
//     "( (1, 0), (0, 1) )",
//   * prim/property metadata sections put the comment first, then all fields
//     in TfDictionaryLessThan order (Sdf_WritePrimMetadata / Sdf_WriteAttribute),
//   * dictionaries (customData, fallbackPrimTypes, ...) are multi-line with
//     byte-sorted keys and per-entry value type names (_WriteDictionary),
//   * layer metadata puts the comment first, then fields in plain sorted
//     order, with subLayers one per line (usdaFileFormat.cpp _WriteLayer),
//   * properties emit in dictionary order, attributes before relationships on
//     name ties (_SortByNameThenType).

import type { SdfSpecType } from './abstractData.ts'
import { sdfNormalizeListOp, type SdfNormalizedListOp } from './listOp.ts'
import {
  dictionaryStrcmp, TfDiagnosticMgr, TfDiagnosticType, TfEnvSetting, TfGetEnvSetting,
  Error as TfError, RaiseWarning as TfRaiseWarning, TfStreamDouble, TfStreamFloat,
} from 'typescript-usd/tf'
import { SdfOpaqueValue } from './opaqueValue.ts'
import {
  CurveType as TsCurveType, ExtrapMode as TsExtrapMode, InterpMode as TsInterpMode, Spline as TsSpline, TangentAlgorithm as TsTangentAlgorithm,
} from 'typescript-usd/ts'
import { SdfAssetPath } from './assetPath.ts'
import { SdfPath } from './path.ts'
import { SdfAnimationBlock, SdfUnregisteredValue, SdfValueBlock } from './types.ts'
import { SdfSchema, _sdfGetDictionaryValueTypes, _sdfGetMetadataFieldType, _sdfIsDictionary, _sdfIsGfValue, type SdfMetadataSpecType } from './schema.ts'
import { sdfCanonicalTextTypeName, sdfValueTypeNameOfValue } from './parserHelpers.ts'
import { Array as VtArray, ArrayEdit as VtArrayEdit } from 'typescript-usd/vt'
import { _halfBitsToFloat } from 'typescript-usd/gf'

type FieldMap = Record<string, { value: unknown; valueTypeName?: string | undefined }>
type SceneMap = Record<string, FieldMap>

// The slice of a layer the USDA writer serializes — spec visitation and field
// access only. The concrete SdfLayer (layer.ts) imports this writer, so the
// writer takes this narrow view rather than importing Layer back.
export interface SdfLayerForWrite {
  getSpecPaths(): string[]
  getFieldNames(specPath: string): string[]
  getField(specPath: string, fieldName: string): unknown
  getSpecType?(specPath: string): SdfSpecType
  _getFieldValueTypeName?(specPath: string, fieldName: string): string | undefined
}

// The spec type of each snapshotted spec: relationships and attributes are
// written by different productions (Sdf_WriteRelationship / Sdf_WriteAttribute).
const snapshotSpecTypes = new WeakMap<FieldMap, SdfSpecType>()

function isRelationshipSpec(spec: FieldMap | undefined): boolean {
  return spec !== undefined && snapshotSpecTypes.get(spec) === 'relationship'
}

function snapshotLayer(layer: SdfLayerForWrite): SceneMap {
  const scene: SceneMap = {}
  for (const specPath of layer.getSpecPaths()) {
    const fields: FieldMap = {}
    for (const fieldName of layer.getFieldNames(specPath)) {
      const value = layer.getField(specPath, fieldName)
      // An SdfUnregisteredValue authored through the API writes as the value
      // it holds (operator<<, types.cpp:909-912), as a parsed one does.
      fields[fieldName] = value instanceof SdfUnregisteredValue
        ? { value: value.value, valueTypeName: value.typeName }
        : { value, valueTypeName: layer._getFieldValueTypeName?.(specPath, fieldName) }
    }
    const specType = layer.getSpecType?.(specPath)
    if (specType) snapshotSpecTypes.set(fields, specType)
    scene[specPath] = fields
  }
  return scene
}

// SdfFileVersion::FromString (fileVersion.cpp:27-71) and AsInt
// (fileVersion.h:49-53): "M.m" or "M.m.p", optionally followed by white
// space; undefined for an invalid version.
function fileVersionFromString(str: string): [number, number, number] | undefined {
  const match = /^(\d+)\.(\d+)(?:\.(\d+))?(?:[ \t\n].*)?$/s.exec(str)
  if (!match) return undefined
  const version = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] as [number, number, number]
  if (version.some(part => part > 255) || version.every(part => part === 0)) return undefined
  return version
}
const fileVersionAsInt = ([maj, min, pat]: readonly [number, number, number]): number =>
  maj << 16 | min << 8 | pat
// SdfFileVersion::AsString (fileVersion.cpp:77-86): the patch is elided when 0.
const fileVersionAsString = ([maj, min, pat]: readonly [number, number, number]): string =>
  pat === 0 ? `${maj}.${min}` : `${maj}.${min}.${pat}`

// usdaFileFormat.cpp:49-54 and 75-77.
const DEFAULT_NEW_VERSION = '1.0'
const USDA_MAX_OUTPUT_VERSION: readonly [number, number, number] = [1, 4, 0]
const USD_WRITE_NEW_USDA_FILES_AS_VERSION = new TfEnvSetting(
  'USD_WRITE_NEW_USDA_FILES_AS_VERSION', DEFAULT_NEW_VERSION,
  'When writing new usda files, write them as this version.' +
  ' This must have the same major version as the software and have less or' +
  ' equal minor and patch versions. This is only for new files; saving' +
  ' edits to an existing file preserves its version.')

// SdfUsdaFileFormat::GetDefaultOutputVersion (usdaFileFormat.cpp:672-694):
// the setting, read once; an unreadable or unwritable value warns and falls
// back to the default.
let defaultOutputVersion: string | undefined
function getDefaultOutputVersion(): string {
  if (defaultOutputVersion !== undefined) return defaultOutputVersion
  const setting = String(TfGetEnvSetting(USD_WRITE_NEW_USDA_FILES_AS_VERSION))
  let version = fileVersionFromString(setting)
  // SdfFileVersion::CanWrite (fileVersion.h:83-87).
  const [maxMaj, maxMin, maxPat] = USDA_MAX_OUTPUT_VERSION
  if (!version || version[0] !== maxMaj ||
      !(version[1] < maxMin || (version[1] === maxMin && version[2] <= maxPat))) {
    TfRaiseWarning(`Invalid value '${setting}' for USD_WRITE_NEW_USDA_FILES_AS_VERSION - ` +
      `falling back to default '${DEFAULT_NEW_VERSION}'`)
    version = fileVersionFromString(DEFAULT_NEW_VERSION)!
  }
  return defaultOutputVersion = fileVersionAsString(version)
}

// Serialize a Layer to USDA text, upgrading the header as authored values require.
// Sdf_TextOutput::RequestWriteVersionUpgrade (fileIO.cpp:85-104): the
// version the layer being written needs, raised as values require it.
let requestedWriteVersion = DEFAULT_NEW_VERSION

function requestWriteVersionUpgrade(version: '1.1' | '1.2' | '1.3' | '1.4'): void {
  // Requests are monotonic (OpenUSD 26.11.1 fileIO.cpp:80-104).
  if (fileVersionAsInt(fileVersionFromString(version)!) >
      fileVersionAsInt(fileVersionFromString(requestedWriteVersion)!)) requestedWriteVersion = version
}

export function serializeUsda(layer: SdfLayerForWrite): string {
  // WriteToString and WriteToFile pass _WriteLayer no explicit version, so
  // the header starts at the default output version (usdaFileFormat.cpp:
  // 492-522, 616-631; SaveToFile's keeping of the layer's own version,
  // 524-562, is not modelled here;
  // Sdf_TextOutput::WriteHeader, fileIO.cpp:49-77).
  requestedWriteVersion = getDefaultOutputVersion()
  const scene = snapshotLayer(layer)
  const lines: string[] = [`#usda ${requestedWriteVersion}`]

  // Layer-level metadata block (comment, defaultPrim, upAxis, subLayers, ...)
  // usdaFileFormat.cpp:399-467 accumulates pseudo-root metadata in a
  // separate Sdf_StringOutput. Its version requests do not reach the outer
  // output, even on repeated exports; prim/body values upgrade that output.
  const outerVersion = requestedWriteVersion
  const layerMeta = collectLayerMeta(scene)
  requestedWriteVersion = outerVersion
  if (layerMeta.length > 0) {
    lines.push('(')
    for (const line of layerMeta) lines.push(line)
    lines.push(')')
  }

  // Root prim reorder statement — a top-level statement after the layer
  // metadata block, not inside it (usdaFileFormat.cpp: "reorder rootPrims = ").
  // Emitted only when it reorders more than one prim (matches upstream's
  // size() > 1 guard for child/property orders).
  const rootPrimOrder = scene['/']?.['primOrder']?.value as string[] | undefined
  if (Array.isArray(rootPrimOrder) && rootPrimOrder.length > 1) {
    lines.push('')
    lines.push(`reorder rootPrims = [${rootPrimOrder.map(n => quoteString(n, false)).join(', ')}]`)
  }

  // Top-level prims from root primChildren — each preceded by a blank line
  // (usdaFileFormat.cpp writes "\n" before every root prim).
  const rootChildren = (scene['/']?.['primChildren']?.value as string[] | undefined) ?? []
  for (const childName of rootChildren) {
    lines.push('')
    emitPrim(scene, `/${childName}`, lines, 0)
  }

  // Upstream closes the layer with a final "\n" past the prim loop, so a
  // serialized layer always ends "}\n\n".
  lines.push('', '')

  lines[0] = `#usda ${requestedWriteVersion}`
  return lines.join('\n')
}

// ---- Layer metadata (usdaFileFormat.cpp _WriteLayer) ----

// Fields on '/' that are not layer metadata (structural / handled elsewhere).
const LAYER_META_EXCLUDE = new Set([
  'specifier', 'typeName', 'primChildren', 'primOrder', 'properties',
  'comment', 'subLayerOffsets', 'layerRelocates', 'relocates',
])

function collectLayerMeta(scene: SceneMap): string[] {
  const root = scene['/']
  if (!root) return []
  const meta: string[] = []

  // Comment first, as a bare quoted string (readability, like upstream).
  const comment = root['comment']?.value
  if (typeof comment === 'string' && comment !== '') {
    meta.push(`    ${quoteString(comment)}`)
  }

  // Remaining fields in plain sorted order (std::sort over TfToken).
  const keys = Object.keys(root).filter(k => !LAYER_META_EXCLUDE.has(k)).sort()
  for (const key of keys) {
    const v = root[key]?.value
    if (v === undefined) continue
    // SdfUnregisteredValue simple values retain their text, including asset
    // and array literals (OpenUSD 26.11.1 textParserHelpers.cpp:209-258).
    if (root[key]?.valueTypeName === 'unregistered' && typeof v === 'string') {
      meta.push(`    ${key} = ${v}`)
    } else if (isListOpValue(key, v, root[key]?.valueTypeName)) {
      meta.push(...listOpMetaLines(key, v, item => root[key]?.valueTypeName === 'unregisteredListOp' ? String(item) : serializeValue(item)).map(line => `    ${line}`))
    } else if (key === 'subLayers') {
      // subLayers = [\n  @path@ (offset...),\n  ...\n]  — one per line.
      const subLayers = v as string[]
      if (!Array.isArray(subLayers) || subLayers.length === 0) continue
      const offsets = (root['subLayerOffsets']?.value as { offset: number; scale: number }[] | undefined) ?? []
      meta.push('    subLayers = [')
      subLayers.forEach((p, i) => {
        const off = offsets[i]
        const offStr = off && (off.offset !== 0 || off.scale !== 1) ? ` ${offsetClause(off)}` : ''
        meta.push(`        @${p}@${offStr}${i < subLayers.length - 1 ? ',' : ''}`)
      })
      meta.push('    ]')
    } else if (key === 'doc' || key === 'documentation') {
      meta.push(`    doc = ${quoteString(String(v))}`)
    } else if (isPlainDict(v)) {
      meta.push(...dictFieldLines(key, v, 1))
    } else if (v instanceof SdfAssetPath) {
      meta.push(`    ${key} = ${assetPathText(v.getAssetPath())}`)
    } else if (typeof v === 'string' &&
               SdfSchema.getInstance().getFallback(key) instanceof SdfAssetPath) {
      // An asset-valued field (colorConfiguration) holds its path string.
      meta.push(`    ${key} = ${assetPathText(v)}`)
    } else if (typeof v === 'string') {
      meta.push(`    ${key} = ${quoteString(v)}`)
    } else if (typeof v === 'number') {
      const registeredType = _sdfGetMetadataFieldType(key, 'layer')
      meta.push(`    ${key} = ${registeredType ? serializeValue(v, registeredType) : serializeNumber(v)}`)
    } else if (typeof v === 'boolean') {
      // Metadata bools print true/false (Sdf_WriteSimpleField special case).
      meta.push(`    ${key} = ${v}`)
    }
    // Other shapes (list ops etc.) are not valid layer metadata — skip.
  }

  // Add any layer relocates to the header (usdaFileFormat.cpp:392-396).
  const relocates = root['layerRelocates']?.value
  if (relocates && typeof relocates === 'object') {
    const entries: [string, string][] = Array.isArray(relocates)
      ? relocates.filter((entry): entry is [string, string] =>
          Array.isArray(entry) && entry.length === 2 &&
          typeof entry[0] === 'string' && typeof entry[1] === 'string')
      : Object.entries(relocates).filter((entry): entry is [string, string] =>
          typeof entry[1] === 'string')
    meta.push(relocatesLines(entries).map(line => `    ${line}`).join('\n'))
  }
  return meta
}

// ---- Composition metadata (W1b) ----

interface TextListOpFields<T> {
  isExplicit?: boolean
  explicitItems?: T[]
  addedItems?: T[]
  prependedItems?: T[]
  appendedItems?: T[]
  deletedItems?: T[]
  orderedItems?: T[]
}

interface RefItemFields {
  assetPath?: string
  primPath?: string
  layerOffset?: { offset: number; scale: number }
  customData?: Record<string, unknown>
}

function offsetClause(off: { offset: number; scale: number }): string {
  const parts: string[] = []
  if (off.offset !== 0) parts.push(`offset = ${serializeNumber(off.offset)}`)
  if (off.scale !== 1) parts.push(`scale = ${serializeNumber(off.scale)}`)
  return `(${parts.join('; ')})`
}

function refItemText(r: RefItemFields): string {
  let out = ''
  if (r.assetPath) out += `@${r.assetPath}@`
  if (r.primPath || !r.assetPath) out += `<${r.primPath ?? ""}>`
  const off = r.layerOffset
  // fileIO_Common.cpp:311-347: customData requires multiline reference
  // metadata; its offsets precede the dictionary inside the same parens.
  if (r.customData && Object.keys(r.customData).length > 0) {
    out += ' (\n'
    if (off?.offset) out += `    offset = ${serializeNumber(off.offset)}\n`
    if (off && off.scale !== 1) out += `    scale = ${serializeNumber(off.scale)}\n`
    out += dictFieldLines('customData', r.customData, 1).join('\n') + '\n)'
  } else if (off && (off.offset !== 0 || off.scale !== 1)) out += ` ${offsetClause(off)}`
  return out
}

// Emits one metadata line per authored list-op bucket, reconstructing the
// list-edit qualifiers the parser consumed (explicit -> bare, prepended ->
// prepend, appended -> append, deleted -> delete).
function listOpMetaLines<T>(
  key: string,
  lop: TextListOpFields<T>,
  itemText: (item: T) => string,
  singleItemUnbracketed = false,
): string[] {
  const lines: string[] = []
  // fileIO_Common.cpp:383-415: empty explicit is None; path/reference
  // lists use one item per line, string/token/numeric lists stay inline.
  const itemPerLine = ['inherits', 'specializes', 'references', 'payload'].includes(key)
  const emit = (qualifier: string, items: T[] | undefined) => {
    if (!items || (items.length === 0 && qualifier !== '')) return
    const texts = items.map(itemText)
    const single = singleItemUnbracketed && texts.length === 1 && !texts[0]!.includes('\n')
    const value = texts.length === 0 ? 'None'
      : single ? texts[0]!
      : itemPerLine
        ? `[\n${texts.map((text, index) => text.split('\n').map(line => `\0    ${line}`).join('\n') + (index + 1 < texts.length ? ',' : '')).join('\n')}\n\0]`
        : `[${texts.join(', ')}]`
    lines.push(`${qualifier}${key} = ${value}`)
  }
  if (lop.isExplicit) emit('', lop.explicitItems)
  else {
    // Non-explicit bucket order mirrors _WriteListOp (fileIO_Common.cpp):
    // delete, add, prepend, append, reorder.
    emit('delete ', lop.deletedItems)
    emit('add ', lop.addedItems)
    emit('prepend ', lop.prependedItems)
    emit('append ', lop.appendedItems)
    emit('reorder ', lop.orderedItems)
  }
  return lines
}

// ---- Dictionary emission (_WriteDictionary) ----

function isPlainDict(v: unknown): v is Record<string, unknown> {
  return _sdfIsDictionary(v)
}

// Sdf_FileIOUtility::_WriteDictionary (fileIO_Common.cpp:861-871): entries
// holding an empty VtValue (undefined or null here) are skipped with a
// warning before the rest are written.
function writableDictKeys(dict: Record<string, unknown>): string[] {
  return Object.keys(dict).sort().filter(key => {
    if (dict[key] !== undefined && dict[key] !== null) return true
    TfRaiseWarning(`Skipping dictionary entry '${key}' because its value is empty`)
    return false
  })
}

// Value type name for a dictionary entry — the GetSerializationName analog.
// Our parser collapses per-entry declared types to plain JS values, so this
// re-derives the closest Sdf type: string arrays serialize as token[] (the
// shape both usdGenSchema-authored entries — apiSchemaOverridePropertyNames,
// fallbackPrimTypes values — carry upstream).
function dictEntryLines(
  key: string, v: unknown, depth: number, declaredType?: string,
): string[] {
  const ind = indent(depth)
  const keyName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : quoteString(key)
  if (isPlainDict(v)) {
    const lines = [`${ind}dictionary ${keyName} = {`]
    const types = _sdfGetDictionaryValueTypes(v)
    for (const k of writableDictKeys(v)) {
      lines.push(...dictEntryLines(k, v[k], depth + 1, types?.get(k)))
    }
    lines.push(`${ind}}`)
    return lines
  }
  if (v instanceof SdfAssetPath) {
    return [`${ind}asset ${keyName} = ${assetPathText(v.getAssetPath())}`]
  }
  // A Gf value or VtArray carries its type; the entry prints the held type,
  // without a role (a point3f[] entry is a float3[]), as VtValue does.
  const heldType = sdfValueTypeNameOfValue(v)
  if (heldType === 'token[]' || heldType === 'asset[]' || heldType === 'string[]') {
    v = (v as VtArray<unknown>).toArray()
    declaredType = heldType
  } else if (heldType) {
    return [`${ind}${heldType} ${keyName} = ${serializeValue(v, heldType)}`]
  }
  if (typeof v === 'number' && declaredType && /^(?:half|float|double|uchar|int|uint|timecode)$/.test(declaredType)) {
    return [`${ind}${declaredType} ${keyName} = ${serializeValue(v, declaredType)}`]
  }
  if (typeof v === 'bigint' && (declaredType === 'uint64' || declaredType === 'int64')) {
    return [`${ind}${declaredType} ${keyName} = ${v}`]
  }
  if (typeof v === 'string' && declaredType === 'pathExpression') return [`${ind}pathExpression ${keyName} = ${quoteString(v)}`]
  if (typeof v === 'string' && declaredType === 'string') {
    return [`${ind}string ${keyName} = ${quoteString(v)}`]
  }
  if (Array.isArray(v) && declaredType === 'string[]') {
    return [`${ind}string[] ${keyName} = [${v.map(item => quoteString(String(item))).join(', ')}]`]
  }
  if (declaredType === 'asset' && typeof v === 'string') {
    return [`${ind}asset ${keyName} = ${assetPathText(v)}`]
  }
  if (declaredType === 'asset[]' && Array.isArray(v)) {
    return [`${ind}asset[] ${keyName} = [${v.map(item =>
      assetPathText(item instanceof SdfAssetPath ? item.getAssetPath() : String(item))).join(', ')}]`]
  }
  if (declaredType === 'double2[]' && Array.isArray(v)) {
    return [`${ind}double2[] ${keyName} = [${v.map(pair =>
      `(${(pair as unknown[]).map(value => serializeNumber(Number(value))).join(', ')})`).join(', ')}]`]
  }
  if (declaredType === 'double' && typeof v === 'number') {
    return [`${ind}double ${keyName} = ${serializeNumber(v)}`]
  }
  if (declaredType === 'token' && typeof v === 'string') {
    return [`${ind}token ${keyName} = ${quoteString(v, false)}`]
  }
  if (typeof v === 'string') return [`${ind}string ${keyName} = ${quoteString(v)}`]
  if (typeof v === 'boolean') return [`${ind}bool ${keyName} = ${v ? '1' : '0'}`]
  if (typeof v === 'bigint') return [`${ind}int64 ${keyName} = ${v}`]
  if (typeof v === 'number') {
    return [`${ind}${Number.isInteger(v) ? 'int' : 'double'} ${keyName} = ${serializeNumber(v)}`]
  }
  if (Array.isArray(v)) {
    if (v.every(x => typeof x === 'string')) {
      return [`${ind}token[] ${keyName} = [${(v as string[]).map(s => quoteString(s, false)).join(', ')}]`]
    }
    if (v.every(x => typeof x === 'number')) {
      const t = v.every(x => Number.isInteger(x as number)) ? 'int[]' : 'double[]'
      return [`${ind}${t} ${keyName} = [${(v as number[]).map(n => serializeNumber(n)).join(', ')}]`]
    }
  }
  return [`${ind}string ${keyName} = ${quoteString(String(v))}`]
}

// `key = {` ... `}` lines for a dictionary-valued metadata field, at the
// given metadata indent depth (entries one deeper, closing brace at depth).
function dictFieldLines(key: string, dict: Record<string, unknown>, depth: number): string[] {
  const ind = indent(depth)
  const lines = [`${ind}${key} = {`]
  const types = _sdfGetDictionaryValueTypes(dict)
  for (const k of writableDictKeys(dict)) {
    lines.push(...dictEntryLines(k, dict[k], depth + 1, types?.get(k)))
  }
  lines.push(`${ind}}`)
  return lines
}

// _WriteRelocates (fileIO_Common.cpp:793-821), multi-line: one line per
// entry, each but the last followed by ", ".
function relocatesLines(entries: readonly (readonly [string, string])[]): string[] {
  return [
    'relocates = {',
    ...entries.map(([source, target], index) =>
      `    <${source}>: <${target}>${index + 1 < entries.length ? ', ' : ''}`),
    '}',
  ]
}

// ---- Prim metadata (Sdf_WritePrimMetadata) ----

// Structural prim fields that never appear in the metadata parens, and
// `relocates`: a legacy prim relocates field (copied by SdfCopySpec,
// copyUtils.cpp:720-724) is not prim metadata, so Sdf_IsPrimMetadataField
// (fileIO_Common.h:315-330) does not write it.
const PRIM_META_EXCLUDE = new Set([
  'specifier', 'typeName', 'primChildren', 'properties', 'primOrder',
  'propertyOrder', 'variantSetChildren', 'comment', 'relocates',
])

// Collects the prim metadata ( ... ) lines for a prim spec, one entry per
// line, in upstream's order: comment first, then fields sorted with
// TfDictionaryLessThan (each rendered by its field-specific form).
function collectPrimMeta(spec: FieldMap, primPath: string): string[] {
  const meta: string[] = []

  const comment = spec['comment']?.value
  if (typeof comment === 'string' && comment !== '') meta.push(quoteString(comment))

  const keys = Object.keys(spec)
    .filter(k => !PRIM_META_EXCLUDE.has(k) && spec[k]?.value !== undefined)
    .sort((a, b) => dictionaryStrcmp(a, b))

  for (const key of keys) {
    const v = spec[key]!.value
    if (spec[key]?.valueTypeName === 'unregistered' && typeof v === 'string') {
      meta.push(`${key} = ${v}`)
      continue
    }
    switch (key) {
      case 'apiSchemas':
      case 'clipSets':
        // OpenUSD v26.08 fileIO_Common.h:465-482 dispatches schema-declared
        // list-op metadata through Sdf_WriteIfListOp, including clipSets.
        meta.push(...listOpMetaLines(key, v as TextListOpFields<string>, s => quoteString(s, false)))
        break
      case 'inheritPaths':
        meta.push(...listOpMetaLines('inherits', v as TextListOpFields<string>, p => `<${p}>`, true))
        break
      case 'specializes':
        meta.push(...listOpMetaLines('specializes', v as TextListOpFields<string>, p => `<${p}>`, true))
        break
      case 'references':
      case 'payload':
        meta.push(...listOpMetaLines(
          key, v as TextListOpFields<RefItemFields>, refItemText, true))
        break
      case 'variantSetNames':
        meta.push(...listOpMetaLines('variantSets', v as TextListOpFields<string>, s => quoteString(s, false), true))
        break
      case 'variantSelection': {
        // fileIO_Common.h:486-496: the selections go through a VtDictionary
        // (a std::map, so sorted by name), and the field opens the parens
        // even when the map is empty and nothing is written.
        const sel = v as Record<string, string[] | string>
        if (isPlainDict(sel) && Object.keys(sel).length === 0) meta.push(OPEN_PARENS_ONLY)
        if (isPlainDict(sel) && Object.keys(sel).length > 0) {
          meta.push('variants = {')
          for (const [name, value] of Object.entries(sel).sort(([a], [b]) => compareCodePoints(a, b))) {
            const val = Array.isArray(value) ? value[0] : value
            if (typeof val === 'string') meta.push(`    string ${name} = ${quoteString(val, false)}`)
          }
          meta.push('}')
        }
        break
      }
      case 'prefixSubstitutions':
      case 'suffixSubstitutions': {
        // fileIO_Common.h:475-486 and fileIO_Common.cpp:879-895:
        // substitution dictionaries are string-to-string maps, without types.
        if (!isPlainDict(v)) break
        const entries = Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        meta.push(`${key} = {`)
        for (const [index, [from, to]] of entries.entries()) {
          meta.push(`    ${quoteString(from)}: ${quoteString(String(to))}${index + 1 < entries.length ? ', ' : ''}`)
        }
        meta.push('}')
        break
      }
      case 'doc':
      case 'documentation':
        meta.push(`doc = ${quoteString(String(v))}`)
        break
      default:
        meta.push(...simpleFieldLines(key, v, spec[key]?.valueTypeName, 'prim'))
        break
    }
  }

  return meta
}

// Generic metadata field rendering (Sdf_WriteSimpleField): dictionaries
// multi-line, metadata bools as true/false, strings quoted, everything else
// through the VtValue stringifier.
function isListOpValue(key: string, v: unknown, valueTypeName?: string): v is TextListOpFields<unknown> {
  const type = SdfSchema.getInstance().getFieldDefinition(key)?.getTypeName()
  return (valueTypeName === 'unregisteredListOp' || !!type && /listop$/i.test(type)) &&
    !!v && typeof v === 'object' && 'isExplicit' in v
}

function simpleFieldLines(key: string, v: unknown, valueTypeName?: string, specType?: SdfMetadataSpecType): string[] {
  // fileIO_Common.h:465-482 dispatches all registered list-op fields before
  // treating a VtDictionary as ordinary dictionary metadata.
  if (isListOpValue(key, v, valueTypeName)) {
    // textParserHelpers.cpp:233-280 stores an unregistered bucket's entire
    // bracket interior as one raw item, avoiding a second set of brackets.
    return listOpMetaLines(key, v, item => valueTypeName === 'unregisteredListOp' ? String(item) : serializeValue(item))
  }
  if (isPlainDict(v)) return dictFieldLines(key, v, 0)
  if (typeof v === 'boolean') return [`${key} = ${v}`]
  // OpenUSD v26.08 pxr/usd/sdf/fileIO_Common.cpp:1152-1162 stringifies
  // SdfPermission enum values as bare USDA identifiers.
  if ((key === 'permission' && (v === 'public' || v === 'private')) || key === 'displayUnit' || key === 'symmetryFunction') {
    return [`${key} = ${v}`]
  }
  if (typeof v === 'string') return [`${key} = ${quoteString(v)}`]
  // A registered field's value holds the field's type (a plugin `float`
  // such as UsdSkel's weight streams as a float, fileIO_Common.cpp:1150).
  const registeredType = specType ? _sdfGetMetadataFieldType(key, specType) : undefined
  if (typeof v === 'number') return [`${key} = ${registeredType ? serializeValue(v, registeredType) : serializeNumber(v)}`]
  if (typeof v === 'bigint') return [`${key} = ${v}`]
  if (Array.isArray(v)) {
    // Token/string arrays (allowedTokens, ...) — single line, quoted items.
    return [`${key} = [${v.map(item => typeof item === 'string' ? quoteString(item, false) : serializeValue(item)).join(', ')}]`]
  }
  return []
}

// ---- Prim emission ----

function emitPrim(scene: SceneMap, path: string, lines: string[], depth: number): void {
  const spec = scene[path]
  if (!spec) return

  // The specifier field's schema fallback is SdfSpecifierOver (schema.cpp:785).
  const specifier = (spec['specifier']?.value as string | undefined) ?? 'over'
  const typeName = spec['typeName']?.value as string | undefined
  const lastSlash = path.lastIndexOf('/')
  const lastVariant = path.lastIndexOf('}')
  const name = path.slice(Math.max(lastSlash, lastVariant) + 1)
  const ind = indent(depth)

  let header = specifier
  if (typeName && typeName !== '__AnyType__') header += ` ${typeName}`
  header += ` "${name}"`

  // Upstream Sdf_WritePrim always opens the brace on its own line: it writes
  // the preamble + metadata, then "\n" then indent + "{\n" unconditionally.
  const meta = collectPrimMeta(spec, path)
  if (meta.length > 0) {
    lines.push(`${ind}${header} (`)
    for (const m of meta) pushMetaEntry(lines, m, depth + 1)
    lines.push(`${ind})`)
  } else {
    lines.push(`${ind}${header}`)
  }
  lines.push(`${ind}{`)

  emitPrimBody(scene, path, spec, lines, depth)

  lines.push(`${ind}}`)
}

// Shared body emitter for prims and variant blocks: properties, variantSet
// blocks, then children.
function emitPrimBody(scene: SceneMap, path: string, spec: FieldMap, lines: string[], depth: number): void {
  // Namespace reorders lead the body (Sdf_WritePrimNamespaceReorders runs
  // before properties in Sdf_WritePrimBody). Each emits only when it reorders
  // more than one name (upstream's size() > 1 guard).
  const ind1 = indent(depth + 1)
  const propOrder = spec['propertyOrder']?.value as string[] | undefined
  if (Array.isArray(propOrder) && propOrder.length > 1) {
    lines.push(`${ind1}reorder properties = [${propOrder.map(n => quoteString(n, false)).join(', ')}]`)
  }
  const primOrder = spec['primOrder']?.value as string[] | undefined
  if (Array.isArray(primOrder) && primOrder.length > 1) {
    lines.push(`${ind1}reorder nameChildren = [${primOrder.map(n => quoteString(n, false)).join(', ')}]`)
  }

  // Upstream Sdf_WritePrimProperties sorts a prim's properties with
  // _SortByNameThenType (fileIO_Common.h): dictionary order by name, ties
  // broken so attributes precede relationships. The authored order is preserved
  // separately via `reorder properties` above, so the emitted block is canonical
  // regardless of insertion order.
  const properties = ((spec['properties']?.value as string[] | undefined) ?? [])
    .slice()
    .sort((a, b) => {
      const c = dictionaryStrcmp(a, b)
      return c !== 0
        ? c
        : propSpecTypeRank(scene[`${path}.${a}`]) - propSpecTypeRank(scene[`${path}.${b}`])
    })
  for (const propName of properties) {
    const attrSpec = scene[`${path}.${propName}`]
    if (attrSpec) emitAttr(attrSpec, propName, lines, depth + 1)
  }

  // OpenUSD v26.08 pxr/usd/sdf/fileIO_Common.h:629-641 emits name children
  // before variant sets. Keep sibling prim separation here so all commands
  // share the canonical USDA formatter.
  const children = (spec['primChildren']?.value as string[] | undefined) ?? []
  if (children.length > 0 && properties.length > 0) lines.push('')
  children.forEach((childName, index) => {
    if (index > 0) lines.push('')
    emitPrim(
      scene,
      `${path === '/' ? '' : path}${path.endsWith('}') ? '' : '/'}${childName}`,
      lines,
      depth + 1,
    )
  })

  const vsChildren = (spec['variantSetChildren']?.value as string[] | undefined) ?? []
  for (const vsName of vsChildren) {
    const vsSpec = scene[`${path}{${vsName}=}`]
    const variants = (vsSpec?.['variantChildren']?.value as string[] | undefined) ?? []
    // fileIO_Common.h:606-620,662-675: variant sets follow the properties
    // and name children directly, and a set without variants writes nothing.
    if (variants.length === 0) continue
    const ind1 = indent(depth + 1)
    lines.push(`${ind1}variantSet "${vsName}" = {`)
    for (const variant of variants.slice().sort()) {
      const vPath = `${path}{${vsName}=${variant}}`
      const vSpec = scene[vPath]
      const ind2 = indent(depth + 2)
      if (!vSpec) { lines.push(`${ind2}"${variant}" {`, `${ind2}}`); continue }
      const vMeta = collectPrimMeta(vSpec, vPath)
      if (vMeta.length > 0) {
        lines.push(`${ind2}"${variant}" (`)
        for (const m of vMeta) pushMetaEntry(lines, m, depth + 3)
        lines.push(`${ind2}) {`)
      } else {
        lines.push(`${ind2}"${variant}" {`)
      }
      emitPrimBody(scene, vPath, vSpec, lines, depth + 2)
      // fileIO_Common.h:643-656 closes every variant after a blank line.
      lines.push('')
      lines.push(`${ind2}}`)
    }
    lines.push(`${ind1}}`)
  }

}

// _SortByNameThenType's tie-break: SdfSpecTypeAttribute (1) sorts before
// SdfSpecTypeRelationship (8). A flat property namespace forbids same-named
// props so this only fires in theory, but mirror upstream's ordering exactly.
function propSpecTypeRank(spec: FieldMap | undefined): number {
  return isRelationshipSpec(spec) ? 1 : 0
}

// ---- Attribute emission ----

// Structural property fields that never appear in the metadata parens
// (the Sdf_IsAttributeMetadataField partition, inverted).
const PROP_META_EXCLUDE = new Set([
  'typeName', 'default', 'timeSamples', 'connectionPaths', 'targetPaths',
  'custom', 'variability', 'spline', 'comment',
  // Children fields hold the relationship target and connection specs.
  'targetChildren', 'connectionChildren',
])

// The ( ... ) metadata section lines for a property spec, in upstream's
// order: comment first, then fields in TfDictionaryLessThan order.
function collectPropMeta(spec: FieldMap): string[] {
  const meta: string[] = []
  const comment = spec['comment']?.value
  if (typeof comment === 'string' && comment !== '') meta.push(quoteString(comment))

  const keys = Object.keys(spec)
    .filter(k => !PROP_META_EXCLUDE.has(k) && spec[k]?.value !== undefined)
    .sort((a, b) => dictionaryStrcmp(a, b))
  for (const key of keys) {
    const v = spec[key]!.value
    if (spec[key]?.valueTypeName === 'unregistered' && typeof v === 'string') meta.push(`${key} = ${v}`)
    else if (key === 'doc' || key === 'documentation') meta.push(`doc = ${quoteString(String(v))}`)
    else meta.push(...simpleFieldLines(key, v, spec[key]?.valueTypeName,
      spec['typeName']?.value === undefined ? 'relationship' : 'attribute'))
  }
  return meta
}

// One metadata entry may contain embedded newlines (a triple-quoted string
// value); those continuation lines are quoted-string CONTENT and must land
// verbatim — only the entry's first line takes the metadata indent.
// A metadata entry that opens the parens but writes nothing
// (Sdf_FileIOUtility::OpenParensIfNeeded before a field with no text).
const OPEN_PARENS_ONLY = '\0open-parens'

// std::string's operator< on UTF-8 bytes, which orders as code points do.
function compareCodePoints(a: string, b: string): number {
  const x = [...a], y = [...b]
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!
    if (d !== 0) return d
  }
  return x.length - y.length
}

function pushMetaEntry(lines: string[], entry: string, depth: number): void {
  if (entry === OPEN_PARENS_ONLY) return
  const [first, ...rest] = entry.split('\n')
  lines.push(`${indent(depth)}${first}`)
  for (const cont of rest) {
    lines.push(cont.startsWith('\0') ? `${indent(depth)}${cont.slice(1)}` : cont)
  }
}

// Appends the metadata parens to the basic declaration line (upstream's
// OpenParens/CloseParens flow: " (" on the declaration line, fields one per
// line at depth+1, ")" back at the declaration depth).
function pushWithMeta(lines: string[], basicLine: string, meta: string[], depth: number): void {
  if (meta.length === 0) {
    lines.push(basicLine)
    return
  }
  lines.push(`${basicLine} (`)
  for (const m of meta) pushMetaEntry(lines, m, depth + 1)
  lines.push(`${indent(depth)})`)
}

function emitAttr(spec: FieldMap, propName: string, lines: string[], depth: number): void {
  const ind = indent(depth)
  const storedType = spec['typeName']?.value as string | undefined
  const meta = collectPropMeta(spec)

  // A non-schema property carries an explicit `custom` declaration, emitted as
  // a leading qualifier before variability/type (fileIO_Common.h: "%s%s%s %s"
  // with hasCustomDeclaration ? "custom " : "").
  const customPrefix = spec['custom']?.value === true ? 'custom ' : ''

  // Sdf_WriteRelationship (fileIO_Common.h:986-1165).
  if (isRelationshipSpec(spec)) {
    const hasTargets = 'targetPaths' in spec
    const targetList = sdfNormalizeListOp<string>(spec['targetPaths']?.value)
    const hasExplicitTargets = !!targetList?.isExplicit
    const hasTargetListOps = !!targetList && !targetList.isExplicit && listOpHasKeys(targetList)
    // A varying relationship uses the varying keyword.
    const varyingStr = spec['variability']?.value === 'varying' ? 'varying ' : ''
    const targetListText = (targets: readonly string[], d: number): string =>
      targets.length > 1
        ? ` = [\n${targets.map(target => `${indent(d + 1)}<${target}>,`).join('\n')}\n${indent(d)}]`
        : ` = <${targets[0]}>`
    if (meta.length > 0 || (hasTargets && hasExplicitTargets) ||
        (!hasTargetListOps && customPrefix === '')) {
      let basic = `${ind}${customPrefix}${varyingStr}rel ${propName}`
      if (hasTargets && hasExplicitTargets) {
        const targets = targetList!.explicitItems
        basic += targets.length === 0 ? ' = None' : targetListText(targets, depth)
      }
      pushWithMeta(lines, basic, meta, depth)
    } else if (customPrefix !== '') {
      lines.push(`${ind}custom ${varyingStr}rel ${propName}`)
    }
    if (hasTargets && hasTargetListOps) {
      const statements: [string, readonly string[]][] = [
        ['delete ', targetList!.deletedItems], ['add ', targetList!.addedItems],
        ['prepend ', targetList!.prependedItems], ['append ', targetList!.appendedItems],
        ['reorder ', targetList!.orderedItems],
      ]
      for (const [op, targets] of statements) {
        if (targets.length === 0) continue
        lines.push(`${ind}${op}${varyingStr}rel ${propName}${targetListText(targets, depth)}`)
      }
    }
    // fileIO_Common.h:1128-1140 retains the legacy relationship default
    // separately from its target list, including Puts(indent, "\\n").
    if ('default' in spec && spec['default']?.value !== undefined) {
      const value = spec['default']!.value
      const text = value instanceof SdfPath ? `<${value.pathString}>` : serializeValue(value)
      lines.push(`${ind}${varyingStr}rel ${propName}.default = ${text}${ind}`)
    }
    return
  }

  // Variability: either the parser's separate 'variability' field, or (crate
  // shape) baked into the typeName as a "uniform " prefix.
  const prefixUniform = storedType?.startsWith('uniform ')
  const authoredType = prefixUniform ? storedType!.slice('uniform '.length) : storedType
  // schema.cpp:544-596 legacy aliases serialize with their standard names.
  const valueTypeName = authoredType ? sdfCanonicalTextTypeName(authoredType) : undefined
  // schema.cpp:591-596: these legacy roles have no modern role spelling;
  // retain the authored role token while serializing its matrix/int storage.
  const typeName = authoredType && /^(Transform|PointIndex|EdgeIndex|FaceIndex)(\[\])?$/.test(authoredType)
    ? authoredType : valueTypeName
  const isUniform = prefixUniform || spec['variability']?.value === 'uniform'
  const typePrefix = `${customPrefix}${isUniform ? 'uniform ' : ''}`

  const defaultVal = spec['default']?.value
  const hasDefault = 'default' in spec
  const timeSamples = spec['timeSamples']?.value as [number, unknown][] | Record<string, unknown> | undefined
  const sampleEntries: [number, unknown][] = Array.isArray(timeSamples)
    ? timeSamples
    : timeSamples && typeof timeSamples === 'object'
      ? Object.entries(timeSamples).map(([t, v]) => [Number(t), v] as [number, unknown])
      : []
  const hasConnections = 'connectionPaths' in spec
  const connectionList = sdfNormalizeListOp<string>(spec['connectionPaths']?.value)
  const spline = spec['spline']?.value

  // Basic line — written when there is metadata, a default, a custom
  // declaration, or nothing else at all (Sdf_WriteAttribute's condition).
  if (meta.length > 0 || hasDefault || customPrefix !== '' ||
      (!hasConnections && timeSamples === undefined && !(spline instanceof TsSpline))) {
    // Keep an untyped authored spec's declaration consistent with its
    // samples; a later timeSamples statement cannot change attribute type
    // (textParserHelpers.cpp:374-480).
    const tname = typeName ?? inferTypeName(hasDefault ? defaultVal : sampleEntries[0]?.[1])
    let basic = `${ind}${typePrefix}${tname} ${propName}`
    // textParserHelpers.cpp:209-258 preserves unregistered authored text.
    // Sdf_FileIOUtility::WriteDefaultValue (fileIO_Common.cpp:524-531): an
    // opaque value is never written; a coding error is posted instead.
    if (hasDefault && defaultVal instanceof SdfOpaqueValue) {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        'Tried to write opaque value to layer', TfDiagnosticType.CodingError))
    } else if (hasDefault) basic += ` = ${spec['default']?.valueTypeName === 'unregistered' && typeof defaultVal === 'string' ? defaultVal : serializeValue(defaultVal, valueTypeName ?? tname)}`
    pushWithMeta(lines, basic, meta, depth)
  }

  // Time samples block (after the basic line, as upstream).
  if (timeSamples !== undefined) {
    const tname = typeName ?? inferTypeName(sampleEntries[0]?.[1])
    lines.push(`${ind}${isUniform ? 'uniform ' : ''}${tname} ${propName}.timeSamples = {`)
    for (const [time, value] of sampleEntries) {
      lines.push(`${ind}    ${formatTime(time)}: ${serializeValue(value, valueTypeName ?? tname)},`)
    }
    lines.push(`${ind}}`)
  }

  // Sdf_WriteAttribute writes the authored spline after time samples and
  // before connections (pxr/usd/sdf/fileIO_Common.h:905-914).
  if (spline instanceof TsSpline) {
    const tname = typeName ?? spline.GetValueType().getTypeName()
    lines.push(`${ind}${isUniform ? 'uniform ' : ''}${tname} ${propName}.spline = {`)
    lines.push(...splineBodyLines(spline, tname, depth + 1))
    lines.push(`${ind}}`)
  }

  // Sdf_WriteConnectionList (fileIO_Common.h:707-783).
  if (hasConnections && connectionList) {
    const tname = typeName ?? 'token'
    const statement = (op: string, paths: readonly string[]): void => {
      const rhs = paths.length === 0 ? 'None'
        : paths.length === 1 ? `<${paths[0]}>`
          : `[\n${paths.map(path => `${indent(depth + 1)}<${path}>,`).join('\n')}\n${ind}]`
      lines.push(`${ind}${op}${isUniform ? 'uniform ' : ''}${tname} ${propName}.connect = ${rhs}`)
    }
    if (connectionList.isExplicit) {
      statement('', connectionList.explicitItems)
    } else {
      const statements: [string, readonly string[]][] = [
        ['delete ', connectionList.deletedItems], ['add ', connectionList.addedItems],
        ['prepend ', connectionList.prependedItems], ['append ', connectionList.appendedItems],
        ['reorder ', connectionList.orderedItems],
      ]
      for (const [op, paths] of statements) if (paths.length > 0) statement(op, paths)
    }
  }
}

// SdfListOp::HasKeys.
function listOpHasKeys(op: SdfNormalizedListOp<unknown>): boolean {
  return op.isExplicit || op.addedItems.length + op.prependedItems.length +
    op.appendedItems.length + op.deletedItems.length + op.orderedItems.length > 0
}

function splineBodyLines(spline: TsSpline, typeName: string, depth: number): string[] {
  const lines: string[] = []
  const ind = indent(depth)
  const knots = spline.getKnots().slice().sort((a, b) => a.getTime() - b.getTime())
  const curveType = spline.getCurveType()

  if (curveType === TsCurveType.Hermite ||
      knots.slice(0, -1).some(knot => knot.getNextInterpolation() === TsInterpMode.Curve)) {
    lines.push(`${ind}${curveType === TsCurveType.Hermite ? 'hermite' : 'bezier'},`)
  }

  const extrapText = (mode: TsExtrapMode): string => {
    switch (mode) {
      case TsExtrapMode.ValueBlock: return 'none'
      case TsExtrapMode.Linear: return 'linear'
      case TsExtrapMode.Sloped: return 'sloped'
      case TsExtrapMode.LoopRepeat: return 'loop repeat'
      case TsExtrapMode.LoopReset: return 'loop reset'
      case TsExtrapMode.LoopOscillate: return 'loop oscillate'
      default: return 'held'
    }
  }
  const writeExtrap = (label: string, extrap: ReturnType<TsSpline['getPreExtrapolation']>) => {
    if (extrap.mode === TsExtrapMode.Held && extrap.slope === 0) return
    // OpenUSD 26.11.1 fileIO_Common.cpp:625-633: looping extrapolation
    // boundaries first require USDA 1.3. Plain looping remains 1.0.
    if (extrap.isLooping() && extrap.loopBoundaryTime !== undefined) requestWriteVersionUpgrade('1.3')
    const slope = extrap.mode === TsExtrapMode.Sloped
      ? `(${serializeValue(extrap.slope, typeName)})`
      : extrap.isLooping() && extrap.loopBoundaryTime !== undefined
        ? `(${serializeValue(extrap.loopBoundaryTime, 'double')})` : ''
    lines.push(`${ind}${label}: ${extrapText(extrap.mode)}${slope},`)
  }
  writeExtrap('pre', spline.getPreExtrapolation())
  writeExtrap('post', spline.getPostExtrapolation())

  const loop = spline.getInnerLoopParams()
  if (loop.protoStart !== 0 || loop.protoEnd !== 0 || loop.numPreLoops !== 0 ||
      loop.numPostLoops !== 0 || loop.valueOffset !== 0) {
    lines.push(`${ind}loop: (${formatTime(loop.protoStart)}, ${formatTime(loop.protoEnd)}, ` +
      `${loop.numPreLoops}, ${loop.numPostLoops}, ${serializeValue(loop.valueOffset, typeName)}),`)
  }

  let incoming = TsInterpMode.Curve
  for (const knot of knots) {
    let line = `${ind}${formatTime(knot.getTime())}: `
    if (knot.isDualValued()) line += `${serializeValue(knot.getPreValue(), typeName)} & `
    line += serializeValue(knot.GetValue(), typeName)
    if (incoming === TsInterpMode.Curve) {
      line += `; pre ${splineTangentText(
        curveType, knot.getPreTanWidth(), knot.getPreTanSlope(), knot.getPreTanAlgorithm(), typeName)}`
    }
    incoming = knot.getNextInterpolation()
    if (incoming === TsInterpMode.Curve) {
      line += `; post curve ${splineTangentText(
        curveType, knot.getPostTanWidth(), knot.getPostTanSlope(), knot.getPostTanAlgorithm(), typeName)}`
    } else {
      const interp = incoming === TsInterpMode.ValueBlock ? 'none'
        : incoming === TsInterpMode.Linear ? 'linear' : 'held'
      line += `; post ${interp}`
    }
    const customData = knot.getCustomData()
    if (Object.keys(customData).length > 0) line += `; ${inlineDictionary(customData)}`
    lines.push(`${line},`)
  }
  return lines
}

function splineTangentText(
  curveType: TsCurveType, width: number, slope: number,
  algorithm: TsTangentAlgorithm, typeName: string,
): string {
  const values = curveType === TsCurveType.Bezier
    ? [serializeNumber(width), serializeValue(slope, typeName)]
    : [serializeValue(slope, typeName)]
  if (algorithm !== TsTangentAlgorithm.None) {
    // OpenUSD 26.11.1 fileIO_Common.cpp:750-757.
    requestWriteVersionUpgrade('1.1')
    values.push(algorithm === TsTangentAlgorithm.AutoEase ? 'autoEase' : 'custom')
  }
  return `(${values.join(', ')})`
}

function inlineDictionary(dict: Record<string, unknown>): string {
  const entries = writableDictKeys(dict).map(key => {
    const value = dict[key]
    const keyName = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : quoteString(key)
    if (isPlainDict(value)) return `dictionary ${keyName} = ${inlineDictionary(value)}`
    if (value instanceof SdfAssetPath) {
      return `asset ${keyName} = ${assetPathText(value.getAssetPath())}`
    }
    if (typeof value === 'string') return `string ${keyName} = ${quoteString(value)}`
    if (typeof value === 'boolean') return `bool ${keyName} = ${value ? '1' : '0'}`
    if (typeof value === 'number') {
      return `${Number.isInteger(value) ? 'int' : 'double'} ${keyName} = ${serializeNumber(value)}`
    }
    return `string ${keyName} = ${quoteString(String(value))}`
  })
  return `{ ${entries.join('; ')} }`
}

// ---- Type classification helpers ----

// Types that represent a single tuple/vector (not a scalar, not an array).
// These serialize as (x, y, z) rather than [x, y, z].
function isVecBaseType(t: string): boolean {
  if (/^(double|float|half|int|uint)[234]$/.test(t)) return true
  if (/^(point|normal|vector|color)[234][fdh]?$/.test(t)) return true
  if (/^texCoord[234][fdh]$/.test(t)) return true
  if (/^quat[fdh]$/.test(t)) return true
  return false
}

// frame4d is a matrix4d role alias (valueTypeName.cpp), streamed identically.
function isMatrixType(t: string): boolean {
  return /^matrix[234]d$/.test(t) || t === 'frame4d'
}

function isAssetType(t: string): boolean {
  return t === 'asset'
}

// True when a declared base type is stored as a 32-bit float (or 16-bit half,
// which is also narrower than f64). Drives shortest-round-trip-through-f32
// formatting so re-parsing recovers the exact stored bits — matrices and
// `double*` stay f64. Mirrors valueTypeName.cpp scalar widths:
//   float, half                       -> 32-bit (half via f32 superset)
//   float2/3/4, half2/3/4             -> 32-bit
//   point/normal/vector/color/texCoord with 'f' or 'h' suffix -> 32-bit
//   quatf / quath                     -> 32-bit
// Everything else (double, *d roles, matrixNd, timecode) -> 64-bit.
// Halfs stream through float's default ostream precision (six significant
// digits, `0.0999756`), as GfHalf's operator<< does.
// Timecodes stream through GfTimeCode's operator<<, which is the double's
// default ostream form (gf/timeCode.cpp:20-24): `1.23457`, `1e+20`.
type FloatWidth = boolean | 'half' | 'timecode'
function isFloat32BaseType(t: string): FloatWidth {
  if (t === 'timecode') return 'timecode'
  if (t === 'half' || /^half[234]$/.test(t) || /^(point|normal|vector|color|texCoord)[234]h$/.test(t) ||
      t === 'quath') return 'half'
  if (t === 'float') return true
  if (/^float[234]$/.test(t)) return true
  if (/^(point|normal|vector|color|texCoord)[234]f$/.test(t)) return true
  if (t === 'quatf') return true
  return false
}

// ---- Type inference (fallback when no stored typeName) ----

function inferTypeName(value: unknown): string {
  if (value === null || value === undefined) return 'token'
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'string') return 'string'
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float'
  if (Array.isArray(value)) {
    if (value.length === 0) return 'float[]'
    const first = value[0]
    if (Array.isArray(first)) return `float${(first as unknown[]).length}[]`
    if (typeof first === 'string') return 'string[]'
    if (typeof first === 'boolean') return 'bool[]'
    if (typeof first === 'number') {
      return value.every(n => Number.isInteger(n as number)) ? 'int[]' : 'float[]'
    }
  }
  return 'token'
}

// ---- Value serialization ----

// Serialize a value to USDA text. typeName guides tuple vs array vs scalar
// formatting AND the float width: a `float`/`half`-family declared type formats
// every numeric leaf with shortest-round-trip-through-f32, so re-parsing
// recovers the exact 32-bit bit pattern.
function serializeValue(value: unknown, typeName?: string): string {
  // fileIO_Common.cpp:196-239 upgrades actual duration values and arrays to
  // USDA 1.4; a duration-typed spline has no such value-stringifier upgrade.
  if (value?.constructor?.name === 'GfDuration' ||
      value instanceof VtArray && value.getElementType().getTypeName() === 'GfDuration' ||
      value instanceof VtArrayEdit && typeName === 'duration[]') requestWriteVersionUpgrade('1.4')
  const baseType = typeName
    ? typeName.endsWith('[]')
      ? typeName.slice(0, -2)
      : typeName
    : undefined
  const isF32 = baseType ? isFloat32BaseType(baseType) : false
  return serializeValueImpl(value, typeName, isF32)
}

// gf/duration.h:130-133 and gf/timeCode.h expose scalar GetValue accessors.
function gfScalarNumber(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || !('GetValue' in value) || typeof value.GetValue !== 'function') return undefined
  const number = (value.GetValue as () => unknown)()
  return typeof number === 'number' ? number : undefined
}

function serializeValueImpl(value: unknown, typeName: string | undefined, isF32: FloatWidth): string {
  const scalar = gfScalarNumber(value)
  if (scalar !== undefined) return value?.constructor?.name === 'GfDuration' ? durationText(scalar) : serializeNumber(scalar, isF32)
  if (value instanceof SdfValueBlock) return 'None'
  if (value instanceof SdfAnimationBlock) return 'AnimationBlock'
  if (value === null || value === undefined) return 'None'
  if (value instanceof VtArrayEdit) return arrayEditText(value, typeName, isF32)
  if (value instanceof VtArray) {
    if (value.getElementType().getTypeName() === 'GfDuration') return `[${value.toArray().map(item => durationText(Number(item))).join(', ')}]`
    const direct = vectorArrayText(value, isF32)
    if (direct !== undefined) return direct
  }
  // Values are written by the type they hold, not the spec's type name
  // (fileIO_Common.cpp:515-536,1154-1163): a single Gf value stored under
  // an array type name (UsdStage::Flatten copies `point3f normals` under a
  // schema's normal3f[] unchanged) is written as that single value.
  if (_sdfIsGfValue(value) && typeName?.endsWith('[]')) {
    typeName = typeName.slice(0, -2)
  }
  if (value instanceof VtArray || _sdfIsGfValue(value)) value = plainValue(value)
  // VtValue bools stream as 1/0 (StringFromVtValue -> TfStringify(VtValue)):
  // upstream generatedSchema/flatten output shows `bool doubleSided = 0`.
  // SdfAssetPath streams its asset path (assetPath.cpp:169-171).
  if(value instanceof SdfAssetPath)return assetPathText(value.getAssetPath())
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return typeName === 'duration' ? durationText(value) : serializeNumber(value, isF32)
  if (typeof value === 'bigint') return value.toString()

  const baseType = typeName
    ? typeName.endsWith('[]') ? typeName.slice(0, -2) : typeName
    : undefined

  if (typeof value === 'string') {
    // Asset-typed values print as @path@ (_StringFromAssetPath), never quoted.
    if (baseType && isAssetType(baseType)) return assetPathText(value)
    return quoteString(value)
  }

  // Leaf serializer for nested components (already know the f32 width).
  const leaf = (n: unknown): string => serializeValueImpl(n, undefined, isF32)

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'

    if (typeName && baseType) {
      const isArrayType = typeName.endsWith('[]')

      if (isArrayType) {
        // e.g. float3[] → [(x,y,z), ...], int[] → [1, 2, 3]
        if (isVecBaseType(baseType)) {
          const items = (value as unknown[][]).map(v =>
            Array.isArray(v)
              ? `(${(v as unknown[]).map(leaf).join(', ')})`
              : leaf(v)
          )
          return `[${items.join(', ')}]`
        }
        if (isMatrixType(baseType)) {
          const items = (value as unknown[][]).map(mat => matrixText(mat as unknown[][], leaf))
          return `[${items.join(', ')}]`
        }
        if (isAssetType(baseType)) {
          return `[${(value as unknown[]).map(v => typeof v === 'string' ? assetPathText(v) : leaf(v)).join(', ')}]`
        }
        // scalar[] → [v0, v1, ...]
        return `[${(value as unknown[]).map(leaf).join(', ')}]`
      }

      // Scalar (non-array) type whose value is a JS array → tuple
      if (isVecBaseType(baseType)) {
        // e.g. double3 → (0, 0, 0)
        return `(${(value as unknown[]).map(leaf).join(', ')})`
      }
      if (isMatrixType(baseType)) {
        // e.g. matrix4d → ( (r0x, r0y, ...), ... )  — GfMatrix stream form.
        return matrixText(value as unknown[][], leaf)
      }
    }

    // No typeName — fall back to shape inference
    const first = value[0]
    if (Array.isArray(first)) {
      const items = (value as unknown[][]).map(v => `(${(v as unknown[]).map(leaf).join(', ')})`)
      return `[${items.join(', ')}]`
    }
    return `[${(value as unknown[]).map(leaf).join(', ')}]`
  }

  return String(value)
}

// Element types whose VtArrayEdit goes through _StringFromVtValueHelper and
// so requests usda 1.2 (fileIO_Common.cpp:224-235, 1122-1137); duration
// edits request 1.4 instead (serializeValue). Every other array edit is
// streamed by TfStringify without a version request (fileIO_Common.cpp:1150).
const ARRAY_EDIT_1_2_TYPES = new Set(['string', 'token', 'asset', 'pathExpression'])

// _StringFromVtArrayEdit (fileIO_Common.cpp:174-184) through
// Vt_ArrayEditStreamImpl (arrayEdit.cpp:21-90).
function arrayEditText(edit: VtArrayEdit<unknown>, typeName: string | undefined, isF32: FloatWidth): string {
  const baseType = typeName?.endsWith('[]') ? typeName.slice(0, -2) : typeName
  if (baseType !== undefined && ARRAY_EDIT_1_2_TYPES.has(baseType)) requestWriteVersionUpgrade('1.2')
  const literal = (elem: unknown): string => {
    if (baseType === 'duration') return durationText(Number(elem))
    if (baseType && isAssetType(baseType)) {
      return assetPathText(elem instanceof SdfAssetPath ? elem.getAuthoredPath() : String(elem))
    }
    return serializeValueImpl(elem, baseType, isF32)
  }
  const index = (idx: number | 'end'): string => `[${idx}]`
  const items = edit._serialization().map((op) => {
    switch (op.kind) {
      case 'write': return `write ${literal(op.value)} to ${index(op.index)}`
      case 'writeRef': return `write ${index(op.source)} to ${index(op.destination)}`
      case 'insert':
        if (op.index === 0) return `prepend ${literal(op.value)}`
        if (op.index === 'end') return `append ${literal(op.value)}`
        return `insert ${literal(op.value)} at ${index(op.index)}`
      case 'insertRef':
        if (op.destination === 0) return `prepend ${index(op.source)}`
        if (op.destination === 'end') return `append ${index(op.source)}`
        return `insert ${index(op.source)} at ${index(op.destination)}`
      case 'erase': return `erase ${index(op.index)}`
      case 'minSize':
        return op.fill === undefined ? `minsize ${op.size}` : `minsize ${op.size} fill ${literal(op.fill)}`
      case 'setSize':
        return op.fill === undefined ? `resize ${op.size}` : `resize ${op.size} fill ${literal(op.fill)}`
      case 'maxSize': return `maxsize ${op.size}`
    }
  })
  return `edit [${items.join('; ')}]`
}

// GfMatrix stream form: "( (1, 0), (0, 1) )" — note the spaces inside the
// outer parens (gf matrix operator<<, preserved verbatim by the text writer).
function matrixText(rows: unknown[][], leaf: (n: unknown) => string): string {
  return `( ${rows.map(row => `(${(row as unknown[]).map(leaf).join(', ')})`).join(', ')} )`
}

// _StringFromAssetPath: @path@, or @@@path@@@ when the path contains '@'
// (with any contained '@@@' backslash-escaped).
export function assetPathText(path: string): string {
  if (!path.includes('@')) return `@${path}@`
  return `@@@${path.replace(/@@@/g, '\\@@@')}@@@`
}

// ---- String quoting (Sdf_FileIOUtility::Quote) ----

// Double quote preferred; single quote when the string contains '"' but no
// "'"; triple quotes when the string contains a newline (and the call site
// allows them — name lists don't). Escapes \r \t \\ and the active quote
// char; \n is escaped only outside triple quotes; other non-printable ASCII
// becomes a \xHH hex escape; multi-byte UTF-8 passes through.
export function quoteString(s: string, allowTripleQuotes = true): string {
  let quote = '"'
  if (s.includes('"') && !s.includes("'")) quote = "'"

  const triple = allowTripleQuotes && s.includes('\n')
  let result = triple ? quote + quote + quote : quote

  for (const ch of s) {
    // fileIO_Common.cpp:1091 iterates c_str() up to the first NUL byte.
    if (ch === '\0') break
    if (ch === '\n') result += triple ? '\n' : '\\n'
    else if (ch === '\r') result += '\\r'
    else if (ch === '\t') result += '\\t'
    else if (ch === '\\') result += '\\\\'
    else if (ch === quote) result += '\\' + quote
    else {
      const cp = ch.codePointAt(0)!
      if (cp >= 32 && cp <= 126) result += ch
      else if (cp < 32 || cp === 127) result += `\\x${cp.toString(16).padStart(2, '0')}`
      // fileIO_Common.cpp:1090-1104 preserves UTF-8 and escapes invalid raw
      // bytes; the parser retains those bytes as surrogateescape code units.
      else if (cp >= 0xdc80 && cp <= 0xdcff) result += `\\x${(cp - 0xdc00).toString(16)}`
      else result += ch // multi-byte UTF-8 passes through unescaped
    }
  }

  result += triple ? quote + quote + quote : quote
  return result
}

// Numbers are written with TfStringify (fileIO_Common.cpp:1150 and the
// TfStringify calls at :588-808,1009-1016): a double's or float's shortest
// round-trip digits through Tf's double-conversion settings
// (tf/stringUtils.cpp:917-1015) — `1e300`, `30000000000` for the float
// 3e10, `0.016601562` for an exact float tie. Halfs stream through ostream.
function serializeNumber(n: number, isFloat32: FloatWidth = false): string {
  if (isFloat32 === 'timecode') return durationText(n)
  if (isFloat32 === 'half') {
    if (Number.isNaN(n)) return 'nan'
    if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf'
    if (Object.is(n, -0)) return '-0'
    if (Number.isInteger(n)) return `${n}`
    return halfText(n)
  }
  return isFloat32 ? TfStreamFloat(n) : TfStreamDouble(n)
}

// gf/duration.cpp:18-22 streams through ostream's default precision, just
// as GfHalf does. Preserve special values and the sign of zero as ostream.
function durationText(n: number): string {
  if (!Number.isFinite(n) || n === 0) return serializeNumber(n)
  return halfText(n)
}

// `%g` with six significant digits: the exact value rounded half-to-even,
// trailing zeros dropped, exponent form outside [1e-4, 1e6).
function halfText(n: number): string {
  const sign = n < 0 ? '-' : ''
  const [mantissa, exponent] = Math.abs(n).toExponential(40).split('e') as [string, string]
  let exp = Number(exponent)
  const digits = mantissa.replace('.', '')
  let head = digits.slice(0, 6)
  const next = digits[6]!
  const tail = /[1-9]/.test(digits.slice(7))
  if (next > '5' || (next === '5' && (tail || Number(head[5]) % 2 === 1))) {
    head = String(Number(head) + 1)
    if (head.length > 6) { head = head.slice(0, 6); exp += 1 }
  }
  const strip = (text: string) => text.includes('.') ? text.replace(/\.?0+$/, '') : text
  if (exp < -4 || exp >= 6) {
    return `${sign}${strip(`${head[0]}.${head.slice(1)}`)}e${exp < 0 ? '-' : '+'}${String(Math.abs(exp)).padStart(2, '0')}`
  }
  if (exp >= 0) return sign + strip(`${head.slice(0, exp + 1)}.${head.slice(exp + 1)}`)
  return sign + strip(`0.${'0'.repeat(-exp - 1)}${head}`)
}

// `[(x, y, z), ...]` / `[a, b, ...]` straight from a float, double or int
// VtArray's storage (the common bulk case), or undefined for other arrays.
function vectorArrayText(array: VtArray<unknown>, isF32: FloatWidth): string | undefined {
  const data = array.cdata()
  const n = array.size
  if (n === 0) return '[]'
  const type = array.getElementType().getTypeName()
  if (!(data instanceof Float32Array || data instanceof Float64Array || data instanceof Int32Array) ||
      type.startsWith('GfQuat') || type.startsWith('GfMatrix')) return undefined
  const width = data.length / n
  const parts = new Array<string>(n)
  if (width === 1) {
    for (let i = 0; i < n; i++) parts[i] = serializeNumber(data[i]!, isF32)
  } else {
    for (let i = 0, o = 0; i < n; i++, o += width) {
      let text = '(' + serializeNumber(data[o]!, isF32)
      for (let k = 1; k < width; k++) text += ', ' + serializeNumber(data[o + k]!, isF32)
      parts[i] = text + ')'
    }
  }
  return `[${parts.join(', ')}]`
}

// A Gf value or VtArray as the plain nested shape the text writer formats:
// [x, y, z] for vectors, real-first [w, x, y, z] for quaternions, rows for
// matrices, a list for arrays (other values are returned as is). Array
// elements are read straight from the array's storage.
export function plainValue(value: unknown): unknown {
  const scalar = gfScalarNumber(value)
  if (scalar !== undefined) return scalar
  if (value instanceof VtArray) {
    const data = value.cdata()
    if (!ArrayBuffer.isView(data)) {
      return (data as readonly unknown[]).map(item => _sdfIsGfValue(item) ? plainValue(item) : item)
    }
    const n = value.size
    if (n === 0) return []
    const type = value.getElementType().getTypeName()
    const width = data.length / n
    const half = type === 'half' || /^Gf(?:Vec[234]|Quat)h$/.test(type)
    const buffer = data as unknown as ArrayLike<number>
    const read = half ? (i: number) => _halfBitsToFloat(buffer[i]!) : (i: number) => buffer[i]!
    const out = new Array<unknown>(n)
    if (width === 1) {
      if (type === 'bool') for (let i = 0; i < n; i++) out[i] = buffer[i] !== 0
      else if (type === 'int64' || type === 'uint64') for (let i = 0; i < n; i++) out[i] = buffer[i]
      else for (let i = 0; i < n; i++) out[i] = read(i)
      return out
    }
    const quat = type.startsWith('GfQuat')
    const dim = type.startsWith('GfMatrix') ? Number(type[8]) : 0
    for (let i = 0; i < n; i++) {
      const o = i * width
      if (quat) out[i] = [read(o + 3), read(o), read(o + 1), read(o + 2)]
      else if (dim) {
        const rows: number[][] = []
        for (let r = 0; r < dim; r++) {
          const row: number[] = []
          for (let c = 0; c < dim; c++) row.push(read(o + r * dim + c))
          rows.push(row)
        }
        out[i] = rows
      } else {
        const comps: number[] = []
        for (let k = 0; k < width; k++) comps.push(read(o + k))
        out[i] = comps
      }
    }
    return out
  }
  if (!_sdfIsGfValue(value)) return value
  const gf = value as { GetReal?: () => number, GetImaginary?: () => { data: readonly number[] },
    GetArray?: () => readonly number[], dimension?: number, data?: readonly number[] }
  if (gf.GetReal) return [gf.GetReal(), ...gf.GetImaginary!().data]
  if (gf.GetArray) {
    const flat = gf.GetArray(), dim = gf.dimension!
    return Array.from({ length: dim }, (_, r) => flat.slice(r * dim, r * dim + dim))
  }
  return [...gf.data!]
}

// fileIO_Common.cpp:588,633,660,804-805: times are TfStringify(double).
function formatTime(t: number): string {
  return TfStreamDouble(t)
}

function indent(depth: number): string {
  return '    '.repeat(depth)
}
