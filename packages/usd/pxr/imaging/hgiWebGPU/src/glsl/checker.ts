// Portions ported from OpenUSD 26.11.1, including:
//  pxr/imaging/hdSt/codeGen.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Type checker for the GLSL-to-WGSL translator (no upstream counterpart; see
// lexer.ts and packages/usd/docs/imaging-i1.md section 3.2 step 3).
//
// It resolves names in scopes, types every expression, resolves user and
// built-in overloads by GLSL 4.50 rules (exact match first, then implicit
// conversion; section 6.1), makes implicit conversions explicit as
// ConvertExpr nodes (WGSL has none), instantiates function templates, fills
// default arguments, folds constant array sizes, and records the facts the
// emitter needs: which by-value parameters are written, which symbols are
// referenced, and the mangled WGSL name of every overload.

import type {
  BlockStmt, CallExpr, Declarator, Expr, FunctionDecl, FunctionSymbol, GlobalDecl, IdentExpr,
  MemberExpr, Stmt, StructDecl, TopLevel, TranslationUnit, TypeSpec, VarSymbol,
} from './ast.ts'
import {
  ATOMIC_BUILTINS, BARRIER_BUILTINS, builtinOverloads, type BuiltinOverload, MATRIX_BUILTINS, matrixBuiltin,
  TEXTURE_BUILTINS, UNSUPPORTED_STAGE_FUNCTIONS,
} from './builtins.ts'
import type { SourceLoc } from './lexer.ts'
import type { Diagnostic } from './preprocessor.ts'
import {
  BOOL, basicType, canImplicitlyConvert, componentCount, FLOAT, type GType, glslName, INT, isScalarOrVector,
  mangleTag, SAMPLER_TYPES, type ScalarKind, scalar, scalarOf, type StructField, typeEq, UINT, VOID, vec, withScalar,
} from './types.ts'
import { safeIdentifier } from './wgslNames.ts'

export class CheckError extends Error {
  readonly loc: SourceLoc | undefined
  constructor(message: string, loc?: SourceLoc) {
    super(message)
    this.loc = loc
  }
}

/** A module-scope symbol supplied by the stage interface (bindings, stage I/O, built-ins). */
export interface ExternalGlobal {
  name: string
  /** GLSL type name: a basic type, a sampler type, or a struct named in `structs`. */
  type: string
  /**
   * Element count when the global is an array; 'runtime' for an unsized
   * buffer array; or the name of an integer macro the code defines
   * (resolved by translateGlslToWgsl).
   */
  arraySize?: number | string
  space: 'private' | 'storage' | 'uniform' | 'handle' | 'workgroup'
  access?: 'read' | 'read_write'
  /** The element type is atomic (`atomic<i32>`/`atomic<u32>`). */
  atomic?: boolean
  binding?: { group: number; binding: number; samplerBinding?: number }
  /** WGSL expression used to read the symbol, when it is not a declared variable (e.g. a member of a uniform struct). */
  accessExpr?: string
  /** For a combined sampler in handle space that the host declares
   *  (declare false): the WGSL name of its sampler variable; accessExpr (or
   *  the name) names the texture. */
  samplerAccessExpr?: string
  /** The translator declares the variable (default true unless accessExpr is set). */
  declare?: boolean
}

export interface ExternalStruct {
  name: string
  fields: { name: string; type: string; arraySize?: number }[]
  /** The translator declares the struct (default true). */
  declare?: boolean
}

/** A function the host defines in WGSL (e.g. the generator's texture accessors HgiGet_<name>). */
export interface ExternalFunction {
  name: string
  /** GLSL parameter type names. */
  params: string[]
  /** GLSL return type name. */
  returnType: string
}

export interface CheckOptions {
  stage: GlslStage
  externals?: ExternalGlobal[]
  externalStructs?: ExternalStruct[]
  externalFunctions?: ExternalFunction[]
  /** Structs the GLSL declares (e.g. in the prelude) that the host already declares in WGSL. */
  providedStructs?: string[]
  /**
   * Section mode: a function declared only by a prototype (FORWARD_DECL) may
   * be called; the emitter writes a stub. In program mode that is an error,
   * as it is a link error in GLSL.
   */
  allowUndefinedFunctions?: boolean
}

export type GlslStage = 'vertex' | 'fragment' | 'compute' | 'postTessVertex' | 'postTessControl' | 'tessControl' | 'tessEval' | 'geometry' | 'library'

export interface StructInfo {
  name: string
  wgsl: string
  fields: StructField[]
  decl: StructDecl | null
  external: boolean
  /** Emitted by the translator. */
  emit: boolean
}

export interface CheckedFunction {
  sym: FunctionSymbol
  decl: FunctionDecl
  /** Parameter symbols, in order. */
  params: VarSymbol[]
}

export interface CheckedGlobal {
  sym: VarSymbol
  decl: GlobalDecl | null
  declarator: Declarator | null
  external: ExternalGlobal | null
}

export interface CheckResult {
  structs: Map<string, StructInfo>
  functions: CheckedFunction[]
  globals: CheckedGlobal[]
  diagnostics: Diagnostic[]
  /** GLSL name -> WGSL name for functions whose name changed (mangling, renames). */
  nameMap: Map<string, string>
  /** Names of functions called but declared only by a prototype (section mode). */
  undefinedFunctions: Set<string>
  /** Those functions' symbols; the emitter writes stubs returning a zero value. */
  stubs: FunctionSymbol[]
  /** Helper functions the emitted code needs (helpers.ts keys). */
  helpers: Set<string>
  usesDerivatives: boolean
}

type Scope = Map<string, VarSymbol>

const SWIZZLE_SETS = ['xyzw', 'rgba', 'stpq']

/**
 * uint -> int. Not a GLSL implicit conversion, but the code generator relies
 * on it: it declares gl_PrimitiveID, hd_VertexID and hd_InstanceID as uint
 * (pxr/imaging/hdSt/codeGen.cpp:3130-3141, 3479-3481) and returns them as
 * int; hgiVulkan leaves GLSL's own int built-ins in place and hgiMetal
 * compiles C++, which converts. Accepted at a higher overload cost than the
 * GLSL conversions.
 */
function uintToInt(from: GType, to: GType): boolean {
  return (from.k === 'scalar' && to.k === 'scalar' && from.s === 'uint' && to.s === 'int') ||
    (from.k === 'vector' && to.k === 'vector' && from.n === to.n && from.s === 'uint' && to.s === 'int')
}

/** Key of the helper a built-in overload needs (helpers.ts). */
export function helperKey(o: BuiltinOverload): string {
  const kind = o.wgsl.slice('helper:'.length)
  const p0 = o.params[0] as GType
  if (kind === 'outerProduct') return `${kind}:${componentCount(p0)}x${componentCount(o.params[1] as GType)}`
  return `${kind}:${glslName(p0)}`
}

export function check(unit: TranslationUnit, options: CheckOptions): CheckResult {
  return new Checker(options).run(unit)
}

class Checker {
  private readonly diagnostics: Diagnostic[] = []
  private readonly structs = new Map<string, StructInfo>()
  private readonly overloads = new Map<string, FunctionSymbol[]>()
  private readonly templates = new Map<string, FunctionDecl[]>()
  private readonly instantiations = new Map<string, FunctionSymbol>()
  private readonly checked: CheckedFunction[] = []
  private readonly globals: CheckedGlobal[] = []
  private readonly globalScope: Scope = new Map()
  private scopes: Scope[] = []
  private currentFn: FunctionSymbol | null = null
  private readonly pending: { sym: FunctionSymbol; decl: FunctionDecl }[] = []
  private readonly undefinedFunctions = new Set<string>()
  private readonly stubs: FunctionSymbol[] = []
  private readonly helpers = new Set<string>()
  private usesDerivatives = false
  private readonly moduleNames = new Set<string>()
  private readonly options: CheckOptions

  constructor(options: CheckOptions) {
    this.options = options
  }

  private error(message: string, loc?: SourceLoc): never {
    throw new CheckError(message, loc)
  }
  private diag(severity: Diagnostic['severity'], message: string, loc?: SourceLoc): void {
    this.diagnostics.push(loc ? { severity, message, loc } : { severity, message })
  }

  /** A module-scope name the host declares: reserved as is. */
  private keepModuleName(name: string): string {
    this.moduleNames.add(name)
    return name
  }

  private claimModuleName(name: string): string {
    let n = safeIdentifier(name)
    let k = 1
    while (this.moduleNames.has(n)) n = `${safeIdentifier(name)}_${k++}`
    this.moduleNames.add(n)
    return n
  }

  // --------------------------------------------------------------- driver

  run(unit: TranslationUnit): CheckResult {
    for (const s of this.options.externalStructs ?? []) this.declareExternalStruct(s)
    // struct names first (fields may reference later structs only by GLSL rules: earlier ones)
    for (const d of unit.decls) if (d.kind === 'struct') this.declareStruct(d)
    for (const d of unit.decls) if (d.kind === 'block') this.declareBlock(d)
    for (const g of this.options.externals ?? []) this.declareExternal(g)
    // functions: host-defined ones first, then the GLSL's
    for (const f of this.options.externalFunctions ?? []) this.declareExternalFunction(f)
    for (const d of unit.decls) if (d.kind === 'function') this.declareFunction(d)
    this.assignFunctionNames()
    // globals, in order (initialisers may use earlier globals and functions)
    for (const d of unit.decls) {
      if (d.kind === 'global') this.declareGlobal(d)
    }
    // function bodies
    for (const d of unit.decls) {
      if (d.kind !== 'function' || !d.body || d.templateParams.length) continue
      const sym = this.findDefinition(d)
      this.pending.push({ sym, decl: d })
    }
    while (this.pending.length) {
      const p = this.pending.shift() as { sym: FunctionSymbol; decl: FunctionDecl }
      this.checkFunction(p.sym, p.decl)
      this.drainTemplates()
    }
    this.drainTemplates()
    // Prototypes that are called but never defined (section mode only).
    for (const list of this.overloads.values()) {
      for (const f of list) {
        if (f.used && !f.defined) this.stubs.push(f)
      }
    }
    const nameMap = new Map<string, string>()
    for (const [name, list] of this.overloads) for (const f of list) if (f.wgsl !== name) nameMap.set(`${name}(${f.params.map(p => glslName(p.type)).join(',')})`, f.wgsl)
    for (const f of this.instantiations.values()) nameMap.set(`${f.name}<${[...(f.typeArgs ?? new Map()).values()].map(glslName).join(',')}>`, f.wgsl)
    return {
      structs: this.structs,
      functions: this.checked,
      globals: this.globals,
      diagnostics: this.diagnostics,
      nameMap,
      undefinedFunctions: this.undefinedFunctions,
      stubs: this.stubs,
      helpers: this.helpers,
      usesDerivatives: this.usesDerivatives,
    }
  }

  // ----------------------------------------------------------------- types

  resolveType(spec: TypeSpec, extraDims: (Expr | null)[] = [], typeArgs?: Map<string, GType>): GType {
    let base: GType | undefined = typeArgs?.get(spec.name) ?? basicType(spec.name)
    if (!base) {
      const s = this.structs.get(spec.name)
      if (s) base = { k: 'struct', name: s.name, fields: s.fields }
    }
    if (!base) this.error(`unknown type '${spec.name}'`, spec.loc)
    // GLSL: `float[2] a[3]` is an array of 3 arrays of 2; declarator dims are outermost.
    const dims = [...extraDims, ...spec.arraySizes]
    for (let k = dims.length - 1; k >= 0; k--) {
      const d = dims[k]
      base = { k: 'array', elem: base, size: d === null || d === undefined ? null : this.constInt(d) }
    }
    return base
  }

  private declareExternalStruct(s: ExternalStruct): void {
    const fields: StructField[] = s.fields.map(f => {
      let t = basicType(f.type) ?? this.structType(f.type)
      if (!t) this.error(`unknown type '${f.type}' in interface struct ${s.name}`)
      if (f.arraySize !== undefined) t = { k: 'array', elem: t, size: f.arraySize }
      return { name: f.name, type: t }
    })
    const declare = s.declare !== false
    this.structs.set(s.name, { name: s.name, wgsl: declare ? this.claimModuleName(s.name) : this.keepModuleName(s.name), fields, decl: null, external: true, emit: declare })
  }

  private structType(name: string): GType | undefined {
    const s = this.structs.get(name)
    return s ? { k: 'struct', name: s.name, fields: s.fields } : undefined
  }

  private declareStruct(d: StructDecl): void {
    if (this.structs.has(d.name)) {
      const prev = this.structs.get(d.name) as StructInfo
      if (prev.external) return // the interface already declares it
      this.error(`struct '${d.name}' redefined`, d.loc)
    }
    const fields: StructField[] = d.fields.map(f => ({ name: f.name, type: this.resolveType(f.type, f.arraySizes) }))
    const provided = this.options.providedStructs?.includes(d.name) ?? false
    this.structs.set(d.name, { name: d.name, wgsl: provided ? this.keepModuleName(d.name) : this.claimModuleName(d.name), fields, decl: d, external: false, emit: !provided })
  }

  private declareBlock(d: TopLevel & { kind: 'block' }): void {
    // An interface block is a struct plus (optionally) an instance; without an
    // instance name its members are globals. Both become module-scope privates.
    const fields: StructField[] = d.fields.map(f => ({ name: f.name, type: this.resolveType(f.type, f.arraySizes) }))
    if (d.instance) {
      if (!this.structs.has(d.blockName)) this.structs.set(d.blockName, { name: d.blockName, wgsl: this.claimModuleName(d.blockName), fields, decl: null, external: false, emit: true })
      let t: GType = { k: 'struct', name: d.blockName, fields }
      for (let k = d.arraySizes.length - 1; k >= 0; k--) {
        const s = d.arraySizes[k]
        t = { k: 'array', elem: t, size: s === null || s === undefined ? null : this.constInt(s) }
      }
      this.addGlobal({ name: d.instance, wgsl: this.claimModuleName(d.instance), type: t, storage: 'private', isConst: false }, null, null, null, d.loc)
    } else {
      for (const f of fields) this.addGlobal({ name: f.name, wgsl: this.claimModuleName(f.name), type: f.type, storage: 'private', isConst: false }, null, null, null, d.loc)
    }
  }

  private declareExternal(g: ExternalGlobal): void {
    let t: GType | undefined = basicType(g.type) ?? this.structType(g.type)
    if (!t) this.error(`unknown type '${g.type}' for interface symbol ${g.name}`)
    if (g.atomic) {
      const s = scalarOf(t)
      if (s !== 'int' && s !== 'uint') this.error(`atomic interface symbol ${g.name} must be int or uint`)
      t = { k: 'atomic', s }
    }
    if (g.arraySize !== undefined) {
      if (typeof g.arraySize === 'string' && g.arraySize !== 'runtime') this.error(`unresolved array size '${g.arraySize}' for ${g.name}`)
      t = { k: 'array', elem: t, size: g.arraySize === 'runtime' ? null : (g.arraySize as number) }
    }
    const declare = g.declare ?? g.accessExpr === undefined
    const wgsl = declare ? this.claimModuleName(g.name) : g.accessExpr ?? this.keepModuleName(g.name)
    const sym: VarSymbol = {
      name: g.name, wgsl, type: t, storage: 'external', isConst: false, space: g.space,
      readonly: g.space === 'uniform' || (g.space === 'storage' && g.access !== 'read_write'),
    }
    if (g.accessExpr !== undefined) sym.access = g.accessExpr
    if (g.samplerAccessExpr !== undefined) sym.samplerWgsl = g.samplerAccessExpr
    this.addGlobal(sym, null, null, g)
  }

  private addGlobal(sym: VarSymbol, decl: GlobalDecl | null, declarator: Declarator | null, external: ExternalGlobal | null, loc?: SourceLoc): void {
    if (this.globalScope.has(sym.name)) {
      const prev = this.globalScope.get(sym.name) as VarSymbol
      if (prev.storage === 'external' && !external) {
        this.diag('warning', `'${sym.name}' is declared by the stage interface; the GLSL declaration is ignored`, loc)
        return
      }
      this.error(`'${sym.name}' redeclared`, loc)
    }
    this.globalScope.set(sym.name, sym)
    this.globals.push({ sym, decl, declarator, external })
  }

  private declareGlobal(d: GlobalDecl): void {
    const isConst = d.qualifiers.includes('const')
    for (const dec of d.declarators) {
      let t = this.resolveType(d.type, dec.arraySizes)
      let init: Expr | null = null
      if (dec.init) {
        this.scopes = [this.globalScope]
        init = this.checkInitializer(dec.init, t)
        if (t.k === 'array' && t.size === null && init.ty?.k === 'array') t = init.ty
        dec.init = init
      }
      dec.ty = t
      const sym: VarSymbol = { name: dec.name, wgsl: this.claimModuleName(dec.name), type: t, storage: isConst ? 'const' : 'private', isConst }
      if (isConst && init) {
        const v = this.tryConstInt(init)
        if (v !== undefined) sym.constValue = v
      }
      dec.sym = sym
      this.addGlobal(sym, d, dec, null, dec.loc)
    }
  }

  // ------------------------------------------------------------ functions

  private paramTypes(d: FunctionDecl, typeArgs?: Map<string, GType>): FunctionSymbol['params'] {
    return d.params.map(p => ({
      name: p.name,
      type: this.resolveType(p.type, p.arraySizes, typeArgs),
      qualifier: p.qualifier,
      defaultValue: p.defaultValue,
    }))
  }

  private declareFunction(d: FunctionDecl): void {
    if (d.templateParams.length) {
      ;(this.templates.get(d.name) ?? this.templates.set(d.name, []).get(d.name) as FunctionDecl[]).push(d)
      return
    }
    const params = this.paramTypes(d)
    const ret = this.resolveType(d.returnType)
    const list = this.overloads.get(d.name) ?? []
    const existing = list.find(f => f.params.length === params.length && f.params.every((p, k) => typeEq(p.type, (params[k] as FunctionSymbol['params'][number]).type)))
    if (existing) {
      if (!typeEq(existing.returnType, ret)) this.error(`'${d.name}' redeclared with a different return type`, d.loc)
      if (existing.external) {
        if (d.body) this.error(`'${d.name}' is defined by the shader generator; the GLSL may not redefine it`, d.loc)
        return
      }
      if (d.body) {
        if (existing.defined) this.error(`function '${d.name}(${params.map(p => glslName(p.type)).join(', ')})' redefined`, d.loc)
        existing.defined = true
        existing.decl = d
        existing.params = params
      }
      // default arguments may be written on the prototype or the definition
      existing.params.forEach((p, k) => {
        const q = params[k] as FunctionSymbol['params'][number]
        if (!p.defaultValue && q.defaultValue) p.defaultValue = q.defaultValue
      })
      return
    }
    list.push({ name: d.name, wgsl: d.name, returnType: ret, params, decl: d, defined: !!d.body, used: false })
    this.overloads.set(d.name, list)
  }

  private assignFunctionNames(): void {
    for (const [name, list] of this.overloads) {
      if (list.some(f => f.external)) {
        if (list.length > 1) this.error(`'${name}' is defined by the shader generator and cannot be overloaded`)
        continue
      }
      if (list.length === 1) {
        ;(list[0] as FunctionSymbol).wgsl = this.claimModuleName(name)
        continue
      }
      // Overloads: the parameterless one keeps the name, the others are
      // mangled by parameter types (packages/usd/docs/imaging-i1.md 3.3).
      const sorted = [...list].sort((a, b) => a.params.length - b.params.length)
      for (const f of sorted) {
        const base = f.params.length === 0 ? name : `${name}_${f.params.map(p => mangleTag(p.type)).join('_')}`
        f.wgsl = this.claimModuleName(base)
      }
    }
  }

  private declareExternalFunction(f: ExternalFunction): void {
    const type = (n: string): GType => {
      const t = basicType(n) ?? this.structType(n)
      if (!t) this.error(`unknown type '${n}' in host function ${f.name}`)
      return t
    }
    const list = this.overloads.get(f.name) ?? []
    list.push({
      name: f.name, wgsl: this.keepModuleName(f.name), returnType: type(f.returnType),
      params: f.params.map((p, k) => ({ name: `p${k}`, type: type(p), qualifier: 'in' as const, defaultValue: null })),
      decl: null, defined: true, used: false, external: true,
    })
    this.overloads.set(f.name, list)
  }

  private findDefinition(d: FunctionDecl): FunctionSymbol {
    const list = this.overloads.get(d.name) as FunctionSymbol[]
    const found = list.find(f => f.decl === d)
    if (!found) this.error(`internal: no symbol for ${d.name}`, d.loc)
    return found
  }

  private checkFunction(sym: FunctionSymbol, decl: FunctionDecl): void {
    this.currentFn = sym
    this.scopes = [this.globalScope, new Map()]
    const params: VarSymbol[] = []
    for (const p of sym.params) {
      const v: VarSymbol = {
        name: p.name,
        wgsl: safeIdentifier(p.name || `_p${params.length}`),
        type: p.type,
        storage: p.qualifier === 'in' ? 'param' : 'refparam',
        isConst: false,
      }
      params.push(v)
      if (p.name) this.top().set(p.name, v)
    }
    try {
      this.checkBlock(decl.body as BlockStmt, false)
      this.checked.push({ sym, decl, params })
    } catch (e) {
      if (e instanceof CheckError) {
        const where = `${sym.name}(${sym.params.map(p => glslName(p.type)).join(', ')})`
        throw new CheckError(`in ${where}: ${e.message}`, e.loc)
      }
      throw e
    } finally {
      this.currentFn = null
    }
  }

  // ---------------------------------------------------------------- scopes

  private top(): Scope {
    return this.scopes[this.scopes.length - 1] as Scope
  }
  private lookup(name: string): VarSymbol | undefined {
    for (let k = this.scopes.length - 1; k >= 0; k--) {
      const v = (this.scopes[k] as Scope).get(name)
      if (v) return v
    }
    return undefined
  }
  private push(): void {
    this.scopes.push(new Map())
  }
  private pop(): void {
    this.scopes.pop()
  }

  // ------------------------------------------------------------ statements

  private checkBlock(b: BlockStmt, newScope = true): void {
    if (newScope) this.push()
    for (let k = 0; k < b.stmts.length; k++) b.stmts[k] = this.checkStmt(b.stmts[k] as Stmt)
    if (newScope) this.pop()
  }

  private checkCond(e: Expr): Expr {
    const c = this.rvalue(this.checkExpr(e))
    if (!(c.ty?.k === 'scalar' && c.ty.s === 'bool')) this.error(`condition must be bool, not ${glslName(c.ty as GType)}`, e.loc)
    return c
  }

  private checkStmt(s: Stmt): Stmt {
    switch (s.kind) {
      case 'block':
        this.checkBlock(s)
        return s
      case 'decl': {
        const isConst = s.qualifiers.includes('const')
        for (const d of s.declarators) {
          let t = this.resolveType(s.type, d.arraySizes)
          if (d.init) {
            d.init = this.checkInitializer(d.init, t)
            if (t.k === 'array' && t.size === null && d.init.ty?.k === 'array') t = d.init.ty
          } else if (isConst) {
            this.error(`const '${d.name}' needs an initializer`, d.loc)
          }
          d.ty = t
          const sym: VarSymbol = { name: d.name, wgsl: safeIdentifier(d.name), type: t, storage: 'local', isConst }
          if (isConst && d.init) {
            const v = this.tryConstInt(d.init)
            if (v !== undefined) sym.constValue = v
          }
          d.sym = sym
          this.top().set(d.name, sym)
        }
        return s
      }
      case 'localstruct':
        this.declareStruct(s.decl)
        return s
      case 'expr':
        s.expr = this.checkExpr(s.expr)
        return s
      case 'if':
        s.cond = this.checkCond(s.cond)
        this.push()
        s.then = this.checkStmt(s.then)
        this.pop()
        if (s.else) {
          this.push()
          s.else = this.checkStmt(s.else)
          this.pop()
        }
        return s
      case 'for':
        this.push()
        if (s.init) s.init = this.checkStmt(s.init)
        if (s.cond) s.cond = this.checkCond(s.cond)
        if (s.update) s.update = this.checkExpr(s.update)
        this.push()
        s.body = this.checkStmt(s.body)
        this.pop()
        this.pop()
        return s
      case 'while':
        s.cond = this.checkCond(s.cond)
        this.push()
        s.body = this.checkStmt(s.body)
        this.pop()
        return s
      case 'dowhile':
        this.push()
        s.body = this.checkStmt(s.body)
        this.pop()
        s.cond = this.checkCond(s.cond)
        return s
      case 'switch': {
        let e = this.rvalue(this.checkExpr(s.expr))
        const st = e.ty as GType
        if (!(st.k === 'scalar' && (st.s === 'int' || st.s === 'uint'))) this.error('switch selector must be int or uint', s.loc)
        s.expr = e
        for (const c of s.cases) {
          c.labels = c.labels.map(l => (l === 'default' ? l : this.convert(this.rvalue(this.checkExpr(l)), st, l.loc)))
          this.push()
          c.body = c.body.map(b => this.checkStmt(b))
          this.pop()
        }
        e = s.expr
        return s
      }
      case 'return': {
        const fn = this.currentFn as FunctionSymbol
        if (s.value) {
          if (fn.returnType.k === 'void') this.error('void function returns a value', s.loc)
          s.value = this.convert(this.rvalue(this.checkExpr(s.value)), fn.returnType, s.loc)
        } else if (fn.returnType.k !== 'void') {
          this.error('non-void function returns no value', s.loc)
        }
        return s
      }
      case 'discard':
        return s
      default:
        return s
    }
  }

  private checkInitializer(e: Expr, t: GType): Expr {
    if (e.kind === 'initlist') {
      // `T x = { a, b }` is the constructor T(a, b)
      if (t.k === 'array') {
        const items = e.items.map(it => this.checkInitializer(it, t.elem))
        const size = t.size ?? items.length
        if (items.length !== size) this.error(`initializer has ${items.length} elements, the array ${size}`, e.loc)
        const call: CallExpr = { kind: 'call', callee: glslName(t.elem), ctorArray: [], args: items, loc: e.loc, ctor: { k: 'array', elem: t.elem, size }, ty: { k: 'array', elem: t.elem, size } }
        return call
      }
      if (t.k === 'struct') {
        const s = this.structs.get(t.name) as StructInfo
        if (e.items.length !== s.fields.length) this.error(`initializer for ${t.name} has ${e.items.length} items, the struct ${s.fields.length} fields`, e.loc)
        const args = e.items.map((it, k) => this.checkInitializer(it, (s.fields[k] as StructField).type))
        return { kind: 'call', callee: t.name, args, loc: e.loc, ctor: t, ty: t }
      }
      const call: CallExpr = { kind: 'call', callee: glslName(t), args: e.items, loc: e.loc }
      return this.checkExpr(call)
    }
    return this.convert(this.rvalue(this.checkExpr(e)), t, e.loc)
  }

  // ----------------------------------------------------------- expressions

  /** Read of an atomic location becomes atomicLoad (ATOMIC_LOAD expands to a plain read, as on Vulkan). */
  private rvalue(e: Expr): Expr {
    const t = e.ty as GType
    if (t.k === 'atomic') return { kind: 'convert', expr: e, to: scalar(t.s), loc: e.loc, ty: scalar(t.s) }
    return e
  }

  /** Implicit conversion to `to` (GLSL 4.50 section 4.1.10), made explicit. */
  convert(e: Expr, to: GType, loc: SourceLoc): Expr {
    const from = e.ty as GType
    if (typeEq(from, to)) return e
    if (canImplicitlyConvert(from, to) || uintToInt(from, to)) return { kind: 'convert', expr: e, to, loc: e.loc, ty: to }
    this.error(`cannot convert ${glslName(from)} to ${glslName(to)}`, loc)
  }

  /** Explicit conversion (constructor semantics): any scalar kind to any other, splat scalar to vector. */
  private cast(e: Expr, to: GType): Expr {
    const from = e.ty as GType
    if (typeEq(from, to)) return e
    return { kind: 'convert', expr: e, to, loc: e.loc, ty: to }
  }

  checkExpr(e: Expr): Expr {
    switch (e.kind) {
      case 'literal':
        e.ty = e.litType === 'bool' ? BOOL : e.litType === 'float' ? FLOAT : e.litType === 'uint' ? UINT : INT
        return e
      case 'ident':
        return this.checkIdent(e)
      case 'binary':
        return this.checkBinary(e)
      case 'unary': {
        e.operand = this.checkExpr(e.operand)
        const t = e.operand.ty as GType
        if (e.op === '++' || e.op === '--') {
          this.markWritten(e.operand)
          if (!(t.k === 'scalar' || t.k === 'vector' || t.k === 'matrix') || scalarOf(t) === 'bool') this.error(`'${e.op}' needs a numeric lvalue`, e.loc)
          e.ty = t
          return e
        }
        e.operand = this.rvalue(e.operand)
        const ot = e.operand.ty as GType
        if (e.op === '!') {
          if (!(ot.k === 'scalar' && ot.s === 'bool')) this.error("'!' needs a bool", e.loc)
        } else if (e.op === '~') {
          const s = scalarOf(ot)
          if (s !== 'int' && s !== 'uint') this.error("'~' needs an integer", e.loc)
        } else if (scalarOf(ot) === 'bool' || !(ot.k === 'scalar' || ot.k === 'vector' || ot.k === 'matrix')) {
          this.error(`'${e.op}' needs a number`, e.loc)
        }
        e.ty = ot
        return e
      }
      case 'postfix': {
        e.operand = this.checkExpr(e.operand)
        this.markWritten(e.operand)
        const t = e.operand.ty as GType
        if (scalarOf(t) === 'bool' || !(t.k === 'scalar' || t.k === 'vector' || t.k === 'matrix')) this.error(`'${e.op}' needs a numeric lvalue`, e.loc)
        e.ty = t
        return e
      }
      case 'assign':
        return this.checkAssign(e)
      case 'ternary': {
        e.cond = this.checkCond(e.cond)
        let a = this.rvalue(this.checkExpr(e.a))
        let b = this.rvalue(this.checkExpr(e.b))
        const at = a.ty as GType
        const bt = b.ty as GType
        if (!typeEq(at, bt)) {
          if (canImplicitlyConvert(at, bt)) a = this.convert(a, bt, e.loc)
          else if (canImplicitlyConvert(bt, at)) b = this.convert(b, at, e.loc)
          else this.error(`ternary arms differ: ${glslName(at)} and ${glslName(bt)}`, e.loc)
        }
        e.a = a
        e.b = b
        e.ty = a.ty as GType
        return e
      }
      case 'call':
        return this.checkCall(e)
      case 'index': {
        e.base = this.checkExpr(e.base)
        e.index = this.rvalue(this.checkExpr(e.index))
        const it = e.index.ty as GType
        if (!(it.k === 'scalar' && (it.s === 'int' || it.s === 'uint'))) this.error('index must be int or uint', e.loc)
        const bt = e.base.ty as GType
        if (bt.k === 'array') e.ty = bt.elem
        else if (bt.k === 'vector') e.ty = scalar(bt.s)
        else if (bt.k === 'matrix') e.ty = vec('float', bt.r)
        else this.error(`cannot index ${glslName(bt)}`, e.loc)
        return e
      }
      case 'member':
        return this.checkMember(e)
      case 'method': {
        e.base = this.checkExpr(e.base)
        if (e.name !== 'length' || e.args.length) this.error(`unknown method '${e.name}'`, e.loc)
        const bt = e.base.ty as GType
        if (bt.k !== 'array' && bt.k !== 'vector' && bt.k !== 'matrix') this.error('length() needs an array, vector or matrix', e.loc)
        e.ty = INT
        return e
      }
      case 'comma': {
        e.exprs = e.exprs.map(x => this.checkExpr(x))
        const last = e.exprs[e.exprs.length - 1] as Expr
        e.exprs[e.exprs.length - 1] = this.rvalue(last)
        e.ty = (e.exprs[e.exprs.length - 1] as Expr).ty as GType
        return e
      }
      case 'initlist':
        this.error('initializer list outside a declaration', e.loc)
        break
      case 'convert':
        return e
    }
    return e
  }

  private checkIdent(e: IdentExpr): Expr {
    const sym = this.lookup(e.name)
    if (!sym) this.error(`undeclared identifier '${e.name}'`, e.loc)
    e.sym = sym
    e.ty = sym.type
    return e
  }

  private checkMember(e: MemberExpr): Expr {
    e.base = this.checkExpr(e.base)
    const bt = e.base.ty as GType
    if (bt.k === 'struct') {
      const s = this.structs.get(bt.name) as StructInfo
      const f = s.fields.find(x => x.name === e.name)
      if (!f) this.error(`${bt.name} has no member '${e.name}'`, e.loc)
      e.ty = f.type
      return e
    }
    if (bt.k === 'vector' || bt.k === 'scalar') {
      e.base = this.rvalue(e.base)
      const n = bt.k === 'vector' ? bt.n : 1
      const set = SWIZZLE_SETS.find(set => [...e.name].every(c => set.includes(c)))
      if (!set || e.name.length > 4) this.error(`bad swizzle '.${e.name}'`, e.loc)
      const idx = [...e.name].map(c => set.indexOf(c))
      if (idx.some(i => i >= n)) this.error(`swizzle '.${e.name}' out of range for ${glslName(bt)}`, e.loc)
      e.swizzle = idx
      e.ty = vec(scalarOf(bt) as ScalarKind, idx.length)
      return e
    }
    this.error(`'.${e.name}' on ${glslName(bt)}`, e.loc)
  }

  /** Mark the root variable of an lvalue as written; returns false if it is not an lvalue. */
  private markWritten(e: Expr): void {
    let x = e
    for (;;) {
      if (x.kind === 'ident') break
      if (x.kind === 'index') x = x.base
      else if (x.kind === 'member') {
        if (x.swizzle && new Set(x.swizzle).size !== x.swizzle.length) this.error('swizzle with repeated components is not an lvalue', x.loc)
        x = x.base
      } else if (x.kind === 'convert' && (x.expr.ty as GType).k === 'atomic') x = x.expr
      else this.error('expression is not assignable', e.loc)
    }
    const sym = x.sym as VarSymbol
    if (sym.isConst) this.error(`cannot assign to const '${sym.name}'`, e.loc)
    if (sym.readonly) this.error(`cannot assign to read-only '${sym.name}'`, e.loc)
    sym.written = true
  }

  private checkAssign(e: Expr & { kind: 'assign' }): Expr {
    e.target = this.checkExpr(e.target)
    this.markWritten(e.target)
    const tt = e.target.ty as GType
    const target = tt.k === 'atomic' ? scalar(tt.s) : tt
    let v = this.rvalue(this.checkExpr(e.value))
    if (e.op === '=') {
      v = this.convert(v, target, e.loc)
    } else {
      const op = e.op.slice(0, -1)
      // check as a binary expression on a copy of the target's type
      const probe: Expr = { kind: 'binary', op, left: { kind: 'ident', name: '<lhs>', loc: e.loc, ty: target }, right: v, loc: e.loc }
      const r = this.checkBinaryTyped(probe as Expr & { kind: 'binary' }, true)
      if (!typeEq(r.ty as GType, target)) this.error(`'${e.op}' gives ${glslName(r.ty as GType)}, not ${glslName(target)}`, e.loc)
      v = (r as Expr & { kind: 'binary' }).right
    }
    e.value = v
    e.ty = target
    return e
  }

  private checkBinary(e: Expr & { kind: 'binary' }): Expr {
    e.left = this.rvalue(this.checkExpr(e.left))
    e.right = this.rvalue(this.checkExpr(e.right))
    return this.checkBinaryTyped(e, false)
  }

  /** Types a binary expression whose operands are already checked. */
  private checkBinaryTyped(e: Expr & { kind: 'binary' }, leftFixed: boolean): Expr {
    const op = e.op
    let l = e.left
    let r = e.right
    const lt = l.ty as GType
    const rt = r.ty as GType
    const fail: () => never = () => this.error(`no operator '${op}' for ${glslName(lt)} and ${glslName(rt)}`, e.loc)
    if (op === '&&' || op === '||' || op === '^^') {
      if (!typeEq(lt, BOOL) || !typeEq(rt, BOOL)) fail()
      e.ty = BOOL
      return e
    }
    // Unify scalar kinds by implicit conversion (int -> uint -> float).
    const ls = scalarOf(lt)
    const rs = scalarOf(rt)
    if (ls === undefined || rs === undefined) {
      if ((op === '==' || op === '!=') && typeEq(lt, rt)) {
        e.ty = BOOL
        return e
      }
      fail()
    }
    if (op === '<<' || op === '>>') {
      if (ls === 'float' || ls === 'bool' || rs === 'float' || rs === 'bool') fail()
      if (lt.k === 'scalar' && rt.k === 'vector') fail()
      e.ty = lt
      return e
    }
    let kind: ScalarKind = ls
    if (ls !== rs) {
      const rank = (s: ScalarKind): number => (s === 'int' ? 0 : s === 'uint' ? 1 : s === 'float' ? 2 : -1)
      const target = rank(ls) > rank(rs) ? ls : rs
      if (rank(ls) < 0 || rank(rs) < 0) fail()
      kind = target
      if (ls !== target) {
        if (leftFixed) fail()
        l = this.convert(l, withScalar(lt, target), e.loc)
      }
      if (rs !== target) r = this.convert(r, withScalar(rt, target), e.loc)
    }
    const L = l.ty as GType
    const R = r.ty as GType
    e.left = l
    e.right = r
    switch (op) {
      case '==':
      case '!=':
        if (!typeEq(L, R)) fail()
        e.ty = BOOL
        return e
      case '<':
      case '>':
      case '<=':
      case '>=':
        if (L.k !== 'scalar' || R.k !== 'scalar' || kind === 'bool') fail()
        e.ty = BOOL
        return e
      case '&':
      case '|':
      case '^':
      case '%':
        if (kind !== 'int' && kind !== 'uint') fail()
        break
      case '+':
      case '-':
      case '*':
      case '/':
        if (kind === 'bool') fail()
        break
      default:
        fail()
    }
    // shapes
    if (L.k === 'matrix' || R.k === 'matrix') {
      if (op === '*') {
        if (L.k === 'matrix' && R.k === 'matrix') {
          if (L.c !== R.r) fail()
          e.ty = { k: 'matrix', c: R.c, r: L.r }
        } else if (L.k === 'matrix' && R.k === 'vector') {
          if (L.c !== R.n) fail()
          e.ty = vec('float', L.r)
        } else if (L.k === 'vector' && R.k === 'matrix') {
          if (L.n !== R.r) fail()
          e.ty = vec('float', R.c)
        } else {
          e.ty = L.k === 'matrix' ? L : R
        }
        return e
      }
      if ((op === '+' || op === '-' || op === '/') && typeEq(L, R)) {
        e.ty = L
        if (op === '/') this.helpers.add(`matrixCompDiv:${glslName(L)}`)
        return e
      }
      if (op === '/' && L.k === 'matrix' && R.k === 'scalar') {
        e.ty = L
        return e
      }
      if ((op === '+' || op === '-') && (L.k === 'scalar' || R.k === 'scalar')) {
        e.ty = L.k === 'matrix' ? L : R
        return e
      }
      fail()
    }
    if (L.k === 'vector' && R.k === 'vector' && L.n !== R.n) fail()
    e.ty = L.k === 'vector' ? L : R
    return e
  }

  // ------------------------------------------------------------------ calls

  private checkCall(e: CallExpr): Expr {
    // constructors
    if (e.ctorArray) return this.checkArrayCtor(e)
    const ctorType = basicType(e.callee) ?? this.structType(e.callee)
    if (ctorType && ctorType.k !== 'sampler' && ctorType.k !== 'atomic') return this.checkCtor(e, ctorType)
    const name = e.callee
    if (TEXTURE_BUILTINS.has(name)) return this.checkTextureCall(e)
    if (name in ATOMIC_BUILTINS) return this.checkAtomicCall(e)
    if (name in BARRIER_BUILTINS) {
      e.builtin = name
      e.ty = VOID
      return e
    }
    if (UNSUPPORTED_STAGE_FUNCTIONS.has(name)) {
      this.diag('warning', `unsupported: ${name}() has no WebGPU equivalent (geometry stage); emitted as a no-op`, e.loc)
      e.builtin = name
      e.ty = VOID
      e.args = e.args.map(a => this.checkExpr(a))
      return e
    }
    const userList = this.overloads.get(name)
    const tmpl = this.templates.get(name)
    if (!userList && !tmpl && (builtinOverloads(name) || MATRIX_BUILTINS.has(name))) return this.checkBuiltinCall(e)
    if (!userList && !tmpl) this.error(`call to undeclared function '${name}'`, e.loc)
    return this.checkUserCall(e, userList ?? [], tmpl ?? [])
  }

  private checkArgs(e: CallExpr): void {
    e.args = e.args.map(a => this.checkExpr(a))
  }

  private checkUserCall(e: CallExpr, list: FunctionSymbol[], templates: FunctionDecl[]): Expr {
    this.checkArgs(e)
    const argTypes = e.args.map(a => {
      const t = a.ty as GType
      return t.k === 'atomic' ? scalar(t.s) : t
    })
    let best: { f: FunctionSymbol; cost: number }[] = []
    for (const f of list) {
      const cost = this.matchCost(f.params, argTypes)
      if (cost < 0) continue
      if (!best.length || cost < (best[0] as { cost: number }).cost) best = [{ f, cost }]
      else if (cost === (best[0] as { cost: number }).cost) best.push({ f, cost })
    }
    let fn: FunctionSymbol | undefined
    if (best.length > 1) this.error(`ambiguous call to '${e.callee}(${argTypes.map(glslName).join(', ')})'`, e.loc)
    if (best.length === 1) fn = (best[0] as { f: FunctionSymbol }).f
    if (!fn && templates.length) fn = this.instantiate(e, templates, argTypes)
    if (!fn) {
      const cands = list.map(f => `${f.name}(${f.params.map(p => glslName(p.type)).join(', ')})`).join('; ')
      this.error(`no matching overload for '${e.callee}(${argTypes.map(glslName).join(', ')})'${cands ? `; candidates: ${cands}` : ''}`, e.loc)
    }
    if (!fn.defined) {
      if (this.options.allowUndefinedFunctions) this.undefinedFunctions.add(fn.name)
      else this.error(`function '${fn.name}(${fn.params.map(p => glslName(p.type)).join(', ')})' is declared but never defined`, e.loc)
    }
    fn.used = true
    // default arguments
    for (let k = e.args.length; k < fn.params.length; k++) {
      const dv = (fn.params[k] as FunctionSymbol['params'][number]).defaultValue
      if (!dv) this.error(`missing argument ${k + 1} to '${fn.name}'`, e.loc)
      e.args.push(this.checkExpr(structuredClone(dv)))
    }
    e.args = e.args.map((a, k) => {
      const p = fn.params[k] as FunctionSymbol['params'][number]
      if (p.qualifier !== 'in') {
        this.markWritten(a)
        if (!typeEq(a.ty as GType, p.type)) this.error(`argument ${k + 1} to '${fn.name}' must be ${glslName(p.type)} for ${p.qualifier}`, a.loc)
        return a
      }
      return this.convert(this.rvalue(a), p.type, a.loc)
    })
    e.fn = fn
    e.ty = fn.returnType
    return e
  }

  /** -1: no match; else number of implicit conversions. */
  private matchCost(params: FunctionSymbol['params'], args: GType[]): number {
    if (args.length > params.length) return -1
    for (let k = args.length; k < params.length; k++) if (!(params[k] as FunctionSymbol['params'][number]).defaultValue) return -1
    let cost = 0
    for (let k = 0; k < args.length; k++) {
      const p = params[k] as FunctionSymbol['params'][number]
      const a = args[k] as GType
      if (typeEq(p.type, a)) continue
      if (p.qualifier !== 'in') return -1
      if (canImplicitlyConvert(a, p.type)) cost++
      else if (uintToInt(a, p.type)) cost += 10
      else return -1
    }
    return cost
  }

  private instantiate(e: CallExpr, templates: FunctionDecl[], argTypes: GType[]): FunctionSymbol | undefined {
    for (const t of templates) {
      const bind = new Map<string, GType>()
      let ok = t.params.length >= argTypes.length
      for (let k = 0; ok && k < t.params.length; k++) {
        const p = t.params[k] as FunctionDecl['params'][number]
        const a = argTypes[k]
        if (!a) {
          if (!p.defaultValue) ok = false
          continue
        }
        if (t.templateParams.includes(p.type.name) && !p.type.arraySizes.length && !p.arraySizes.length) {
          const prev = bind.get(p.type.name)
          if (prev && !typeEq(prev, a)) ok = false
          else bind.set(p.type.name, a)
        }
      }
      if (!ok || t.templateParams.some(n => !bind.has(n))) continue
      const params = this.paramTypes(t, bind)
      if (this.matchCost(params, argTypes) < 0) continue
      const key = `${t.name}<${t.templateParams.map(n => glslName(bind.get(n) as GType)).join(',')}>@${t.loc.file}:${t.loc.line}`
      let sym = this.instantiations.get(key)
      if (!sym) {
        const decl = structuredClone(t)
        decl.templateParams = []
        const ret = this.resolveType(t.returnType, [], bind)
        sym = {
          name: t.name,
          wgsl: this.claimModuleName(`${t.name}_${t.templateParams.map(n => mangleTag(bind.get(n) as GType)).join('_')}`),
          returnType: ret,
          params,
          decl,
          typeArgs: bind,
          defined: true,
          used: true,
        }
        this.instantiations.set(key, sym)
        this.pendingTemplate(sym, decl, bind)
      }
      return sym
    }
    void e
    return undefined
  }

  private pendingTemplate(sym: FunctionSymbol, decl: FunctionDecl, bind: Map<string, GType>): void {
    // Template bodies are checked with T bound; local declarations of type T
    // resolve through the same map.
    const self = this
    const resolve = this.resolveType.bind(this)
    const check = (): void => {
      const saved = self.resolveType
      self.resolveType = (spec, extra = [], typeArgs) => resolve(spec, extra, typeArgs ?? bind)
      try {
        self.checkFunction(sym, decl)
      } finally {
        self.resolveType = saved
      }
    }
    // checked after the current function (checkFunction is not re-entrant)
    this.templateThunks.push(check)
  }

  private readonly templateThunks: (() => void)[] = []
  private drainTemplates(): void {
    while (this.templateThunks.length) (this.templateThunks.shift() as () => void)()
  }

  private checkBuiltinCall(e: CallExpr): Expr {
    this.checkArgs(e)
    e.args = e.args.map(a => this.rvalue(a))
    const argTypes = e.args.map(a => a.ty as GType)
    let ov: BuiltinOverload | undefined
    if (MATRIX_BUILTINS.has(e.callee)) {
      ov = matrixBuiltin(e.callee, argTypes.map(t => (t.k === 'vector' && t.s !== 'float' ? withScalar(t, 'float') : t)))
    } else {
      const list = builtinOverloads(e.callee) as BuiltinOverload[]
      let bestCost = Infinity
      let ambiguous = false
      for (const o of list) {
        if (o.params.length !== argTypes.length) continue
        let cost = 0
        let ok = true
        for (let k = 0; k < argTypes.length; k++) {
          const p = o.params[k] as GType
          const a = argTypes[k] as GType
          if (typeEq(p, a)) continue
          if (canImplicitlyConvert(a, p)) cost++
          else {
            ok = false
            break
          }
        }
        if (!ok) continue
        if (cost < bestCost) {
          bestCost = cost
          ov = o
          ambiguous = false
        } else if (cost === bestCost) {
          ambiguous = true
        }
      }
      if (ambiguous && ov) {
        // GLSL prefers int->float over int->uint only via ordering; take the
        // first float overload, which is what drivers do for literals.
        const fl = list.filter(o => o.params.length === argTypes.length && o.params.every((p, k) => typeEq(p, argTypes[k] as GType) || canImplicitlyConvert(argTypes[k] as GType, p)))
        ov = fl.find(o => o.params.every(p => scalarOf(p) === 'float' || scalarOf(p) === 'bool')) ?? ov
      }
    }
    if (!ov) this.error(`no matching overload for built-in '${e.callee}(${argTypes.map(glslName).join(', ')})'`, e.loc)
    const o = ov
    e.args = e.args.map((a, k) => this.convert(a, o.params[k] as GType, a.loc))
    // `out:` forms (frexp) write their last argument.
    if (o.wgsl.startsWith('out:')) this.markWritten(e.args[e.args.length - 1] as Expr)
    e.builtin = o.wgsl
    e.ty = o.ret
    if (o.wgsl.startsWith('helper:')) this.helpers.add(helperKey(o))
    if (/^fn:(dpd|fwidth)/.test(o.wgsl)) this.usesDerivatives = true
    return e
  }

  private checkCtor(e: CallExpr, t: GType): Expr {
    this.checkArgs(e)
    e.args = e.args.map(a => this.rvalue(a))
    e.ctor = t
    e.ty = t
    const args = e.args
    const types = args.map(a => a.ty as GType)
    if (t.k === 'struct') {
      const s = this.structs.get(t.name) as StructInfo
      if (args.length !== s.fields.length) this.error(`${t.name}() takes ${s.fields.length} arguments`, e.loc)
      e.args = args.map((a, k) => this.convert(a, (s.fields[k] as StructField).type, a.loc))
      return e
    }
    if (t.k === 'scalar') {
      if (args.length !== 1) this.error(`${glslName(t)}() takes one argument`, e.loc)
      const a0 = types[0] as GType
      if (!isScalarOrVector(a0) && a0.k !== 'matrix') this.error(`cannot construct ${glslName(t)} from ${glslName(a0)}`, e.loc)
      return e
    }
    if (t.k === 'vector') {
      if (args.length === 0) return e
      if (args.length === 1 && (types[0] as GType).k === 'scalar') {
        e.args = [this.cast(args[0] as Expr, scalar(t.s))]
        return e
      }
      let total = 0
      e.args = args.map((a, k) => {
        const at = types[k] as GType
        if (at.k === 'scalar') {
          total += 1
          return this.cast(a, scalar(t.s))
        }
        if (at.k === 'vector') {
          total += at.n
          return this.cast(a, vec(t.s, at.n))
        }
        if (at.k === 'matrix') {
          total += at.c * at.r
          return a
        }
        this.error(`cannot construct ${glslName(t)} from ${glslName(at)}`, e.loc)
      })
      if (total < t.n) this.error(`too few components to construct ${glslName(t)}`, e.loc)
      if (args.length > 1 && total - componentCount(types[types.length - 1] as GType) >= t.n) this.error(`too many arguments to construct ${glslName(t)}`, e.loc)
      return e
    }
    if (t.k === 'matrix') {
      if (args.length === 1 && (types[0] as GType).k === 'matrix') return e
      e.args = args.map((a, k) => {
        const at = types[k] as GType
        if (at.k === 'scalar') return this.cast(a, FLOAT)
        if (at.k === 'vector') return this.cast(a, vec('float', at.n))
        this.error(`cannot construct ${glslName(t)} from ${glslName(at)}`, e.loc)
      })
      if (args.length === 1) {
        this.helpers.add(`matDiag:${glslName(t)}`)
        return e
      }
      const total = types.reduce((n, x) => n + componentCount(x), 0)
      if (total !== t.c * t.r) this.error(`${glslName(t)}() needs ${t.c * t.r} components, got ${total}`, e.loc)
      return e
    }
    if (t.k === 'array') return e
    this.error(`cannot construct ${glslName(t)}`, e.loc)
  }

  private checkArrayCtor(e: CallExpr): Expr {
    this.checkArgs(e)
    e.args = e.args.map(a => this.rvalue(a))
    const elem = this.resolveType({ name: e.callee, arraySizes: [], loc: e.loc })
    const dims = e.ctorArray as (Expr | null)[]
    const size = dims[0] ? this.constInt(dims[0]) : e.args.length
    if (dims.length !== 1) this.error('only one-dimensional array constructors are supported', e.loc)
    if (size !== e.args.length) this.error(`array constructor has ${e.args.length} elements, not ${size}`, e.loc)
    e.args = e.args.map(a => this.convert(a, elem, a.loc))
    const t: GType = { k: 'array', elem, size }
    e.ctor = t
    e.ty = t
    return e
  }

  private samplerOf(e: Expr): string {
    const t = e.ty as GType
    if (t.k !== 'sampler') this.error(`expected a sampler, found ${glslName(t)}`, e.loc)
    return t.name
  }

  private checkTextureCall(e: CallExpr): Expr {
    this.checkArgs(e)
    const s = e.args[0]
    if (!s) this.error(`${e.callee}() needs a sampler`, e.loc)
    const sname = this.samplerOf(s)
    const info = SAMPLER_TYPES[sname] as (typeof SAMPLER_TYPES)[string]
    for (let k = 1; k < e.args.length; k++) e.args[k] = this.rvalue(e.args[k] as Expr)
    const coordN = info.dim === '1d' || info.dim === 'buffer' ? 1 : info.dim === '2d' || info.dim === '1d_array' ? 2 : 3
    const coordNArr = coordN + (info.dim.endsWith('_array') && info.dim !== '1d_array' ? 0 : 0)
    const sampled = vec(info.sampled, 4)
    const fcoord = vec('float', info.shadow ? coordNArr + 1 : coordNArr)
    const icoord = vec('int', coordNArr)
    const sizeN = info.dim === 'cube' ? 2 : info.dim === '2d_array' ? 3 : info.dim === 'cube_array' ? 3 : coordN
    const want = (k: number, t: GType): void => {
      const a = e.args[k]
      if (!a) this.error(`${e.callee}() needs argument ${k + 1}`, e.loc)
      e.args[k] = this.convert(a, t, a.loc)
    }
    switch (e.callee) {
      case 'texture':
      case 'textureProj':
        want(1, e.callee === 'textureProj' ? vec('float', coordNArr + 1) : fcoord)
        if (e.args[2]) want(2, FLOAT)
        e.ty = info.shadow ? FLOAT : sampled
        break
      case 'textureLod':
        want(1, fcoord)
        want(2, FLOAT)
        e.ty = info.shadow ? FLOAT : sampled
        break
      case 'textureGrad':
        want(1, fcoord)
        want(2, vec('float', coordN === 3 && info.dim !== '2d_array' ? 3 : 2))
        want(3, vec('float', coordN === 3 && info.dim !== '2d_array' ? 3 : 2))
        e.ty = sampled
        break
      case 'textureOffset':
      case 'textureLodOffset':
        want(1, fcoord)
        e.ty = sampled
        break
      case 'textureGather':
        want(1, fcoord)
        if (e.args[2]) want(2, INT)
        e.ty = sampled
        break
      case 'texelFetch':
        want(1, icoord)
        if (e.args[2]) want(2, INT)
        e.ty = sampled
        break
      case 'textureSize':
        if (e.args[1]) want(1, INT)
        e.ty = vec('int', sizeN)
        break
      case 'textureQueryLevels':
        e.ty = INT
        break
      case 'imageLoad':
        want(1, icoord)
        e.ty = sampled
        break
      case 'imageStore':
        want(1, icoord)
        want(2, sampled)
        e.ty = VOID
        break
      case 'imageSize':
        e.ty = vec('int', sizeN)
        break
    }
    e.builtin = e.callee
    if (e.callee === 'texture' || e.callee === 'textureProj' || e.callee === 'textureOffset') this.usesDerivatives = true
    return e
  }

  private checkAtomicCall(e: CallExpr): Expr {
    this.checkArgs(e)
    const mem = e.args[0]
    if (!mem) this.error(`${e.callee}() needs a memory argument`, e.loc)
    const mt = mem.ty as GType
    if (mt.k !== 'atomic') this.error(`${e.callee}() needs an atomic location (declare the buffer element atomic in the stage interface)`, e.loc)
    this.markWritten(mem)
    const st = scalar(mt.s)
    for (let k = 1; k < e.args.length; k++) e.args[k] = this.convert(this.rvalue(e.args[k] as Expr), st, e.loc)
    e.builtin = e.callee
    e.ty = st
    return e
  }

  // -------------------------------------------------------- constant folding

  constInt(e: Expr): number {
    const v = this.tryConstIntRaw(e)
    if (v === undefined) this.error('array size must be a constant integer expression', e.loc)
    return v
  }

  private tryConstInt(e: Expr): number | undefined {
    return this.tryConstIntRaw(e)
  }

  private tryConstIntRaw(e: Expr): number | undefined {
    switch (e.kind) {
      case 'literal':
        if (e.litType === 'int' || e.litType === 'uint') return Number(BigInt.asIntN(64, BigInt(e.text.replace(/[uU]$/, '').replace(/^0(?=[0-7])/, '0o'))))
        return undefined
      case 'ident': {
        const s = this.lookup(e.name)
        return s?.constValue
      }
      case 'convert':
        return scalarOf(e.to) === 'float' ? undefined : this.tryConstIntRaw(e.expr)
      case 'unary': {
        const v = this.tryConstIntRaw(e.operand)
        if (v === undefined) return undefined
        return e.op === '-' ? -v : e.op === '+' ? v : e.op === '~' ? ~v : undefined
      }
      case 'binary': {
        const a = this.tryConstIntRaw(e.left)
        const b = this.tryConstIntRaw(e.right)
        if (a === undefined || b === undefined) return undefined
        switch (e.op) {
          case '+': return a + b
          case '-': return a - b
          case '*': return a * b
          case '/': return b ? Math.trunc(a / b) : undefined
          case '%': return b ? a % b : undefined
          case '<<': return a << b
          case '>>': return a >> b
          case '&': return a & b
          case '|': return a | b
          case '^': return a ^ b
        }
        return undefined
      }
      case 'call':
        if ((e.callee === 'int' || e.callee === 'uint') && e.args.length === 1) return this.tryConstIntRaw(e.args[0] as Expr)
        return undefined
      case 'method': {
        const t = e.base.ty
        if (e.name === 'length' && t?.k === 'array' && t.size !== null) return t.size
        return undefined
      }
    }
    return undefined
  }
}

export type { MemberExpr }
