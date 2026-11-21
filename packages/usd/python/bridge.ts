// The JavaScript half of the `pxr` Python forwarding layer: the module the
// Python package (python/pxr) imports as `_tsusd`.
//
// Upstream builds each library's Python module from its wrap*.cpp files
// (e.g. pxr/usd/sdf/wrapPath.cpp) over the C++ library; the forwarding
// layer plays the same role over typescript-usd's core. This file only
// exposes the core's modules and the few call helpers Python cannot write
// itself (`new`, calls under a TfErrorMark, type identity of values).
import * as Gf from 'typescript-usd/gf'
import * as Sdf from 'typescript-usd/sdf'
import { SdfPath, sdfPathFindLongestPrefix, sdfPathFindLongestStrictPrefix, sdfPathFindPrefixedRange } from 'typescript-usd/sdf/path'
import * as Tf from 'typescript-usd/tf'
import * as Usd from 'typescript-usd/usd'
import * as UsdGeom from 'typescript-usd/usdGeom'
import * as UsdLux from 'typescript-usd/usdLux'
import * as UsdMedia from 'typescript-usd/usdMedia'
import * as UsdShade from 'typescript-usd/usdShade'
import * as UsdUI from 'typescript-usd/usdUI'
import * as UsdUtils from 'typescript-usd/usdUtils'
import * as Sdr from 'typescript-usd/sdr'
import * as Vt from 'typescript-usd/vt'

// The result of a guarded call: [errors, value]. `errors` are the
// commentaries of the Tf errors the call posted (taken out of the diagnostic
// manager, as TfPyConvertTfErrorsToPythonException does, pyError.cpp:31-60),
// or undefined; a thrown JavaScript exception is reported the same way.
type Guarded = [string[] | undefined, unknown, string | undefined]

function guarded(run: () => unknown): Guarded {
  const mark = new Tf.TfErrorMark()
  try {
    let value: unknown
    try {
      value = run()
    } catch (err) {
      const errors = mark.getErrors().map(e => e.getCommentary())
      mark.clear()
      const name = err instanceof Error ? err.constructor.name : 'Error'
      return [[...errors, err instanceof Error ? err.message : String(err)], undefined, name]
    }
    const errors = mark.getErrors().map(e => e.getCommentary())
    mark.clear()
    return [errors.length > 0 ? errors : undefined, value, undefined]
  } finally {
    mark.dispose()
  }
}

// Stable identities for core objects, for Python's __hash__ and `is`-like
// equality of wrappers that forward to the same object.
const ids = new WeakMap<object, number>()
let nextId = 1

// The core modules are handed to Python as plain objects, not module
// namespace objects: upstream's Tf.PrepareModule sets `__module__` on every
// value a forwarding module holds (pxr/base/tf/__init__.py:116-128),
// including these, and a module namespace is read-only (a TypeError in a
// browser, where it is a real ES module namespace).
export const tsusd = {
  Gf: { ...Gf },
  Sdf: { ...Sdf, Path: SdfPath, sdfPathFindLongestPrefix, sdfPathFindLongestStrictPrefix, sdfPathFindPrefixedRange },
  Tf: { ...Tf },
  Usd: { ...Usd },
  UsdGeom: { ...UsdGeom },
  UsdLux: { ...UsdLux },
  UsdMedia: { ...UsdMedia },
  UsdShade: { ...UsdShade },
  UsdUI: { ...UsdUI },
  UsdUtils: { ...UsdUtils },
  Sdr: { ...Sdr },
  Vt: { ...Vt },
  UsdSchemaRegistry: Usd.SchemaRegistry,

  // obj[name](...args) under a TfErrorMark.
  callMethod(obj: Record<string, (...a: unknown[]) => unknown>, name: string, ...args: unknown[]): Guarded {
    return guarded(() => obj[name]!(...args))
  },
  // fn(...args) under a TfErrorMark.
  callFunction(fn: (...a: unknown[]) => unknown, ...args: unknown[]): Guarded {
    return guarded(() => fn(...args))
  },
  // new cls(...args) under a TfErrorMark.
  construct(cls: new (...a: unknown[]) => unknown, ...args: unknown[]): Guarded {
    return guarded(() => new cls(...args))
  },
  getProperty(obj: Record<string, unknown>, name: string): Guarded {
    return guarded(() => obj[name])
  },
  kindOf(obj: unknown): string {
    if (obj === null) return 'null'
    if (Array.isArray(obj)) return 'array'
    if (typeof obj === 'object' && typeof (obj as { then?: unknown }).then === 'function') return 'promise'
    if (typeof obj === 'object' && typeof (obj as Iterable<unknown>)[Symbol.iterator] === 'function'
      && Object.getPrototypeOf(obj) !== Object.prototype) return 'iterable'
    if (typeof obj === 'object' && Object.getPrototypeOf(obj) === Object.prototype) return 'record'
    return typeof obj
  },
  // The constructor of a value, for the Python side's class lookup.
  ctorOf(obj: object): unknown { return obj.constructor },
  same(a: unknown, b: unknown): boolean { return a === b },
  objectId(obj: object): number {
    let id = ids.get(obj)
    if (id === undefined) ids.set(obj, id = nextId++)
    return id
  },
  // A core schema class (a UsdSchemaBase subclass) and its registered
  // schema name (the generated `typeName`), for the Python side's schema
  // forwarding (python/pxr/_schema.py); undefined for any other value.
  schemaTypeName(cls: unknown): string | undefined {
    if (typeof cls !== 'function' || !(cls.prototype instanceof Usd.SchemaBase)) return undefined
    const name = (cls as { typeName?: unknown }).typeName
    return typeof name === 'string' ? name : undefined
  },
  // The class a class extends (Object.getPrototypeOf), for the Python base.
  superclassOf(cls: object): unknown { return Object.getPrototypeOf(cls) },
  isInstance(obj: unknown, cls: abstract new (...a: never[]) => unknown): boolean {
    return obj instanceof cls
  },
  arrayFrom(it: Iterable<unknown>): unknown[] { return Array.from(it) },
  // Number(x) of a core value (valueOf), for Python's __float__.
  toNumber(x: unknown): number { return Number(x) },
  toString(x: unknown): string { return String(x) },
  setCwd(dir: string): void { process.chdir(dir) },
  // Function.prototype.apply, which every core class inherits: a class's
  // own static `apply` (UsdSchemaBase-derived Apply) is a different value.
  functionApply: Function.prototype.apply,
}
