// A workaround for a fault in Safari 27.3 (WebKit) seen with Pyodide 314.0.7
// and 314.0.8: once Pyodide's JavaScript-to-Python number conversion
// (pyodide.asm.mjs js2python_convertImmutable) has run a few thousand times,
// every number it passes into WebAssembly as a double (PyFloat_FromDouble,
// PyLong_FromDouble) arrives wrong: the low 32 bits of the double's bit
// pattern (Math.PI becomes 1413754136.0, 30 becomes 0). A plain Pyodide page
// shows it after about 3,900 conversions; walking the Carbon Frame Bike's
// 844 prims from Python is enough. Chrome/V8 and Node are not affected, and
// passing doubles the other way (Python to JavaScript) is correct.
//
// The patched conversion passes no double into WebAssembly: an integer in
// int32 range goes through PyLong_FromLong (an i32 argument); any other
// number is written as text and parsed by PyFloat_FromString (or
// PyLong_FromUnicodeObject for a safe integer), which is exact for every
// double (String(x) round-trips). The result types are Pyodide's: safe
// integers become int, other numbers float.
//
// pyodide.asm.mjs is Pyodide's (MPL-2.0); the copy the viewer serves and
// ships is modified by this file, and says so in its first line.
const ORIGINAL = 'if(e==="number")return Number.isSafeInteger(t)?_PyLong_FromDouble(t):_PyFloat_FromDouble(t);'
const PATCHED = 'if(e==="number")return __tsusdNumberToPython(t);'
const HELPER = 'function __tsusdNumberToPython(t){if(Number.isInteger(t)&&t>=-2147483648&&t<=2147483647)return _PyLong_FromLong(t);'
  + 'let s=pn(String(t));if(s===0)return 0;let r=Number.isSafeInteger(t)?_PyLong_FromUnicodeObject(s,10):_PyFloat_FromString(s);_Py_DecRef(s);return r}'
const ANCHOR = 'function mn(t){'
const NOTICE = '// Modified by typescript-usd (apps/usdview/scripts/pyodide-number-patch.ts): JavaScript numbers reach Python without a double argument into WebAssembly, working around a Safari 27.3 fault.\n'

/** pyodide.asm.mjs with the number conversion patched. Throws when the
 *  code it patches is not found exactly once (a different Pyodide build). */
export function patchPyodideAsm(source: string): string {
  if (source.startsWith(NOTICE)) return source
  if (source.split(ORIGINAL).length !== 2 || source.split(ANCHOR).length !== 2)
    throw new Error('pyodide.asm.mjs: the number conversion to patch was not found (Pyodide changed; see scripts/pyodide-number-patch.ts).')
  return NOTICE + source.replace(ORIGINAL, PATCHED).replace(ANCHOR, HELPER + ANCHOR)
}
