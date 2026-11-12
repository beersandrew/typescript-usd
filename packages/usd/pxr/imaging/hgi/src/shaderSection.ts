// Ported from OpenUSD 26.11.1: pxr/imaging/hgi/shaderSection.cpp,
//  pxr/imaging/hgi/shaderSection.h
// Copyright 2020 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hgi/shaderSection.{h,cpp} (OpenUSD 26.11.1).

import type { HgiStringStream } from './stringStream.ts'

/** shaderSection.h:21-25: struct to hold attribute definitions. */
export interface HgiShaderSectionAttribute {
  identifier: string
  index: string
}
/** shaderSection.h:27-28 */
export type HgiShaderSectionAttributeVector = HgiShaderSectionAttribute[]

/** shaderSection.h:38-107. A base class for a Shader Section. In general, a
 *  shader section is a section of code written into a shader. */
export class HgiShaderSection {
  private readonly _identifierVar: string
  private readonly _attributes: HgiShaderSectionAttributeVector
  private readonly _defaultValue: string
  private readonly _arraySize: string
  private readonly _blockInstanceIdentifier: string

  /** shaderSection.cpp:12-24 (defaults: shaderSection.h:91-96) */
  protected constructor(
    identifier: string,
    attributes: HgiShaderSectionAttributeVector = [],
    defaultValue = '',
    arraySize = '',
    blockInstanceIdentifier = '',
  ) {
    this._identifierVar = identifier
    this._attributes = attributes
    this._defaultValue = defaultValue
    this._arraySize = arraySize
    this._blockInstanceIdentifier = blockInstanceIdentifier
  }

  /** shaderSection.cpp:28-31: writes nothing by default. */
  writeType(_ss: HgiStringStream): void {}

  /** shaderSection.cpp:33-37 */
  writeIdentifier(ss: HgiStringStream): void {
    ss.write(this._identifierVar)
  }

  /** shaderSection.cpp:45-53 */
  writeDeclaration(ss: HgiStringStream): void {
    this.writeType(ss)
    ss.write(' ')
    this.writeIdentifier(ss)
    this.writeArraySize(ss)
    ss.write(';')
  }

  /** shaderSection.cpp:55-61 */
  writeParameter(ss: HgiStringStream): void {
    this.writeType(ss)
    ss.write(' ')
    this.writeIdentifier(ss)
  }

  /** shaderSection.cpp:63-69 */
  writeArraySize(ss: HgiStringStream): void {
    if (this._arraySize) {
      ss.write('[', this._arraySize, ']')
    }
  }

  /** shaderSection.cpp:39-43 */
  writeBlockInstanceIdentifier(ss: HgiStringStream): void {
    ss.write(this._blockInstanceIdentifier)
  }

  /** shaderSection.h:71-73 */
  getIdentifier(): string {
    return this._identifierVar
  }

  /** shaderSection.cpp:71-75 */
  getAttributes(): HgiShaderSectionAttributeVector {
    return this._attributes
  }

  /** shaderSection.h:80-82 */
  getArraySize(): string {
    return this._arraySize
  }

  /** shaderSection.h:85-87 */
  hasBlockInstanceIdentifier(): boolean {
    return this._blockInstanceIdentifier.length > 0
  }

  /** shaderSection.cpp:77-81 */
  protected _getDefaultValue(): string {
    return this._defaultValue
  }
}
