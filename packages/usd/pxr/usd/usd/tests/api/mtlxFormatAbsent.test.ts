// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Opening a .mtlx layer when usdMtlx is not imported. An OpenUSD build without
// PXR_ENABLE_MATERIALX_SUPPORT has no usdMtlx plugin, so no plugin declares
// the extension (usdMtlx/plugInfo.json) and Sdf reports the layer's format as
// unknown (layer.cpp:3563-3568). Expectations come from the native capture in
// fixtures/unknownFileFormat, which opens an extension no plugin declares.
// This file must not import typescript-usd/usdMtlx.
import { expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { Stage } from 'typescript-usd/usd'
import { FileFormat, Layer } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'
import { readOracleFixture } from '../../../../testing/oracleFixture.ts'

interface Diagnostic { commentary: string; codingError: boolean }
const fixture = new URL('../fixtures/unknownFileFormat/', import.meta.url)
const native = readOracleFixture(new URL('expected.json', fixture)) as {
  findByExtension: boolean
  layerFindOrOpen: { raised: boolean; errors: Diagnostic[] }
  stageOpen: { raised: boolean; errors: Diagnostic[] }
  mtlxFormat: { formatId: string; declaredBy: string[] }
}
const path = fileURLToPath(new URL('material.mtlx', fixture))

// The C++ form of a native Tf.ErrorException: the open yields nothing and
// the errors it posted are the exception's.
async function posted(open: () => Promise<unknown>): Promise<{ result: unknown, errors: Diagnostic[] }> {
  const mark = new TfErrorMark()
  try {
    const result = await open()
    const errors = mark.getErrors().map(error => ({
      commentary: error.getCommentary().replaceAll(path, '<path>'), codingError: error.isCodingError() }))
    mark.clear()
    return { result, errors }
  } finally {
    mark.dispose()
  }
}

it('finds no file format for .mtlx', () => {
  // Natively the .mtlx format is declared only by the usdMtlx plugin.
  expect(native.mtlxFormat).toEqual({ formatId: 'mtlx', declaredBy: ['usdMtlx'] })
  expect(FileFormat.findByExtension(path) !== undefined).toBe(native.findByExtension)
})

it('reports the unknown-format error when opening a .mtlx layer', async () => {
  // SdfLayer::FindOrOpen returns null with the coding error posted.
  expect(native.layerFindOrOpen.raised).toBe(true)
  expect(await posted(() => Layer.findOrOpen(path)))
    .toEqual({ result: undefined, errors: native.layerFindOrOpen.errors })
})

it('fails to open a stage on a .mtlx root layer with the same error', async () => {
  // UsdStage::Open then also posts "Failed to open layer" (stage.cpp:1287)
  // and returns null.
  expect(native.stageOpen.raised).toBe(true)
  expect(await posted(() => Stage.open(path)))
    .toEqual({ result: undefined, errors: native.stageOpen.errors })
})
