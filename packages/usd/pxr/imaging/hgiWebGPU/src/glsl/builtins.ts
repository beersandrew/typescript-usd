// GLSL built-in function table for the GLSL-to-WGSL translator (no upstream
// counterpart; see lexer.ts).
//
// Signatures follow the GLSL 4.50 specification, chapter 8, over genType
// families. Each entry gives its WGSL form: a WGSL built-in name, an operator
// template (`$0 < $1`), or a helper function from the translator's WGSL
// helper library (helpers.ts) for functions WGSL lacks (`mod`, `inverse`,
// `isnan`, ...). Texture, image, atomic and stage-only functions are resolved
// by the checker directly (checker.ts) because they take handles or
// references.

import { type GType, type ScalarKind, mat, scalar, vec } from './types.ts'

export interface BuiltinOverload {
  name: string
  params: GType[]
  ret: GType
  /** WGSL form: `fn:name` (call), `op:template` ($0..$n), `helper:name` (helper library). */
  wgsl: string
}

type Kind = ScalarKind

interface Family {
  kinds: Kind[]
  sigs: string[] // "P1 P2 : R"
  wgsl: string
  /** Allowed vector sizes (default 1..4). */
  sizes?: number[]
}

const F: Kind[] = ['float']
const FIU: Kind[] = ['float', 'int', 'uint']
const FI: Kind[] = ['float', 'int']
const IU: Kind[] = ['int', 'uint']

const TABLE: Record<string, Family[]> = {}
function def(name: string, kinds: Kind[], sigs: string[], wgsl: string, sizes?: number[]): void {
  ;(TABLE[name] ??= []).push(sizes ? { kinds, sigs, wgsl, sizes } : { kinds, sigs, wgsl })
}

// 8.1 angle and trigonometry
for (const n of ['sin', 'cos', 'tan', 'asin', 'acos', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'radians', 'degrees']) def(n, F, ['G : G'], `fn:${n}`)
def('atan', F, ['G : G'], 'fn:atan')
def('atan', F, ['G G : G'], 'fn:atan2')
// 8.2 exponential
for (const n of ['exp', 'log', 'exp2', 'log2', 'sqrt']) def(n, F, ['G : G'], `fn:${n}`)
def('pow', F, ['G G : G'], 'fn:pow')
def('inversesqrt', F, ['G : G'], 'fn:inverseSqrt')
// 8.3 common
def('abs', FI, ['G : G'], 'fn:abs')
def('sign', FI, ['G : G'], 'fn:sign')
for (const n of ['floor', 'trunc', 'ceil', 'fract']) def(n, F, ['G : G'], `fn:${n}`)
def('round', F, ['G : G'], 'fn:round')
def('roundEven', F, ['G : G'], 'fn:round')
def('mod', F, ['G G : G', 'G S : G'], 'helper:mod')
def('min', FIU, ['G G : G', 'G S : G'], 'fn:min')
def('max', FIU, ['G G : G', 'G S : G'], 'fn:max')
def('clamp', FIU, ['G G G : G', 'G S S : G'], 'fn:clamp')
def('mix', F, ['G G G : G', 'G G S : G'], 'fn:mix')
def('mix', FIU.concat(['bool']), ['G G Gb : G'], 'op:select($0, $1, $2)')
def('step', F, ['G G : G', 'S G : G'], 'fn:step')
def('smoothstep', F, ['G G G : G', 'S S G : G'], 'fn:smoothstep')
def('isnan', F, ['G : Gb'], 'helper:isnan')
def('isinf', F, ['G : Gb'], 'helper:isinf')
def('floatBitsToInt', F, ['G : Gi'], 'op:bitcast<$R>($0)')
def('floatBitsToUint', F, ['G : Gu'], 'op:bitcast<$R>($0)')
def('intBitsToFloat', ['int'], ['G : Gf'], 'op:bitcast<$R>($0)')
def('uintBitsToFloat', ['uint'], ['G : Gf'], 'op:bitcast<$R>($0)')
def('fma', F, ['G G G : G'], 'fn:fma')
// frexp(x, out exp): WGSL's frexp returns the fraction and exponent as a
// struct; the emitter assigns the exponent to the out argument (emit.ts).
def('frexp', F, ['G Gi : G'], 'out:frexp')
// 8.4 packing
def('packHalf2x16', F, ['v2 : u'], 'fn:pack2x16float')
def('unpackHalf2x16', F, ['u : v2'], 'fn:unpack2x16float')
def('packUnorm2x16', F, ['v2 : u'], 'fn:pack2x16unorm')
def('packSnorm2x16', F, ['v2 : u'], 'fn:pack2x16snorm')
def('unpackUnorm2x16', F, ['u : v2'], 'fn:unpack2x16unorm')
def('unpackSnorm2x16', F, ['u : v2'], 'fn:unpack2x16snorm')
def('packUnorm4x8', F, ['v4 : u'], 'fn:pack4x8unorm')
def('packSnorm4x8', F, ['v4 : u'], 'fn:pack4x8snorm')
def('unpackUnorm4x8', F, ['u : v4'], 'fn:unpack4x8unorm')
def('unpackSnorm4x8', F, ['u : v4'], 'fn:unpack4x8snorm')
// 8.5 geometric
def('length', F, ['G : S'], 'fn:length')
def('distance', F, ['G G : S'], 'fn:distance')
def('dot', F, ['G G : S'], 'fn:dot')
def('cross', F, ['v3 v3 : v3'], 'fn:cross')
def('normalize', F, ['V : V'], 'fn:normalize')
def('normalize', F, ['S : S'], 'op:sign($0)')
def('faceforward', F, ['V V V : V'], 'fn:faceForward')
def('reflect', F, ['V V : V'], 'fn:reflect')
def('refract', F, ['V V S : V'], 'fn:refract')
// 8.7 vector relational
for (const [n, op] of [['lessThan', '<'], ['lessThanEqual', '<='], ['greaterThan', '>'], ['greaterThanEqual', '>=']] as const) {
  def(n, FIU, ['V V : Vb'], `op:($0 ${op} $1)`, [2, 3, 4])
}
for (const [n, op] of [['equal', '=='], ['notEqual', '!=']] as const) {
  def(n, FIU.concat(['bool']), ['V V : Vb'], `op:($0 ${op} $1)`, [2, 3, 4])
}
def('any', ['bool'], ['V : b'], 'fn:any', [2, 3, 4])
def('all', ['bool'], ['V : b'], 'fn:all', [2, 3, 4])
def('not', ['bool'], ['V : V'], 'op:(!$0)', [2, 3, 4])
// 8.8 integer
def('bitfieldExtract', IU, ['G i i : G'], 'op:extractBits($0, u32($1), u32($2))')
def('bitfieldInsert', IU, ['G G i i : G'], 'op:insertBits($0, $1, u32($2), u32($3))')
def('bitfieldReverse', IU, ['G : G'], 'fn:reverseBits')
def('bitCount', IU, ['G : Gi'], 'op:$RC(countOneBits($0))')
def('findLSB', IU, ['G : Gi'], 'op:$RC(firstTrailingBit($0))')
def('findMSB', IU, ['G : Gi'], 'op:$RC(firstLeadingBit($0))')
// 8.13 derivatives (fragment); Safari needs derivative_uniformity off
// (packages/usd/docs/imaging-i1.md section 2.4), which the emitter writes.
for (const [g, w] of [['dFdx', 'dpdx'], ['dFdy', 'dpdy'], ['fwidth', 'fwidth'], ['dFdxFine', 'dpdxFine'], ['dFdyFine', 'dpdyFine'], ['dFdxCoarse', 'dpdxCoarse'], ['dFdyCoarse', 'dpdyCoarse'], ['fwidthFine', 'fwidthFine'], ['fwidthCoarse', 'fwidthCoarse']] as const) {
  def(g, F, ['G : G'], `fn:${w}`)
}

function tok(t: string, k: Kind, n: number): GType | null {
  switch (t) {
    case 'G': return vec(k, n)
    case 'V': return n === 1 ? null : vec(k, n)
    case 'S': return scalar(k)
    case 'Gb': return vec('bool', n)
    case 'Vb': return n === 1 ? null : vec('bool', n)
    case 'Gi': return vec('int', n)
    case 'Gu': return vec('uint', n)
    case 'Gf': return vec('float', n)
    case 'f': return scalar('float')
    case 'i': return scalar('int')
    case 'u': return scalar('uint')
    case 'b': return scalar('bool')
    case 'v2': return vec('float', 2)
    case 'v3': return vec('float', 3)
    case 'v4': return vec('float', 4)
  }
  throw new Error(`bad builtin pattern ${t}`)
}

const cache = new Map<string, BuiltinOverload[]>()

/** All concrete overloads of a GLSL built-in function, or undefined if not a table built-in. */
export function builtinOverloads(name: string): BuiltinOverload[] | undefined {
  const hit = cache.get(name)
  if (hit) return hit
  const fams = TABLE[name]
  if (!fams) return undefined
  const out: BuiltinOverload[] = []
  const seen = new Set<string>()
  for (const fam of fams) {
    for (const k of fam.kinds) {
      for (const n of fam.sizes ?? [1, 2, 3, 4]) {
        for (const sig of fam.sigs) {
          const [ps, r] = sig.split(':').map(s => s.trim()) as [string, string]
          const params = ps.split(/\s+/).filter(Boolean).map(p => tok(p, k, n))
          const ret = tok(r, k, n)
          if (ret === null || params.some(p => p === null)) continue
          const key = JSON.stringify([params, ret])
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ name, params: params as GType[], ret, wgsl: fam.wgsl })
        }
      }
    }
  }
  cache.set(name, out)
  return out
}

/** Matrix built-ins (resolved on the argument types directly). */
export function matrixBuiltin(name: string, args: GType[]): BuiltinOverload | undefined {
  const a = args[0]
  if (!a || a.k !== 'matrix') {
    if (name === 'outerProduct' && args.length === 2) {
      const [c, r] = args as [GType, GType]
      if (c.k === 'vector' && r.k === 'vector') {
        return { name, params: [vec('float', c.n), vec('float', r.n)], ret: mat(r.n, c.n), wgsl: 'helper:outerProduct' }
      }
    }
    return undefined
  }
  switch (name) {
    case 'transpose': return args.length === 1 ? { name, params: [a], ret: mat(a.r, a.c), wgsl: 'fn:transpose' } : undefined
    case 'determinant': return args.length === 1 && a.c === a.r ? { name, params: [a], ret: scalar('float'), wgsl: 'fn:determinant' } : undefined
    case 'inverse': return args.length === 1 && a.c === a.r ? { name, params: [a], ret: a, wgsl: 'helper:inverse' } : undefined
    case 'matrixCompMult': return args.length === 2 ? { name, params: [a, a], ret: a, wgsl: 'helper:matrixCompMult' } : undefined
  }
  return undefined
}

export const MATRIX_BUILTINS = new Set(['transpose', 'determinant', 'inverse', 'matrixCompMult', 'outerProduct'])

export const TEXTURE_BUILTINS = new Set([
  'texture', 'textureLod', 'textureGrad', 'texelFetch', 'textureSize', 'textureQueryLevels', 'textureOffset',
  'textureLodOffset', 'textureProj', 'textureGather', 'imageLoad', 'imageStore', 'imageSize',
])

export const ATOMIC_BUILTINS: Record<string, string> = {
  atomicAdd: 'atomicAdd', atomicMin: 'atomicMin', atomicMax: 'atomicMax', atomicAnd: 'atomicAnd',
  atomicOr: 'atomicOr', atomicXor: 'atomicXor', atomicExchange: 'atomicExchange', atomicCompSwap: 'atomicCompareExchangeWeak',
}

export const BARRIER_BUILTINS: Record<string, string> = {
  barrier: 'workgroupBarrier()',
  memoryBarrier: 'storageBarrier()',
  memoryBarrierBuffer: 'storageBarrier()',
  memoryBarrierShared: 'workgroupBarrier()',
  memoryBarrierImage: 'textureBarrier()',
  groupMemoryBarrier: 'workgroupBarrier()',
}

/** Stage built-ins WebGPU has no equivalent for; calls become no-ops with an "unsupported" diagnostic. */
export const UNSUPPORTED_STAGE_FUNCTIONS = new Set(['EmitVertex', 'EndPrimitive', 'EmitStreamVertex', 'EndStreamPrimitive'])

export function isBuiltinFunction(name: string): boolean {
  return name in TABLE || MATRIX_BUILTINS.has(name) || TEXTURE_BUILTINS.has(name) || name in ATOMIC_BUILTINS || name in BARRIER_BUILTINS || UNSUPPORTED_STAGE_FUNCTIONS.has(name)
}
