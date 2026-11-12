// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/inbetweenShape.cpp,
//  pxr/usd/usdSkel/inbetweenShape.h
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdSkelInbetweenShape (OpenUSD v26.11.1 pxr/usd/usdSkel/inbetweenShape.
// {h,cpp}): not a schema class; a BlendShape's 'inbetweens:<name>' point
// offsets attribute, whose 'weight' metadatum is the weight at which the
// inbetween applies, with an optional 'inbetweens:<name>:normalOffsets'
// companion attribute.
import type { Attribute, Prim } from 'typescript-usd/usd'
import { UsdSkelTokens } from './tokens.ts'

// inbetweenShape.cpp:13-17 (_tokens).
const INBETWEENS_PREFIX = 'inbetweens:'
const NORMAL_OFFSETS_SUFFIX = ':normalOffsets'

export class InbetweenShape {
  private readonly _attr: Attribute | undefined

  // inbetweenShape.cpp:21-23: wraps an existing attribute; with none, the
  // shape is not defined.
  constructor(attr?: Attribute) {
    this._attr = attr
  }

  // inbetweenShape.cpp:28-41 (_Create): a uniform, non-custom point3f[]
  // attribute named inbetweens:<name>; undefined shape for an invalid name.
  static _create(prim: Prim, name: string): InbetweenShape {
    const attrName = InbetweenShape._makeNamespaced(name)
    if (attrName === '') return new InbetweenShape()
    return new InbetweenShape(prim.createAttribute(attrName, 'point3f[]', false, 'uniform'))
  }

  /** The attribute holding the inbetween's point offsets. */
  getAttr(): Attribute | undefined { return this._attr }

  /** inbetweenShape.h:113-115: the wrapped attribute is a valid inbetween. */
  isDefined(): boolean { return this._attr !== undefined && InbetweenShape.isInbetween(this._attr) }

  /** inbetweenShape.h:125-127 operator==: the same attribute. */
  equals(other: InbetweenShape): boolean {
    return this._attr?.getPath() === other._attr?.getPath()
  }

  // inbetweenShape.cpp:45-48.
  static isInbetween(attr: Attribute | undefined): boolean {
    return attr !== undefined && attr.isValid() ? InbetweenShape._isValidInbetweenName(attr.name) : false
  }

  // inbetweenShape.cpp:53-58.
  static _isValidInbetweenName(name: string): boolean {
    return name.startsWith(INBETWEENS_PREFIX) && !name.endsWith(NORMAL_OFFSETS_SUFFIX)
  }

  // inbetweenShape.cpp:67-93: the empty string for an invalid name.
  static _makeNamespaced(name: string): string {
    const result = name.startsWith(INBETWEENS_PREFIX) ? name : INBETWEENS_PREFIX + name
    return InbetweenShape._isValidInbetweenName(result) ? result : ''
  }

  // inbetweenShape.cpp:99-102.
  static _getNamespacePrefix(): string { return INBETWEENS_PREFIX }

  // inbetweenShape.cpp:106-118.
  private _getNormalOffsetsAttr(create: boolean): Attribute | undefined {
    const attr = this._attr
    const prim = attr?.getPrim()
    if (!attr || !prim) return undefined
    const normalOffsetsName = attr.name + NORMAL_OFFSETS_SUFFIX
    return create
      ? prim.createAttribute(normalOffsetsName, 'vector3f[]', false, 'varying')
      : prim.getAttr(normalOffsetsName)
  }

  /** inbetweenShape.cpp:122-125: invalid (isValid() false) when absent. */
  getNormalOffsetsAttr(): Attribute | undefined { return this._getNormalOffsetsAttr(false) }

  // inbetweenShape.cpp:129-137.
  createNormalOffsetsAttr(defaultValue?: unknown): Attribute | undefined {
    const attr = this._getNormalOffsetsAttr(true)
    if (attr && defaultValue !== undefined) attr.set(defaultValue)
    return attr
  }

  /** inbetweenShape.cpp:141-144: the weight, undefined when none is authored. */
  getWeight(): number | undefined {
    const weight = this._attr?.getMetadata(UsdSkelTokens.weight)
    return typeof weight === 'number' ? weight : undefined
  }

  // inbetweenShape.cpp:148-151.
  setWeight(weight: number): boolean {
    return this._attr?.setMetadata(UsdSkelTokens.weight, weight) ?? false
  }

  // inbetweenShape.cpp:155-158.
  hasAuthoredWeight(): boolean {
    return this._attr?.hasAuthoredMetadata(UsdSkelTokens.weight) ?? false
  }

  /** inbetweenShape.cpp:162-165: the offsets, undefined without a value. */
  getOffsets(): unknown {
    return this._attr?.isValid() ? this._attr.get() : undefined
  }

  // inbetweenShape.cpp:169-172.
  setOffsets(offsets: unknown): boolean {
    if (!this._attr) return false
    this._attr.set(offsets)
    return true
  }

  /** inbetweenShape.cpp:176-182: undefined when there are no normal offsets. */
  getNormalOffsets(): unknown {
    const attr = this.getNormalOffsetsAttr()
    return attr?.isValid() ? attr.get() : undefined
  }

  // inbetweenShape.cpp:186-192.
  setNormalOffsets(offsets: unknown): boolean {
    const attr = this._getNormalOffsetsAttr(true)
    if (!attr) return false
    attr.set(offsets)
    return true
  }
}
