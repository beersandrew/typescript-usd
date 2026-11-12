// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfVariableExpressionAST.cpp,
//  pxr/usd/sdf/testenv/testSdfVariableExpressionAST.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/sdf/testenv/testSdfVariableExpressionAST.py
// (registered as testSdfVariableExpressionAST). Every test method is ported.
//
// API mapping: Sdf.VariableExpressionAST(x) is new SdfVariableExpressionAST(x);
// bool(ast) is ast.isValid(); ASTNodes.X is SdfVariableExpressionASTNodes.X;
// methods are camelCase. LiteralNode.GetValue() returns an int64 as a bigint.
// The Python wrapper turns plain values given to MakeVariable(name, fallback)
// into literals; here they are passed through makeLiteral /
// makeListOfLiterals. A coding error that raises Tf.ErrorException in Python
// is an error posted to TfDiagnosticMgr here (raisesTfError). The
// "del ast" step has no counterpart: nodes are garbage collected.

import { describe, expect, it } from 'vitest'
import { TfErrorMark } from 'typescript-usd/tf'
import {
  SdfVariableExpression, type SdfVariableExpressionBuilder, type SdfVariableExpressionFunctionBuilder,
  type SdfVariableExpressionListBuilder,
} from '../../src/variableExpression.ts'
import {
  SdfVariableExpressionAST, SdfVariableExpressionASTNodes as ASTNodes, type Node, type NodeList,
} from '../../src/variableExpressionAST.ts'

const VE = SdfVariableExpression
type ExprLike = SdfVariableExpression | SdfVariableExpressionBuilder | SdfVariableExpressionFunctionBuilder |
  SdfVariableExpressionListBuilder
const str = (e: ExprLike): string => (e instanceof SdfVariableExpression ? e : new SdfVariableExpression(e)).getString()

function raisesTfError(fn: () => void): void {
  const mark = new TfErrorMark()
  fn()
  const clean = mark.isClean()
  mark.clear()
  mark.dispose()
  expect(clean).toBe(false)
}

function assertEqualExpression(expr1: ExprLike, expr2: ExprLike): void {
  expect(str(expr1)).toBe(str(expr2))
}

function assertValidAST(ast: SdfVariableExpressionAST): void {
  expect(ast.isValid()).toBe(true)
  expect(ast.getErrors().length).toBe(0)
  expect(ast.getRoot()).not.toBeNull()
  assertEqualExpression(ast.getRoot()!.getExpression(), ast.getExpression())
}

function assertInvalidAST(ast: SdfVariableExpressionAST, expectedErrors: string[]): void {
  expect(ast.isValid()).toBe(false)
  expect(ast.getErrors()).toEqual(expectedErrors)
  expect(ast.getRoot()).toBeNull()
  assertEqualExpression(ast.getExpression(), new SdfVariableExpression())
}

function assertExpectedNodeList(nodeList: NodeList, expectedExprs: ExprLike[]): void {
  const nodes = nodeList.getNodes()
  for (let i = 0; i < Math.min(nodes.length, expectedExprs.length); ++i) {
    assertEqualExpression(nodes[i]!.getExpression(), expectedExprs[i]!)
  }
}

describe('testSdfVariableExpressionAST', () => {
  // testSdfVariableExpressionAST.py:37-58
  it('test_Basic', () => {
    assertInvalidAST(new SdfVariableExpressionAST(), ['No expression specified'])
    assertInvalidAST(new SdfVariableExpressionAST('bogus_expr'),
      ["Expressions must begin with '`' at character 0"])

    const ast = new SdfVariableExpressionAST(new SdfVariableExpression(VE.makeLiteral(1)))
    const node = ast.getRoot()!.as(ASTNodes.LiteralNode)!
    expect(node).not.toBeNull()
    expect(node.getValue()).toBe(1n)
    node.setValue(2)
    expect(node.getValue()).toBe(2n)
  })

  // :60-87
  it('test_Literal', () => {
    type Value = number | bigint | string | boolean | null
    const makeExpr = (value: Value) =>
      value === null ? VE.makeNone() : VE.makeLiteral(value)
    const asLiteral = (value: Value) => typeof value === 'number' ? BigInt(value) : value

    const testLiteralAST = (ast: SdfVariableExpressionAST, expectedValue: Value) => {
      assertValidAST(ast)
      const literalNode = ast.getRoot()!
      expect(literalNode).toBeInstanceOf(ASTNodes.LiteralNode)
      expect((literalNode as InstanceType<typeof ASTNodes.LiteralNode>).getValue()).toBe(asLiteral(expectedValue))
      assertEqualExpression(ast.getExpression(), makeExpr(expectedValue))
    }

    const testValues: Value[] = [0, 1, 2 ** 31 - 1, 2 ** 31, 'foo', 'foo_${BAR}', true, false, null]
    for (const value of testValues) {
      const ast = new SdfVariableExpressionAST(new SdfVariableExpression(makeExpr(value)))
      testLiteralAST(ast, value)
      for (const newValue of testValues) {
        ;(ast.getRoot() as InstanceType<typeof ASTNodes.LiteralNode>).setValue(newValue)
        testLiteralAST(ast, newValue)
      }
    }
  })

  // :89-104
  it('test_Variable', () => {
    const testVariableAST = (ast: SdfVariableExpressionAST, expectedName: string) => {
      assertValidAST(ast)
      const varNode = ast.getRoot()!
      expect(varNode).toBeInstanceOf(ASTNodes.VariableNode)
      expect((varNode as InstanceType<typeof ASTNodes.VariableNode>).getName()).toBe(expectedName)
      assertEqualExpression(ast.getExpression(), VE.makeVariable(expectedName))
    }
    const ast = new SdfVariableExpressionAST(new SdfVariableExpression(VE.makeVariable('FOO')))
    testVariableAST(ast, 'FOO')
    ;(ast.getRoot() as InstanceType<typeof ASTNodes.VariableNode>).setName('BAR')
    testVariableAST(ast, 'BAR')
  })

  // :106-150
  it('testVariableFallback', () => {
    const testVariableFallbackAST = (
      ast: SdfVariableExpressionAST, expectedName: string, expectedFallback: SdfVariableExpressionBuilder |
        SdfVariableExpressionListBuilder,
    ) => {
      assertValidAST(ast)
      const varNode = ast.getRoot()!
      expect(varNode).toBeInstanceOf(ASTNodes.VariableNode)
      expect((varNode as InstanceType<typeof ASTNodes.VariableNode>).getName()).toBe(expectedName)
      assertEqualExpression(ast.getExpression(), VE.makeVariable(expectedName, expectedFallback))
    }

    for (const fallback of [
      VE.makeLiteral('BAR'), VE.makeLiteral(true), VE.makeLiteral(42), VE.makeListOfLiterals([1, 2, 3]),
    ]) {
      const expr = new SdfVariableExpression(VE.makeVariable('FOO', fallback))
      testVariableFallbackAST(new SdfVariableExpressionAST(expr), 'FOO', fallback)
    }

    expect(() => VE.makeVariable('FOO', VE.makeLiteral(3.14))).toThrow(TypeError)

    // Functions are not supported as fallback values.
    const funcFallback = VE.makeFunction('if', VE.makeLiteral(true), VE.makeLiteral(10), VE.makeLiteral(20))
    expect(new SdfVariableExpression(VE.makeVariable('FOO', funcFallback)).isValid()).toBe(false)

    // Inline variable references are not allowed within a fallback string,
    assertInvalidAST(new SdfVariableExpressionAST("`${FOO:'${BAR}'}`"),
      ['Variable references are not allowed in fallback string values at character 8'])
  })

  // :152-198
  it('testVariableFallbackAccessors', () => {
    let ast = new SdfVariableExpressionAST(new SdfVariableExpression(VE.makeVariable('FOO')))
    let varNode = ast.getRoot()!.as(ASTNodes.VariableNode)!
    expect(varNode.getFallbackValue()).toBeNull()

    ast = new SdfVariableExpressionAST(new SdfVariableExpression(VE.makeVariable('FOO', VE.makeLiteral(42))))
    varNode = ast.getRoot()!.as(ASTNodes.VariableNode)!
    const fallback = varNode.getFallbackValue()
    expect(fallback).toBeInstanceOf(ASTNodes.LiteralNode)
    expect((fallback as InstanceType<typeof ASTNodes.LiteralNode>).getValue()).toBe(42n)

    const rootOf = (b: ExprLike): Node => new SdfVariableExpressionAST(
      b instanceof SdfVariableExpression ? b : new SdfVariableExpression(b)).getRoot()!

    varNode.setFallbackValue(rootOf(VE.makeLiteral('usd')))
    expect(varNode.getFallbackValue()).toBeInstanceOf(ASTNodes.LiteralNode)
    assertEqualExpression(ast.getExpression(), VE.makeVariable('FOO', VE.makeLiteral('usd')))

    varNode.setFallbackValue(rootOf(VE.makeList(VE.makeLiteral(1), VE.makeLiteral(2))))
    expect(varNode.getFallbackValue()).toBeInstanceOf(ASTNodes.ListNode)

    varNode.clearFallbackValue()
    expect(varNode.getFallbackValue()).toBeNull()
    assertEqualExpression(ast.getExpression(), VE.makeVariable('FOO'))

    raisesTfError(() => varNode.setFallbackValue(rootOf(VE.makeVariable('BAR'))))
    raisesTfError(() => varNode.setFallbackValue(rootOf(VE.makeNone())))
    // Functions are not supported as fallback values.
    raisesTfError(() => varNode.setFallbackValue(rootOf(
      VE.makeFunction('if', VE.makeLiteral(true), VE.makeLiteral(10), VE.makeLiteral(20)))))
  })

  // checkNodeList (:200-269)
  function checkNodeList(
    getNodeListFromAST: (ast: SdfVariableExpressionAST) => NodeList,
    makeExprForAST: (exprs: ExprLike[]) => ExprLike,
  ): void {
    const testNodeList = (ast: SdfVariableExpressionAST, expectedExprs: ExprLike[]) => {
      assertExpectedNodeList(getNodeListFromAST(ast), expectedExprs)
      assertEqualExpression(ast.getExpression(), makeExprForAST(expectedExprs))
    }

    // Create an AST for an expression containing a node list with a few
    // initial elements.
    const expectedExprs: ExprLike[] = [VE.makeLiteral('a'), VE.makeLiteral('b')]
    const expr = makeExprForAST(expectedExprs)
    const ast = new SdfVariableExpressionAST(new SdfVariableExpression(str(expr)))
    assertExpectedNodeList(getNodeListFromAST(ast), expectedExprs)

    // Test appending an element to the AST's node list
    const newExpr = VE.makeLiteral(false)
    const newExprAST = new SdfVariableExpressionAST(new SdfVariableExpression(newExpr))

    let astCopy = new SdfVariableExpressionAST(ast)
    getNodeListFromAST(astCopy).append(newExprAST.getRoot()!)
    testNodeList(astCopy, [...expectedExprs, newExpr])

    // Test setting elements in the AST's node list
    for (let i = 0; i < expectedExprs.length; ++i) {
      astCopy = new SdfVariableExpressionAST(ast)
      getNodeListFromAST(astCopy).set(i, newExprAST.getRoot()!)
      testNodeList(astCopy, [...expectedExprs.slice(0, i), newExpr, ...expectedExprs.slice(i + 1)])
    }

    // Test setting element out of bounds
    astCopy = new SdfVariableExpressionAST(ast)
    raisesTfError(() => getNodeListFromAST(astCopy).set(expectedExprs.length, newExprAST.getRoot()!))

    // Test inserting elements in the AST's node list
    for (let i = 0; i < expectedExprs.length + 1; ++i) {
      astCopy = new SdfVariableExpressionAST(ast)
      getNodeListFromAST(astCopy).insert(i, newExprAST.getRoot()!)
      testNodeList(astCopy, [...expectedExprs.slice(0, i), newExpr, ...expectedExprs.slice(i)])
    }

    // Test inserting element out of bounds
    astCopy = new SdfVariableExpressionAST(ast)
    raisesTfError(() => getNodeListFromAST(astCopy).insert(expectedExprs.length + 1, newExprAST.getRoot()!))

    // Test removing individual elements in the AST's node list
    for (let i = 0; i < expectedExprs.length; ++i) {
      astCopy = new SdfVariableExpressionAST(ast)
      getNodeListFromAST(astCopy).remove(i)
      testNodeList(astCopy, [...expectedExprs.slice(0, i), ...expectedExprs.slice(i + 1)])
    }

    // Test removing element out of bounds
    astCopy = new SdfVariableExpressionAST(ast)
    raisesTfError(() => getNodeListFromAST(astCopy).remove(expectedExprs.length))

    // Test clearing the AST's node list entirely
    astCopy = new SdfVariableExpressionAST(ast)
    getNodeListFromAST(astCopy).clear()
    testNodeList(astCopy, [])
  }

  // :271-302
  it('test_List', () => {
    const testListAST = (ast: SdfVariableExpressionAST, expectedElementExprs: ExprLike[]) => {
      assertValidAST(ast)
      const listNode = ast.getRoot()!
      expect(listNode).toBeInstanceOf(ASTNodes.ListNode)
      assertExpectedNodeList((listNode as InstanceType<typeof ASTNodes.ListNode>).getElements(), expectedElementExprs)
    }

    // Test AST for an empty list expression
    testListAST(new SdfVariableExpressionAST(new SdfVariableExpression(VE.makeList())), [])

    // Test AST for a more complicated list expression containing a variety
    // of elements.
    const elemExprs: ExprLike[] = [
      VE.makeLiteral(true),
      VE.makeVariable('FOO'),
      VE.makeFunction('foo', VE.makeListOfLiterals(['a', 'b']), VE.makeLiteral('a')),
    ]
    testListAST(new SdfVariableExpressionAST(new SdfVariableExpression(VE.makeList(...elemExprs))), elemExprs)

    checkNodeList(
      ast => (ast.getRoot() as InstanceType<typeof ASTNodes.ListNode>).getElements(),
      exprs => VE.makeList(...exprs))
  })

  // :304-329
  it('test_Function', () => {
    const testFunctionAST = (ast: SdfVariableExpressionAST, expectedName: string, expectedArgExprs: ExprLike[]) => {
      assertValidAST(ast)
      const functionNode = ast.getRoot()!
      expect(functionNode).toBeInstanceOf(ASTNodes.FunctionNode)
      const fn = functionNode as InstanceType<typeof ASTNodes.FunctionNode>
      expect(fn.getName()).toBe(expectedName)
      assertExpectedNodeList(fn.getArguments(), expectedArgExprs)
    }

    const functionName = 'func'
    const functionArgs: ExprLike[] = [
      VE.makeLiteral(true),
      VE.makeVariable('FOO'),
      VE.makeListOfLiterals(['a', 'b']),
      VE.makeFunction('foo', VE.makeListOfLiterals(['a', 'b']), VE.makeLiteral('a')),
    ]
    const expr = new SdfVariableExpression(VE.makeFunction(functionName, ...functionArgs))
    testFunctionAST(new SdfVariableExpressionAST(expr), functionName, functionArgs)

    checkNodeList(
      ast => (ast.getRoot() as InstanceType<typeof ASTNodes.FunctionNode>).getArguments(),
      exprs => VE.makeFunction('foo', ...exprs))
  })
})
