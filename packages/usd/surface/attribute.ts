// Ported from OpenUSD 26.11.1: pxr/usd/usd/attribute.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Surface Attribute: one call per member into the core's attribute handle
// (pxr/usd/usd/src/prim.ts Attribute; OpenUSD pxr/usd/usd/attribute.h).
import { TimeCode as UsdTimeCode, type Attribute as CoreAttribute } from 'typescript-usd/usd'
import { guard } from './error.ts'
import { Prim } from './prim.ts'
import { fromCoreValue, toCoreValue, type ReadonlyValue, type ValueInput } from './values.ts'

/**
 * A typed attribute. `T` is the value type: a typed array for numeric
 * arrays (`Attribute<Float32Array>` for `point3f[]`), `number`, `string`,
 * `boolean`, or the core's Gf value for vectors and matrices. Untyped
 * lookups (`prim.attribute(name)`) give `Attribute<unknown>`; schema classes
 * such as `Mesh` give the declared type.
 *
 * @upstream UsdAttribute
 */
export class Attribute<T = unknown> {
  readonly #core: CoreAttribute

  private constructor(core: CoreAttribute) {
    this.#core = core
  }

  /**
   * The surface attribute for a core attribute handle, or undefined for an
   * invalid one (UsdObject::IsValid).
   *
   * @upstream none
   */
  static fromCore<T = unknown>(core: CoreAttribute | undefined): Attribute<T> | undefined {
    return core?.isValid() ? new Attribute<T>(core) : undefined
  }

  /**
   * The core attribute this wraps, for APIs the surface does not cover yet.
   *
   * @upstream none
   */
  get core(): CoreAttribute {
    return this.#core
  }

  /**
   * The attribute's name, including namespaces (`primvars:displayColor`).
   *
   * @upstream UsdObject::GetName
   */
  get name(): string {
    return this.#core.name
  }

  /**
   * The attribute's path (`/World/Mesh.points`).
   *
   * @upstream UsdObject::GetPath
   */
  get path(): string {
    return this.#core.getPath()
  }

  /**
   * The declared value type name (`point3f[]`).
   *
   * @upstream UsdAttribute::GetTypeName
   */
  get typeName(): string {
    return this.#core.typeName
  }

  /**
   * The prim that owns the attribute.
   *
   * @upstream UsdObject::GetPrim
   */
  get prim(): Prim | undefined {
    return Prim.fromCore(this.#core.getPrim())
  }

  /**
   * The value at `time`, or at the default time when omitted; undefined when
   * there is no value (or it is blocked). Numeric arrays are read-only typed
   * arrays over the core's storage.
   *
   * @param time - A time code; omitted is UsdTimeCode::Default().
   * @upstream UsdAttribute::Get
   */
  get(time?: number): ReadonlyValue<T> | undefined {
    return fromCoreValue<T>(guard('Attribute.get', () => this.#core.getValueAtTime(time ?? UsdTimeCode.Default())))
  }

  /**
   * Authors `value` at `time`, or as the default value when omitted, on the
   * stage's edit target. Arrays accept any Iterable of their elements.
   *
   * @throws UsdError when the value does not match the attribute's type.
   * @upstream UsdAttribute::Set
   */
  set(value: ValueInput<T>, time?: number): void {
    const input = toCoreValue(value)
    guard('Attribute.set', () => time === undefined ? this.#core.set(input) : this.#core.setTimeSample(time, input))
  }

  /**
   * The times with authored samples, in increasing order.
   *
   * @upstream UsdAttribute::GetTimeSamples
   */
  get timeSamples(): number[] {
    return this.#core.getTimeSampleKeys()
  }

  /**
   * Whether the attribute has an authored default value or time samples
   * (schema fallbacks do not count).
   *
   * @upstream UsdAttribute::HasAuthoredValue
   */
  get hasAuthoredValue(): boolean {
    return this.#core.hasAuthoredValue()
  }

  /**
   * Whether the value might change over time (more than one sample, or a
   * spline or clips).
   *
   * @upstream UsdAttribute::ValueMightBeTimeVarying
   */
  valueMightBeTimeVarying(): boolean {
    return this.#core.valueMightBeTimeVarying()
  }

  /**
   * Blocks the attribute's value at the edit target: reads give undefined.
   *
   * @upstream UsdAttribute::Block
   */
  block(): void {
    guard('Attribute.block', () => this.#core.block())
  }
}
