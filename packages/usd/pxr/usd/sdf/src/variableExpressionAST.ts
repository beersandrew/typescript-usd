// Ported from OpenUSD 26.11.1: pxr/usd/sdf/variableExpressionAST.cpp,
//  pxr/usd/sdf/variableExpressionAST.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// SdfVariableExpressionAST and SdfVariableExpressionASTNodes — port of
// OpenUSD v26.11.1 pxr/usd/sdf/variableExpressionAST.{h,cpp}: an editable
// abstract syntax tree of a variable expression.

import { TfDiagnosticMgr, Error as TfError, TfDiagnosticType } from 'typescript-usd/tf'
import {
  SdfVariableExpression, SdfVariableExpressionBuilder, SdfVariableExpressionFunctionBuilder,
  SdfVariableExpressionListBuilder,
} from './variableExpression.ts'
import { Sdf_ParseVariableExpressionAST } from './variableExpressionParser.ts'

function codingError(message: string): void {
  TfDiagnosticMgr.GetInstance().postError(new TfError(message, TfDiagnosticType.CodingError))
}

/** Base class for nodes in the SdfVariableExpression abstract syntax tree. */
export abstract class Node {
  // variableExpressionAST.cpp:22-26
  clone(): Node { return this._clone() }

  /** Return the SdfVariableExpression for this node (variableExpressionAST.cpp:28-32). */
  getExpression(): SdfVariableExpression {
    return new SdfVariableExpression(this._getExpressionBuilder())
  }

  /** variableExpressionAST.cpp:34-38 */
  getExpressionBuilder(): SdfVariableExpressionBuilder | SdfVariableExpressionFunctionBuilder |
    SdfVariableExpressionListBuilder {
    return this._getExpressionBuilder()
  }

  /** This node as `type`, or null if it is not one (Node::As). */
  as<T extends Node>(type: abstract new (...args: never[]) => T): T | null {
    return this instanceof type ? this as unknown as T : null
  }

  protected abstract _clone(): Node
  protected abstract _getExpressionBuilder(): SdfVariableExpressionBuilder
}

/** Ordered list of abstract syntax tree nodes (variableExpressionAST.cpp:40-122). */
export class NodeList {
  #nodes: Node[]
  constructor(nodes: Node[] = []) { this.#nodes = nodes }

  getNodes(): Node[] { return [...this.#nodes] }

  /** Append a copy of `node`. */
  append(node: Node): void { this.#nodes.push(node.clone()) }

  /** Set the node at index `i` to a copy of `node`. */
  set(i: number, node: Node): void {
    if (i >= this.#nodes.length) { codingError(`Invalid index ${i}`); return }
    this.#nodes[i] = node.clone()
  }

  /** Insert a copy of `node` at index `i`, in [0, getNodes().length]. */
  insert(i: number, node: Node): void {
    if (i > this.#nodes.length) { codingError(`Invalid index ${i}`); return }
    this.#nodes.splice(i, 0, node.clone())
  }

  /** Remove the node at index `i`. */
  remove(i: number): void {
    if (i >= this.#nodes.length) { codingError(`Invalid index ${i}`); return }
    this.#nodes.splice(i, 1)
  }

  clear(): void { this.#nodes = [] }

  clone(): NodeList { return new NodeList(this.#nodes.map(n => n.clone())) }
}

/**
 * The value of a LiteralNode: std::variant<std::monostate, bool, int64_t,
 * std::string>, with null for std::monostate (None) and bigint for int64_t.
 */
export type LiteralValue = null | boolean | bigint | string

const toLiteralValue = (value: LiteralValue | number): LiteralValue => {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new TypeError(`Invalid literal value ${value}`)
    return BigInt(value)
  }
  return value
}

/** A literal value (variableExpressionAST.cpp:124-145). */
export class LiteralNode extends Node {
  #value: LiteralValue
  /** @internal Use SdfVariableExpressionAST to create nodes. */
  constructor(value: LiteralValue = null) { super(); this.#value = value }

  getValue(): LiteralValue { return this.#value }
  setValue(value: LiteralValue | number): void { this.#value = toLiteralValue(value) }

  protected _clone(): Node { return new LiteralNode(this.#value) }

  protected _getExpressionBuilder(): SdfVariableExpressionBuilder {
    return this.#value === null
      ? SdfVariableExpression.makeNone()
      : SdfVariableExpression.makeLiteral(this.#value)
  }
}

/**
 * A raw variable reference, `${FOO}`, possibly with a fallback value
 * (variableExpressionAST.cpp:147-181). Variable references inside quoted
 * strings are part of a LiteralNode.
 */
export class VariableNode extends Node {
  #name: string
  #fallbackValue: Node | null
  /** @internal Use SdfVariableExpressionAST to create nodes. */
  constructor(name: string, fallbackValue: Node | null = null) {
    super()
    this.#name = name
    this.#fallbackValue = fallbackValue
  }

  getName(): string { return this.#name }
  setName(name: string): void { this.#name = name }

  getFallbackValue(): Node | null { return this.#fallbackValue }

  /** `node` must be a non-None LiteralNode or a ListNode. */
  setFallbackValue(node: Node): void {
    // A fallback may be a literal or a list. This mirrors the types accepted
    // by the parser's VariableFallbackValue rule.
    const literalNode = node.as(LiteralNode)
    if (literalNode) {
      if (literalNode.getValue() === null) {
        codingError('VariableNode: fallback value should not be None.')
        return
      }
    } else if (!node.as(ListNode)) {
      codingError('VariableNode: fallback must be a literal or list.')
      return
    }
    this.#fallbackValue = node.clone()
  }

  clearFallbackValue(): void { this.#fallbackValue = null }

  protected _clone(): Node {
    return new VariableNode(this.#name, this.#fallbackValue ? this.#fallbackValue.clone() : null)
  }

  protected _getExpressionBuilder(): SdfVariableExpressionBuilder {
    return this.#fallbackValue
      ? SdfVariableExpression.makeVariable(this.#name, toBuilder(this.#fallbackValue.getExpressionBuilder()))
      : SdfVariableExpression.makeVariable(this.#name)
  }
}

const toBuilder = (
  b: SdfVariableExpressionBuilder | SdfVariableExpressionFunctionBuilder | SdfVariableExpressionListBuilder,
): SdfVariableExpressionBuilder => b instanceof SdfVariableExpressionBuilder ? b : b.toBuilder()

/** A list (variableExpressionAST.cpp:183-207). */
export class ListNode extends Node {
  readonly #elems: NodeList
  /** @internal Use SdfVariableExpressionAST to create nodes. */
  constructor(elems: NodeList = new NodeList()) { super(); this.#elems = elems }

  override getExpressionBuilder(): SdfVariableExpressionListBuilder {
    const builder = SdfVariableExpression.makeList()
    for (const node of this.#elems.getNodes()) builder.addElement(node.getExpressionBuilder())
    return builder
  }

  getElements(): NodeList { return this.#elems }

  protected _clone(): Node { return new ListNode(this.#elems.clone()) }
  protected _getExpressionBuilder(): SdfVariableExpressionBuilder { return this.getExpressionBuilder().toBuilder() }
}

/** A function call (variableExpressionAST.cpp:209-234). */
export class FunctionNode extends Node {
  #functionName: string
  readonly #functionArgs: NodeList
  /** @internal Use SdfVariableExpressionAST to create nodes. */
  constructor(functionName: string, functionArgs: NodeList = new NodeList()) {
    super()
    this.#functionName = functionName
    this.#functionArgs = functionArgs
  }

  override getExpressionBuilder(): SdfVariableExpressionFunctionBuilder {
    const builder = SdfVariableExpression.makeFunction(this.#functionName)
    for (const node of this.#functionArgs.getNodes()) builder.addArgument(node.getExpressionBuilder())
    return builder
  }

  getName(): string { return this.#functionName }
  setName(name: string): void { this.#functionName = name }
  getArguments(): NodeList { return this.#functionArgs }

  protected _clone(): Node { return new FunctionNode(this.#functionName, this.#functionArgs.clone()) }
  protected _getExpressionBuilder(): SdfVariableExpressionBuilder { return this.getExpressionBuilder().toBuilder() }
}

/** @internal The parser's access to node construction (_NodeCreator). */
export const _NodeCreator = {
  makeLiteralNode: (value: LiteralValue): LiteralNode => new LiteralNode(value),
  makeVariableNode: (name: string, fallback: Node | null): VariableNode => new VariableNode(name, fallback),
  makeListNode: (elems: NodeList): ListNode => new ListNode(elems),
  makeFunctionNode: (name: string, args: NodeList): FunctionNode => new FunctionNode(name, args),
  makeNodeList: (nodes: Node[]): NodeList => new NodeList(nodes),
}

/**
 * Abstract syntax tree for an SdfVariableExpression
 * (variableExpressionAST.cpp:238-302).
 */
export class SdfVariableExpressionAST {
  #node: Node | null = null
  #errors: string[] = []

  /**
   * With no argument, an invalid AST. With an expression string or
   * SdfVariableExpression, the AST of that expression (invalid if it cannot be
   * parsed). With another AST, a deep copy of it.
   */
  constructor(expr?: string | SdfVariableExpression | SdfVariableExpressionAST) {
    if (expr === undefined) {
      this.#errors.push('No expression specified')
      return
    }
    if (expr instanceof SdfVariableExpressionAST) {
      this.#node = expr.#node ? expr.#node.clone() : null
      this.#errors = [...expr.#errors]
      return
    }
    const parseResult = Sdf_ParseVariableExpressionAST(
      expr instanceof SdfVariableExpression ? expr.getString() : expr)
    this.#node = parseResult.astRoot
    this.#errors = parseResult.errors
  }

  /** operator bool */
  isValid(): boolean { return this.#node !== null }

  getErrors(): string[] { return this.#errors }

  getRoot(): Node | null { return this.#node }

  getExpression(): SdfVariableExpression {
    return this.#node ? this.#node.getExpression() : new SdfVariableExpression()
  }
}

export const SdfVariableExpressionASTNodes = {
  Node, NodeList, LiteralNode, VariableNode, ListNode, FunctionNode,
}
