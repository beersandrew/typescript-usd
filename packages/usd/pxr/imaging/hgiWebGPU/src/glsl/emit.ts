// Ported from OpenUSD 26.11.1: pxr/imaging/hd/vtBufferSource.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// WGSL emitter and lowering for the GLSL-to-WGSL translator (no upstream
// counterpart; see lexer.ts and packages/usd/docs/imaging-i1.md sections 3.2
// steps 4-5 and 3.3).
//
// Lowerings, each for a GLSL construct WGSL lacks:
// - overloads and template instances get mangled names (checker.ts);
// - `out`/`inout` parameters become `ptr<function, T>`; call sites pass `&v`
//   for a whole local variable, otherwise a temporary with copy-in/copy-out
//   (GLSL's own semantics), because Safari rejects `&v.x` (imaging-i1.md 2.4);
// - by-value parameters that the body writes are copied to a local `var`;
// - multi-component swizzle stores (`v.xy = e`, rejected by Safari) become
//   per-component stores through a temporary;
// - `++`/`--`, assignments, comma expressions and calls with reference
//   arguments inside expressions are hoisted into statements; a ternary whose
//   arms have side effects or call user functions becomes `if`/`else` on a
//   temporary, otherwise `select`;
// - `for` loops whose parts are not WGSL `for` parts, `do`-`while`, and loop
//   conditions that need hoisted statements become `loop { ... continuing }`;
// - `switch` fallthrough duplicates the following case bodies; a missing
//   `default` is added;
// - implicit conversions (ConvertExpr) become WGSL conversions; literals are
//   written with explicit types;
// - matrix constructors from a scalar or another matrix, `mat / scalar`,
//   `mat / mat`, `mod`, `inverse`, `isnan`/`isinf`, `atan(y, x)` and the
//   `lessThan` family become helpers or operators;
// - combined GLSL samplers become a texture plus a `<name>_sampler`, and the
//   GLSL texture functions the WGSL texture built-ins;
// - atomic locations are read with atomicLoad and written with atomicStore;
// - bool members of structs a storage or uniform buffer holds (bool is not
//   host-shareable in WGSL) are u32 members, read as `!= 0u`; GLSL's bool
//   in a buffer block is a 32-bit 0 or 1 (Storm stores bool primvars as
//   int32: hd/vtBufferSource.cpp:70-89);
// - `diagnostic(off, derivative_uniformity)` is written, because Safari
//   rejects texture sampling and derivatives in non-uniform control flow and
//   GLSL has no such rule (imaging-i1.md 2.4).

import type {
  BlockStmt, CallExpr, Expr, FunctionSymbol, IdentExpr, Stmt, SwitchCase, VarSymbol,
} from './ast.ts'
import { type CheckedFunction, type CheckedGlobal, type CheckResult, helperKey, type StructInfo } from './checker.ts'
import { helperName, helperSource } from './helpers.ts'
import type { SourceLoc } from './lexer.ts'
import type { Diagnostic } from './preprocessor.ts'
import {
  componentCount, type GType, glslName, SAMPLER_TYPES, type ScalarKind, scalarOf, typeEq, wgslScalar,
  wgslName as wgslTypeName,
} from './types.ts'
import { safeIdentifier } from './wgslNames.ts'

export class EmitError extends Error {
  readonly loc: SourceLoc | undefined
  constructor(message: string, loc?: SourceLoc) {
    super(message)
    this.loc = loc
  }
}

export interface EmitOptions {
  stage: string
  /** First binding index for interface symbols that have none (group 0). */
  autoBindingStart?: number
}

export interface EmitResult {
  directives: string[]
  /** Module body: structs, globals, helpers, functions. */
  body: string
  /** Name of the function that initialises module-scope variables with non-constant initialisers, if any. */
  initGlobalsFunction: string | null
  diagnostics: Diagnostic[]
  /** Bindings assigned to interface symbols that had none. */
  autoBindings: { name: string; group: number; binding: number }[]
}

const SWZ = 'xyzw'

const SPLAT_BUILTINS = new Set(['fn:min', 'fn:max', 'fn:clamp', 'fn:step', 'fn:smoothstep', 'helper:mod'])

interface FnState {
  lines: string[]
  indent: number
  tmp: number
}

export function emit(checked: CheckResult, options: EmitOptions): EmitResult {
  return new Emitter(checked, options).run()
}

class Emitter {
  private readonly checked: CheckResult
  private readonly options: EmitOptions
  private readonly diagnostics: Diagnostic[] = []
  private readonly helpers: Set<string>
  private fn: FnState = { lines: [], indent: 0, tmp: 0 }
  /** Statements to place before the statement being emitted (hoisting). */
  private pre: string[] = []
  private readonly autoBindings: EmitResult['autoBindings'] = []
  private nextBinding: number
  private stage: string

  /** Structs a storage or uniform interface symbol holds, directly or
   *  through other structs and arrays (host-shareable in WGSL). */
  private readonly hostShareable = new Set<string>()

  constructor(checked: CheckResult, options: EmitOptions) {
    this.checked = checked
    this.options = options
    const share = (t: GType): void => {
      if (t.k === 'array') share(t.elem)
      else if (t.k === 'struct' && !this.hostShareable.has(t.name)) {
        this.hostShareable.add(t.name)
        for (const f of t.fields) share(f.type)
      }
    }
    for (const g of checked.globals) {
      if (g.external && (g.external.space === 'storage' || g.external.space === 'uniform')) share(g.sym.type)
    }
    this.helpers = new Set(checked.helpers)
    this.nextBinding = options.autoBindingStart ?? 0
    this.stage = options.stage
  }

  private error(message: string, loc?: SourceLoc): never {
    throw new EmitError(message, loc)
  }

  run(): EmitResult {
    const out: string[] = []
    // structs
    for (const s of this.checked.structs.values()) if (s.emit) out.push(this.structSource(s))
    // globals
    const inits: string[] = []
    for (const g of this.checked.globals) {
      const src = this.globalSource(g, inits)
      if (src) out.push(src)
    }
    let initGlobalsFunction: string | null = null
    // functions
    const fnSrc: string[] = []
    for (const f of this.checked.functions) fnSrc.push(this.functionSource(f))
    for (const s of this.checked.stubs) fnSrc.push(this.stubSource(s))
    if (inits.length) {
      initGlobalsFunction = 'hgi_InitGlobals'
      fnSrc.push(`fn ${initGlobalsFunction}() {\n${inits.map(l => `  ${l}`).join('\n')}\n}`)
    }
    // helpers (after functions: emitting may add some)
    const helperSrc = [...this.helpers].sort().map(helperSource)
    const body = [...out, ...helperSrc, ...fnSrc].join('\n\n') + '\n'
    return {
      directives: ['diagnostic(off, derivative_uniformity);'],
      body,
      initGlobalsFunction,
      diagnostics: this.diagnostics,
      autoBindings: this.autoBindings,
    }
  }

  // --------------------------------------------------------------- names

  private typeName(t: GType): string {
    if (t.k === 'void') return ''
    return wgslTypeName(t, n => (this.checked.structs.get(n) as StructInfo | undefined)?.wgsl ?? n)
  }

  /** A bool or bool vector member of a host-shareable struct, which WGSL
   *  holds as u32 (see the lowerings above). */
  private isHostBoolMember(base: GType, field: string): boolean {
    if (base.k !== 'struct' || !this.hostShareable.has(base.name)) return false
    const t = base.fields.find(f => f.name === field)?.type
    return !!t && scalarOf(t) === 'bool'
  }

  private structSource(s: StructInfo): string {
    const shared = this.hostShareable.has(s.name)
    const fields = s.fields.map(f => {
      let t = this.typeName(f.type)
      if (shared && scalarOf(f.type) === 'bool') {
        if (f.type.k === 'scalar') t = 'u32'
        else if (f.type.k === 'vector') t = `vec${f.type.n}<u32>`
        else this.error(`bool array member '${f.name}' of struct ${s.name} in a buffer is not supported`)
      }
      return `  ${safeIdentifier(f.name)}: ${t},`
    })
    if (!fields.length) fields.push('  _hgi_empty: u32,')
    return `struct ${s.wgsl} {\n${fields.join('\n')}\n}`
  }

  private globalSource(g: CheckedGlobal, inits: string[]): string | null {
    const sym = g.sym
    const t = this.typeName(sym.type)
    if (g.external) {
      const ext = g.external
      if (ext.declare === false || (ext.accessExpr !== undefined && ext.declare !== true)) return null
      if (ext.space === 'private') return `var<private> ${sym.wgsl}: ${t};`
      if (ext.space === 'workgroup') return `var<workgroup> ${sym.wgsl}: ${t};`
      const binding: { group: number; binding: number; samplerBinding?: number } = ext.binding ?? this.autoBinding(ext.name, ext.space === 'handle')
      const at = `@group(${binding.group}) @binding(${binding.binding})`
      if (ext.space === 'uniform') return `${at} var<uniform> ${sym.wgsl}: ${t};`
      if (ext.space === 'storage') return `${at} var<storage, ${ext.access ?? 'read'}> ${sym.wgsl}: ${t};`
      // handle: a combined GLSL sampler becomes a texture and a sampler
      const st = sym.type.k === 'array' ? sym.type.elem : sym.type
      if (st.k !== 'sampler') this.error(`interface symbol ${sym.name} in handle space must have a sampler type`)
      if (sym.type.k === 'array') this.error(`arrays of samplers (${sym.name}) are not supported by WebGPU`)
      const info = SAMPLER_TYPES[st.name]
      const lines = [`${at} var ${sym.wgsl}: ${this.typeName(st)};`]
      if (!info?.image) {
        const sb = binding.samplerBinding ?? binding.binding + 1
        lines.push(`@group(${binding.group}) @binding(${sb}) var ${sym.wgsl}_sampler: ${info?.shadow ? 'sampler_comparison' : 'sampler'};`)
      }
      return lines.join('\n')
    }
    const dec = g.declarator
    if (sym.type.k === 'sampler') this.error(`global sampler '${sym.name}' must come from the stage interface`)
    if (!dec || !dec.init) return `var<private> ${sym.wgsl}: ${t};`
    if (this.isConstExpr(dec.init)) {
      const v = this.exprNoHoist(dec.init)
      return sym.storage === 'const' ? `const ${sym.wgsl}: ${t} = ${v};` : `var<private> ${sym.wgsl}: ${t} = ${v};`
    }
    // Non-constant initialiser: WGSL module-scope initialisers must be
    // constant, so assign it at the start of the entry point.
    this.fn = { lines: [], indent: 0, tmp: 0 }
    this.pre = []
    const v = this.expr(dec.init)
    for (const l of this.pre) inits.push(l)
    inits.push(`${sym.wgsl} = ${v};`)
    this.pre = []
    return `var<private> ${sym.wgsl}: ${t};`
  }

  private autoBinding(name: string, handle: boolean): { group: number; binding: number } {
    const b = { group: 0, binding: this.nextBinding }
    this.nextBinding += handle ? 2 : 1
    this.autoBindings.push({ name, ...b })
    return b
  }

  private isConstExpr(e: Expr): boolean {
    switch (e.kind) {
      case 'literal': return true
      case 'ident': return e.sym?.storage === 'const'
      case 'convert': return this.isConstExpr(e.expr) && (e.expr.ty as GType).k !== 'atomic'
      case 'unary': return e.op !== '++' && e.op !== '--' && this.isConstExpr(e.operand)
      case 'binary': return this.isConstExpr(e.left) && this.isConstExpr(e.right)
      case 'call': return !!e.ctor && e.args.every(a => this.isConstExpr(a)) && !(e.ctor.k === 'matrix' && e.args.length === 1)
      case 'member': return this.isConstExpr(e.base)
      case 'index': return this.isConstExpr(e.base) && this.isConstExpr(e.index)
      default: return false
    }
  }

  private exprNoHoist(e: Expr): string {
    this.pre = []
    const v = this.expr(e)
    if (this.pre.length) this.error('internal: constant expression needed statements')
    return v
  }

  // ------------------------------------------------------------ functions

  private paramList(f: FunctionSymbol, params: VarSymbol[] | null): string {
    return f.params
      .map((p, k) => {
        const v = params?.[k]
        const name = v ? (v.storage === 'param' && this.needsLocalCopy(v) ? `${v.wgsl}_in` : v.wgsl) : `p${k}`
        if (p.qualifier !== 'in') return `${name}: ptr<function, ${this.typeName(p.type)}>`
        if (p.type.k === 'sampler') {
          const info = SAMPLER_TYPES[p.type.name]
          return `${name}: ${this.typeName(p.type)}${info?.image ? '' : `, ${name}_sampler: ${info?.shadow ? 'sampler_comparison' : 'sampler'}`}`
        }
        return `${name}: ${this.typeName(p.type)}`
      })
      .join(', ')
  }

  private needsLocalCopy(v: VarSymbol): boolean {
    // WGSL parameters are immutable; arrays are copied so dynamic indexing
    // works on a variable rather than a value.
    return !!v.written || v.type.k === 'array'
  }

  private functionSource(f: CheckedFunction): string {
    const sym = f.sym
    this.fn = { lines: [], indent: 1, tmp: 0 }
    this.pre = []
    for (const p of f.params) {
      if (p.storage === 'param' && this.needsLocalCopy(p)) this.line(`var ${p.wgsl} = ${p.wgsl}_in;`)
    }
    const body = f.decl.body as BlockStmt
    for (const s of body.stmts) this.stmt(s)
    if (sym.returnType.k !== 'void' && !alwaysReturns(body)) {
      // GLSL lets control reach the end of a non-void function (the value is
      // undefined); WGSL requires a return on every path.
      this.line(`return ${this.typeName(sym.returnType)}();`)
    }
    const ret = sym.returnType.k === 'void' ? '' : ` -> ${this.typeName(sym.returnType)}`
    return `fn ${sym.wgsl}(${this.paramList(sym, f.params)})${ret} {\n${this.fn.lines.join('\n')}\n}`
  }

  private stubSource(f: FunctionSymbol): string {
    this.diagnostics.push({ severity: 'warning', message: `stub: '${f.name}(${f.params.map(p => glslName(p.type)).join(', ')})' is declared but not defined here; emitted as a stub returning a zero value`, ...(f.decl ? { loc: f.decl.loc } : {}) })
    const ret = f.returnType.k === 'void' ? '' : ` -> ${this.typeName(f.returnType)}`
    const body = f.returnType.k === 'void' ? '' : `\n  return ${this.typeName(f.returnType)}();\n`
    return `fn ${f.wgsl}(${this.paramList(f, null)})${ret} {${body}}`
  }

  private line(s: string): void {
    this.fn.lines.push('  '.repeat(this.fn.indent) + s)
  }

  private flushPre(): void {
    for (const l of this.pre) this.line(l)
    this.pre = []
  }

  private newTmp(): string {
    return `_hgi_t${this.fn.tmp++}`
  }

  /** Run `f` with a fresh hoisting sink; returns its statements and the value. */
  private captured(f: () => string): { pre: string[]; value: string } {
    const saved = this.pre
    this.pre = []
    const value = f()
    const pre = this.pre
    this.pre = saved
    return { pre, value }
  }

  // ----------------------------------------------------------- statements

  private stmt(s: Stmt): void {
    switch (s.kind) {
      case 'block':
        this.line('{')
        this.fn.indent++
        for (const x of s.stmts) this.stmt(x)
        this.fn.indent--
        this.line('}')
        return
      case 'empty':
      case 'localstruct':
        return
      case 'decl':
        for (const d of s.declarators) {
          const sym = d.sym as VarSymbol
          const t = this.typeName(sym.type)
          if (d.init) {
            const v = this.expr(d.init)
            this.flushPre()
            // GLSL `const` locals are often run-time values: `let`. Arrays stay
            // variables so they can be indexed dynamically.
            if (sym.isConst && sym.type.k !== 'array') this.line(`let ${sym.wgsl}: ${t} = ${v};`)
            else this.line(`var ${sym.wgsl}: ${t} = ${v};`)
          } else {
            this.line(`var ${sym.wgsl}: ${t};`)
          }
        }
        return
      case 'expr':
        this.exprStmt(s.expr)
        return
      case 'if': {
        const c = this.expr(s.cond)
        this.flushPre()
        this.line(`if (${c}) {`)
        this.nested(s.then)
        if (s.else) {
          this.line('} else {')
          this.nested(s.else)
        }
        this.line('}')
        return
      }
      case 'while': {
        const c = this.captured(() => this.expr(s.cond))
        if (!c.pre.length) {
          this.line(`while (${c.value}) {`)
          this.nested(s.body)
          this.line('}')
          return
        }
        this.line('loop {')
        this.fn.indent++
        for (const l of c.pre) this.line(l)
        this.line(`if (!(${c.value})) { break; }`)
        this.stmtInline(s.body)
        this.fn.indent--
        this.line('}')
        return
      }
      case 'dowhile': {
        const c = this.captured(() => this.expr(s.cond))
        this.line('loop {')
        this.nested(s.body)
        this.fn.indent++
        this.line('continuing {')
        this.fn.indent++
        for (const l of c.pre) this.line(l)
        this.line(`break if !(${c.value});`)
        this.fn.indent--
        this.line('}')
        this.fn.indent--
        this.line('}')
        return
      }
      case 'for':
        this.forStmt(s)
        return
      case 'switch':
        this.switchStmt(s)
        return
      case 'break':
        this.line('break;')
        return
      case 'continue':
        this.line('continue;')
        return
      case 'discard':
        this.line('discard;')
        return
      case 'return':
        if (s.value) {
          const v = this.expr(s.value)
          this.flushPre()
          this.line(`return ${v};`)
        } else {
          this.line('return;')
        }
        return
    }
  }

  private nested(s: Stmt): void {
    this.fn.indent++
    this.stmtInline(s)
    this.fn.indent--
  }

  /** Emit a statement's contents without an extra brace level for blocks. */
  private stmtInline(s: Stmt): void {
    if (s.kind === 'block') for (const x of s.stmts) this.stmt(x)
    else this.stmt(s)
  }

  private forStmt(s: Stmt & { kind: 'for' }): void {
    // init
    let initText: string | null = null
    let initLines: string[] = []
    if (s.init) {
      const savedLines = this.fn.lines
      const savedIndent = this.fn.indent
      this.fn.lines = []
      this.fn.indent = 0
      this.stmt(s.init)
      initLines = this.fn.lines
      this.fn.lines = savedLines
      this.fn.indent = savedIndent
      if (initLines.length === 1 && !/^[{}]/.test(initLines[0] as string)) initText = (initLines[0] as string).replace(/;$/, '')
    }
    const cond = s.cond ? this.captured(() => this.expr(s.cond as Expr)) : null
    const upd = s.update ? this.capturedStmt(() => this.exprStmt(s.update as Expr)) : []
    const simpleUpdate = upd.length <= 1 && !(upd[0] ?? '').includes('\n') && !/^(var|let|if|loop|\{)/.test(upd[0] ?? '')
    if ((s.init === null || initText !== null) && (!cond || !cond.pre.length) && simpleUpdate) {
      const u = (upd[0] ?? '').replace(/;$/, '')
      this.line(`for (${initText ?? ''}; ${cond ? cond.value : ''}; ${u}) {`)
      this.nested(s.body)
      this.line('}')
      return
    }
    this.line('{')
    this.fn.indent++
    for (const l of initLines) this.line(l)
    this.line('loop {')
    this.fn.indent++
    if (cond) {
      for (const l of cond.pre) this.line(l)
      this.line(`if (!(${cond.value})) { break; }`)
    }
    this.stmtInline(s.body)
    if (upd.length) {
      this.line('continuing {')
      this.fn.indent++
      for (const l of upd) this.line(l)
      this.fn.indent--
      this.line('}')
    }
    this.fn.indent--
    this.line('}')
    this.fn.indent--
    this.line('}')
  }

  /** Emit statements into a list (relative indentation) instead of the function body. */
  private capturedStmt(f: () => void): string[] {
    const savedLines = this.fn.lines
    const savedIndent = this.fn.indent
    const savedPre = this.pre
    this.fn.lines = []
    this.fn.indent = 0
    this.pre = []
    f()
    const out = this.fn.lines
    this.fn.lines = savedLines
    this.fn.indent = savedIndent
    this.pre = savedPre
    return out
  }

  private switchStmt(s: Stmt & { kind: 'switch' }): void {
    const sel = this.expr(s.expr)
    this.flushPre()
    this.line(`switch (${sel}) {`)
    this.fn.indent++
    const cases = s.cases
    let sawDefault = false
    for (let k = 0; k < cases.length; k++) {
      const c = cases[k] as SwitchCase
      // fallthrough: append the following bodies until one ends in a jump
      const body: Stmt[] = [...c.body]
      let j = k
      while (!endsInJump(body) && j + 1 < cases.length) {
        j++
        body.push(...(cases[j] as SwitchCase).body)
      }
      if (body.length && (body[body.length - 1] as Stmt).kind === 'break') body.pop()
      const labels = c.labels.map(l => (l === 'default' ? 'default' : this.exprNoHoistKeep(l)))
      if (c.labels.includes('default')) sawDefault = true
      this.line(`case ${labels.join(', ')}: {`)
      this.fn.indent++
      for (const x of body) this.stmt(x)
      this.fn.indent--
      this.line('}')
    }
    if (!sawDefault) this.line('default: {}')
    this.fn.indent--
    this.line('}')
  }

  private exprNoHoistKeep(e: Expr): string {
    const saved = this.pre
    this.pre = []
    const v = this.expr(e)
    if (this.pre.length) this.error('case label must be constant', e.loc)
    this.pre = saved
    return v
  }

  /** An expression in statement position (WGSL allows only calls, assignments and increments there). */
  private exprStmt(e: Expr): void {
    switch (e.kind) {
      case 'assign':
        this.assign(e.target, e.op, e.value)
        return
      case 'unary':
      case 'postfix':
        if (e.op === '++' || e.op === '--') {
          this.increment(e.kind === 'unary' ? e.operand : e.operand, e.op)
          return
        }
        break
      case 'comma':
        for (const x of e.exprs) this.exprStmt(x)
        return
      case 'call': {
        if (e.fn) {
          const c = this.userCall(e, true)
          this.flushPre()
          if (c) this.line(`${c};`)
          return
        }
        const v = this.expr(e)
        this.flushPre()
        if (e.ty?.k === 'void') {
          if (v) this.line(`${v};`)
        } else {
          this.line(`_ = ${v};`)
        }
        return
      }
      case 'ternary': {
        const c = this.expr(e.cond)
        this.flushPre()
        this.line(`if (${c}) {`)
        this.fn.indent++
        this.exprStmt(e.a)
        this.fn.indent--
        this.line('} else {')
        this.fn.indent++
        this.exprStmt(e.b)
        this.fn.indent--
        this.line('}')
        return
      }
      case 'convert':
        this.exprStmt(e.expr)
        return
      case 'binary':
        if ((e.op === '&&' || e.op === '||') && this.hasSideEffects(e.right)) {
          const l = this.expr(e.left)
          this.flushPre()
          this.line(`if (${e.op === '&&' ? l : `!(${l})`}) {`)
          this.fn.indent++
          this.exprStmt(e.right)
          this.fn.indent--
          this.line('}')
          return
        }
        break
    }
    // pure expression: evaluate for its hoisted parts only
    this.expr(e)
    this.flushPre()
  }

  // -------------------------------------------------------- side effects

  private hasSideEffects(e: Expr): boolean {
    switch (e.kind) {
      case 'assign': return true
      case 'unary': return e.op === '++' || e.op === '--' || this.hasSideEffects(e.operand)
      case 'postfix': return true
      case 'call':
        if (e.fn) return true
        if (e.builtin && (e.builtin in ATOMIC_STORE_LIKE || e.builtin === 'imageStore')) return true
        return e.args.some(a => this.hasSideEffects(a))
      case 'binary': return this.hasSideEffects(e.left) || this.hasSideEffects(e.right)
      case 'ternary': return this.hasSideEffects(e.cond) || this.hasSideEffects(e.a) || this.hasSideEffects(e.b)
      case 'index': return this.hasSideEffects(e.base) || this.hasSideEffects(e.index)
      case 'member': return this.hasSideEffects(e.base)
      case 'method': return this.hasSideEffects(e.base)
      case 'comma': return e.exprs.some(x => this.hasSideEffects(x))
      case 'convert': return this.hasSideEffects(e.expr)
      default: return false
    }
  }

  // --------------------------------------------------------- assignment

  /** Text of an lvalue (a WGSL reference expression). */
  private lvalue(e: Expr): string {
    switch (e.kind) {
      case 'ident': return this.identText(e)
      case 'index': return `${this.lvalue(e.base)}[${this.expr(e.index)}]`
      case 'member': {
        if (e.swizzle) {
          if (e.swizzle.length !== 1) this.error('internal: multi-component swizzle lvalue', e.loc)
          return `${this.lvalue(e.base)}.${SWZ[e.swizzle[0] as number]}`
        }
        if (this.isHostBoolMember(e.base.ty as GType, e.name)) {
          this.error(`writing bool member '${e.name}' of a struct in a buffer is not supported`, e.loc)
        }
        return `${this.lvalue(e.base)}.${safeIdentifier(e.name)}`
      }
      case 'convert':
        if ((e.expr.ty as GType).k === 'atomic') return this.lvalue(e.expr)
        break
    }
    this.error('expression is not an lvalue', e.loc)
  }

  /** Splits a swizzled lvalue into its vector root and the component map. */
  private swizzleTarget(e: Expr): { base: Expr; comps: number[] } | null {
    if (e.kind !== 'member' || !e.swizzle) return null
    let comps = e.swizzle
    let base = e.base
    while (base.kind === 'member' && base.swizzle) {
      const inner = base.swizzle
      comps = comps.map(c => inner[c] as number)
      base = base.base
    }
    if (comps.length === 1) return null
    return { base, comps }
  }

  private assign(target: Expr, op: string, value: Expr): void {
    const tt = target.ty as GType
    const binop = op === '=' ? null : op.slice(0, -1)
    // atomic location
    if (target.kind === 'convert' || tt.k === 'atomic' || (target.ty && isAtomicLvalue(target))) {
      const lv = this.lvalue(target)
      let v = this.expr(value)
      if (binop) v = this.binaryText(binop, `atomicLoad(&${lv})`, v, scalarTypeOfAtomic(target), value.ty as GType)
      this.flushPre()
      this.line(`atomicStore(&${lv}, ${v});`)
      return
    }
    const sw = this.swizzleTarget(target)
    if (sw) {
      const baseLv = this.lvalue(sw.base)
      const bt = sw.base.ty as GType
      const n = componentCount(bt)
      let v = this.expr(value)
      if (binop) {
        const cur = `${baseLv}.${sw.comps.map(c => SWZ[c]).join('')}`
        v = this.binaryText(binop, cur, v, target.ty as GType, value.ty as GType)
      }
      this.flushPre()
      if (sw.comps.length === n && sw.comps.every((c, k) => c === k)) {
        this.line(`${baseLv} = ${v};`)
        return
      }
      // Safari rejects multi-component swizzle stores (imaging-i1.md 2.4).
      const t = this.newTmp()
      this.line(`let ${t} = ${v};`)
      sw.comps.forEach((c, k) => this.line(`${baseLv}.${SWZ[c]} = ${t}.${SWZ[k]};`))
      return
    }
    const lv = this.lvalue(target)
    let v = this.expr(value)
    if (binop) {
      const lt = target.ty as GType
      const rt = value.ty as GType
      if (lt.k === 'matrix' && (binop === '/' || (binop !== '*' && rt.k === 'scalar'))) {
        v = this.binaryText(binop, lv, v, lt, rt)
        this.flushPre()
        this.line(`${lv} = ${v};`)
        return
      }
      v = this.adjustRight(binop, lt, rt, v)
      this.flushPre()
      this.line(`${lv} ${op} ${v};`)
      return
    }
    this.flushPre()
    this.line(`${lv} = ${v};`)
  }

  private increment(target: Expr, op: '++' | '--'): void {
    const t = target.ty as GType
    const s = scalarOf(t) as ScalarKind
    if (t.k === 'scalar' && (s === 'int' || s === 'uint') && !this.swizzleTarget(target) && !isAtomicLvalue(target)) {
      const lv = this.lvalue(target)
      this.flushPre()
      this.line(`${lv}${op};`)
      return
    }
    const one: Expr = { kind: 'literal', text: '1', litType: s === 'float' ? 'float' : s === 'uint' ? 'uint' : 'int', loc: target.loc, ty: { k: 'scalar', s } }
    this.assign(target, op === '++' ? '+=' : '-=', one)
  }

  // ----------------------------------------------------------- expressions

  private identText(e: IdentExpr): string {
    const sym = e.sym as VarSymbol
    if (sym.access !== undefined) return sym.access
    if (sym.storage === 'refparam') return `(*${sym.wgsl})`
    return sym.wgsl
  }

  expr(e: Expr): string {
    switch (e.kind) {
      case 'literal':
        return literalText(e.text, e.litType, e.litType === 'bool' ? 'bool' : (e.ty as { s: ScalarKind }).s)
      case 'ident':
        return this.identText(e)
      case 'convert':
        return this.convertText(e.expr, e.to)
      case 'binary':
        return this.binary(e)
      case 'unary': {
        if (e.op === '++' || e.op === '--') {
          this.increment(e.operand, e.op)
          return this.expr(e.operand)
        }
        const v = this.expr(e.operand)
        if (e.op === '+') return v
        return `(${e.op}${v})`
      }
      case 'postfix': {
        const t = this.newTmp()
        const cur = this.expr(e.operand)
        this.pre.push(`let ${t} = ${cur};`)
        this.withPreAsLines(() => this.increment(e.operand, e.op))
        return t
      }
      case 'assign': {
        this.withPreAsLines(() => this.assign(e.target, e.op, e.value))
        return this.expr(e.target)
      }
      case 'ternary':
        return this.ternary(e)
      case 'call':
        return this.call(e)
      case 'index': {
        const b = this.expr(e.base)
        return `${b}[${this.expr(e.index)}]`
      }
      case 'member': {
        const b = this.expr(e.base)
        if (e.swizzle) {
          const bt = e.base.ty as GType
          if (bt.k === 'scalar') {
            return e.swizzle.length === 1 ? b : `vec${e.swizzle.length}<${wgslScalar(bt.s)}>(${b})`
          }
          return `${b}.${e.swizzle.map(c => SWZ[c]).join('')}`
        }
        if (this.isHostBoolMember(e.base.ty as GType, e.name)) {
          const t = e.ty as GType
          return t.k === 'vector'
            ? `(${b}.${safeIdentifier(e.name)} != vec${t.n}<u32>(0u))`
            : `(${b}.${safeIdentifier(e.name)} != 0u)`
        }
        return `${b}.${safeIdentifier(e.name)}`
      }
      case 'method': {
        const t = e.base.ty as GType
        if (t.k === 'array') {
          if (t.size !== null) return `${t.size}i`
          return `i32(arrayLength(&${this.lvalue(e.base)}))`
        }
        if (t.k === 'vector') return `${t.n}i`
        if (t.k === 'matrix') return `${t.c}i`
        this.error('length() on a non-array', e.loc)
        break
      }
      case 'comma': {
        for (let k = 0; k < e.exprs.length - 1; k++) this.withPreAsLines(() => this.exprStmt(e.exprs[k] as Expr))
        return this.expr(e.exprs[e.exprs.length - 1] as Expr)
      }
      case 'initlist':
        this.error('internal: unlowered initializer list', e.loc)
    }
    this.error(`internal: cannot emit ${e.kind}`, e.loc)
  }

  /** Run statement emission, sending its lines to the hoisting sink. */
  private withPreAsLines(f: () => void): void {
    const lines = this.capturedStmt(() => {
      f()
      this.flushPre()
    })
    for (const l of lines) this.pre.push(l)
  }

  private convertText(inner: Expr, to: GType): string {
    const from = inner.ty as GType
    if (from.k === 'atomic') return `atomicLoad(&${this.lvalue(inner)})`
    const ts = scalarOf(to)
    // literals take the target type directly
    if (inner.kind === 'literal' && to.k === 'scalar' && ts && inner.litType !== 'bool' && ts !== 'bool') {
      return literalText(inner.text, inner.litType, ts)
    }
    if (inner.kind === 'unary' && inner.op === '-' && inner.operand.kind === 'literal' && to.k === 'scalar' && (ts === 'float' || ts === 'int')) {
      const lit = inner.operand
      if (lit.litType !== 'bool') return `(-${literalText(lit.text, lit.litType, ts)})`
    }
    const v = this.expr(inner)
    const T = this.typeName(to)
    if (to.k === 'scalar') {
      if (from.k === 'scalar') return `${T}(${v})`
      if (from.k === 'vector') return `${T}(${v}.x)`
      if (from.k === 'matrix') return `${T}(${v}[0][0])`
    }
    if (to.k === 'vector') {
      if (from.k === 'scalar') {
        return from.s === to.s ? `${T}(${v})` : `${T}(${wgslScalar(to.s)}(${v}))`
      }
      if (from.k === 'vector') {
        if (from.n === to.n) return `${T}(${v})`
        const sw = SWZ.slice(0, to.n)
        return from.s === to.s ? `${v}.${sw}` : `${T}(${v}.${sw})`
      }
    }
    this.error(`cannot convert ${glslName(from)} to ${glslName(to)}`, inner.loc)
  }

  private binary(e: Expr & { kind: 'binary' }): string {
    const op = e.op
    if (op === '&&' || op === '||') {
      const l = this.expr(e.left)
      const r = this.captured(() => this.expr(e.right))
      if (!r.pre.length) return `(${l} ${op} ${r.value})`
      // the right operand needs statements: keep short-circuit evaluation
      const t = this.newTmp()
      this.pre.push(`var ${t} = ${l};`)
      this.pre.push(`if (${op === '&&' ? t : `!${t}`}) {`)
      for (const x of r.pre) this.pre.push(`  ${x}`)
      this.pre.push(`  ${t} = ${r.value};`)
      this.pre.push('}')
      return t
    }
    if (op === '^^') return `(${this.expr(e.left)} != ${this.expr(e.right)})`
    const l = this.expr(e.left)
    const r = this.expr(e.right)
    return this.binaryText(op, l, r, e.left.ty as GType, e.right.ty as GType)
  }

  /** Right operand adjusted for WGSL: shift amounts are u32, bitwise operands match in shape. */
  private adjustRight(op: string, lt: GType, rt: GType, r: string): string {
    if (op === '<<' || op === '>>') {
      const n = lt.k === 'vector' ? lt.n : 1
      const rs = scalarOf(rt)
      let u = rs === 'uint' ? r : rt.k === 'vector' ? `vec${rt.n}<u32>(${r})` : /^\d+i$/.test(r) ? r.replace(/i$/, 'u') : `u32(${r})`
      if (n > 1 && rt.k === 'scalar') u = `vec${n}<u32>(${u})`
      return u
    }
    if ((op === '&' || op === '|' || op === '^') && lt.k === 'vector' && rt.k === 'scalar') return `${this.typeName(lt)}(${r})`
    return r
  }

  private binaryText(op: string, l: string, r: string, lt: GType, rt: GType): string {
    if (op === '<<' || op === '>>') return `(${l} ${op} ${this.adjustRight(op, lt, rt, r)})`
    if ((op === '&' || op === '|' || op === '^') && lt.k === 'scalar' && rt.k === 'vector') return `(${this.typeName(rt)}(${l}) ${op} ${r})`
    if ((op === '&' || op === '|' || op === '^') && lt.k === 'vector' && rt.k === 'scalar') return `(${l} ${op} ${this.typeName(lt)}(${r}))`
    if (op === '==' || op === '!=') {
      if (lt.k === 'vector') return op === '==' ? `all(${l} == ${r})` : `any(${l} != ${r})`
      if (lt.k === 'matrix') {
        const cols = Array.from({ length: lt.c }, (_, k) => `all(${l}[${k}] == ${r}[${k}])`).join(' && ')
        return op === '==' ? `(${cols})` : `!(${cols})`
      }
      if (lt.k !== 'scalar') this.error(`'${op}' on ${glslName(lt)} is not supported in WGSL`)
    }
    if (lt.k === 'matrix' || rt.k === 'matrix') {
      if (op === '/' && lt.k === 'matrix' && rt.k === 'scalar') return `(${l} * (1.0f / ${r}))`
      if (op === '/' && lt.k === 'matrix' && rt.k === 'matrix') {
        const key = `matrixCompDiv:${glslName(lt)}`
        this.helpers.add(key)
        return `${helperName('matrixCompDiv', glslName(lt))}(${l}, ${r})`
      }
      if ((op === '+' || op === '-') && (lt.k === 'scalar' || rt.k === 'scalar')) {
        const m = (lt.k === 'matrix' ? lt : rt) as { c: number; r: number }
        const s = lt.k === 'scalar' ? l : r
        const cols = Array.from({ length: m.c }, () => `vec${m.r}<f32>(${s})`).join(', ')
        const sm = `mat${m.c}x${m.r}<f32>(${cols})`
        return lt.k === 'scalar' ? `(${sm} ${op} ${r})` : `(${l} ${op} ${sm})`
      }
    }
    return `(${l} ${op} ${r})`
  }

  private isPureCheap(e: Expr): boolean {
    switch (e.kind) {
      case 'literal':
      case 'ident':
        return true
      case 'convert':
        return (e.expr.ty as GType).k !== 'atomic' && this.isPureCheap(e.expr)
      case 'unary':
        return e.op !== '++' && e.op !== '--' && this.isPureCheap(e.operand)
      case 'binary':
        return this.isPureCheap(e.left) && this.isPureCheap(e.right)
      case 'member':
        return this.isPureCheap(e.base)
      case 'index':
        return this.isPureCheap(e.base) && this.isPureCheap(e.index)
      case 'ternary':
        return this.isPureCheap(e.cond) && this.isPureCheap(e.a) && this.isPureCheap(e.b)
      case 'call':
        if (e.fn) return false
        if (e.builtin && TEXTURE_LIKE.has(e.builtin)) return false
        return e.args.every(a => this.isPureCheap(a))
      default:
        return false
    }
  }

  private ternary(e: Expr & { kind: 'ternary' }): string {
    const c = this.expr(e.cond)
    if (this.isPureCheap(e.a) && this.isPureCheap(e.b) && (e.ty as GType).k !== 'array' && (e.ty as GType).k !== 'struct') {
      const a = this.captured(() => this.expr(e.a))
      const b = this.captured(() => this.expr(e.b))
      if (!a.pre.length && !b.pre.length) return `select(${b.value}, ${a.value}, ${c})`
    }
    // GLSL evaluates only the selected arm: if/else on a temporary.
    const t = this.newTmp()
    const a = this.captured(() => this.expr(e.a))
    const b = this.captured(() => this.expr(e.b))
    this.pre.push(`var ${t}: ${this.typeName(e.ty as GType)};`)
    this.pre.push(`if (${c}) {`)
    for (const x of a.pre) this.pre.push(`  ${x}`)
    this.pre.push(`  ${t} = ${a.value};`)
    this.pre.push('} else {')
    for (const x of b.pre) this.pre.push(`  ${x}`)
    this.pre.push(`  ${t} = ${b.value};`)
    this.pre.push('}')
    return t
  }

  // ------------------------------------------------------------------ calls

  private call(e: CallExpr): string {
    if (e.ctor) return this.ctor(e)
    if (e.fn) {
      const v = this.userCall(e, false)
      return v as string
    }
    const b = e.builtin as string
    if (TEXTURE_LIKE.has(b)) return this.textureCall(e)
    if (b in ATOMIC_STORE_LIKE) return this.atomicCall(e)
    if (b in BARRIERS) return BARRIERS[b] as string
    if (b === 'EmitVertex' || b === 'EndPrimitive' || b === 'EmitStreamVertex' || b === 'EndStreamPrimitive') return ''
    if (b === 'out:frexp') return this.frexpCall(e)
    const args = e.args.map(a => this.expr(a))
    const ret = e.ty as GType
    if (b.startsWith('fn:') || b.startsWith('helper:')) {
      // WGSL's min/max/clamp/step/smoothstep need matching shapes: splat scalars
      if (SPLAT_BUILTINS.has(b) && ret.k === 'vector') {
        e.args.forEach((a, k) => {
          if ((a.ty as GType).k === 'scalar') args[k] = `${this.typeName(ret)}(${args[k]})`
        })
      }
      if (b.startsWith('helper:')) {
        const key = helperKeyForCall(e)
        this.helpers.add(key)
        const [kind, t] = key.split(':') as [string, string]
        return `${helperName(kind, t)}(${args.join(', ')})`
      }
      return `${b.slice(3)}(${args.join(', ')})`
    }
    if (b.startsWith('op:')) {
      return b.slice(3).replace(/\$(RC|R|\d)/g, (_, k: string) => {
        if (k === 'R' || k === 'RC') return this.typeName(ret)
        return args[Number(k)] as string
      })
    }
    this.error(`internal: unknown built-in form ${b}`, e.loc)
  }

  /** GLSL frexp(x, out exp): WGSL frexp(x) returns { fract, exp }; the
   *  exponent is assigned to the out argument before the fraction is used. */
  private frexpCall(e: CallExpr): string {
    const x = this.expr(e.args[0] as Expr)
    const tmp = this.newTmp()
    this.pre.push(`let ${tmp} = frexp(${x});`)
    const expType = (e.args[1] as Expr).ty as GType
    const expIdent: Expr = { kind: 'ident', name: tmp, loc: e.loc, ty: expType, sym: { name: tmp, wgsl: `${tmp}.exp`, type: expType, storage: 'local', isConst: true } }
    this.withPreAsLines(() => this.assign(e.args[1] as Expr, '=', expIdent))
    return `${tmp}.fract`
  }

  private ctor(e: CallExpr): string {
    const t = e.ctor as GType
    const T = this.typeName(t)
    if (t.k === 'struct' && this.hostShareable.has(t.name) && t.fields.some(f => scalarOf(f.type) === 'bool')) {
      this.error(`constructing struct ${t.name}, which a buffer holds with bool members, is not supported`, e.loc)
    }
    if (t.k === 'struct' || t.k === 'array') return `${T}(${e.args.map(a => this.expr(a)).join(', ')})`
    if (t.k === 'scalar') {
      const a = e.args[0] as Expr
      const at = a.ty as GType
      if (typeEq(at, t)) return this.expr(a)
      if (a.kind === 'literal' && a.litType !== 'bool' && t.s !== 'bool') return literalText(a.text, a.litType, t.s)
      const v = this.expr(a)
      if (at.k === 'vector') return `${T}(${v}.x)`
      if (at.k === 'matrix') return `${T}(${v}[0][0])`
      return `${T}(${v})`
    }
    if (t.k === 'vector') {
      if (!e.args.length) return `${T}()`
      if (e.args.length === 1) {
        const a = e.args[0] as Expr
        const at = a.ty as GType
        const v = this.expr(a)
        if (at.k === 'scalar') return `${T}(${v})`
        if (at.k === 'vector') return at.n === t.n ? v : `${v}.${SWZ.slice(0, t.n)}`
        if (at.k === 'matrix') {
          const tmp = this.hoist(v, at)
          const comps: string[] = []
          for (let c = 0; c < at.c && comps.length < t.n; c++) for (let r = 0; r < at.r && comps.length < t.n; r++) comps.push(`${tmp}[${c}][${r}]`)
          return `${T}(${comps.join(', ')})`
        }
      }
      let have = 0
      const parts: string[] = []
      for (const a of e.args) {
        const at = a.ty as GType
        const need = t.n - have
        if (need <= 0) break
        const v = this.expr(a)
        const n = componentCount(at)
        if (at.k === 'matrix') this.error('matrix arguments to vector constructors are not supported', a.loc)
        if (n > need) {
          parts.push(need === 1 ? `${v}.x` : `${v}.${SWZ.slice(0, need)}`)
          have += need
        } else {
          parts.push(v)
          have += n
        }
      }
      return `${T}(${parts.join(', ')})`
    }
    if (t.k === 'matrix') {
      if (e.args.length === 1) {
        const a = e.args[0] as Expr
        const at = a.ty as GType
        if (at.k === 'scalar') {
          const key = `matDiag:${glslName(t)}`
          this.helpers.add(key)
          return `${helperName('matDiag', glslName(t))}(${this.expr(a)})`
        }
        if (at.k === 'matrix') {
          if (at.c === t.c && at.r === t.r) return this.expr(a)
          const src = this.hoist(this.expr(a), at)
          const cols: string[] = []
          for (let c = 0; c < t.c; c++) {
            const comps: string[] = []
            for (let r = 0; r < t.r; r++) comps.push(c < at.c && r < at.r ? `${src}[${c}][${r}]` : c === r ? '1.0f' : '0.0f')
            cols.push(`vec${t.r}<f32>(${comps.join(', ')})`)
          }
          return `${T}(${cols.join(', ')})`
        }
      }
      const types = e.args.map(a => a.ty as GType)
      if (types.every(x => x.k === 'scalar') || (types.length === t.c && types.every(x => x.k === 'vector' && x.n === t.r))) {
        return `${T}(${e.args.map(a => this.expr(a)).join(', ')})`
      }
      // mixed scalars and vectors: flatten to scalars
      const comps: string[] = []
      e.args.forEach(a => {
        const at = a.ty as GType
        const v = this.expr(a)
        if (at.k === 'scalar') comps.push(v)
        else {
          const tmp = this.hoist(v, at)
          for (let k = 0; k < componentCount(at); k++) comps.push(`${tmp}.${SWZ[k]}`)
        }
      })
      return `${T}(${comps.join(', ')})`
    }
    this.error(`cannot construct ${glslName(t)}`, e.loc)
  }

  /** Evaluate once into a `let` unless already a plain name. */
  private hoist(v: string, t: GType): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(v)) return v
    const tmp = this.newTmp()
    this.pre.push(`let ${tmp}: ${this.typeName(t)} = ${v};`)
    return tmp
  }

  /**
   * A user-function call. Reference parameters use `&v` for a whole local
   * variable and a temporary with copy-in/copy-out otherwise. In expression
   * context a call with reference arguments is hoisted into a statement.
   */
  private userCall(e: CallExpr, asStatement: boolean): string | null {
    const fn = e.fn as FunctionSymbol
    const args: string[] = []
    const post: { target: Expr; tmp: string; type: GType }[] = []
    const roots = new Map<VarSymbol, number>()
    for (const a of e.args) {
      const r = rootSymbol(a)
      if (r) roots.set(r, (roots.get(r) ?? 0) + 1)
    }
    e.args.forEach((a, k) => {
      const p = fn.params[k] as FunctionSymbol['params'][number]
      if (p.qualifier === 'in') {
        if (p.type.k === 'sampler') {
          const s = this.samplerArg(a)
          args.push(s.sampler ? `${s.texture}, ${s.sampler}` : s.texture)
          return
        }
        args.push(this.expr(a))
        return
      }
      const root = rootSymbol(a)
      if (a.kind === 'ident' && root && roots.get(root) === 1) {
        if (root.storage === 'refparam') {
          args.push(root.wgsl)
          return
        }
        if (root.storage === 'local' || (root.storage === 'param' && this.needsLocalCopy(root))) {
          args.push(`&${root.wgsl}`)
          return
        }
      }
      const tmp = this.newTmp()
      const T = this.typeName(p.type)
      if (p.qualifier === 'inout') this.pre.push(`var ${tmp}: ${T} = ${this.expr(a)};`)
      else this.pre.push(`var ${tmp}: ${T};`)
      args.push(`&${tmp}`)
      post.push({ target: a, tmp, type: p.type })
    })
    const callText = `${fn.wgsl}(${args.join(', ')})`
    const copyOut = (): void => {
      for (const p of post) {
        const tmpIdent: Expr = { kind: 'ident', name: p.tmp, loc: e.loc, ty: p.type, sym: { name: p.tmp, wgsl: p.tmp, type: p.type, storage: 'local', isConst: false } }
        this.withPreAsLines(() => this.assign(p.target, '=', tmpIdent))
      }
    }
    if (asStatement) {
      if (!post.length) return callText
      this.pre.push(`${callText};`)
      copyOut()
      return null
    }
    if (!post.length) return callText
    const r = this.newTmp()
    this.pre.push(`let ${r} = ${callText};`)
    copyOut()
    return r
  }

  // ---------------------------------------------------------------- textures

  private samplerArg(a: Expr): { texture: string; sampler: string | null; name: string } {
    if (a.kind !== 'ident') this.error('a sampler argument must be a sampler variable (arrays of samplers are not supported by WebGPU)', a.loc)
    const sym = a.sym as VarSymbol
    const t = sym.type
    if (t.k !== 'sampler') this.error('expected a sampler', a.loc)
    const info = SAMPLER_TYPES[t.name]
    return { texture: sym.wgsl, sampler: info?.image ? null : sym.samplerWgsl ?? `${sym.wgsl}_sampler`, name: t.name }
  }

  private textureCall(e: CallExpr): string {
    const s = this.samplerArg(e.args[0] as Expr)
    const info = SAMPLER_TYPES[s.name] as (typeof SAMPLER_TYPES)[string]
    const args = e.args.slice(1).map(a => this.expr(a))
    const frag = this.stage === 'fragment' || this.stage === 'library'
    const isArray = info.dim.endsWith('_array')
    const coordN = info.dim === '1d' || info.dim === 'buffer' ? 1 : info.dim === '2d' ? 2 : info.dim === '1d_array' ? 1 : info.dim === '2d_array' ? 2 : 3
    const split = (c: string, icoord: boolean): string => {
      // array textures take the layer as a separate integer argument
      if (!isArray) return c
      const tmp = this.hoist(c, { k: 'vector', s: icoord ? 'int' : 'float', n: coordN + 1 })
      const xy = info.dim === '1d_array'
        ? (icoord ? `vec2<i32>(${tmp}.x, 0i)` : `vec2<f32>(${tmp}.x, 0.5f)`)
        : coordN === 1 ? `${tmp}.x` : `${tmp}.${SWZ.slice(0, coordN)}`
      const layer = `${tmp}.${SWZ[coordN]}`
      return `${xy}, ${icoord ? layer : `i32(floor(${layer} + 0.5f))`}`
    }
    const T = s.texture
    const S = s.sampler as string
    const sampledRet = (v: string): string => v
    switch (e.callee) {
      case 'texture':
      case 'textureOffset': {
        if (info.shadow) {
          const c = this.hoist(args[0] as string, { k: 'vector', s: 'float', n: coordN + 1 + (isArray ? 1 : 0) })
          const cc = isArray ? `${c}.${SWZ.slice(0, coordN)}, i32(floor(${c}.${SWZ[coordN]} + 0.5f))` : `${c}.${SWZ.slice(0, coordN)}`
          const ref = `${c}.${SWZ[coordN + (isArray ? 1 : 0)]}`
          return frag ? `textureSampleCompare(${T}, ${S}, ${cc}, ${ref})` : `textureSampleCompareLevel(${T}, ${S}, ${cc}, ${ref})`
        }
        const c = split(args[0] as string, false)
        if (args[1] !== undefined && e.callee === 'texture') return frag ? `textureSampleBias(${T}, ${S}, ${c}, ${args[1]})` : `textureSampleLevel(${T}, ${S}, ${c}, ${args[1]})`
        return sampledRet(frag ? `textureSample(${T}, ${S}, ${c})` : `textureSampleLevel(${T}, ${S}, ${c}, 0.0f)`)
      }
      case 'textureProj': {
        const c = this.hoist(args[0] as string, { k: 'vector', s: 'float', n: coordN + 1 })
        const p = `(${c}.${SWZ.slice(0, coordN)} / ${c}.${SWZ[coordN]})`
        return frag ? `textureSample(${T}, ${S}, ${p})` : `textureSampleLevel(${T}, ${S}, ${p}, 0.0f)`
      }
      case 'textureLod':
      case 'textureLodOffset':
        if (info.shadow) this.error('textureLod on a shadow sampler is not supported', e.loc)
        return `textureSampleLevel(${T}, ${S}, ${split(args[0] as string, false)}, ${args[1]})`
      case 'textureGrad':
        return `textureSampleGrad(${T}, ${S}, ${split(args[0] as string, false)}, ${args[1]}, ${args[2]})`
      case 'textureGather':
        return `textureGather(${args[1] ?? '0i'}, ${T}, ${S}, ${split(args[0] as string, false)})`
      case 'texelFetch': {
        const c = split(args[0] as string, true)
        if (info.dim === 'buffer') return `textureLoad(${T}, ${c}, 0i)`
        return `textureLoad(${T}, ${c}, ${args[1] ?? '0i'})`
      }
      case 'textureSize': {
        const ret = e.ty as GType
        const lod = args[0] ?? '0i'
        if (isArray) {
          const dims = `textureDimensions(${T}, ${lod})`
          const d = coordN === 1 ? `i32(${dims}.x)` : `vec${coordN}<i32>(${dims})`
          return `${this.typeName(ret)}(${d}, i32(textureNumLayers(${T})))`
        }
        return ret.k === 'scalar' ? `i32(textureDimensions(${T}, ${lod}))` : `${this.typeName(ret)}(textureDimensions(${T}, ${lod}))`
      }
      case 'textureQueryLevels':
        return `i32(textureNumLevels(${T}))`
      case 'imageLoad':
        return `textureLoad(${T}, ${split(args[0] as string, true)})`
      case 'imageStore':
        return `textureStore(${T}, ${split(args[0] as string, true)}, ${args[1]})`
      case 'imageSize': {
        const ret = e.ty as GType
        return ret.k === 'scalar' ? `i32(textureDimensions(${T}))` : `${this.typeName(ret)}(textureDimensions(${T}))`
      }
    }
    this.error(`unsupported texture function ${e.callee}`, e.loc)
  }

  private atomicCall(e: CallExpr): string {
    const mem = e.args[0] as Expr
    const lv = this.lvalue(mem)
    const args = e.args.slice(1).map(a => this.expr(a))
    const w = ATOMIC_STORE_LIKE[e.builtin as string] as string
    if (w === 'atomicCompareExchangeWeak') return `${w}(&${lv}, ${args[0]}, ${args[1]}).old_value`
    return `${w}(&${lv}, ${args.join(', ')})`
  }
}

const ATOMIC_STORE_LIKE: Record<string, string> = {
  atomicAdd: 'atomicAdd', atomicMin: 'atomicMin', atomicMax: 'atomicMax', atomicAnd: 'atomicAnd',
  atomicOr: 'atomicOr', atomicXor: 'atomicXor', atomicExchange: 'atomicExchange', atomicCompSwap: 'atomicCompareExchangeWeak',
}

const BARRIERS: Record<string, string> = {
  barrier: 'workgroupBarrier()',
  memoryBarrier: 'storageBarrier()',
  memoryBarrierBuffer: 'storageBarrier()',
  memoryBarrierShared: 'workgroupBarrier()',
  memoryBarrierImage: 'textureBarrier()',
  groupMemoryBarrier: 'workgroupBarrier()',
}

const TEXTURE_LIKE = new Set([
  'texture', 'textureLod', 'textureGrad', 'texelFetch', 'textureSize', 'textureQueryLevels', 'textureOffset',
  'textureLodOffset', 'textureProj', 'textureGather', 'imageLoad', 'imageStore', 'imageSize',
])

function helperKeyForCall(e: CallExpr): string {
  const kind = (e.builtin as string).slice('helper:'.length)
  const params = e.args.map(a => a.ty as GType)
  if (kind === 'mod') return `mod:${glslName(e.ty as GType)}`
  return helperKey({ name: e.callee, params, ret: e.ty as GType, wgsl: e.builtin as string })
}

function rootSymbol(e: Expr): VarSymbol | null {
  let x = e
  for (;;) {
    if (x.kind === 'ident') return x.sym ?? null
    if (x.kind === 'index') x = x.base
    else if (x.kind === 'member') x = x.base
    else if (x.kind === 'convert') x = x.expr
    else return null
  }
}

function isAtomicLvalue(e: Expr): boolean {
  return (e.ty as GType | undefined)?.k === 'atomic' || (e.kind === 'convert' && (e.expr.ty as GType).k === 'atomic')
}

function scalarTypeOfAtomic(e: Expr): GType {
  const t = (e.kind === 'convert' ? e.expr.ty : e.ty) as GType
  return t.k === 'atomic' ? { k: 'scalar', s: t.s } : t
}

function endsInJump(stmts: Stmt[]): boolean {
  const last = stmts[stmts.length - 1]
  if (!last) return false
  if (last.kind === 'break' || last.kind === 'continue' || last.kind === 'return' || last.kind === 'discard') return true
  if (last.kind === 'block') return endsInJump(last.stmts)
  if (last.kind === 'if') return !!last.else && endsInJump([last.then]) && endsInJump([last.else])
  return false
}

/** Every path through `s` ends in return or discard (WGSL behaviour analysis, simplified). */
export function alwaysReturns(s: Stmt): boolean {
  switch (s.kind) {
    case 'return':
      return true
    case 'block':
      return s.stmts.some(x => alwaysReturns(x))
    case 'if':
      return !!s.else && alwaysReturns(s.then) && alwaysReturns(s.else)
    case 'switch':
      return s.cases.some(c => c.labels.includes('default')) && s.cases.every(c => c.body.some(x => alwaysReturns(x)))
    case 'for':
      return s.cond === null && !containsBreak(s.body)
    case 'while':
      return s.cond.kind === 'literal' && s.cond.text === 'true' && !containsBreak(s.body)
    default:
      return false
  }
}

function containsBreak(s: Stmt): boolean {
  switch (s.kind) {
    case 'break':
      return true
    case 'block':
      return s.stmts.some(containsBreak)
    case 'if':
      return containsBreak(s.then) || (!!s.else && containsBreak(s.else))
    default:
      return false // nested loops and switches own their breaks
  }
}

// ------------------------------------------------------------------ literals

/** A GLSL literal written as a WGSL literal of the given scalar type. */
export function literalText(text: string, litType: 'int' | 'uint' | 'float' | 'bool', to: ScalarKind): string {
  if (litType === 'bool') {
    if (to === 'bool') return text
    return to === 'float' ? (text === 'true' ? '1.0f' : '0.0f') : `${text === 'true' ? 1 : 0}${to === 'uint' ? 'u' : 'i'}`
  }
  if (litType === 'float') {
    const f = floatText(text)
    if (to === 'float') return f
    if (to === 'bool') return Number(f.replace(/f$/, '')) !== 0 ? 'true' : 'false'
    return `${to === 'uint' ? 'u32' : 'i32'}(${f})`
  }
  let v = BigInt(text.replace(/[uU]$/, '').replace(/^0(?=[0-7]+$)/, '0o'))
  if (to === 'float') return `${v.toString()}.0f`
  if (to === 'bool') return v !== 0n ? 'true' : 'false'
  if (to === 'uint') {
    if (v < 0n) v = BigInt.asUintN(32, v)
    return `${BigInt.asUintN(32, v).toString()}u`
  }
  // int: GLSL lets hex literals carry the sign bit (0xc0000000)
  if (v > 0x7fffffffn) return `bitcast<i32>(${BigInt.asUintN(32, v).toString()}u)`
  return `${v.toString()}i`
}

function floatText(text: string): string {
  let t = text.replace(/(lf|LF|f|F)$/, '')
  if (t.startsWith('.')) t = `0${t}`
  t = t.replace(/\.(?=[eE]|$)/, '.0')
  if (!/[.eE]/.test(t)) t = `${t}.0`
  return `${t}f`
}
