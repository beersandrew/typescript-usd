// Ported from OpenUSD 26.11.1: pxr/base/vt/arrayEditOps.cpp,
//  pxr/base/vt/arrayEditOps.h, pxr/base/vt/arrayEditBuilder.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Operation-stream primitives from OpenUSD v26.08
// pxr/base/vt/arrayEditOps.h:26-123 and arrayEditBuilder.h:28-50.

export type VtArrayEditOp = readonly [op: number, a1: number, a2?: number]

export class Vt_ArrayEditOps {
  static readonly EndIndex = Number.MIN_SAFE_INTEGER
  static readonly NumOps = 10
  readonly instructions: VtArrayEditOp[]

  constructor(instructions: readonly VtArrayEditOp[] = []) {
    this.instructions = instructions.map(op => [...op] as VtArrayEditOp)
  }

  static isValidOp(op: number): boolean {
    return Number.isInteger(op) && op >= 0 && op < Vt_ArrayEditOps.NumOps
  }

  static getArity(op: number): number {
    return [0, 1, 2, 3, 6, 8].includes(op) ? 2 : 1
  }

  IsEmpty(): boolean { return this.instructions.length === 0 }
  forEach(fn: (op: number, a1: number, a2?: number) => void): void {
    for (const [op, a1, a2] of this.instructions) fn(op, a1, a2)
  }
  forEachValid(
    numLiterals: number,
    initialSize: number,
    fn: (op: number, a1: number, a2?: number) => void,
  ): void {
    this.forEach((op, a1, a2) => {
      if (!Vt_ArrayEditOps.isValidOp(op)) return
      if ([0, 2, 6, 8].includes(op) && (a1 < 0 || a1 >= numLiterals)) return
      const normalize = (value: number | undefined): number | undefined =>
        value === Vt_ArrayEditOps.EndIndex ? initialSize :
          value !== undefined && value < 0 ? value + initialSize : value
      fn(op, normalize(a1)!, normalize(a2))
    })
  }
  modifyEach(fn: (op: number, a1: number, a2?: number) => VtArrayEditOp): void {
    this.instructions.splice(0, this.instructions.length,
      ...this.instructions.map(([op, a1, a2]) => fn(op, a1, a2)))
  }
}

export class Vt_ArrayEditOpsBuilder {
  readonly instructions: VtArrayEditOp[] = []
  addOp(op: number, a1: number, a2?: number): void {
    if (!Vt_ArrayEditOps.isValidOp(op)) throw new RangeError(`invalid array-edit op ${op}`)
    const arity = Vt_ArrayEditOps.getArity(op)
    if (arity === 2 && a2 === undefined) throw new TypeError(`array-edit op ${op} requires two arguments`)
    this.instructions.push(a2 === undefined ? [op, a1] : [op, a1, a2])
  }
}
