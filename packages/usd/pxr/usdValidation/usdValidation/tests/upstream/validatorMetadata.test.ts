// Ported from OpenUSD 26.11.1:
//  pxr/usdValidation/usdValidation/testenv/testUsdValidator.cpp,
//  pxr/usdValidation/usdValidation/testenv/testUsdValidatorMetadata.py,
//  pxr/usdValidation/usdValidation/validator.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1
// pxr/usdValidation/usdValidation/testenv/testUsdValidatorMetadata.py.
//
// Left out: test_CreateMetadataWithInvalidKeywordArgs (wrong argument types,
// which the TypeScript types reject) and the four test_Metadata*Immutable
// tests: the Python binding exposes read-only properties, while
// UsdValidationValidatorMetadata follows the C++ struct, whose fields are
// mutable (validator.h:33-81; testUsdValidator.cpp assigns them).
import { describe, expect, it } from 'vitest'
import { Registry as PlugRegistry, type Plugin as PlugPlugin } from 'typescript-usd/plug'
import { ValidatorMetadata } from '../../src/index.ts'

interface Expected {
  name?: string
  doc?: string
  keywords?: string[]
  schemaTypes?: string[]
  plugin?: PlugPlugin | null
  isSuite?: boolean
}

// testUsdValidatorMetadata.py:14-30 (_VerifyMetadata).
function _verifyMetadata(metadata: ValidatorMetadata, {
  name = '', doc = '', keywords = [], schemaTypes = [], plugin = null, isSuite = false,
}: Expected = {}): void {
  expect(metadata.name).toBe(name)
  expect(metadata.doc).toBe(doc)
  expect(metadata.getKeywords()).toEqual(keywords)
  expect(metadata.getSchemaTypes()).toEqual(schemaTypes)
  expect(metadata.plugin).toBe(plugin)
  expect(metadata.isSuite).toBe(isSuite)
}

describe('TestUsdValidatorMetadata', () => {
  it('test_CreateDefaultMetadata', () => {
    const metadata = new ValidatorMetadata()
    _verifyMetadata(metadata)
  })

  it('test_CreateMetadataWithValidKeywordArgs', () => {
    const allPlugins = PlugRegistry.GetInstance().getAllPlugins()
    const expectedPlugin = allPlugins.length > 0 ? allPlugins[0]! : null
    const validMetadatas: Expected[] = [
      { name: 'empty_validator' },
      {
        name: 'validator1',
        doc: 'This is a test validator.',
        keywords: ['validator1', 'test'],
        schemaTypes: ['SomePrimType'],
        plugin: null,
        isSuite: false,
      },
      {
        name: 'validator2',
        doc: 'This is another test validator.',
        keywords: ['validator2', 'test'],
        schemaTypes: ['NewPrimType'],
        plugin: expectedPlugin,
        isSuite: false,
      },
    ]
    for (const args of validMetadatas) {
      const { plugin, ...rest } = args
      const metadata = new ValidatorMetadata({ ...rest, pluginPtr: plugin ?? null })
      _verifyMetadata(metadata, args)
    }
  })
})
