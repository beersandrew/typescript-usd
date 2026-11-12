// Ported from OpenUSD 26.11.1: pxr/base/gf/ostreamHelpers.h,
//  pxr/base/tf/stringUtils.cpp, pxr/usdImaging/usdviewq/arrayAttributeView.py,
//  pxr/usdImaging/usdviewq/common.py, pxr/usdImaging/usdviewq/scalarTypes.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Text that native usdview produces through Python and Tf string conversion.
// OpenUSD v26.11.1:
//  usdviewq/common.py:296-345 GetShortStringForValue (property view Value column)
//  usdviewq/scalarTypes.py:28-120 ToString (Value tab) and arrayAttributeView.py:83-91
//  pxr/base/tf/stringUtils.cpp:917-1015 (TfStreamDouble/TfStreamFloat: double-conversion
//    ToShortest/ToShortestSingle, decimal_in_shortest_low -6, high 15, 'e', no '+')
//  pxr/base/gf/ostreamHelpers.h:24-33 (GfHalf falls through to std::ostream, %g precision 6)
// Expected text: tests/fixtures/usdviewPropertyView/expected.json (native capture).
import { displayResolvedPath } from './resolved-path-display'

/** Python 3 repr(float) / str(float). */
export function pyFloat(value: number): string {
  if (Number.isNaN(value)) return 'nan'
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf'
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0'
  const { sign, digits, exponent } = shortest(value)
  // float_repr_style 'short': positional when -4 <= exp < 16.
  if (exponent >= -4 && exponent < 16) {
    const text = positional(digits, exponent)
    return sign + (text.includes('.') ? text : text + '.0')
  }
  const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits
  return `${sign}${mantissa}e${exponent < 0 ? '-' : '+'}${String(Math.abs(exponent)).padStart(2, '0')}`
}

/** Shortest round-trip decimal digits of a double (JS and Python agree on the digits). */
function shortest(value: number, single = false): { sign: string, digits: string, exponent: number } {
  let text: string
  if (single) {
    const target = Math.fround(value)
    text = ''
    for (let precision = 1; precision <= 9; precision++) {
      text = Math.abs(target).toPrecision(precision)
      if (Math.fround(Number(text)) === Math.abs(target)) break
    }
    text = Number(text).toExponential()
  } else text = Math.abs(value).toExponential()
  const [mantissa, exponent] = text.split('e')
  return { sign: value < 0 || Object.is(value, -0) ? '-' : '', digits: mantissa!.replace('.', ''), exponent: Number(exponent) }
}
function positional(digits: string, exponent: number): string {
  if (exponent < 0) return '0.' + '0'.repeat(-exponent - 1) + digits
  if (digits.length <= exponent + 1) return digits + '0'.repeat(exponent + 1 - digits.length)
  return digits.slice(0, exponent + 1) + '.' + digits.slice(exponent + 1)
}

/** TfStreamDouble / TfStreamFloat (Gf vector, matrix, range and quat components). */
export function tfStream(value: number, single = false): string {
  if (Number.isNaN(value)) return 'nan'
  if (!Number.isFinite(single ? Math.fround(value) : value)) return value > 0 ? 'inf' : '-inf'
  if (value === 0) return Object.is(value, -0) ? '-0' : '0'
  const { sign, digits, exponent } = shortest(value, single)
  if (exponent >= -6 && exponent < 15) return sign + positional(digits, exponent)
  return `${sign}${digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits}e${exponent}`
}

/** std::ostream << float (GfHalf components): printf %g, precision 6. */
export function cGeneral(value: number, precision = 6): string {
  if (Number.isNaN(value)) return 'nan'
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf'
  if (value === 0) return Object.is(value, -0) ? '-0' : '0'
  const exponent = Number(value.toExponential(precision - 1).split('e')[1])
  const strip = (text: string) => text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
  if (exponent < -4 || exponent >= precision) {
    const [mantissa, exp] = value.toExponential(precision - 1).split('e')
    const e = Number(exp)
    return `${strip(mantissa!)}e${e < 0 ? '-' : '+'}${String(Math.abs(e)).padStart(2, '0')}`
  }
  return strip(value.toFixed(Math.max(0, precision - 1 - exponent)))
}

function group(integer: string): string { return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') }
/** Python '{:,d}'.format(int); bools are ints (True -> 1). */
export function pyGroupedInt(value: number | bigint | boolean): string {
  const text = typeof value === 'boolean' ? (value ? '1' : '0') : typeof value === 'bigint' ? value.toString() : Math.trunc(value).toString()
  return text.startsWith('-') ? '-' + group(text.slice(1)) : group(text)
}
/** Python '{:,.6f}'.format(float): correctly rounded, ties to even. */
export function pyGroupedFixed6(value: number): string {
  if (Number.isNaN(value)) return 'nan'
  if (!Number.isFinite(value)) return value > 0 ? 'inf' : '-inf'
  const negative = value < 0 || Object.is(value, -0), magnitude = Math.abs(value)
  let integer: string, fraction: string
  if (magnitude >= 1e21) { integer = BigInt(magnitude).toString(); fraction = '000000' }
  else {
    // toFixed(100) yields the exact binary value's decimal digits (to 100 places).
    const exact = magnitude.toFixed(100), [whole, decimals] = exact.split('.') as [string, string]
    let kept = BigInt(whole + decimals.slice(0, 6))
    const rest = decimals.slice(6), first = Number(rest[0])
    const tie = first === 5 && /^5?0*$/.test(rest)
    if (first > 5 || (first === 5 && !tie) || (tie && kept % 2n === 1n)) kept += 1n
    const digits = kept.toString().padStart(7, '0')
    integer = digits.slice(0, -6); fraction = digits.slice(-6)
  }
  return `${negative ? '-' : ''}${group(integer)}.${fraction}`
}

// ------------------------------------------------------------------ Gf values
interface GfLike { constructor: { name: string }, _data?: number[], dimension?: number, scalarKind?: string }
function scalarOf(kind: string | undefined): (value: number) => string {
  return kind === 'f' ? v => tfStream(v, true) : kind === 'h' ? v => cGeneral(v) : kind === 'i' ? v => String(v) : v => tfStream(v)
}
function vecText(values: readonly number[], kind: string | undefined): string {
  const scalar = scalarOf(kind)
  return `(${values.map(scalar).join(', ')})`
}
function matrixRows(value: unknown): { rows: number[][], kind: string } | undefined {
  const matrix = value as { _m?: number[], dimension?: number, scalarKind?: string }
  if (!Array.isArray(matrix?._m) || !matrix.dimension) return
  const n = matrix.dimension, rows: number[][] = []
  for (let r = 0; r < n; r++) rows.push(matrix._m.slice(r * n, r * n + n))
  return { rows, kind: matrix.scalarKind ?? 'd' }
}
function quatParts(value: unknown): { real: number, imaginary: number[], kind: string } | undefined {
  const quat = value as { _real?: number, _imaginary?: { _data?: number[], scalarKind?: string } }
  if (typeof quat?._real !== 'number' || !Array.isArray(quat._imaginary?._data)) return
  return { real: quat._real, imaginary: quat._imaginary._data, kind: quat._imaginary.scalarKind ?? 'd' }
}
function rangeParts(value: unknown): { min: number[], max: number[], kind: string } | undefined {
  const range = value as { _min?: GfLike, _max?: GfLike }
  if (!Array.isArray(range?._min?._data) || !Array.isArray(range._max?._data)) return
  return { min: range._min._data, max: range._max._data, kind: range._min.scalarKind ?? 'd' }
}
/** str() of a Gf value (operator<< in pxr/base/gf/*.cpp), or undefined when not a Gf value. */
export function gfStr(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return
  const vec = value as GfLike
  if (Array.isArray(vec._data) && vec.dimension) return vecText(vec._data, vec.scalarKind)
  const matrix = matrixRows(value)
  if (matrix) return `( ${matrix.rows.map(row => vecText(row, matrix.kind)).join(', ')} )`
  const quat = quatParts(value)
  if (quat) return vecText([quat.real, ...quat.imaginary], quat.kind)
  const range = rangeParts(value)
  if (range) return `[${vecText(range.min, range.kind)}...${vecText(range.max, range.kind)}]`
}
/** A row-major 4x4 matrix as GfMatrix4d (XformCache results are plain arrays). */
export function matrix4dStr(m: ArrayLike<number>): string {
  const rows = [0, 1, 2, 3].map(r => vecText(Array.from({ length: 4 }, (_, c) => m[r * 4 + c]!), 'd'))
  return `( ${rows.join(', ')} )`
}
export function matrix4dToString(m: ArrayLike<number>): string {
  return [0, 1, 2, 3].map(r => Array.from({ length: 4 }, (_, c) => tfStream(m[r * 4 + c]!)).join(', ') + '\n').join('')
}

// --------------------------------------------------------------- value types
/** Sdf value type role names collapse to the C++ value type's first registered
 * name, which Sdf.GetValueTypeNameForValue reports (e.g. point3f[] -> float3). */
export function baseScalarType(typeName: string): string {
  const scalar = typeName.replace(/\[\]$/, '')
  const role = /^(?:point|normal|vector|color|texCoord)(\d)([hfd])$/.exec(scalar)
  if (role) return `${{ h: 'half', f: 'float', d: 'double' }[role[2] as 'h' | 'f' | 'd']}${role[1]}`
  if (scalar === 'frame4d') return 'matrix4d'
  return scalar
}
const integerTypes = new Set(['uchar', 'int', 'uint', 'int64', 'uint64'])
const floatTypes = new Set(['half', 'float', 'double'])

interface ArrayLikeValue { length: number, get?: (index: number) => unknown, [index: number]: unknown }
function arrayOf(value: unknown): ArrayLikeValue | undefined {
  if (value === null || typeof value !== 'object') return
  const array = value as ArrayLikeValue
  if (!Number.isSafeInteger(array.length)) return
  if (typeof array.get === 'function' || Array.isArray(value) || ArrayBuffer.isView(value)) return array
}
function at(array: ArrayLikeValue, index: number): unknown { return typeof array.get === 'function' ? array.get(index) : array[index] }

/** Public SdfAssetPath fields; unlike a raw authored string these retain resolver output. */
function assetPathParts(value:unknown):{authored:string,evaluated:string,resolved:string}|undefined{
 if(!value||typeof value!=='object')return
 const path=value as {getAuthoredPath?:()=>string,getEvaluatedPath?:()=>string,getResolvedPath?:()=>string}
 if(typeof path.getAuthoredPath!=='function'||typeof path.getResolvedPath!=='function')return
 return {authored:path.getAuthoredPath(),evaluated:path.getEvaluatedPath?.()??'',resolved:displayResolvedPath(path.getResolvedPath())}
}

/** Python str() of one scalar value of the given Sdf scalar type name. */
export function pyStr(value: unknown, scalarType: string): string {
  if (value === undefined || value === null) return 'None'
  const base = baseScalarType(scalarType)
  if(base==='asset'){
    const array=scalarType.endsWith('[]')?arrayOf(value):undefined
    if(array)return '['+Array.from({length:array.length},(_,index)=>pyStr(at(array,index),'asset')).join(', ')+']'
    const path=assetPathParts(value)
    if(path)return '@'+(path.evaluated||path.authored)+'@'
  }
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number') {
    if (base === 'bool') return value ? 'True' : 'False'
    if (integerTypes.has(base)) return String(Math.trunc(value))
    if (base === 'timecode') return tfStream(value)
    return pyFloat(value)
  }
  if (typeof value === 'string') return base === 'asset' ? `@${value}@` : value
  const gf = gfStr(value)
  if (gf !== undefined) return gf
  return String(value)
}

/** common.py:315-345 GetShortStringForValue for a Usd attribute value. */
export function shortStringForValue(value: unknown, typeName: string): string {
  if (value === undefined || value === null) return ''
  let result: string
  const array = typeName.endsWith('[]') ? arrayOf(value) : undefined
  if (array) {
    const scalar = baseScalarType(typeName)
    if (array.length) {
      const items = array.length <= 6
        ? Array.from({ length: array.length }, (_, i) => pyStr(at(array, i), scalar))
        : [0, 1, 2].map(i => pyStr(at(array, i), scalar)).concat('...', [3, 2, 1].map(k => pyStr(at(array, array.length - k), scalar)))
      result = `${scalar}[${array.length}]: [${items.join(', ')}]`
    } else result = `${scalar}[]`
  } else result = pyStr(value, typeName)
  return result.slice(0, 500)
}
/** GetShortStringForValue for a relationship: ", ".join(str(p) for p in targets). */
export function shortStringForTargets(targets: readonly string[]): string { return targets.join(', ').slice(0, 500) }

/** Python repr() used by pprint.pformat for values ToString does not special-case. */
function pyRepr(value: unknown, scalarType: string): string {
  const base = baseScalarType(scalarType)
  const asset=base==='asset'?assetPathParts(value):undefined
  if(asset)return `Sdf.AssetPath(authoredPath=${pyStringRepr(asset.authored)}${asset.evaluated?`, evaluatedPath=${pyStringRepr(asset.evaluated)}`:''}${asset.resolved?`, resolvedPath=${pyStringRepr(asset.resolved)}`:''})`
  if (typeof value === 'string') {
    if (base === 'asset') return `Sdf.AssetPath(authoredPath=${pyStringRepr(value)})`
    return pyStringRepr(value)
  }
  if (typeof value === 'number' && base === 'timecode') return `Gf.TimeCode(${tfStream(value)})`
  const quat = quatParts(value)
  if (quat) {
    const name = { f: 'Quatf', d: 'Quatd', h: 'Quath' }[quat.kind] ?? 'Quatd'
    const vec = { f: 'Vec3f', d: 'Vec3d', h: 'Vec3h' }[quat.kind] ?? 'Vec3d'
    return `Gf.${name}(${pyFloat(quat.real)}, Gf.${vec}(${quat.imaginary.map(pyFloat).join(', ')}))`
  }
  return pyStr(value, scalarType)
}
export function pyStringRepr(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'"
  return quote + text.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote).replace(/\n/g, '\\n').replace(/\t/g, '\\t') + quote
}
/** pprint.pformat of a list of already-repr'd items (width 80, one item per line when wrapping). */
export function pprintList(items: readonly string[]): string {
  const flat = `[${items.join(', ')}]`
  return flat.length <= 80 ? flat : `[${items.join(',\n ')}]`
}

/** scalarTypes.py:28-120 ToString(value, Sdf value type name). */
export function scalarToString(value: unknown, typeName: string): string {
  if (value === undefined || value === null) return 'None'
  const base = baseScalarType(typeName)
  const matrix = matrixRows(value)
  if (matrix) return matrix.rows.map(row => row.map(scalarOf(matrix.kind)).join(', ') + '\n').join('')
  if (gfStr(value) !== undefined && !quatParts(value)) return gfStr(value)!
  if (typeof value === 'boolean') return pyGroupedInt(value)
  if (typeof value === 'bigint') return pyGroupedInt(value)
  if (typeof value === 'number') {
    if (base === 'bool') return pyGroupedInt(!!value)
    if (integerTypes.has(base)) return pyGroupedInt(value)
    if (floatTypes.has(base)) return pyGroupedFixed6(value)
    return pyRepr(value, typeName)
  }
  if (typeof value === 'string' && base !== 'asset') return value
  return pyRepr(value, typeName)
}
/** Value tab text for a relationship: pprint.pformat([Sdf.Path(...), ...]). */
export function targetsToString(targets: readonly string[]): string {
  return pprintList(targets.map(path => `Sdf.Path(${pyStringRepr(path)})`))
}
/** arrayAttributeView.py:83-91 row text: "<index>: <ToString(element, scalarType)>". */
export function arrayEntryToString(index: number, value: unknown, typeName: string): string {
  return `${index}: ${scalarToString(value, typeName.replace(/\[\]$/, ''))}`
}
/** appController.py:2210-2217 setFrameField: str(round(float(frame), ndigits=2)). */
export function frameFieldText(frame: number): string {
  // Doubles of 1e15 and above have no fractional digits to round.
  if (!Number.isFinite(frame) || Math.abs(frame) >= 1e15) return pyFloat(frame)
  // Python rounds the exact binary value, ties to even.
  const exact = Math.abs(frame).toFixed(100), [whole, decimals] = exact.split('.') as [string, string]
  let kept = BigInt(whole + decimals.slice(0, 2))
  const rest = decimals.slice(2), first = Number(rest[0]), tie = first === 5 && /^50*$/.test(rest)
  if (first > 5 || (first === 5 && !tie) || (tie && kept % 2n === 1n)) kept += 1n
  return pyFloat(Number(kept) / 100 * (frame < 0 || Object.is(frame, -0) ? -1 : 1))
}
