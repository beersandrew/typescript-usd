// Ported from OpenUSD 26.11.1: pxr/usd/sdf/crateDataTypes.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Private parser-to-SdfData flattening boundary. Parser record shapes stop in
// this file; SdfLayer, file-format clients, Pcp, and Usd see only specs and
// fields through SdfAbstractData.

import { Sdf_CrateData } from './crateData.ts'
import { SdfData, _SdfLazyFieldValue } from './data.ts'
import type { CrateContents, CrateValueRep } from './crateFile.ts'
import { VT } from './crateTypes.ts'
import { Error as TfError, TfDiagnosticMgr, TfDiagnosticType } from 'typescript-usd/tf'
import type { SdfSpecType } from './abstractData.ts'
import { Spline as TsSpline } from 'typescript-usd/ts'
import { Array as VtArray } from 'typescript-usd/vt'

interface ParserValue { value?: unknown; valueTypeName?: string }
interface ParserSpec {
  form?: number
  fields?: Record<string, ParserValue>
  [fieldName: string]: unknown
}
export type SdfParserScene = Record<string, ParserSpec>

const CRATE_SPEC_TYPES: Readonly<Record<number, SdfSpecType>> = {
  1: 'attribute', 2: 'connection', 3: 'expression', 4: 'mapper',
  5: 'mapperArg', 6: 'prim', 7: 'pseudoRoot', 8: 'relationship',
  9: 'relationshipTarget', 10: 'variant', 11: 'variantSet',
}

function parserSpecType(path: string, spec: ParserSpec): SdfSpecType {
  const encoded = spec.form === undefined ? undefined : CRATE_SPEC_TYPES[spec.form]
  if (encoded) return encoded
  if (typeof spec.specType === 'string') return spec.specType as SdfSpecType
  if (path === '/') return 'pseudoRoot'
  if (/\{[^}=]+=[^}]*\}$/.test(path)) {
    return /=\}$/.test(path) ? 'variantSet' : 'variant'
  }
  const lastSlash = path.lastIndexOf('/')
  if (path.indexOf('.', lastSlash) >= 0) {
    const targets = (spec.targetPaths as ParserValue | undefined)?.value
    return spec.specType === 'relationship' || targets !== undefined ? 'relationship' : 'attribute'
  }
  return 'prim'
}

function normalizeTimeSamples(value: unknown): [number, unknown][] {
  const entries = value instanceof Map
    ? [...value]
    : Array.isArray(value)
      ? value.filter((entry): entry is [unknown, unknown] =>
        Array.isArray(entry) && entry.length >= 2)
      : value !== null && typeof value === 'object'
        ? Object.entries(value)
        : []
  return entries
    .map(([time, sample]): [number, unknown] => [
      Number(time),
      sample !== null && typeof sample === 'object' && 'typeId' in sample && 'value' in sample
        ? (sample as ParserValue).value : sample,
    ])
    .filter(([time]) => Number.isFinite(time))
    .sort(([left], [right]) => left - right)
}

function validateAndCoerceSpline(value: unknown): unknown {
  if (!(value instanceof TsSpline)) return value
  const typeName = value.GetValueType().getTypeName()
  const isFloat = typeName === 'float'
  for (const knot of value.getKnots()) {
    if (knot.getPreTanWidth() < 0 || knot.getPostTanWidth() < 0) {
      throw new Error('Cannot set negative tangent width')
    }
    if (isFloat) {
      const authored = [knot.GetValue(), knot.getPreValue()]
      if (authored.some(item => !Number.isFinite(Math.fround(item)))) {
        throw new Error('Cannot set undefined float spline value')
      }
      knot.setValue(Math.fround(knot.GetValue()))
      if (knot.isDualValued()) knot.setPreValue(Math.fround(knot.getPreValue()))
      knot.setPreTanSlope(Math.fround(knot.getPreTanSlope()))
      knot.setPostTanSlope(Math.fround(knot.getPostTanSlope()))
    }
  }
  return value
}

// The text parser stores an explicit connection list as a path, a path list,
// or null for None; crate stores every connection list as a list op.
function normalizeListOp(value: unknown): unknown {
  if (value === null || typeof value !== 'object' ||
      !(value as { _sdfExplicitEmpty?: boolean })._sdfExplicitEmpty) return value
  return { ...(value as Record<string, unknown>), isExplicit: true }
}

export function dataFromParserScene(scene: SdfParserScene): SdfData {
  const data = new SdfData()
  for (const path in scene) {
    if (!Object.prototype.hasOwnProperty.call(scene, path)) continue
    const spec = scene[path]!
    const specType = parserSpecType(path, spec)
    data.createSpec(path, specType)
    const typeName = (spec.typeName as ParserValue | undefined)?.value
    // USDA's flattened entries contain normalized values while `fields`
    // retains grammar-level list-op shapes. USDC makes both views identical.
    for (const fieldName in spec) {
      if (fieldName === 'form' || fieldName === 'fields' || fieldName === 'specType' ||
          !Object.prototype.hasOwnProperty.call(spec, fieldName)) continue
      const parserValue = spec[fieldName] as ParserValue | undefined
      const parsedValue = parserValue?.value
      if (parsedValue === undefined) continue
      const value = parsedValue
      const enumValue = fieldName === 'specifier' && typeof value === 'number'
        ? (['def', 'over', 'class'] as const)[value]
        : fieldName === 'variability' && typeof value === 'number'
          ? (['varying', 'uniform'] as const)[value]
          : fieldName === 'permission' && typeof value === 'number'
            ? (['public', 'private'] as const)[value]
            : value
      // Unknown pseudo-root metadata is retained as SdfUnregisteredValue by
      // OpenUSD 26.11.1 textParserHelpers.cpp:209-258 so it survives saving.
      // The parser's values are fresh and owned by no one else, so the data
      // takes them without a copy, as the text parser's context hands parsed
      // values to SdfData upstream (textParserHelpers.cpp:129), where the
      // VtValue copy shares storage.
      if (fieldName === 'timeSamples') {
        data._setOwned(path, fieldName, normalizeTimeSamples(value))
      } else {
        const normalized = normalizeListOp(enumValue)
        data._setOwned(path, fieldName,
          fieldName === 'spline' ? validateAndCoerceSpline(normalized)
            : fieldName === 'documentation' && typeof normalized === 'string'
              ? normalized.replace(/\\(['"\\])/g, '$1') : normalized)
      }
      if (parserValue?.valueTypeName) {
        data.setValueTypeName(path, fieldName, parserValue.valueTypeName)
      }
    }
  }
  return data
}


// The crate counterpart of dataFromParserScene: the same field shaping, but
// values stay undecoded until read (Sdf_CrateData unpacks on demand) and are
// stored without the float32 coercion and copy, since crate floats are
// already exact and every decode yields a fresh value. Inline values, and the
// fields this flattening itself inspects, are decoded up front; splines too,
// since their validation must fail the open as it does for text.
const EAGER_CRATE_FIELDS = new Set(['typeName', 'variantSetNames', 'specifier', 'variability', 'permission', 'spline'])

// Sdf_CrateDataImpl::_ToPayloadListOpValue (crateData.cpp:1075-1098): the
// payload field is a list op, but the crate stores a single explicit payload
// as an SdfPayload (the only form before crate 0.8.0, and the form the
// writer still uses when it can, crateData.cpp:1100-1124). A payload with
// an empty asset path is the old spelling of `payload = None`: an explicitly
// empty list. Any other payload is an explicit list of that one payload.
function toPayloadListOpValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || 'isExplicit' in value ||
      !('assetPath' in value)) return normalizeListOp(value)
  const payload = value as { assetPath: string }
  return {
    isExplicit: true,
    explicitItems: payload.assetPath === '' ? [] : [payload],
    prependedItems: [], appendedItems: [], deletedItems: [],
  }
}

function crateFieldValue(fieldName: string, value: unknown): unknown {
  if (fieldName === 'specifier' && typeof value === 'number') return (['def', 'over', 'class'] as const)[value]
  if (fieldName === 'variability' && typeof value === 'number') return (['varying', 'uniform'] as const)[value]
  if (fieldName === 'permission' && typeof value === 'number') return (['public', 'private'] as const)[value]
  if (fieldName === 'timeSamples') return normalizeTimeSamples(value)
  // Prim relocates are an SdfRelocatesMap.
  if (fieldName === 'relocates' && Array.isArray(value)) {
    const map: Record<string, string> = {}
    for (const [source, target] of value as [string, string][]) if (!(source in map)) map[source] = target
    return map
  }
  if (fieldName === 'payload') return toPayloadListOpValue(value)
  // allowedTokens and displayGroupOrder are a VtTokenArray and a
  // VtStringArray (schema.cpp:735,766), crate token and string arrays; the
  // field holds the plain string list the text parser and the spec setters
  // store (attributeSpec.ts setAllowedTokens).
  if ((fieldName === 'allowedTokens' || fieldName === 'displayGroupOrder') && value instanceof VtArray) {
    return value.toArray().map(String)
  }
  const normalized = normalizeListOp(value)
  if (fieldName === 'spline') return validateAndCoerceSpline(normalized)
  if (fieldName === 'documentation' && typeof normalized === 'string') {
    return normalized.replace(/\\(['"\\])/g, '$1')
  }
  return normalized
}

class CrateLazyField extends _SdfLazyFieldValue {
  constructor(
    private readonly contents: CrateContents, private readonly name: string,
    private readonly rep: CrateValueRep, private readonly assetPath: string,
  ) { super() }
  resolve(): unknown {
    // CrateFile::_UnpackValue (crateFile.cpp:4361-4385): a value that fails
    // to unpack (out-of-bounds sizes in a corrupt file) posts a runtime
    // error and reads as empty.
    let value: unknown
    try {
      value = this.contents.decode(this.rep).value
    } catch {
      TfDiagnosticMgr.GetInstance().postError(new TfError(
        `Corrupt asset <${this.assetPath}>: exception thrown unpacking a value, returning an empty VtValue`,
        TfDiagnosticType.RuntimeError))
      return undefined
    }
    return crateFieldValue(this.name, value)
  }
}

export function dataFromCrateContents(contents: CrateContents, detached = false, assetPath = ''): SdfData {
  const data = new Sdf_CrateData(true, detached, contents.version)
  for (const spec of contents.specs) {
    const { path } = spec
    const specType = CRATE_SPEC_TYPES[spec.form] ?? parserSpecType(path, {})
    data.createSpec(path, specType)
    for (let fi = spec.fieldSetStart; fi < contents.fieldSets.length; fi++) {
      const fieldIdx = contents.fieldSets[fi]!
      if (fieldIdx < 0 || fieldIdx === 0xffffffff) break
      const { name, rep } = contents.fields[fieldIdx]!
      // Every field of every spec is kept, registered or not: unknown
      // pseudo-root metadata survives a crate open as it does a text open
      // (OpenUSD 26.11.1 crateData.cpp:830-850 unpacks each field of each
      // field set without consulting the schema).
      if (rep.isInlined || EAGER_CRATE_FIELDS.has(name) || rep.typeId === VT.UnregisteredValue) {
        const decoded = contents.decode(rep)
        if (decoded.value === undefined) continue
        const value = crateFieldValue(name, decoded.value)
        data._setOwned(path, name, value)
        if (decoded.valueTypeName) data.setValueTypeName(path, name, decoded.valueTypeName)
      } else {
        data._setLazy(path, name, new CrateLazyField(contents, name, rep, assetPath))
      }
    }
  }
  return data
}
