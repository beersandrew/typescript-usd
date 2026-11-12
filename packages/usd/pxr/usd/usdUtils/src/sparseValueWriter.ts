// Ported from OpenUSD 26.11.1: pxr/usd/usdUtils/sparseValueWriter.cpp,
//  pxr/usd/usdUtils/sparseValueWriter.h,
//  pxr/usd/usdUtils/wrapSparseValueWriter.cpp
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/usdUtils/sparseValueWriter.{h,cpp} (OpenUSD 26.11.1).
//
// Sparse authoring of attribute values: a run of time samples with the same
// (or, for floating point types, nearly the same) value is written as the
// first and last samples of the run only, and a default value that matches
// the attribute's existing default is not authored.
//
// PLATFORM-DIVERGENCE(usdutils-sparse-value-held-type): a VtValue knows its
// held C++ type, which _IsClose dispatches on (sparseValueWriter.cpp:126-185);
// a JavaScript value does not (a number may be a double, float, half or
// int). Each value is first converted to the attribute's declared value type,
// as the Python wrapper's UsdPythonToSdfType does (wrapSparseValueWriter.cpp:
// 21-50), and _IsClose dispatches on that declared type.
//
// The VtValue* overloads of the constructor, SetTimeSample and SetAttribute
// (sparseValueWriter.h:98, 119, 230-232), and SetAttribute's template
// overload (:235-241), exist to move a value without copying it; JavaScript
// passes values by reference, so each has the one form here.

import { coerceValueToType, findValueTypeName } from 'typescript-usd/sdf'
import { _sdfValuesEqual } from 'typescript-usd/sdf/_internal'
import { TfDiagnosticMgr, Error as TfError, TfDiagnosticType, TF_CODING_ERROR } from 'typescript-usd/tf'
import {
  TimeCode as UsdTimeCode, usdTimeCodeToStreamString, type Attribute as UsdAttribute, type Stage as UsdStage,
} from 'typescript-usd/usd'

type TimeCodeLike = UsdTimeCode | number

const toTimeCode = (t: TimeCodeLike): UsdTimeCode => typeof t === 'number' ? new UsdTimeCode(t) : t

// The epsilon value used for comparing half values.
const _halfEpsilon = 1e-2
// The epsilon value used for comparing float values.
const _floatEpsilon = 1e-6
// The epsilon value used for comparing double values.
const _doubleEpsilon = 1e-12

// GfIsClose(double, double, epsilon) (gf/math.h:28-30).
const gfIsClose = (a: number, b: number, epsilon: number): boolean => Math.abs(a - b) < epsilon

type IsClose = (a: unknown, b: unknown) => boolean

// _IsClose(double|float|GfHalf) (sparseValueWriter.cpp:49-65): the scalar
// comparison for a Gf scalar kind.
const scalarIsClose = (epsilon: number): IsClose => (a, b) => gfIsClose(a as number, b as number, epsilon)

// _IsClose(MatrixType) (sparseValueWriter.cpp:67-83): element-wise.
const matrixIsClose = (n: number, epsilon: number): IsClose => (a, b) => {
  const ma = a as { getElement(i: number, j: number): number }
  const mb = b as { getElement(i: number, j: number): number }
  for (let i = 0; i < n; ++i) {
    for (let j = 0; j < n; ++j) {
      if (!gfIsClose(ma.getElement(i, j), mb.getElement(i, j), epsilon)) return false
    }
  }
  return true
}

// _IsClose(VectorType) (sparseValueWriter.cpp:85-96): component-wise.
const vecIsClose = (n: number, epsilon: number): IsClose => (a, b) => {
  const va = a as { get(i: number): number }, vb = b as { get(i: number): number }
  for (let i = 0; i < n; ++i) {
    if (!gfIsClose(va.get(i), vb.get(i), epsilon)) return false
  }
  return true
}

// _IsClose(QuatType) (sparseValueWriter.cpp:98-108): real, then imaginary.
const quatIsClose = (epsilon: number): IsClose => {
  const imaginaryIsClose = vecIsClose(3, epsilon)
  return (a, b) => {
    const qa = a as { GetReal(): number, GetImaginary(): unknown }
    const qb = b as { GetReal(): number, GetImaginary(): unknown }
    if (!gfIsClose(qa.GetReal(), qb.GetReal(), epsilon)) return false
    return imaginaryIsClose(qa.GetImaginary(), qb.GetImaginary())
  }
}

// _IsClose(VtArray<T>) (sparseValueWriter.cpp:110-124): size, then
// element-wise.
const arrayIsClose = (elementIsClose: IsClose): IsClose => (a, b) => {
  const aa = a as { size: number, get(i: number): unknown }
  const ab = b as { size: number, get(i: number): unknown }
  if (aa.size !== ab.size) return false
  for (let i = 0; i < aa.size; ++i) {
    if (!elementIsClose(aa.get(i), ab.get(i))) return false
  }
  return true
}

// The held types CHECK_IS_HOLDING_AND_IS_CLOSE tests
// (sparseValueWriter.cpp:126-182), by SdfValueTypeName type key, with the
// _IsClose overload each selects. Arrays follow from their element types.
const scalarIsCloseByType = new Map<string, IsClose>([
  ['double', scalarIsClose(_doubleEpsilon)],
  ['float', scalarIsClose(_floatEpsilon)],
  ['half', scalarIsClose(_halfEpsilon)],
  ['GfMatrix4d', matrixIsClose(4, _doubleEpsilon)],
  ['GfMatrix3d', matrixIsClose(3, _doubleEpsilon)],
  ['GfMatrix2d', matrixIsClose(2, _doubleEpsilon)],
  ['GfVec2d', vecIsClose(2, _doubleEpsilon)],
  ['GfVec3d', vecIsClose(3, _doubleEpsilon)],
  ['GfVec4d', vecIsClose(4, _doubleEpsilon)],
  ['GfVec2f', vecIsClose(2, _floatEpsilon)],
  ['GfVec3f', vecIsClose(3, _floatEpsilon)],
  ['GfVec4f', vecIsClose(4, _floatEpsilon)],
  ['GfVec2h', vecIsClose(2, _halfEpsilon)],
  ['GfVec3h', vecIsClose(3, _halfEpsilon)],
  ['GfVec4h', vecIsClose(4, _halfEpsilon)],
  ['GfQuatd', quatIsClose(_doubleEpsilon)],
  ['GfQuatf', quatIsClose(_floatEpsilon)],
  ['GfQuath', quatIsClose(_halfEpsilon)],
])
const isCloseByType = new Map<string, IsClose>(scalarIsCloseByType)
for (const [type, isClose] of scalarIsCloseByType) isCloseByType.set(`${type}[]`, arrayIsClose(isClose))

// _IsClose(const VtValue&, const VtValue&) (sparseValueWriter.cpp:130-186).
// `heldType` is the SdfValueTypeName type key of the attribute both values
// were converted to (see the PLATFORM-DIVERGENCE above).
function _IsClose(a: unknown, b: unknown, heldType: string | undefined): boolean {
  // If either value is empty, return false.
  if (a === undefined || b === undefined) return false

  const isClose = heldType === undefined ? undefined : isCloseByType.get(heldType)
  if (isClose) return isClose(a, b)

  // If we get here, it's not a floating-point type. Hence, check for equality.
  return _sdfValuesEqual(a, b)
}

// UsdAttribute::Set(value, time): true on success. The TypeScript setters
// throw on failure; the error is posted, as UsdAttribute::Set posts it, and
// false returned.
function setValue(attr: UsdAttribute, value: unknown, time: UsdTimeCode): boolean {
  try {
    if (time.isDefault()) attr.set(value)
    else attr.setTimeSample(time.GetValue(), value)
    return true
  } catch (error) {
    TfDiagnosticMgr.GetInstance().postError(error instanceof TfError ? error
      : new TfError(error instanceof Error ? error.message : String(error), TfDiagnosticType.RuntimeError))
    return false
  }
}

/**
 * UsdUtilsSparseAttrValueWriter (sparseValueWriter.h:71-140): sparse
 * authoring of one attribute's default value and time samples, which must
 * be set in increasing time order.
 */
export class UsdUtilsSparseAttrValueWriter {
  // The attribute whose time-samples will be authored via public API.
  readonly #attr: UsdAttribute
  // The attribute's declared value type, which values are converted to.
  readonly #typeName: string
  readonly #heldType: string | undefined
  // The time at which previous time-sample was authored.
  #prevTime: UsdTimeCode = UsdTimeCode.Default()
  // The value at previously authored time-sample.
  #prevValue: unknown = undefined
  // Whether a time-sample was written at _prevTime (with value=_prevValue).
  #didWritePrevValue = true

  /**
   * sparseValueWriter.cpp:188-203: the writer for `attr`, authoring
   * `defaultValue` (when given) unless it is close to the attribute's
   * existing default.
   */
  constructor(attr: UsdAttribute, defaultValue?: unknown) {
    this.#attr = attr
    this.#typeName = attr.typeName
    this.#heldType = findValueTypeName(this.#typeName)?.type
    this.#initializeSparseAuthoring(this.#convert(defaultValue))
  }

  // UsdPythonToSdfType(value, attr.GetTypeName()) (wrapSparseValueWriter.cpp:
  // 21-50): the value as the attribute's declared type; None is empty.
  #convert(value: unknown): unknown {
    return value === undefined || value === null ? undefined : coerceValueToType(value, this.#typeName)
  }

  // _InitializeSparseAuthoring (sparseValueWriter.cpp:205-229).
  #initializeSparseAuthoring(defaultValue: unknown): void {
    // UsdAttribute::Get(&existingDefault, UsdTimeCode::Default()): the
    // resolved default or fallback, if any.
    const existingDefault = this.#attr.getValue()
    if (existingDefault !== undefined) {
      if (defaultValue !== undefined &&
          !_IsClose(existingDefault, defaultValue, this.#heldType)) {
        setValue(this.#attr, defaultValue, UsdTimeCode.Default())
      }
    } else if (defaultValue !== undefined) {
      setValue(this.#attr, defaultValue, UsdTimeCode.Default())
    }

    // If a non-empty default value was provided, then set _prevValue to it,
    // if not set it to the existing default value. This initializes the
    // run-length encoding / sparse authoring scheme.
    this.#prevValue = defaultValue !== undefined ? defaultValue : existingDefault
  }

  /**
   * UsdUtilsSparseAttrValueWriter::SetTimeSample (sparseValueWriter.cpp:
   * 231-275): writes `value` at `time` unless it continues the current run
   * of (nearly) equal values; the last sample of a run is written when the
   * run ends. Returns false when authoring fails.
   */
  setTimeSample(value: unknown, time: TimeCodeLike): boolean {
    const t = toTimeCode(time)
    const v = this.#convert(value)
    if (t.isDefault()) {
      if (!this.#prevTime.isDefault()) {
        TF_CODING_ERROR(`UsdUtilsSparseAttrValueWriter::SetTimeSample was ` +
          `called with time=Default on attr <${this.#attr.getPath()}> with existing time-samples.`)
        return false
      }
    }

    // UsdTimeCode::operator> (timeCode.h:205-209).
    if (this.#prevTime.valueOf() > t.valueOf()) {
      TF_CODING_ERROR(`Time-samples should be set in sequentially increasing order of time. ` +
        `Current time ( ${usdTimeCodeToStreamString(t)} ) is earlier than previous time ` +
        `( ${usdTimeCodeToStreamString(this.#prevTime)} )`)
    }

    let success = true
    if (!_IsClose(this.#prevValue, v, this.#heldType)) {
      if (!this.#didWritePrevValue) {
        // Write the extra timeSample to end the previous run.
        success = setValue(this.#attr, this.#prevValue, this.#prevTime) && success
      }
      success = setValue(this.#attr, v, t) && success

      this.#prevValue = v

      // Setting _didWritePrevValue to true indicates the start of a new
      // run of similar values.
      this.#didWritePrevValue = true
    } else {
      this.#didWritePrevValue = false
    }

    // Update the time at which the next sample must be authored,
    // if different from the current sample.
    this.#prevTime = t

    return success
  }

  /** sparseValueWriter.h:122-124 */
  getAttr(): UsdAttribute { return this.#attr }
}

/**
 * UsdUtilsSparseValueWriter (sparseValueWriter.h:212-276): sparse authoring
 * of many attributes, with one UsdUtilsSparseAttrValueWriter per attribute.
 */
export class UsdUtilsSparseValueWriter {
  // _AttrValueWriterMap (sparseValueWriter.h:270-273), keyed by the
  // attribute's stage and path (UsdAttribute equality).
  #attrValueWriterMap = new Map<UsdStage, Map<string, UsdUtilsSparseAttrValueWriter>>()

  /**
   * UsdUtilsSparseValueWriter::SetAttribute (sparseValueWriter.cpp:323-364):
   * a default-time value creates the attribute's writer with that default
   * (or, for a known attribute, sets its default); a numeric time sets a
   * time sample.
   */
  setAttribute(attr: UsdAttribute, value: unknown, time: TimeCodeLike = UsdTimeCode.Default()): boolean {
    const t = toTimeCode(time)
    const stage = attr.getStage()
    let byPath = this.#attrValueWriterMap.get(stage)
    if (!byPath) this.#attrValueWriterMap.set(stage, byPath = new Map())
    const it = byPath.get(attr.getPath())
    if (it === undefined) {
      if (t.isDefault()) {
        byPath.set(attr.getPath(), new UsdUtilsSparseAttrValueWriter(attr, value))
        return true
      }
      const vw = new UsdUtilsSparseAttrValueWriter(attr)
      byPath.set(attr.getPath(), vw)
      return vw.setTimeSample(value, t)
    }
    return it.setTimeSample(value, t)
  }

  /** sparseValueWriter.h:247-249 */
  clear(): void {
    this.#attrValueWriterMap.clear()
  }

  /** UsdUtilsSparseValueWriter::GetSparseAttrValueWriters (sparseValueWriter.cpp:366-374). */
  getSparseAttrValueWriters(): UsdUtilsSparseAttrValueWriter[] {
    const sparseValueWriterVec: UsdUtilsSparseAttrValueWriter[] = []
    for (const byPath of this.#attrValueWriterMap.values()) sparseValueWriterVec.push(...byPath.values())
    return sparseValueWriterVec
  }
}
