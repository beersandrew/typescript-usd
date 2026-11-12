// AST for the GLSL subset the translator accepts (no upstream counterpart; see
// lexer.ts). Expression nodes carry the checker's annotations (`ty`, the
// resolved symbol or overload) so the emitter needs no second analysis.

import type { SourceLoc } from './lexer.ts'
import type { GType } from './types.ts'

export interface TypeSpec {
  name: string
  /** Array dimensions written on the type (`float[3] x`). null = unsized. */
  arraySizes: (Expr | null)[]
  /** Inline struct definition (`struct S { ... } s;`). */
  struct?: StructDecl
  loc: SourceLoc
}

export interface Declarator {
  name: string
  arraySizes: (Expr | null)[]
  init: Expr | null
  loc: SourceLoc
  // checker annotations
  ty?: GType
  sym?: VarSymbol
}

export interface StructDecl {
  kind: 'struct'
  name: string
  fields: { type: TypeSpec; name: string; arraySizes: (Expr | null)[]; loc: SourceLoc }[]
  loc: SourceLoc
}

export interface ParamDecl {
  type: TypeSpec
  name: string
  arraySizes: (Expr | null)[]
  qualifier: 'in' | 'out' | 'inout'
  isConst: boolean
  defaultValue: Expr | null
  loc: SourceLoc
}

export interface FunctionDecl {
  kind: 'function'
  returnType: TypeSpec
  name: string
  params: ParamDecl[]
  body: BlockStmt | null
  templateParams: string[]
  loc: SourceLoc
}

export interface GlobalDecl {
  kind: 'global'
  qualifiers: string[]
  type: TypeSpec
  declarators: Declarator[]
  loc: SourceLoc
}

/** `in Block { ... } instance;` style interface block. */
export interface BlockDecl {
  kind: 'block'
  qualifiers: string[]
  blockName: string
  fields: StructDecl['fields']
  instance: string | null
  arraySizes: (Expr | null)[]
  loc: SourceLoc
}

export type TopLevel = StructDecl | FunctionDecl | GlobalDecl | BlockDecl

export interface TranslationUnit {
  decls: TopLevel[]
}

// ------------------------------------------------------------------ statements

export interface BlockStmt { kind: 'block'; stmts: Stmt[]; loc: SourceLoc }
export interface DeclStmt { kind: 'decl'; qualifiers: string[]; type: TypeSpec; declarators: Declarator[]; loc: SourceLoc }
export interface ExprStmt { kind: 'expr'; expr: Expr; loc: SourceLoc }
export interface IfStmt { kind: 'if'; cond: Expr; then: Stmt; else: Stmt | null; loc: SourceLoc }
export interface ForStmt { kind: 'for'; init: Stmt | null; cond: Expr | null; update: Expr | null; body: Stmt; loc: SourceLoc }
export interface WhileStmt { kind: 'while'; cond: Expr; body: Stmt; loc: SourceLoc }
export interface DoWhileStmt { kind: 'dowhile'; body: Stmt; cond: Expr; loc: SourceLoc }
export interface SwitchCase { labels: (Expr | 'default')[]; body: Stmt[]; loc: SourceLoc }
export interface SwitchStmt { kind: 'switch'; expr: Expr; cases: SwitchCase[]; loc: SourceLoc }
export interface JumpStmt { kind: 'break' | 'continue' | 'discard'; loc: SourceLoc }
export interface ReturnStmt { kind: 'return'; value: Expr | null; loc: SourceLoc }
export interface EmptyStmt { kind: 'empty'; loc: SourceLoc }
export interface LocalStructStmt { kind: 'localstruct'; decl: StructDecl; loc: SourceLoc }

export type Stmt =
  | BlockStmt | DeclStmt | ExprStmt | IfStmt | ForStmt | WhileStmt | DoWhileStmt
  | SwitchStmt | JumpStmt | ReturnStmt | EmptyStmt | LocalStructStmt

// ----------------------------------------------------------------- expressions

export interface ExprBase {
  loc: SourceLoc
  ty?: GType
}

export interface IdentExpr extends ExprBase { kind: 'ident'; name: string; sym?: VarSymbol }
export interface LiteralExpr extends ExprBase { kind: 'literal'; text: string; litType: 'int' | 'uint' | 'float' | 'bool' }
export interface BinaryExpr extends ExprBase { kind: 'binary'; op: string; left: Expr; right: Expr }
export interface UnaryExpr extends ExprBase { kind: 'unary'; op: string; operand: Expr }
export interface PostfixExpr extends ExprBase { kind: 'postfix'; op: '++' | '--'; operand: Expr }
export interface AssignExpr extends ExprBase { kind: 'assign'; op: string; target: Expr; value: Expr }
export interface TernaryExpr extends ExprBase { kind: 'ternary'; cond: Expr; a: Expr; b: Expr }
export interface CallExpr extends ExprBase {
  kind: 'call'
  callee: string
  /** Array constructor dimensions (`float[3](...)`). */
  ctorArray?: (Expr | null)[]
  args: Expr[]
  // annotations
  fn?: FunctionSymbol
  builtin?: string
  ctor?: GType
}
export interface IndexExpr extends ExprBase { kind: 'index'; base: Expr; index: Expr }
export interface MemberExpr extends ExprBase { kind: 'member'; base: Expr; name: string; swizzle?: number[] }
export interface MethodExpr extends ExprBase { kind: 'method'; base: Expr; name: string; args: Expr[] }
export interface CommaExpr extends ExprBase { kind: 'comma'; exprs: Expr[] }
export interface InitListExpr extends ExprBase { kind: 'initlist'; items: Expr[] }
/** Inserted by the checker: GLSL implicit conversion made explicit. */
export interface ConvertExpr extends ExprBase { kind: 'convert'; expr: Expr; to: GType }

export type Expr =
  | IdentExpr | LiteralExpr | BinaryExpr | UnaryExpr | PostfixExpr | AssignExpr | TernaryExpr
  | CallExpr | IndexExpr | MemberExpr | MethodExpr | CommaExpr | InitListExpr | ConvertExpr

// --------------------------------------------------------------------- symbols

export type VarStorage =
  | 'local' // function-scope var
  | 'param' // by-value parameter
  | 'refparam' // out/inout parameter (ptr<function, T>)
  | 'private' // module-scope var<private>
  | 'const' // module-scope const
  | 'external' // provided by the stage interface (bindings, I/O)

export interface VarSymbol {
  name: string
  /** Name used in WGSL. */
  wgsl: string
  type: GType
  storage: VarStorage
  isConst: boolean
  /** Constant value when foldable (array sizes, `const int N = 4`). */
  constValue?: number
  /** Assigned somewhere (by-value params that are written get a local copy). */
  written?: boolean
  /** For external symbols: WGSL access expression, if not the bare name. */
  access?: string
  /** For external combined samplers the host declares: the WGSL sampler
   *  variable paired with the texture `wgsl` names (default `<wgsl>_sampler`). */
  samplerWgsl?: string
  /** For external symbols: address space for pointers to it. */
  space?: 'private' | 'function' | 'storage' | 'uniform' | 'workgroup' | 'handle'
  readonly?: boolean
}

export interface FunctionSymbol {
  name: string
  /** Mangled WGSL name. */
  wgsl: string
  returnType: GType
  params: { name: string; type: GType; qualifier: 'in' | 'out' | 'inout'; defaultValue: Expr | null }[]
  decl: FunctionDecl | null
  /** Template instantiation bindings (T -> type). */
  typeArgs?: Map<string, GType>
  defined: boolean
  used: boolean
  /** Defined by the host (the shader generator), not emitted; the name is kept. */
  external?: boolean
}
