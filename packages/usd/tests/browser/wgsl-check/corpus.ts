// Ported from OpenUSD 26.11.1: pxr/imaging/hdSt/testenv/testHdStDepthBias.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Translation corpus for the WGSL check: glslfx sections (section mode) and
// codegen-assembled programs captured from the OpenUSD 26.11.1 reference build
// (program mode), translated with the GLSL-to-WGSL translator. Tooling, not
// library code; plain TypeScript that Node runs directly (type stripping).
//
// Section mode follows packages/usd/docs/imaging-i1.md section 3.1: one
// section with a prelude of stub declarations, under named define sets (the
// code generator's base defines, plus each define set of a captured program
// that contains the section). The stubs are
// - function prototypes collected from every hdSt section and from the code
//   generator's part of every captured program (declared-only functions the
//   section calls become stubs returning zero, reported by the translator);
// - struct definitions from the same places;
// - the stage interface of the captured programs (read from the generated
//   MSL's ProgramScope members), as module-scope variables;
// - GLSL built-ins of stages WebGPU lacks (geometry, tessellation), as
//   module-scope variables, reported as unsupported.
//
// Program mode translates each captured stage program (the code generator's
// GLSL, as HDST_DUMP_SHADER_SOURCE prints it) with its own MSL-derived
// interface; testHdStDepthBias's programs also go through
// HgiWebGPUShaderGenerator in the harness page (see run.mjs).

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { FunctionDecl, TypeSpec } from '../../../pxr/imaging/hgiWebGPU/src/glsl/ast.ts'
import { tokenize } from '../../../pxr/imaging/hgiWebGPU/src/glsl/lexer.ts'
import { isBasicTypeName } from '../../../pxr/imaging/hgiWebGPU/src/glsl/types.ts'
import { parse } from '../../../pxr/imaging/hgiWebGPU/src/glsl/parser.ts'
import { GLSL_PRELUDE } from '../../../pxr/imaging/hgiWebGPU/src/glsl/prelude.ts'
import { preprocess } from '../../../pxr/imaging/hgiWebGPU/src/glsl/preprocessor.ts'
import {
  type ExternalGlobal, type ExternalStruct, formatDiagnostic, type GlslStage, translateGlslToWgsl,
} from '../../../pxr/imaging/hgiWebGPU/src/glsl/translator.ts'

export interface GlslfxSection {
  file: string // e.g. mesh.glslfx
  name: string
  line: number // line of the `-- glsl` header
  text: string // with HioGlslfx's `// line N "file"` marker
  stage: GlslStage
  /** The `-- layout` section of the same name, if any (HioGlslfxResourceLayout input). */
  layout?: string
}

/** The glsl sections of one glslfx file, as HioGlslfx splits them (pxr/imaging/hio/glslfx.cpp:406-475). */
export function readGlslfxSections(file: string, source: string): GlslfxSection[] {
  const out: GlslfxSection[] = []
  const layouts = new Map<string, string>()
  let layoutName: string | null = null
  const lines = source.split('\n')
  let cur: GlslfxSection | null = null
  lines.forEach((l, k) => {
    const lineNo = k + 1
    if (l.startsWith('---')) return // comment
    if (l.startsWith('--')) {
      const toks = l.trim().split(/\s+/)
      cur = null
      layoutName = toks[1] === 'layout' ? (toks[2] ?? null) : null
      if (layoutName) layouts.set(layoutName, '')
      if (toks[1] === 'glsl' && toks[2]) {
        cur = { file, name: toks[2], line: lineNo, text: `// line ${lineNo} "${file}"\n`, stage: stageOfSection(toks[2]) }
        out.push(cur)
      }
      return
    }
    if (cur) (cur as GlslfxSection).text += `${l}\n`
    else if (layoutName) layouts.set(layoutName, `${layouts.get(layoutName)}${l}\n`)
  })
  for (const sec of out) {
    const l = layouts.get(sec.name)
    if (l) sec.layout = l
  }
  return out
}

/**
 * Module-scope symbols a `-- layout` section declares, as the code generator
 * turns HioGlslfxResourceLayout elements into stage interface entries
 * (pxr/imaging/hio/glslfxResourceLayout.cpp); uniform block and buffer
 * members are read unqualified in the GLSL. Array sizes that name a define
 * the set lacks take `sizes`.
 */
export function layoutInterface(layout: string, sizes: Record<string, string>): { globals: ExternalGlobal[]; structs: ExternalStruct[] } {
  const globals: ExternalGlobal[] = []
  const structs: ExternalStruct[] = []
  let elems: unknown[]
  try {
    elems = JSON.parse(layout.replace(/\/\/.*$/gm, '')) as unknown[]
  } catch {
    return { globals, structs }
  }
  const size = (v: unknown): number => {
    const t = String(v)
    if (/^\d+$/.test(t)) return Number(t)
    if (t === 'gl_MaxPatchVertices') return 32
    return Number(sizes[t] ?? 16)
  }
  const members = (list: unknown[]): { name: string; type: string; arraySize?: number }[] =>
    list.filter(Array.isArray).map(m => {
      const [type, name, arr] = m as string[]
      return arr && arr !== '[]' ? { name: name as string, type: type as string, arraySize: size(arr) } : { name: name as string, type: type as string }
    })
  for (const e of elems) {
    if (!Array.isArray(e)) continue
    const kind = String(e[0])
    if ((kind === 'in' || kind === 'out') && e.length >= 3 && typeof e[2] === 'string') {
      globals.push({ name: e[2], type: String(e[1]), space: 'private' })
    } else if ((kind === 'in array' || kind === 'out array') && e.length >= 4) {
      globals.push({ name: String(e[2]), type: String(e[1]), arraySize: size(e[3]), space: 'private' })
    } else if (kind === 'in block' || kind === 'out block') {
      const name = `${e[1]}_${e[2]}`
      structs.push({ name, fields: members(e.slice(3)) })
      globals.push({ name: String(e[2]), type: name, space: 'private' })
    } else if (kind === 'in block array' || kind === 'out block array') {
      const name = `${e[1]}_${e[2]}`
      structs.push({ name, fields: members(e.slice(4)) })
      globals.push({ name: String(e[2]), type: name, arraySize: size(e[3]), space: 'private' })
    } else if (kind === 'uniform block') {
      for (const m of members(e.slice(3))) globals.push({ ...m, space: 'private' })
    } else if (kind.startsWith('buffer')) {
      for (const m of (e.slice(3) as unknown[]).filter(Array.isArray) as string[][]) {
        const [type, name, arr] = m as [string, string, string | undefined]
        const atomic = type === 'atomic_int' || type === 'atomic_uint'
        const g: ExternalGlobal = { name, type: atomic ? (type === 'atomic_int' ? 'int' : 'uint') : type, space: 'storage', access: kind.includes('readWrite') ? 'read_write' : 'read' }
        if (atomic) g.atomic = true
        // buffer members are bound as arrays (hgiMetal binds `device T*`)
        g.arraySize = arr && arr !== '[]' ? size(arr) : 'runtime'
        globals.push(g)
      }
    }
  }
  return { globals, structs }
}

/** Stage inferred from a section name, as the I-1 survey does (imaging-i1.md section 2). */
export function stageOfSection(name: string): GlslStage {
  const n = name
  if (/PostTessControl/.test(n)) return 'postTessControl'
  if (/PostTessVertex/.test(n)) return 'postTessVertex'
  if (/TessControl/.test(n)) return 'tessControl'
  if (/TessEval/.test(n)) return 'tessEval'
  if (/Geometry/.test(n)) return 'geometry'
  if (/(^|\.)Vertex(\.|$)/.test(n)) return 'vertex'
  if (/(^|\.)Fragment(\.|$)/.test(n)) return 'fragment'
  if (/(^|\.)Compute(\.|$)/.test(n)) return 'compute'
  return 'library'
}

export interface CapturedProgram {
  id: string // e.g. depthBias/program1_shader3_FRAGMENT_SHADER
  stage: 'COMPUTE' | 'VERTEX' | 'POST_TESS_VERTEX' | 'FRAGMENT'
  glsl: string
  /** The code generator's part (before the first section marker). */
  codegen: string
  defines: Record<string, string>
  /** Sections the program contains, by `file:line` of their marker. */
  markers: Set<string>
  globals: ExternalGlobal[]
  structs: ExternalStruct[]
  /** Only the interface is known (no GLSL dump). */
  interfaceOnly?: boolean
}

/** Programs printed by HDST_DUMP_SHADER_SOURCE (stdout.txt), paired with the MSL files HDST_DUMP_SHADER_SOURCEFILE wrote. */
export function readCapturedPrograms(dir: string, label: string): CapturedProgram[] {
  const stdout = readFileSync(path.join(dir, 'stdout.txt'), 'utf8').split('\n')
  const out: CapturedProgram[] = []
  for (let i = 0; i < stdout.length; i++) {
    const m = /^--------- ([A-Z_]+) ----------$/.exec(stdout[i] as string)
    if (!m) continue
    let j = i + 1
    const body: string[] = []
    while (j < stdout.length && stdout[j] !== '---------------------------') body.push(stdout[j++] as string)
    const w = /^Write (\S+)\.glsl/.exec(stdout[j + 1] ?? '')
    i = j
    if (!w) continue
    const stage = (m[1] as string).replace(/^GL_/, '').replace(/_SHADER$/, '') as CapturedProgram['stage']
    const glsl = body.join('\n') + '\n'
    const first = glsl.search(/^\/\/ line \d+ "/m)
    const codegen = first < 0 ? glsl : glsl.slice(0, first)
    const defines: Record<string, string> = {}
    for (const d of codegen.matchAll(/^#define ([A-Za-z_]\w*)(?:[ \t]+(.*))?$/gm)) defines[d[1] as string] = (d[2] ?? '').trim()
    const markers = new Set<string>()
    for (const mk of glsl.matchAll(/^\/\/ line (\d+) "([^"]+)"/gm)) markers.add(`${mk[2]}:${mk[1]}`)
    const msl = readFileSync(path.join(dir, `${w[1]}.glsl`), 'utf8')
    const iface = mslInterface(msl, stage)
    out.push({ id: `${label}/${w[1]}`, stage, glsl, codegen, defines, markers, ...iface })
  }
  // Compute programs Storm builds outside the code generator (smooth
  // normals, quadrangulation, OpenSubdiv stencils: GL_COMPUTE_SHADER) are
  // not printed by HDST_DUMP_SHADER_SOURCE; only their interface is used.
  const seen = new Set(out.map(p => p.id))
  for (const f of readdirSync(dir).filter(n => /^program\d+_shader\d+_GL_COMPUTE_SHADER\.glsl$/.test(n))) {
    const id = `${label}/${f.replace(/\.glsl$/, '')}`
    if (seen.has(id)) continue
    const iface = mslInterface(readFileSync(path.join(dir, f), 'utf8'), 'COMPUTE')
    out.push({ id, stage: 'COMPUTE', glsl: '', codegen: '', defines: {}, markers: new Set(), interfaceOnly: true, ...iface })
  }
  return out
}

/**
 * The stage interface of a captured program, from the ProgramScope member
 * declarations hgiMetal's generator wrote (pxr/imaging/hgiMetal/
 * shaderGenerator.mm:1464-1658). Buffers become storage bindings (read-only
 * for `constant`, read-write for `device`), everything else module-scope
 * private variables.
 */
export function mslInterface(msl: string, stage: string): { globals: ExternalGlobal[]; structs: ExternalStruct[] } {
  const globals: ExternalGlobal[] = []
  const structs: ExternalStruct[] = []
  const scopeStructs = /Scope Structs \/\/\/\/\/\/\/\/\n([\s\S]*?)\/\/ \/\/\/\/\/\/\/\/ Scope Member Declarations/.exec(msl)?.[1] ?? ''
  for (const s of scopeStructs.matchAll(/struct (\w+) \{\n([\s\S]*?)\};/g)) {
    const fields = [...(s[2] as string).matchAll(/^(\w+) (\w+)(?:\[(\w+)\])?;/gm)].map(f => ({ name: f[2] as string, type: mslType(f[1] as string), ...(f[3] ? { arraySize: Number(f[3]) } : {}) }))
    structs.push({ name: s[1] as string, fields })
  }
  const members = /Scope Member Declarations \/\/\/\/\/\/\/\/\n([\s\S]*?)\/\/ \/\/\/\/\/\/\/\/ Scope Function Definitions/.exec(msl)?.[1] ?? ''
  let binding = 0
  for (const line of members.split('\n')) {
    const t = line.replace(/\[\[[^\]]*\]\]/g, '').trim()
    if (!t || t.startsWith('//')) continue
    let m = /^(constant|device) (\w+)([*&]) (\w+);$/.exec(t)
    if (m) {
      const g: ExternalGlobal = { name: m[4] as string, type: mslType(m[2] as string), space: 'storage', access: m[1] === 'device' ? 'read_write' : 'read', binding: { group: 0, binding: binding++ } }
      if (m[3] === '*') g.arraySize = 'runtime'
      globals.push(g)
      continue
    }
    m = /^(\w+) (\w+)(?:\[(\w+)\])?;$/.exec(t)
    if (m) {
      if (m[2] === 'discarded_fragment') continue // hgiMetal's own bookkeeping
      const g: ExternalGlobal = { name: m[2] as string, type: mslType(m[1] as string), space: 'private' }
      if (m[3]) g.arraySize = /^\d+$/.test(m[3]) ? Number(m[3]) : m[3] === 'VERTEX_CONTROL_POINTS_PER_PATCH' ? 3 : m[3]
      globals.push(g)
    }
  }
  void stage
  return { globals, structs }
}

function mslType(t: string): string {
  if (t === 'hd_vec3') return 'hgi_vec3'
  if (t === 'hd_ivec3') return 'hgi_ivec3'
  if (t === 'hd_mat3') return 'hgi_mat3'
  return t
}

// ---------------------------------------------------------------------------
// section environment

export interface DefineSet {
  name: string
  defines: Record<string, string>
}

/** Defines the code generator always writes (pxr/imaging/hdSt/codeGen.cpp:2154-2165). */
export const BASE_DEFINES: Record<string, string> = { HD_SHADER_API: '3', MAT4: 'mat4' }

/** GLSL built-ins of stages and features WebGPU lacks, for section mode only. */
const UNSUPPORTED_BUILTINS: ExternalGlobal[] = [
  { name: 'gl_TessCoord', type: 'vec3', space: 'private' },
  { name: 'gl_InvocationID', type: 'int', space: 'private' },
  { name: 'gl_PatchVerticesIn', type: 'int', space: 'private' },
  { name: 'gl_TessLevelOuter', type: 'float', arraySize: 4, space: 'private' },
  { name: 'gl_TessLevelInner', type: 'float', arraySize: 2, space: 'private' },
  { name: 'gl_PrimitiveIDIn', type: 'int', space: 'private' },
  { name: 'gl_PointCoord', type: 'vec2', space: 'private' },
  { name: 'gl_PointSize', type: 'float', space: 'private' },
  { name: 'gl_in', type: 'gl_PerVertex', arraySize: 4, space: 'private' },
  { name: 'gl_out', type: 'gl_PerVertex', arraySize: 4, space: 'private' },
]
const GL_PER_VERTEX: ExternalStruct = { name: 'gl_PerVertex', fields: [{ name: 'gl_Position', type: 'vec4' }, { name: 'gl_PointSize', type: 'float' }, { name: 'gl_ClipDistance', type: 'float', arraySize: 8 }] }

/** Built-ins every stage may read in section mode (supplied by the stage interface in program mode). */
const COMMON_BUILTINS: ExternalGlobal[] = [
  { name: 'gl_Position', type: 'vec4', space: 'private' },
  { name: 'gl_FragCoord', type: 'vec4', space: 'private' },
  { name: 'gl_FrontFacing', type: 'bool', space: 'private' },
  { name: 'gl_FragDepth', type: 'float', space: 'private' },
  { name: 'gl_PrimitiveID', type: 'uint', space: 'private' },
  { name: 'gl_ClipDistance', type: 'float', arraySize: 8, space: 'private' },
]

function typeText(t: TypeSpec): string | null {
  if (t.arraySizes.length) return null
  return t.name
}

function prototypeText(f: FunctionDecl): string | null {
  if (f.templateParams.length) return null
  const ret = typeText(f.returnType)
  if (!ret) return null
  const params: string[] = []
  for (const p of f.params) {
    if (p.arraySizes.length || p.type.arraySizes.length) return null
    // keep `T()` default arguments (the code generator's `vec2 uv = vec2()`)
    const dv = p.defaultValue
    const def = dv && dv.kind === 'call' && dv.args.length === 0 ? ` = ${dv.callee}()` : ''
    if (dv && !def) return null
    params.push(`${p.qualifier === 'in' ? '' : `${p.qualifier} `}${p.type.name} ${p.name || 'p'}${def}`)
  }
  return `${ret} ${f.name}(${params.join(', ')});`
}

/** Struct definitions ordered so each follows the structs it uses (GLSL needs declaration before use). */
function orderStructs(list: [string, string][]): string[] {
  const byName = new Map(list)
  const out: string[] = []
  const done = new Set<string>()
  const visit = (n: string, stack: Set<string>): void => {
    if (done.has(n) || stack.has(n)) return
    stack.add(n)
    const src = byName.get(n) as string
    for (const m of src.replace(/^struct\s+\w+/, '').matchAll(/\b(\w+)\b/g)) if (byName.has(m[1] as string)) visit(m[1] as string, stack)
    done.add(n)
    out.push(src)
  }
  for (const [n] of list) visit(n, new Set())
  return out
}

const STRUCT_RE = /struct\s+(\w+)\s*\{[^{}]*\}\s*;/g

/** Prototypes and structs of a GLSL text under a define set (lenient: unparsable texts contribute nothing). */
interface Proto {
  name: string
  text: string
  types: string[]
}

function harvest(text: string, defines: Record<string, string>, knownTypes: Set<string>): { protos: Map<string, Proto>; structs: Map<string, string> } {
  const protos = new Map<string, Proto>()
  const structs = new Map<string, string>()
  try {
    const toks = [...tokenize(GLSL_PRELUDE, '<prelude>').slice(0, -1), ...tokenize(text, '<harvest>')]
    const pp = preprocess(toks, { defines })
    const expanded = pp.tokens.map(t => t.text).join(' ')
    for (const s of expanded.matchAll(STRUCT_RE)) {
      if (s[1]?.startsWith('hgi_')) continue
      if (/\[\s*[A-Za-z_]\w*\s*\]/.test(s[0])) continue // array size from a define this set lacks
      try {
        parse(tokenize(s[0], '<struct>'), knownTypes) // drop non-GLSL (e.g. Metal) structs
        structs.set(s[1] as string, s[0])
      } catch {
        // not GLSL
      }
    }
    const unit = parse(pp.tokens, knownTypes)
    for (const d of unit.decls) {
      if (d.kind === 'global' && d.qualifiers.includes('const') && d.type.arraySizes.length === 0) {
        // literal constants other sections declare (const float EPS = 1e-6)
        for (const dec of d.declarators) {
          const init = dec.init
          if (init?.kind === 'literal' && !dec.arraySizes.length) protos.set(`const ${dec.name}`, { name: dec.name, text: `const ${d.type.name} ${dec.name} = ${init.text};`, types: [d.type.name] })
        }
      }
      if (d.kind === 'global' && !d.qualifiers.includes('const') && d.type.arraySizes.length === 0) {
        for (const dec of d.declarators) {
          if (dec.init || dec.arraySizes.length) continue
          protos.set(`var ${dec.name}`, { name: dec.name, text: `${d.type.name} ${dec.name};`, types: [d.type.name] })
        }
      }
      if (d.kind !== 'function') continue
      const p = prototypeText(d)
      if (p) protos.set(`${d.name}(${d.params.map(x => `${x.qualifier} ${x.type.name}`).join(',')})`, { name: d.name, text: p, types: [d.returnType.name, ...d.params.map(x => x.type.name)] })
    }
  } catch {
    // sections that need their environment to parse contribute no prototypes
  }
  return { protos, structs }
}

export interface SectionCase {
  section: GlslfxSection
  defineSet: DefineSet
  result: ReturnType<typeof translateGlslToWgsl>
  /** The section uses a stage WebGPU lacks. */
  unsupportedStage: boolean
}

export interface Corpus {
  sections: GlslfxSection[]
  programs: CapturedProgram[]
}

export function loadCorpus(openusd: string, nativeDirs: Record<string, string>): Corpus {
  const shaderDir = path.join(openusd, 'pxr/imaging/hdSt/shaders')
  const sections: GlslfxSection[] = []
  for (const f of readdirSync(shaderDir).filter(n => n.endsWith('.glslfx')).sort()) {
    sections.push(...readGlslfxSections(f, readFileSync(path.join(shaderDir, f), 'utf8')))
  }
  const programs: CapturedProgram[] = []
  for (const [label, dir] of Object.entries(nativeDirs)) programs.push(...readCapturedPrograms(dir, label))
  return { sections, programs }
}

const UNSUPPORTED_STAGES = new Set<GlslStage>(['geometry', 'tessControl', 'tessEval', 'postTessControl'])

/** Translate every section under its define sets. */
export function translateSections(corpus: Corpus): SectionCase[] {
  const { sections, programs } = corpus
  // known struct names (for lenient parsing)
  const known = new Set<string>()
  for (const t of [...sections.map(s => s.text), ...programs.map(p => p.codegen)]) for (const m of t.matchAll(/struct\s+(\w+)/g)) known.add(m[1] as string)
  for (const p of programs) for (const s of p.structs) known.add(s.name)
  known.add('gl_PerVertex')

  // define sets per section
  const setsFor = new Map<GlslfxSection, DefineSet[]>()
  for (const s of sections) {
    const sets: DefineSet[] = [{ name: 'base', defines: BASE_DEFINES }]
    const seen = new Set<string>()
    for (const p of programs) {
      if (!p.markers.has(`${s.file}:${s.line}`)) continue
      const key = JSON.stringify(Object.entries(p.defines).sort())
      if (seen.has(key)) continue
      seen.add(key)
      sets.push({ name: p.id, defines: { ...p.defines } })
    }
    setsFor.set(s, sets)
  }

  // environment per define set, cached
  // Stub declarations are harvested with every define the captured programs
  // use as a fallback (array sizes such as HD_INSTANCE_INDEX_WIDTH), the
  // define set's own values winning; the section itself sees only the set.
  const fallback: Record<string, string> = {}
  for (const p of programs) for (const [k, v] of Object.entries(p.defines)) if (!(k in fallback) && /^\w*$/.test(v)) fallback[k] = v
  // function templates the code generator writes (InterpolatePrimvar, codeGen.cpp:2528-2540)
  const templates = new Set<string>()
  for (const p of programs) {
    for (const m of p.codegen.matchAll(/^template <typename T>\n[^{]*\{[^}]*\}\n/gm)) templates.add(m[0])
  }
  const envCache = new Map<string, { protos: Proto[]; structs: Map<string, string>; templates: string[] }>()
  const envFor = (ds: DefineSet): { protos: Proto[]; structs: Map<string, string>; templates: string[] } => {
    const key = ds.name
    const hit = envCache.get(key)
    if (hit) return hit
    const protos = new Map<string, Proto>()
    const structs = new Map<string, string>()
    for (const t of [...sections.map(s => s.text), ...programs.map(p => p.codegen)]) {
      const h = harvest(t, { ...Object.fromEntries(sectionMacros), ...fallback, ...ds.defines }, known)
      // first declaration wins, except that one with default arguments replaces one without
      for (const [k, v] of h.protos) if (!protos.has(k) || (v.text.includes('=') && !(protos.get(k) as Proto).text.includes('='))) protos.set(k, v)
      for (const [k, v] of h.structs) if (!structs.has(k)) structs.set(k, v)
    }
    const env = { protos: [...protos.values()], structs, templates: [...templates] }
    envCache.set(key, env)
    return env
  }

  // stage interfaces: union per stage kind, first declaration wins
  const ifaceFor = (stage: GlslStage): { globals: ExternalGlobal[]; structs: ExternalStruct[] } => {
    const order: CapturedProgram['stage'][] = stage === 'vertex' ? ['VERTEX', 'POST_TESS_VERTEX', 'FRAGMENT', 'COMPUTE']
      : stage === 'postTessVertex' ? ['POST_TESS_VERTEX', 'VERTEX', 'FRAGMENT', 'COMPUTE']
        : stage === 'compute' ? ['COMPUTE', 'VERTEX', 'FRAGMENT', 'POST_TESS_VERTEX']
          : ['FRAGMENT', 'VERTEX', 'POST_TESS_VERTEX', 'COMPUTE']
    const g = new Map<string, ExternalGlobal>()
    const st = new Map<string, ExternalStruct>()
    for (const kind of order) {
      for (const p of programs.filter(x => x.stage === kind)) {
        for (const x of p.globals) if (!g.has(x.name)) g.set(x.name, { ...x, space: x.space === 'storage' ? 'storage' : 'private' })
        for (const x of p.structs) if (!st.has(x.name)) st.set(x.name, x)
      }
    }
    for (const b of [...COMMON_BUILTINS, ...UNSUPPORTED_BUILTINS]) if (!g.has(b.name)) g.set(b.name, b)
    st.set(GL_PER_VERTEX.name, GL_PER_VERTEX)
    let binding = 0
    const globals = [...g.values()].map(x => {
      if (x.space !== 'storage') {
        const { binding: _b, ...rest } = x
        void _b
        return rest
      }
      return { ...x, binding: { group: 0, binding: binding++ } }
    })
    return { globals, structs: [...st.values()] }
  }

  const sectionMacros = new Map<string, string>()
  for (const s of sections) for (const m of s.text.matchAll(/^\s*#define\s+([A-Za-z_]\w*)[ \t]+(\S[^\n]*)$/gm)) if (!sectionMacros.has(m[1] as string)) sectionMacros.set(m[1] as string, (m[2] as string).replace(/\/\/.*$/, '').trim())

  const out: SectionCase[] = []
  for (const s of sections) {
    for (const ds of setsFor.get(s) as DefineSet[]) {
      const env = envFor(ds)
      const iface = ifaceFor(s.stage)
      // Structs and globals the section declares itself are not stubbed.
      const own = new Set([...s.text.matchAll(/struct\s+(\w+)/g)].map(m => m[1] as string))
      const usesOwn = (src: string): boolean => [...src.replace(/^struct\s+\w+/, '').matchAll(/\b(\w+)\b/g)].some(m => own.has(m[1] as string))
      const envStructs = [...env.structs].filter(([n, src]) => !own.has(n) && !usesOwn(src))
      const structSrc = orderStructs(envStructs).join('\n')
      const ownGlobals = new Set([...s.text.matchAll(/^(?:(?:in|out|flat|uniform|const)\s+)*\w+\s+(\w+)\s*(?:\[[^\]]*\])?\s*(?:=[^;]*)?;/gm)].map(m => m[1] as string))
      // the section's own layout first, then the captured programs' interfaces
      const lay = s.layout ? layoutInterface(s.layout, { ...fallback, ...ds.defines }) : { globals: [], structs: [] }
      const layNames = new Set(lay.globals.map(g => g.name))
      let nextBinding = 0
      const merged: ExternalGlobal[] = [
        ...lay.globals.map(g => (g.space === 'storage' ? { ...g, binding: { group: 1, binding: nextBinding++ } } : g)),
        ...iface.globals.filter(g => !layNames.has(g.name)),
      ]
      const globals = merged.filter(g => !ownGlobals.has(g.name) && !own.has(g.type)).map(g => {
        // array sizes named by a define this set lacks take the captured value
        if (typeof g.arraySize !== 'string' || g.arraySize === 'runtime' || g.arraySize in ds.defines) return g
        return { ...g, arraySize: Number(fallback[g.arraySize] ?? 8) }
      })
      const layStructNames = new Set(lay.structs.map(x => x.name))
      const structs = [...lay.structs, ...iface.structs.filter(x => !layStructNames.has(x.name))].filter(x => !own.has(x.name) && !env.structs.has(x.name))
      // object-like macros other sections define (PI, EPS, ...), when this section uses but neither it nor the set defines them
      const envMacros = [...sectionMacros].filter(([k]) => !(k in ds.defines) && new RegExp(`\\b${k}\\b`).test(s.text) && !new RegExp(`(#define|\\w)\\s+${k}\\s*[=;\\[(]`).test(s.text)).map(([k, v]) => `#define ${k} ${v}`)
      const ownFns = new Set([...harvest(s.text, { ...fallback, ...ds.defines }, known).protos.values()].map(p => p.name))
      for (const m of s.text.matchAll(/^[A-Za-z_][\w ]*?\b(\w+)\s*\(/gm)) ownFns.add(m[1] as string)
      // accessors no captured program has, typed from the section's own use (`float r = HdGet_x(i);`)
      const declared = (n: string): boolean => env.protos.some(p => p.name === n) || ownFns.has(n)
      const inferred = [...s.text.matchAll(/\b(float|int|uint|bool|[iu]?vec[234]|mat[234]|MAT4)\s+\w+\s*=\s*(HdGet\w*_\w+)\s*\(([^()]*)\)/g)]
        .filter(m => !declared(m[2] as string))
        .map(m => `${m[1]} ${m[2]}(${(m[3] as string).trim() ? (m[3] as string).split(',').map((_, k) => `int a${k}`).join(', ') : ''});`)
      // the shader generator's texture accessors (hgiVulkan/shaderSection.cpp:319-435), as a 2D float texture
      for (const m of new Set([...s.text.matchAll(/\bHgi(Get|GetSize|TextureLod|TexelFetch|Set)_(\w+)\s*\(/g)].map(x => `${x[1]}:${x[2]}`))) {
        const [k, n] = m.split(':') as [string, string]
        const decl: Record<string, string> = { Get: `vec4 HgiGet_${n}(vec2 uv);`, GetSize: `ivec2 HgiGetSize_${n}();`, TextureLod: `vec4 HgiTextureLod_${n}(vec2 uv, float lod);`, TexelFetch: `vec4 HgiTexelFetch_${n}(ivec2 uv);`, Set: `void HgiSet_${n}(ivec2 uv, vec4 data);` }
        inferred.push(decl[k] as string)
      }
      const defines = [...Object.entries(ds.defines).map(([k, v]) => `#define ${k} ${v}`), ...envMacros].join('\n')
      // prototypes whose types are all available and not the section's own
      const available = new Set([...envStructs.map(([n]) => n), ...structs.map(x => x.name)])
      const protoSrc = [...new Set(inferred), ...env.protos.filter(p => !ownFns.has(p.name) && !ownGlobals.has(p.name) && !globals.some(g => g.name === p.name)).filter(p => p.types.every(t => isBasicTypeName(t) || available.has(t) || /^hgi_/.test(t))).map(p => p.text)].join('\n')
      const result = translateGlslToWgsl({
        stage: s.stage,
        declarations: `${defines}\n${structSrc}\n${protoSrc}\n${ownFns.has('InterpolatePrimvar') ? '' : env.templates.join('')}`,
        code: s.text,
        globals,
        structs,
        mode: 'section',
        fileName: s.file,
      })
      out.push({ section: s, defineSet: ds, result, unsupportedStage: UNSUPPORTED_STAGES.has(s.stage) })
    }
  }
  return out
}

/** Translate each captured program with its own interface. */
export function translatePrograms(corpus: Corpus): { program: CapturedProgram; result: ReturnType<typeof translateGlslToWgsl> }[] {
  return corpus.programs.filter(p => !p.interfaceOnly).map(p => ({
    program: p,
    result: translateGlslToWgsl({
      stage: p.stage === 'COMPUTE' ? 'compute' : p.stage === 'FRAGMENT' ? 'fragment' : p.stage === 'VERTEX' ? 'vertex' : 'postTessVertex',
      code: p.glsl,
      globals: p.globals,
      structs: p.structs,
      fileName: p.id,
    }),
  }))
}

export { formatDiagnostic }
