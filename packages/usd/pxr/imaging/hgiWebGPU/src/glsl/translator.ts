// Ported from OpenUSD 26.11.1: pxr/imaging/hgiMetal/shaderGenerator.mm
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// GLSL-to-WGSL translation entry point for HgiWebGPU's shader generator.
//
// The translator has no upstream counterpart: upstream backends compile the
// code generator's GLSL directly (hgiVulkan via shaderc, hgiMetal as MSL
// behind a prelude). HgiWebGPUShaderGenerator calls translateGlslToWgsl at the
// point where hgiMetal's generator compiles its MSL
// (pxr/imaging/hgiMetal/shaderGenerator.mm:1464-1658): on one stage's
// HgiShaderFunctionDesc text (shaderCodeDeclarations + shaderCode) after the
// code generator has fixed defines and accessors, with the stage interface
// supplied as typed module-scope symbols. Design: packages/usd/docs/
// imaging-i1.md section 3.
//
// Division of work (imaging-i1.md 3.2 step 5): the translator owns the bodies,
// the lowering and the module-scope declarations of the symbols it is given;
// the shader generator owns binding numbers and the entry point, which copies
// @location/@builtin inputs into the private globals, calls main() and returns
// the outputs (stageInterface.ts has a reference implementation of that part).

import { CheckError, check, type ExternalFunction, type ExternalGlobal, type ExternalStruct, type GlslStage } from './checker.ts'
import { EmitError, emit } from './emit.ts'
import { formatLoc, LexError, type SourceLoc, tokenize } from './lexer.ts'
import { ParseError, parse } from './parser.ts'
import { GLSL_PRELUDE } from './prelude.ts'
import { type Diagnostic, type MacroDef, preprocess, PreprocessError, parseIntLiteral } from './preprocessor.ts'

function macroIntValue(defs: Map<string, MacroDef>, name: string, depth = 0): number | undefined {
  const m = defs.get(name)
  if (!m || m.params !== null || m.body.length !== 1 || depth > 8) return undefined
  const t = m.body[0] as { kind: string; text: string }
  if (t.kind === 'num') {
    try {
      return Number(parseIntLiteral(t.text))
    } catch {
      return undefined
    }
  }
  return t.kind === 'id' ? macroIntValue(defs, t.text, depth + 1) : undefined
}

/** GLSL type spelling to WGSL for an alias target (hgiWebGPU/shaderGenerator.ts
 *  GetWGSLType for the vector and scalar names; struct names pass through). */
function _wgslAliasTarget(t: string): string {
  const scalars: Record<string, string> = { float: 'f32', int: 'i32', uint: 'u32', bool: 'bool', double: 'f32' }
  // Packed doubles are declared as their float structs
  // (hgiWebGPU/shaderGenerator.ts GetWGSLType).
  if (t === 'hgi_dvec3') return 'hgi_vec3'
  if (t === 'hgi_dmat3') return 'hgi_mat3'
  if (scalars[t]) return scalars[t]!
  const m = /^(vec|ivec|uvec|bvec|dvec)([234])$/.exec(t)
  if (m) return `vec${m[2]}<${{ vec: 'f32', dvec: 'f32', ivec: 'i32', uvec: 'u32', bvec: 'bool' }[m[1]!]}>`
  return t
}

/** The identifier an object-like macro chain ends in (`#define hd_vec3
 *  hgi_vec3`, pxr/imaging/hdSt/codeGen.cpp:415: the hd_* types alias the
 *  Hgi packed types; a native backend sees the interface type through the
 *  C preprocessor), or undefined when `name` is not such a macro. */
function macroTypeName(defs: Map<string, MacroDef>, name: string, depth = 0): string | undefined {
  const m = defs.get(name)
  if (!m || m.params !== null || m.body.length !== 1 || depth > 8) return undefined
  const t = m.body[0] as { kind: string; text: string }
  if (t.kind !== 'id') return undefined
  return macroTypeName(defs, t.text, depth + 1) ?? t.text
}

export type { ExternalFunction, ExternalGlobal, ExternalStruct, GlslStage }
export type { Diagnostic }

export interface GlslTranslateInput {
  stage: GlslStage
  /** HgiShaderFunctionDesc::shaderCodeDeclarations. */
  declarations?: string
  /** HgiShaderFunctionDesc::shaderCode. */
  code: string
  /** Extra macro definitions (name -> replacement text), applied before the prelude. */
  defines?: Record<string, string>
  /** Module-scope symbols supplied by the stage interface. */
  globals?: ExternalGlobal[]
  /** Struct types those symbols use that the GLSL does not declare. */
  structs?: ExternalStruct[]
  /** Functions the host defines in WGSL (texture accessors). */
  functions?: ExternalFunction[]
  /** Structs the GLSL (or prelude) declares that the host already declares in WGSL. */
  providedStructs?: string[]
  /**
   * 'program' (default): a complete stage; calling a function that is only
   * declared is an error. 'section': one glslfx section with a stub
   * environment; prototypes without bodies become stubs (reported).
   */
  mode?: 'program' | 'section'
  /** Prepend the HgiWebGPU GLSL prelude (default true). */
  prelude?: boolean
  /** First binding for interface symbols declared without one (group 0). */
  autoBindingStart?: number
  fileName?: string
}

export interface GlslTranslateResult {
  ok: boolean
  /** Complete WGSL text: directives, then the body. Empty when ok is false. */
  wgsl: string
  /** Global directives (`diagnostic(...)`); the generator adds its `enable`s alongside. */
  directives: string[]
  /** Declarations and functions, without directives. */
  body: string
  diagnostics: Diagnostic[]
  /** GLSL signature -> WGSL function name, for renamed and mangled functions. */
  nameMap: Map<string, string>
  /** Function the entry point must call before main() to run non-constant global initialisers. */
  initGlobalsFunction: string | null
  autoBindings: { name: string; group: number; binding: number }[]
  /** Section mode: functions called but only declared, emitted as stubs. */
  stubbedFunctions: string[]
  /** Interface symbols (input.globals) the code assigns, passes as out/inout
   *  arguments or updates atomically, in any function it defines. */
  writtenGlobals: string[]
}

export function translateGlslToWgsl(input: GlslTranslateInput): GlslTranslateResult {
  const diagnostics: Diagnostic[] = []
  const fail = (message: string, loc?: SourceLoc): GlslTranslateResult => {
    diagnostics.push(loc ? { severity: 'error', message, loc } : { severity: 'error', message })
    return {
      ok: false, wgsl: '', directives: [], body: '', diagnostics, nameMap: new Map(), initGlobalsFunction: null,
      autoBindings: [], stubbedFunctions: [], writtenGlobals: [],
    }
  }
  try {
    const file = input.fileName ?? '<shader>'
    const tokens = [
      ...(input.prelude === false ? [] : tokenize(GLSL_PRELUDE, '<hgiWebGPU prelude>').slice(0, -1)),
      ...(input.declarations ? tokenize(input.declarations, file).slice(0, -1) : []),
      ...tokenize(input.code, file),
    ]
    // the first token of each part starts a line
    const pp = preprocess(tokens, input.defines ? { defines: input.defines } : {})
    for (const d of pp.diagnostics) diagnostics.push(d)
    if (pp.diagnostics.some(d => d.severity === 'error')) return fail('preprocessing failed')
    // Interface array sizes may name a macro the code defines
    // (gl_ClipDistance[HD_NUM_clipPlanes], pxr/imaging/hdSt/codeGen.cpp); the
    // value is resolved here and the name is emitted as a WGSL const so a
    // host declaration `array<f32, HD_NUM_clipPlanes>` is valid too.
    const consts = new Map<string, number>()
    // Interface symbol types may also name a macro of the code: HdSt's code
    // generator declares packed primvars as hd_vec3 after
    // `#define hd_vec3 hgi_vec3` (pxr/imaging/hdSt/codeGen.cpp:415). A GLSL
    // compiler sees the declaration after the define; here the type is
    // resolved for the checker and the name is emitted as a WGSL alias so a
    // host declaration of type hd_vec3 is valid too.
    const aliases = new Map<string, string>()
    const typed = (input.globals ?? []).map(g => {
      const resolved = macroTypeName(pp.defines, g.type)
      if (resolved === undefined) return g
      aliases.set(g.type, resolved)
      return { ...g, type: resolved }
    })
    const globals = typed.map(g => {
      if (typeof g.arraySize !== 'string' || g.arraySize === 'runtime') return g
      const name = g.arraySize
      const v = /^\d+$/.test(name) ? Number(name) : macroIntValue(pp.defines, name)
      if (v === undefined) throw new PreprocessError(`array size '${name}' of interface symbol ${g.name} is not an integer macro`)
      if (!/^\d+$/.test(name)) consts.set(name, v)
      return { ...g, arraySize: v }
    })
    const unit = parse(pp.tokens)
    const checked = check(unit, {
      stage: input.stage,
      externals: globals,
      externalStructs: input.structs ?? [],
      externalFunctions: input.functions ?? [],
      providedStructs: input.providedStructs ?? [],
      allowUndefinedFunctions: input.mode === 'section',
    })
    for (const d of checked.diagnostics) diagnostics.push(d)
    const emitted = emit(checked, { stage: input.stage, ...(input.autoBindingStart !== undefined ? { autoBindingStart: input.autoBindingStart } : {}) })
    for (const d of emitted.diagnostics) diagnostics.push(d)
    const constSrc = [...consts].map(([k, v]) => `const ${k} = ${v};\n`).join('')
      + [...aliases].map(([k, v]) => `alias ${k} = ${_wgslAliasTarget(v)};\n`).join('')
    emitted.body = constSrc + emitted.body
    const wgsl = `${emitted.directives.join('\n')}\n\n${emitted.body}`
    return {
      ok: true,
      wgsl,
      directives: emitted.directives,
      body: emitted.body,
      diagnostics,
      nameMap: checked.nameMap,
      initGlobalsFunction: emitted.initGlobalsFunction,
      autoBindings: emitted.autoBindings,
      stubbedFunctions: checked.stubs.map(s => s.name),
      writtenGlobals: checked.globals.flatMap(g => g.external && g.sym.written ? [g.external.name] : []),
    }
  } catch (e) {
    if (e instanceof LexError || e instanceof PreprocessError || e instanceof CheckError || e instanceof EmitError) {
      return fail(e.message, e.loc)
    }
    if (e instanceof ParseError) return fail(e.message.replace(/^[^:]+:\d+:\d+: /, ''), e.loc)
    throw e
  }
}

export function formatDiagnostic(d: Diagnostic): string {
  return `${d.loc ? `${formatLoc(d.loc)}: ` : ''}${d.severity}: ${d.message}`
}
