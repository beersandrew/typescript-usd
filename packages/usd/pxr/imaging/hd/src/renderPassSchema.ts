// Ported from OpenUSD 26.11.1: pxr/imaging/hd/renderPassSchema.cpp,
//  pxr/imaging/hd/renderPassSchema.h
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/imaging/hd/renderPassSchema.{h,cpp}.

import { MakeTokens as TfMakeTokens } from 'typescript-usd/tf'
import {
  HdContainerDataSource, HdDataSourceBase, HdPathDataSource, HdTokenDataSource,
} from './dataSource.ts'
import { HdSchema, _HdBuildRetained, _HdLocator, _HdSchemaFromParent } from './schema.ts'

export const HdRenderPassSchemaTokens = TfMakeTokens({
  renderPass: 'renderPass', passType: 'passType', renderSource: 'renderSource',
})

export class HdRenderPassSchema extends HdSchema {
  static Builder = class {
    _passType: HdDataSourceBase | undefined
    _renderSource: HdDataSourceBase | undefined
    setPassType(value?: HdDataSourceBase): this { this._passType = value; return this }
    setRenderSource(value?: HdDataSourceBase): this { this._renderSource = value; return this }
    build(): HdContainerDataSource {
      return HdRenderPassSchema.buildRetained(this._passType, this._renderSource)
    }
  }
  static getFromParent(parent?: HdContainerDataSource): HdRenderPassSchema {
    return new HdRenderPassSchema(_HdSchemaFromParent(parent, this.getSchemaToken()))
  }
  static getSchemaToken(): string { return HdRenderPassSchemaTokens.renderPass }
  static getDefaultLocator() { return _HdLocator(this.getSchemaToken()) }
  static getPassTypeLocator() { return _HdLocator(this.getSchemaToken(), 'passType') }
  static getRenderSourceLocator() { return _HdLocator(this.getSchemaToken(), 'renderSource') }
  getPassType(): HdTokenDataSource | undefined {
    const value = this._container?.Get('passType')
    return value instanceof HdTokenDataSource ? value : undefined
  }
  getRenderSource(): HdPathDataSource | undefined {
    const value = this._container?.Get('renderSource')
    return value instanceof HdPathDataSource ? value : undefined
  }
  static buildRetained(
    passType?: HdDataSourceBase,
    renderSource?: HdDataSourceBase,
  ): HdContainerDataSource {
    return _HdBuildRetained({ passType, renderSource })
  }
}
