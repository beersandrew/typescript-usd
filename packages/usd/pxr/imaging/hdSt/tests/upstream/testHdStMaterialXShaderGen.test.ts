// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hdSt/testenv/testHdStMaterialXShaderGen.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of pxr/imaging/hdSt/testenv/testHdStMaterialXShaderGen.cpp
// (OpenUSD 26.11.1) and its nine registrations
// (pxr/imaging/hdSt/CMakeLists.txt:2757-2818, DIFF_COMPARE of stdout).
// Expected: the reference build's stdout for each registration,
// ../fixtures/materialXShaderGen/<test>/ (FIXTURES.md); the generated
// glslfx must match byte for byte. The .mtlx inputs are the testenv files,
// copied unchanged into ../fixtures/materialXShaderGen/testenv/.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createDocument, TypedValue, type Document, type Input, type Node } from '@mtlx/core'
import { FilePath, readFromXmlFile } from '@mtlx/format'
import { isTransparentSurface } from '@mtlx/genshader'
import { HdMtlxSearchPaths, HdMtlxStdLibraries } from '../../../hdMtlx/src/hdMtlx.ts'
import { HdMtlxTokens } from '../../../hdMtlx/src/tokens.ts'
import { HgiTokens } from 'typescript-usd/hgi'
import { HdSt_GenMaterialXShader, HdSt_MxShaderGenInfo } from '../../src/materialXFilter.ts'
import { HdStMaterialTagTokens } from '../../src/tokens.ts'
import { TF_WARN } from '../../src/tfDiagnostic.ts'

const fixtures = new URL('../fixtures/materialXShaderGen/', import.meta.url)

// Helpers to determine the Material Tag
// Note that similar helpers live in HdStMaterialXFilter

/** testHdStMaterialXShaderGen.cpp:27-44 */
function _IsDifferentFrom(mxInput: Input | null, value: number): boolean {
  if (!mxInput) {
    return false
  }

  if (mxInput.hasValue()) {
    const val = mxInput.getValue()!
    if (val.isA('float')) {
      return ((val as TypedValue).getData() as number) !== value
    }
    return true
  }

  return mxInput.hasNodeName() || mxInput.hasNodeGraphString() ||
         mxInput.hasOutputString() || mxInput.hasInterfaceName()
}

/** testHdStMaterialXShaderGen.cpp:46-63 */
function _GetUsdPreviewSurfaceMaterialTag(terminalNode: Node): string {
  // See https://openusd.org/release/spec_usdpreviewsurface.html
  // and implementation in MaterialX libraries/bxdf/usd_preview_surface.mtlx

  // Non-zero opacityThreshold (or connected) triggers masked mode:
  if (_IsDifferentFrom(terminalNode.getInput('opacityThreshold'), 0.0)) {
    return HdStMaterialTagTokens.masked.toString()
  }

  // Opacity less than 1.0 (or connected) triggers transparent mode:
  if (_IsDifferentFrom(terminalNode.getInput('opacity'), 1.0)) {
    return HdStMaterialTagTokens.translucent.toString()
  }

  return HdStMaterialTagTokens.defaultMaterialTag.toString()
}

/** testHdStMaterialXShaderGen.cpp:65-87 */
function _GetMaterialTag(mxDoc: Document): string {
  // Find shader element in the mtlx document.
  const shaderNode = mxDoc.getNode(HdMtlxTokens.surfaceshaderName.toString())
  if (!shaderNode) {
    return HdStMaterialTagTokens.defaultMaterialTag.toString()
  }

  // The custom code to handle masked mode prevents MaterialX from
  // correctly deducing transparency with mx::isTransparentSurface()
  if (shaderNode.getCategory() === 'UsdPreviewSurface') {
    return _GetUsdPreviewSurfaceMaterialTag(shaderNode)
  }

  // XXX: Once other material tests are added (eg. glTf) similar helper
  // helper functions will need to be added to get the correct MaterialTag
  if (isTransparentSurface(shaderNode)) {
    return HdStMaterialTagTokens.translucent.toString()
  }
  return HdStMaterialTagTokens.defaultMaterialTag.toString()
}

/** testHdStMaterialXShaderGen.cpp:89-134. Returns what the program writes
 *  to stdout. */
function TestShaderGen(mtlxFilename: FilePath, mxHdInfo: HdSt_MxShaderGenInfo): string {
  // Get Standard Libraries and SearchPaths (for mxDoc and mxShaderGen)
  const stdLibraries = HdMtlxStdLibraries()
  const searchPaths = HdMtlxSearchPaths()

  // Read the mtlx file
  const mxDoc = createDocument()
  try {
    readFromXmlFile(mxDoc, mtlxFilename, searchPaths)
  } catch (e) {
    TF_WARN(`mx::readFromXmlFile threw an exception: ${(e as Error).message}`)
    return ''
  }

  mxDoc.importLibrary(stdLibraries)

  // Validate the document.
  const messages: string[] = []
  if (!mxDoc.validate(messages)) {
    // (written to stderr upstream)
  }

  // Custom material tags should already be set below through the config arg:
  // --config materialTag:<customTagName>
  if (mxHdInfo.materialTag === HdStMaterialTagTokens.defaultMaterialTag.toString()) {
    mxHdInfo.materialTag = _GetMaterialTag(mxDoc)
  }

  // Generate the HdSt MaterialX Shader
  const glslfx = HdSt_GenMaterialXShader(
    mxDoc, stdLibraries, searchPaths, mxHdInfo, HgiTokens.OpenGL)
  return glslfx!.getSourceCode('pixel')
}

/** testHdStMaterialXShaderGen.cpp:136-190 (argument parsing). */
function main(args: string[]): string {
  const mxHdInfo = new HdSt_MxShaderGenInfo()
  let mtlxFile = 'standard_surface_default.mtlx'
  for (let i = 0; i < args.length; ++i) {
    const arg = args[i]!
    if (arg === '--filename') {
      mtlxFile = args[++i]!
    }
    if (arg === '--textureName') {
      mxHdInfo.textureNames.push(args[++i]!)
    }
    if (arg === '--primvarMap') {
      const primvarMap = args[++i]!
      const npos = primvarMap.indexOf(':')
      mxHdInfo.primvarMap.set(primvarMap.slice(0, npos), primvarMap.slice(npos + 1))
    }
    if (arg === '--bindless') {
      mxHdInfo.bindlessTexturesEnabled = true
    }
    if (arg === '--config') {
      const config = args[++i]!
      const npos = config.indexOf(':')
      if (config.slice(0, npos) === 'materialTag') {
        mxHdInfo.materialTag = config.slice(npos + 1)
      }
    }
  }
  // The registered tests run in a copy of the testenv directory.
  const path = fileURLToPath(new URL(`testenv/${mtlxFile}`, fixtures))
  return TestShaderGen(new FilePath(path), mxHdInfo)
}

interface Capture { test: string; command: string; stdout: string; returnCode: number }
function capture(test: string): { args: string[]; expected: string } {
  const json = JSON.parse(readFileSync(new URL(`${test}/capture.json`, fixtures), 'utf8')) as { payload: Capture }
  const { command, stdout, returnCode } = json.payload
  expect(returnCode).toBe(0)
  return {
    args: command.split(' ').slice(1),
    expected: readFileSync(new URL(`${test}/${stdout}`, fixtures), 'utf8'),
  }
}

describe('testHdStMaterialXShaderGen', () => {
  for (const test of [
    'testHdStMaterialXShaderGen_UsdPSdefault',
    'testHdStMaterialXShaderGen_SSmarble',
    'testHdStMaterialXShaderGen_SScopper',
    'testHdStMaterialXShaderGen_SSdefault',
    'testHdStMaterialXShaderGen_UsdPStextured',
    'testHdStMaterialXShaderGen_SStextured',
    'testHdStMaterialXShaderGen_UsdPSglass',
    'testHdStMaterialXShaderGen_SStextured_bindless',
    'testHdStMaterialXShaderGen_texcoord',
  ]) {
    it(test, () => {
      const { args, expected } = capture(test)
      const actual = main(args)
      const dump = process.env.HDST_MTLX_DUMP_DIR
      if (dump) writeFileSync(`${dump}/${test}.out`, actual)
      expect(actual).toBe(expected)
    })
  }
})
