// Window > TypeScript Interpreter's language (src/interpreter-language.ts):
// TypeScript evaluated as the Python console of OpenUSD 26.11.1
// usdviewq/pythonInterpreter.py evaluates Python. Loaded on first use, with
// the transpiler and the library modules it seeds.
//
// PLATFORM-DIVERGENCE(usdview-typescript-interpreter): usdview's interpreter
// runs Python, the language of OpenUSD's bindings. The browser runs
// JavaScript natively and this library is written in TypeScript, so this
// console takes TypeScript, its types stripped before it runs, over the same
// objects; Python (Pyodide) is a separate panel.
//
// - Types are stripped by Sucrase (pinned in package.json): pure JavaScript,
//   no WebAssembly, about 300 KB unminified in its lazy chunk, and covers the
//   TypeScript a console takes (annotations, generics, `as`, `satisfies`,
//   enums, parameter properties, abstract members). It drops namespaces
//   holding values, which this console rejects instead (stripTypes).
// - The stripped JavaScript is parsed by Acorn to keep a persistent scope
//   across entries, as Python's interactive interpreter keeps its locals:
//   top-level declarations become assignments into the scope and the body
//   runs in an async function, so top-level `await` works (Stage.open is
//   async here). This is how Node's REPL rewrites top-level await
//   (lib/internal/repl/await.js), with the scope a `with` object.
import { getVersion, transform } from 'sucrase'
import { parse, type Node as AcornNode } from 'acorn'
import * as Ar from 'typescript-usd/ar'
import * as CameraUtil from 'typescript-usd/cameraUtil'
import * as ExecIr from 'typescript-usd/execIr'
import * as GeomUtil from 'typescript-usd/geomUtil'
import * as Gf from 'typescript-usd/gf'
import * as Glf from 'typescript-usd/glf'
import * as Kind from 'typescript-usd/kind'
import * as Pcp from 'typescript-usd/pcp'
import * as Plug from 'typescript-usd/plug'
import * as PxOsd from 'typescript-usd/pxOsd'
import * as SdfIndex from 'typescript-usd/sdf'
import * as SdfPathModule from 'typescript-usd/sdf/path'
import * as Sdr from 'typescript-usd/sdr'
import * as Tf from 'typescript-usd/tf'
import * as Trace from 'typescript-usd/trace'
import * as Ts from 'typescript-usd/ts'
import * as Usd from 'typescript-usd/usd'
import * as UsdGeom from 'typescript-usd/usdGeom'
import * as UsdHydra from 'typescript-usd/usdHydra'
import * as UsdImagingGL from 'typescript-usd/usdImagingGL'
import * as UsdLod from 'typescript-usd/usdLod'
import * as UsdLux from 'typescript-usd/usdLux'
import * as UsdMedia from 'typescript-usd/usdMedia'
import * as UsdMtlx from 'typescript-usd/usdMtlx'
import * as UsdPhysics from 'typescript-usd/usdPhysics'
import * as UsdProc from 'typescript-usd/usdProc'
import * as UsdProfiles from 'typescript-usd/usdProfiles'
import * as UsdRender from 'typescript-usd/usdRender'
import * as UsdRi from 'typescript-usd/usdRi'
import * as UsdSemantics from 'typescript-usd/usdSemantics'
import * as UsdShade from 'typescript-usd/usdShade'
import * as UsdSkel from 'typescript-usd/usdSkel'
import * as UsdUI from 'typescript-usd/usdUI'
import * as UsdUtils from 'typescript-usd/usdUtils'
import * as UsdValidation from 'typescript-usd/usdValidation'
import * as UsdVol from 'typescript-usd/usdVol'
import * as Vt from 'typescript-usd/vt'
import * as Work from 'typescript-usd/work'
import type { InterpreterContext, InterpreterLanguage, InterpreterOutput, SharedVariables } from './interpreter-language'
import { peerObject } from './shared-variables'
import { UsdviewApi, usdviewApiDocs } from './usdview-api'

/** pythonInterpreter.py:285-289 _DoAutoImports: every loaded pxr module
 *  (Tf.ScriptModuleLoader().GetModulesDict()) under its Python name. These
 *  are the library's ports of the modules OpenUSD 26.11.1 wraps for Python
 *  (pxr/**\/__init__.py); usdAbc, usdDraco, usdPmc, usdBakeMtlx and
 *  usdAppUtils have none. Sdf also takes the path module's classes (Sdf.Path),
 *  which the library exports from its own entry point. */
export const seededModules: Readonly<Record<string, object>> = {
  Ar, CameraUtil, ExecIr, GeomUtil, Gf, Glf, Kind, Pcp, Plug, PxOsd,
  Sdf: { ...SdfIndex, Path: SdfPathModule.SdfPath, PathSet: SdfPathModule.SdfPathSet },
  Sdr, Tf, Trace, Ts, Usd, UsdGeom, UsdHydra, UsdImagingGL, UsdLod, UsdLux, UsdMedia, UsdMtlx,
  UsdPhysics, UsdProc, UsdProfiles, UsdRender, UsdRi, UsdSemantics, UsdShade, UsdSkel, UsdUI,
  UsdUtils, UsdValidation, UsdVol, Vt, Work,
}
/** `import ... from 'typescript-usd/<entry>'` in the console resolves to the
 *  viewer's own module instances. */
const libraryEntries: Readonly<Record<string, object>> = Object.fromEntries(Object.entries({
  ar: Ar, cameraUtil: CameraUtil, execIr: ExecIr, geomUtil: GeomUtil, gf: Gf, glf: Glf, kind: Kind, pcp: Pcp, plug: Plug,
  pxOsd: PxOsd, sdf: SdfIndex, 'sdf/path': SdfPathModule, sdr: Sdr, tf: Tf, trace: Trace, ts: Ts, usd: Usd, usdGeom: UsdGeom,
  usdHydra: UsdHydra, usdImagingGL: UsdImagingGL, usdLod: UsdLod, usdLux: UsdLux, usdMedia: UsdMedia, usdMtlx: UsdMtlx,
  usdPhysics: UsdPhysics, usdProc: UsdProc, usdProfiles: UsdProfiles, usdRender: UsdRender, usdRi: UsdRi,
  usdSemantics: UsdSemantics, usdShade: UsdShade, usdSkel: UsdSkel, usdUI: UsdUI, usdUtils: UsdUtils,
  usdValidation: UsdValidation, usdVol: UsdVol, vt: Vt, work: Work,
}).map(([entry, module]) => [`typescript-usd/${entry}`, module]))

/** A syntax error, with whether more input could complete it (codeop's "incomplete input"). */
export class InterpreterSyntaxError extends SyntaxError {
  override name = 'SyntaxError'
  constructor(message: string, readonly line: number, readonly column: number, readonly incomplete: boolean) { super(message) }
}

const valueNamespace = /(^|[\n;{}])\s*(export\s+)?(namespace|module)\s+[A-Za-z_$][\w$.]*\s*\{/

/** TypeScript to JavaScript: Sucrase's typescript transform, keeping
 *  imports (a console entry may import names it uses in later entries). */
export function stripTypes(source: string): string {
  if (valueNamespace.test(source)) {
    const index = source.search(/\b(namespace|module)\b/)
    const { line, column } = position(source, index)
    throw new InterpreterSyntaxError('TypeScript namespaces are not supported in the interpreter; use an object.', line, column, false)
  }
  try {
    return transform(source, { transforms: ['typescript'], disableESTransforms: true, keepUnusedImports: true }).code
  } catch (error) {
    const e = error as Error & { pos?: number, loc?: { line: number, column: number } }
    const pos = e.pos ?? 0
    // Input that ends inside a construct is incomplete: the console asks for
    // another line, as Python's codeop does for an open bracket.
    const incomplete = pos >= source.trimEnd().length || /^Unterminated (template|comment)/.test(e.message)
    const { line, column } = position(source, pos)
    throw new InterpreterSyntaxError(e.message.replace(/ \(\d+:\d+\)$/, ''), line, column, incomplete)
  }
}
function position(source: string, index: number) {
  const before = source.slice(0, Math.max(0, index)).split('\n')
  return { line: before.length, column: before.at(-1)!.length }
}

type Program = AcornNode & { body: Statement[] }
type Statement = AcornNode & Record<string, any>
/** Names a binding pattern declares. */
function boundNames(pattern: Statement, names: string[] = []): string[] {
  switch (pattern.type) {
    case 'Identifier': names.push(pattern.name); break
    case 'ObjectPattern': for (const p of pattern.properties) boundNames(p.type === 'RestElement' ? p.argument : p.value, names); break
    case 'ArrayPattern': for (const e of pattern.elements) if (e) boundNames(e, names); break
    case 'RestElement': boundNames(pattern.argument, names); break
    case 'AssignmentPattern': boundNames(pattern.left, names); break
  }
  return names
}

export interface CompiledEntry {
  /** The body of the async function the entry runs as, inside `with (scope)`. */
  body: string
  /** Top-level names the entry declares (they live in the persistent scope). */
  declared: string[]
}
const importHook = '__usdviewImport'

/** Rewrites stripped JavaScript so its top-level declarations persist in
 *  the scope and the value of a final expression is returned. Python's
 *  interactive mode echoes expression statements but not assignments, so a
 *  final assignment returns nothing. */
export function compileEntry(code: string): CompiledEntry {
  let program: Program
  const options = { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, allowImportExportEverywhere: true } as const
  // Node's REPL reads `{a: 1}` as an object literal rather than a block.
  const trimmed = code.trim()
  let source = code
  if (trimmed.startsWith('{') && !trimmed.endsWith(';')) {
    try { parse(`(${trimmed})`, options); source = `(${trimmed})` } catch { /* a block */ }
  }
  try { program = parse(source, options) as Program } catch (error) {
    const e = error as SyntaxError & { loc?: { line: number, column: number } }
    throw new InterpreterSyntaxError(e.message.replace(/ \(\d+:\d+\)$/, ''), e.loc?.line ?? 1, e.loc?.column ?? 0, false)
  }
  const text = (node: AcornNode) => source.slice(node.start, node.end)
  const declared: string[] = [], hoisted: string[] = []
  const edits: { start: number, end: number, text: string }[] = []
  const body = program.body
  body.forEach((node, index) => {
    switch (node.type) {
      case 'VariableDeclaration': {
        if (node.kind !== 'var' && node.kind !== 'let' && node.kind !== 'const')
          throw new InterpreterSyntaxError(`'${node.kind}' declarations are not supported at the top level of the interpreter.`, 1, 0, false)
        const parts: string[] = []
        for (const declarator of node.declarations) {
          const names = boundNames(declarator.id); declared.push(...names)
          if (declarator.init) parts.push(`(${text(declarator.id)} = ${text(declarator.init)})`)
          else if (node.kind !== 'var') parts.push(...names.map(name => `(${name} = undefined)`))
        }
        edits.push({ start: node.start, end: node.end, text: parts.length ? `;${parts.join(', ')};` : ';' })
        break
      }
      case 'FunctionDeclaration':
        declared.push(node.id.name)
        hoisted.push(`${node.id.name} = ${text(node)};`)
        edits.push({ start: node.start, end: node.end, text: ';' })
        break
      case 'ClassDeclaration':
        declared.push(node.id.name)
        edits.push({ start: node.start, end: node.end, text: `;${node.id.name} = ${text(node)};` })
        break
      case 'ImportDeclaration': {
        const module = `(await ${importHook}(${text(node.source)}))`
        const parts: string[] = []
        for (const specifier of node.specifiers) {
          declared.push(specifier.local.name)
          if (specifier.type === 'ImportNamespaceSpecifier') parts.push(`(${specifier.local.name} = ${module})`)
          else if (specifier.type === 'ImportDefaultSpecifier') parts.push(`(${specifier.local.name} = ${module}.default)`)
          else parts.push(`(${specifier.local.name} = ${module}[${JSON.stringify(specifier.imported.type === 'Identifier' ? specifier.imported.name : specifier.imported.value)}])`)
        }
        edits.push({ start: node.start, end: node.end, text: `;${parts.length ? parts.join(', ') : module};` })
        break
      }
      case 'ExportNamedDeclaration': case 'ExportDefaultDeclaration': case 'ExportAllDeclaration':
        throw new InterpreterSyntaxError("'export' is not supported in the interpreter.", 1, 0, false)
      case 'ExpressionStatement':
        if (index === body.length - 1 && !node.directive && node.expression.type !== 'AssignmentExpression')
          edits.push({ start: node.start, end: node.end, text: `return (${text(node.expression)});` })
        break
    }
  })
  let rewritten = source
  for (const edit of edits.sort((a, b) => b.start - a.start)) rewritten = rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end)
  return { body: `${hoisted.join('\n')}\n${rewritten}`, declared }
}

const AsyncFunction = (async () => {}).constructor as new (...args: string[]) => (...args: unknown[]) => Promise<unknown>

/** The persistent scope: a `with` object that owns every name that is not a
 *  global, so assignments to new names stay in the scope (Python's locals)
 *  and reading an unknown name is a ReferenceError (Python's NameError). */
function scopeProxy(locals: Record<string, unknown>, importModule: (specifier: string) => Promise<unknown>) {
  return new Proxy(locals, {
    has: (target, key) => typeof key === 'string' && (key === importHook || key in target || !(key in globalThis)),
    get: (target, key) => {
      if (key === importHook) return importModule
      if (typeof key !== 'string') return undefined
      if (key in target) return target[key]
      throw new ReferenceError(`${key} is not defined`)
    },
    set: (target, key, value) => { if (typeof key === 'string') target[key] = value; return true },
  })
}

// ---- Values as the console prints them ------------------------------------

const qualifiedNames = new Map<unknown, string>()
for (const [module, exports] of Object.entries(seededModules))
  for (const [name, value] of Object.entries(exports))
    if (typeof value === 'function' && !qualifiedNames.has(value)) qualifiedNames.set(value, `${module}.${name}`)
qualifiedNames.set(UsdviewApi, 'UsdviewApi')

function qualifiedName(value: object): string | undefined {
  for (let proto = Object.getPrototypeOf(value); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    const name = qualifiedNames.get(proto.constructor)
    if (name) return name
  }
  return undefined
}
const customString = (value: object) => {
  for (let proto = Object.getPrototypeOf(value); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto))
    if (Object.prototype.hasOwnProperty.call(proto, 'toString')) return proto !== Array.prototype && proto !== Function.prototype && proto !== Error.prototype
  return false
}
const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`

/** The text of a value, like Node's util.inspect, with the library's
 *  objects in the form of their Python reprs: Usd.Prim(</World>),
 *  Gf.Vec3d(1, 2, 3), Sdf.Layer('anon:...'). */
export function formatValue(value: unknown, depth = 0, seen = new Set<object>()): string {
  switch (typeof value) {
    case 'string': return quote(value)
    case 'number': return Object.is(value, -0) ? '-0' : String(value)
    case 'bigint': return `${value}n`
    case 'undefined': return 'undefined'
    case 'boolean': return String(value)
    case 'symbol': return value.toString()
    case 'function': {
      const name = qualifiedNames.get(value)
      if (/^class[\s{]/.test(Function.prototype.toString.call(value))) return `[class ${name ?? (value.name || '(anonymous)')}]`
      return `[Function: ${value.name || '(anonymous)'}]`
    }
  }
  if (value === null) return 'null'
  const object = value as object
  if (seen.has(object)) return '[Circular]'
  if (depth > 2) return Array.isArray(object) ? '[Array]' : '[Object]'
  seen.add(object)
  try {
    const name = qualifiedName(object)
    const record = object as Record<string, any>
    if (name) {
      // usdviewApi.py's objects and the library's: prims and properties by
      // path, layers by identifier, stages by root layer, values by their string.
      if (/\.(Prim|Attribute|Rel|Property)$/.test(name)) {
        const path = typeof record.getPath === 'function' ? record.getPath() : record.path
        if (typeof path === 'string') return `${name}(<${path}>)`
      }
      if (name === 'Sdf.Layer') return `${name}(${quote(String(record.identifier))})`
      if (name === 'Usd.Stage' && typeof record.getRootLayer === 'function') return `${name}(rootLayer=${quote(String(record.getRootLayer().identifier))})`
      if (customString(object)) {
        const text = String(object)
        return text.startsWith(name) ? text : `${name}(${text})`
      }
    }
    if (Array.isArray(object) || ArrayBuffer.isView(object) && !(object instanceof DataView)) {
      const items = Array.from(object as ArrayLike<unknown>)
      const shown = items.slice(0, 100).map(item => formatValue(item, depth + 1, seen))
      if (items.length > 100) shown.push(`... ${items.length - 100} more items`)
      const prefix = Array.isArray(object) ? '' : `${object.constructor.name}(${items.length}) `
      return shown.length ? `${prefix}[ ${shown.join(', ')} ]` : `${prefix}[]`
    }
    if (object instanceof Map) return `Map(${object.size}) {${[...object].map(([k, v]) => ` ${formatValue(k, depth + 1, seen)} => ${formatValue(v, depth + 1, seen)}`).join(',')}${object.size ? ' ' : ''}}`
    if (object instanceof Set) return `Set(${object.size}) {${[...object].map(v => ` ${formatValue(v, depth + 1, seen)}`).join(',')}${object.size ? ' ' : ''}}`
    if (object instanceof Error) return object.stack && object.stack.includes(object.message) ? object.stack : `${object.name}: ${object.message}`
    if (object instanceof Promise) return 'Promise { <pending> }'
    if (object instanceof Date) return object.toISOString()
    if (object instanceof RegExp) return String(object)
    if (name && customString(object)) return String(object)
    const entries = Object.entries(object).filter(([key]) => !key.startsWith('_'))
    const label = name ?? (Object.getPrototypeOf(object) === null ? '[Object: null prototype]' : Object.getPrototypeOf(object) === Object.prototype ? '' : object.constructor?.name ?? '')
    if (!entries.length) return label ? `${label} {}` : '{}'
    return `${label ? `${label} ` : ''}{ ${entries.map(([key, v]) => `${/^[A-Za-z_$][\w$]*$/.test(key) ? key : quote(key)}: ${formatValue(v, depth + 1, seen)}`).join(', ')} }`
  } finally { seen.delete(object) }
}
/** console.log's text of its arguments: strings as they are. */
const formatArguments = (args: unknown[]) => args.map(arg => typeof arg === 'string' ? arg : formatValue(arg)).join(' ')

/** The text an exception shows: the stack where the engine gives one, as
 *  Python's showtraceback prints the traceback. */
export function formatException(error: unknown): string {
  if (error instanceof Error) {
    const header = `${error.name}: ${error.message}`
    const stack = error.stack ?? ''
    if (!stack) return header
    // V8 starts its stack with the header; JavaScriptCore and SpiderMonkey list frames only.
    return stack.startsWith(header) || stack.startsWith(error.name) ? stack : `${header}\n${stack}`
  }
  return `Uncaught ${formatValue(error)}`
}

/** pythonInterpreter.py:152-158 showsyntaxerror's text (traceback's format_exception_only). */
function formatSyntaxError(error: InterpreterSyntaxError, source: string): string {
  const line = source.split('\n')[error.line - 1] ?? ''
  const indent = line.length - line.trimStart().length
  return `  File "<input>", line ${error.line}\n    ${line.trim()}\n    ${' '.repeat(Math.max(0, error.column - indent))}^\nSyntaxError: ${error.message}\n`
}

// ---- Completion (pythonInterpreter.py:39-143 _Completer) -------------------

const keywords = ['await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
  'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let',
  'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
  'yield', 'as', 'async', 'interface', 'type', 'satisfies', 'undefined']
function propertyNames(value: unknown): string[] {
  const names = new Set<string>()
  for (let object = value === null || value === undefined ? null : Object(value); object; object = Object.getPrototypeOf(object))
    for (const name of Object.getOwnPropertyNames(object)) names.add(name)
  return [...names]
}

// ---- The language ----------------------------------------------------------

class TypeScriptInterpreter implements InterpreterLanguage {
  readonly title = 'TypeScript Interpreter'
  readonly ps1 = '>>> '
  readonly ps2 = '... '
  readonly banner = `TypeScript (types stripped by Sucrase ${getVersion()}) on ${typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgent : 'unknown'}.`
  readonly locals: Record<string, unknown>
  readonly shared: SharedVariables
  readonly sharedHint = 'Use `py.name` to read or set the Python Interpreter\'s variable `name`.'
  readonly #scope: Record<string, unknown>

  constructor(context: InterpreterContext) {
    // pythonInterpreter.py:912-920 Myconsole: the auto-imported modules,
    // usdviewApi and help (Controller.__init__, :218).
    // `py`: the Python console's variables (src/shared-variables.ts).
    this.locals = { ...seededModules, usdviewApi: context.usdviewApi, help: (object?: unknown) => this.#help(object), py: peerObject(context.peers, 'python') }
    const seeded = new Set(Object.keys(this.locals))
    const locals = this.locals
    this.shared = {
      names: () => Object.keys(locals).filter(name => !seeded.has(name) && !name.startsWith('_')),
      has: name => Object.prototype.hasOwnProperty.call(locals, name),
      get: name => locals[name],
      set: (name, value) => { locals[name] = value },
    }
    this.#scope = scopeProxy(this.locals, specifier => specifier in libraryEntries ? Promise.resolve(libraryEntries[specifier]) : import(/* @vite-ignore */ specifier))
  }
  #output: InterpreterOutput | undefined
  /** pythonInterpreter.py:177-191 _Helper; help(usdviewApi) lists its members and their docs. */
  #help(object?: unknown): void {
    const write = (text: string) => this.#output?.write(text)
    if (arguments.length === 0 || object === undefined) { write('Type help(object) for help about object.\n'); return }
    if (object instanceof UsdviewApi) {
      write(`Help on UsdviewApi object:\n\nclass UsdviewApi\n |  This class is an interface that provides access to Usdview context for\n |  Usdview plugins and other clients.\n |\n${Object.entries(usdviewApiDocs).map(([name, doc]) => ` |  ${name}\n |      ${doc}\n`).join(' |\n')}`)
      return
    }
    const name = typeof object === 'function' ? qualifiedNames.get(object) ?? object.name : qualifiedName(object as object) ?? (object as object).constructor?.name
    const members = propertyNames(typeof object === 'function' ? object.prototype ?? object : object).filter(n => !n.startsWith('_') && n !== 'constructor').sort()
    const statics = typeof object === 'function' ? Object.getOwnPropertyNames(object).filter(n => !['length', 'name', 'prototype'].includes(n) && !n.startsWith('_')).sort() : []
    write(`Help on ${name ?? typeof object}:\n${statics.length ? `\nStatic members:\n${statics.map(n => `    ${n}\n`).join('')}` : ''}\nMembers:\n${members.map(n => `    ${n}\n`).join('')}`)
  }

  async runSource(source: string, output: InterpreterOutput): Promise<boolean> {
    let entry: CompiledEntry
    try { entry = compileEntry(stripTypes(source)) } catch (error) {
      if (error instanceof InterpreterSyntaxError) {
        if (error.incomplete) return true
        output.write(formatSyntaxError(error, source), 'syntaxError')
        return false
      }
      throw error
    }
    for (const name of entry.declared) if (!(name in this.locals)) this.locals[name] = undefined
    // pythonInterpreter.py:28-37 _Redirected: the console takes stdout and
    // stderr while the entry runs; here console.log and its siblings.
    const methods = ['log', 'info', 'debug', 'warn', 'error'] as const
    const saved = methods.map(method => console[method])
    for (const method of methods) console[method] = (...args: unknown[]) => { output.write(`${formatArguments(args)}\n`) }
    this.#output = output
    try {
      const run = new AsyncFunction('__usdviewScope', `with (__usdviewScope) {\n${entry.body}\n}`)
      const value = await run(this.#scope)
      // sys.displayhook: None is not printed; here undefined.
      if (value !== undefined) output.write(`${formatValue(value)}\n`)
    } catch (error) {
      output.write(`${formatException(error)}\n`, error instanceof SyntaxError && !(error instanceof Error && error.stack?.includes('at ')) ? 'syntaxError' : 'traceback')
    } finally {
      methods.forEach((method, index) => { console[method] = saved[index]! })
      this.#output = undefined
    }
    return false
  }

  complete(text: string): string[] {
    if (text.includes('.')) return this.#attrMatches(text)
    // :61-78 _GlobalMatches: keywords, builtins and the locals.
    const matches = new Set<string>()
    for (const words of [keywords, Object.getOwnPropertyNames(globalThis), Object.keys(this.locals)])
      for (const word of words) if (word.startsWith(text)) matches.add(word)
    return [...matches]
  }
  /** :80-136 _AttrMatches. The expression before the last dot is looked up
   *  as a chain of names (property reads only, nothing is called). The
   *  library's underscore members are its internals: they are offered only
   *  once the typed name starts with '_'. */
  #attrMatches(text: string): string[] {
    let index = -1
    for (const char of ' )(;,+=*/-%!<>') index = Math.max(text.lastIndexOf(char), index)
    if (index >= text.length - 1) return []
    const prefix = index >= 0 ? text.slice(0, index + 1) : '', suffix = index >= 0 ? text.slice(index + 1) : text
    const match = /^([^.]+(?:\.[^.]+)*)\.(.*)$/.exec(suffix)
    if (!match) return []
    const [, expr, attr] = match as unknown as [string, string, string]
    let object: unknown
    try {
      const [first, ...rest] = expr.split('.')
      if (!/^[A-Za-z_$][\w$]*$/.test(first!) || !rest.every(part => /^[A-Za-z_$][\w$]*$/.test(part))) return []
      object = first! in this.locals ? this.locals[first!] : (globalThis as Record<string, unknown>)[first!]
      for (const part of rest) object = (object as Record<string, unknown>)[part]
    } catch { return [] }
    if (object === undefined || object === null) return []
    const words = propertyNames(object).filter(word => attr.startsWith('_') || !word.startsWith('_'))
    return [...new Set(words.filter(word => word.startsWith(attr)).map(word => `${prefix}${expr}.${word}`))]
  }
}

/** The TypeScript language for Window > TypeScript Interpreter. */
export async function createTypeScriptInterpreter(context: InterpreterContext): Promise<InterpreterLanguage> {
  return new TypeScriptInterpreter(context)
}
