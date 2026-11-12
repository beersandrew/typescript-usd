// Ported from OpenUSD 26.11.1:
//  pxr/usd/sdf/testenv/testSdfVariableExpressionAST.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD 26.11.1 pxr/usd/sdf/testenv/testSdfVariableExpressionAST.cpp
// (registered as testSdfVariableExpressionAST_Cpp).
//
// The const / non-const GetRoot() overloads are one getRoot() here, and
// node->As<T>() is node.as(T).

import { describe, expect, it } from 'vitest'
import { SdfVariableExpression } from '../../src/variableExpression.ts'
import {
  SdfVariableExpressionAST, SdfVariableExpressionASTNodes as AST, type Node,
} from '../../src/variableExpressionAST.ts'

type NodeType = typeof AST.LiteralNode | typeof AST.VariableNode | typeof AST.ListNode | typeof AST.FunctionNode

// _TestCast / _TestCasts (testSdfVariableExpressionAST.cpp:17-38)
function _TestCasts(expected: NodeType, node: Node | null): void {
  for (const type of [AST.LiteralNode, AST.VariableNode, AST.ListNode, AST.FunctionNode] as (abstract new (...args: never[]) => Node)[]) {
    if (type === expected) expect(node!.as(type)).not.toBeNull()
    else expect(node!.as(type)).toBeNull()
  }
}

// :40-52
function _TestLiteralNode(exprStr: string, expectedStr = ''): void {
  const ast = new SdfVariableExpressionAST(exprStr)
  _TestCasts(AST.LiteralNode, ast.getRoot())
  const literalNode = ast.getRoot()!.as(AST.LiteralNode)!
  const expr = new SdfVariableExpression(literalNode.getExpressionBuilder())
  expect(expr.getString()).toBe(expectedStr === '' ? exprStr : expectedStr)
}

// :80-95
function _TestFallbackVariable(expectedFallbackType: NodeType, exprStr: string, expectedStr = ''): void {
  const ast = new SdfVariableExpressionAST(exprStr)
  _TestCasts(AST.VariableNode, ast.getRoot())
  _TestCasts(expectedFallbackType, ast.getRoot()!.as(AST.VariableNode)!.getFallbackValue())
  const variableNode = ast.getRoot()!.as(AST.VariableNode)!
  const expr = new SdfVariableExpression(variableNode.getExpressionBuilder())
  expect(expr.getString()).toBe(expectedStr === '' ? exprStr : expectedStr)
}

describe('testSdfVariableExpressionAST_Cpp', () => {
  // :54-67
  it('_TestLiteral', () => {
    _TestLiteralNode('`1`')
    _TestLiteralNode('`True`')
    _TestLiteralNode('`False`')
    _TestLiteralNode('`"DoubleQuote"`')
    _TestLiteralNode("`'SingleQuote'`", '`"SingleQuote"`')
    _TestLiteralNode('`"shot_${SHOT_ID}.usda"`')

    // Literal string nodes may contain variable references with fallback values
    _TestLiteralNode("`\"${FOO:'/shots'}/shot.usda\"`", "`'${FOO:\"/shots\"}/shot.usda'`")
  })

  // :69-78
  it('_TestVariable', () => {
    const ast = new SdfVariableExpressionAST('`${FOO}`')
    _TestCasts(AST.VariableNode, ast.getRoot())
    const variableNode = ast.getRoot()!.as(AST.VariableNode)!
    const expr = new SdfVariableExpression(variableNode.getExpressionBuilder())
    expect(expr.getString()).toBe('`${FOO}`')
  })

  // :97-110
  it('_TestVariablesWithFallbackValues', () => {
    _TestFallbackVariable(AST.LiteralNode, '`${FALLBACK:False}`')
    _TestFallbackVariable(AST.LiteralNode, '`${FALLBACK:True}`')
    _TestFallbackVariable(AST.LiteralNode, '`${FALLBACK:42}`')
    _TestFallbackVariable(AST.LiteralNode, '`${FALLBACK:"I<3Usd"}`')
    // note single quoted strings are round tripped as double quoted.
    _TestFallbackVariable(AST.LiteralNode, "`${FALLBACK:'I<3Usd'}`", '`${FALLBACK:"I<3Usd"}`')
    _TestFallbackVariable(AST.ListNode, '`${FALLBACK:[1, 2, 3]}`')
    _TestFallbackVariable(AST.ListNode, '`${FALLBACK:["a", "b"]}`')
  })

  // :112-133
  it('_TestList', () => {
    const ast = new SdfVariableExpressionAST('`[1, 2]`')
    _TestCasts(AST.ListNode, ast.getRoot())
    const listNode = ast.getRoot()!.as(AST.ListNode)!
    expect(new SdfVariableExpression(listNode.getExpressionBuilder()).getString()).toBe('`[1, 2]`')

    // Verify that using the expression builder does _not_ modify the
    // original AST.
    const listBuilder = listNode.getExpressionBuilder()
    listBuilder.addLiteralValues([3n])
    const newExpr = new SdfVariableExpression(listBuilder)
    expect(listNode.getExpression().getString()).toBe('`[1, 2]`')
    expect(newExpr.getString()).toBe('`[1, 2, 3]`')
  })

  // :135-155
  it('_TestFunction', () => {
    const ast = new SdfVariableExpressionAST('`func()`')
    _TestCasts(AST.FunctionNode, ast.getRoot())
    const fnNode = ast.getRoot()!.as(AST.FunctionNode)!
    expect(new SdfVariableExpression(fnNode.getExpressionBuilder()).getString()).toBe('`func()`')

    // Verify that using the expression builder does _not_ modify the
    // original AST.
    const fnBuilder = fnNode.getExpressionBuilder()
    fnBuilder.addArgument(SdfVariableExpression.makeLiteral(1n))
    const newExpr = new SdfVariableExpression(fnBuilder)
    expect(fnNode.getExpression().getString()).toBe('`func()`')
    expect(newExpr.getString()).toBe('`func(1)`')
  })
})
