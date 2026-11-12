// Ported from OpenUSD 26.11.1: pxr/base/vt/arrayEditBuilder.cpp,
//  pxr/base/vt/arrayEditBuilder.h
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// VtArrayEditBuilder from OpenUSD v26.08 pxr/base/vt/arrayEditBuilder.h.
import { type ArrayEditOp, VtArrayEdit } from './arrayEdit.ts'

export class VtArrayEditBuilder<T> {
  static readonly EndIndex = Number.MIN_SAFE_INTEGER
  #ops: ArrayEditOp<T>[] = []

  write(value: T, index: number): this {
    this.#ops.push({ kind: 'write', value, index }); return this
  }
  writeRef(source: number, destination: number): this {
    this.#ops.push({ kind: 'writeRef', source, destination }); return this
  }
  insert(value: T, index: number): this {
    this.#ops.push({
      kind: 'insert', value,
      index: index === VtArrayEditBuilder.EndIndex ? 'end' : index,
    }); return this
  }
  insertRef(source: number, destination: number): this {
    this.#ops.push({
      kind: 'insertRef', source,
      destination: destination === VtArrayEditBuilder.EndIndex ? 'end' : destination,
    }); return this
  }
  prepend(value: T): this { return this.insert(value, 0) }
  prependRef(source: number): this { return this.insertRef(source, 0) }
  append(value: T): this { return this.insert(value, VtArrayEditBuilder.EndIndex) }
  appendRef(source: number): this {
    return this.insertRef(source, VtArrayEditBuilder.EndIndex)
  }
  eraseRef(index: number): this { this.#ops.push({ kind: 'erase', index }); return this }
  minSize(size: number, fill?: T): this {
    this.#ops.push({ kind: 'minSize', size, fill }); return this
  }
  setSize(size: number, fill?: T): this {
    this.#ops.push({ kind: 'setSize', size, fill }); return this
  }
  maxSize(size: number): this { this.#ops.push({ kind: 'maxSize', size }); return this }

  static optimize<T>(edit: VtArrayEdit<T>): VtArrayEdit<T> {
    return new VtArrayEdit(edit._serialization())
  }
  static getSerializationData<T>(edit: VtArrayEdit<T>): string {
    return JSON.stringify(edit._serialization())
  }
  static createFromSerializationData<T>(data: string): VtArrayEdit<T> {
    const parsed: unknown = JSON.parse(data)
    if (!Array.isArray(parsed)) throw new TypeError('invalid VtArrayEdit serialization')
    return new VtArrayEdit(parsed as ArrayEditOp<T>[])
  }
  finalizeAndReset(): VtArrayEdit<T> {
    const edit = new VtArrayEdit(this.#ops)
    this.#ops = []
    return edit
  }
}
