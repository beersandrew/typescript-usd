// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/testenv/testUsdImagingHdMtlx.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The testUsdImagingHdMtlx program (pxr/usdImaging/usdImaging/testenv/
// testUsdImagingHdMtlx.cpp, OpenUSD 26.11.1), as testUsdImagingHdMtlx.test.ts
// runs it, for tests that run it on other scenes: main(<input>.usda) with the
// input relative to the working directory returns the program's stdout and
// the documents it writes by filename.
//
// Divergence (as testUsdImagingHdMtlx.test.ts): the document is written with
// writeToXmlString instead of writeToXmlFile (same XML writer), and returned
// rather than written to disk.

import { expect } from 'vitest'
import { writeToXmlString, XmlWriteOptions } from '@mtlx/format'
import type { Element } from '@mtlx/core'
import { TfErrorMark } from 'typescript-usd/tf'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceMaterialNetworkInterface as HdDataSourceMaterialNetworkInterface,
  type DataSourceLocator as HdDataSourceLocator,
} from 'typescript-usd/hd'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
import {
  UsdImagingCreateSceneIndices,
  UsdImagingDataSourceMaterial,
  UsdImagingDataSourceMaterialPrim,
  UsdImagingDataSourceStageGlobals,
} from 'typescript-usd/usdImaging'
import {
  HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface,
  HdMtlxStdLibraries,
  type HdMtlxTexturePrimvarData,
} from '../../../../imaging/hdMtlx/src/hdMtlx.ts'

// testUsdImagingHdMtlx.cpp:31-36
const _tokens = {
  mtlx: 'mtlx',
  material: 'material',
  mtlxVersion: 'mtlx:version',
} as const

/** testUsdImagingHdMtlx.cpp:40-73 (the TestStageGlobals of the
 *  DataSourceAttribute test upstream) */
class TestStageGlobals extends UsdImagingDataSourceStageGlobals {
  private readonly _time = 0
  private readonly _timeVarying = new Map<string, HdDataSourceLocator[]>()
  private readonly _assetPathDependent = new Set<string>()
  getTime(): UsdTimeCode { return new UsdTimeCode(this._time) }
  flagAsTimeVarying(hydraPath: string, locator: HdDataSourceLocator): void {
    const l = this._timeVarying.get(hydraPath) ?? []
    l.push(locator)
    this._timeVarying.set(hydraPath, l)
  }
  flagAsAssetPathDependent(usdPath: string): void {
    this._assetPathDependent.add(usdPath)
  }
}

/** testUsdImagingHdMtlx.cpp:75-81. Replace the given filename extension
 *  with 'mtlx' */
function _CreateMtlxFilename(filename: string): string {
  const extPos = filename.lastIndexOf('.')
  return filename.substring(0, extPos) + '.mtlx'
}

/** testUsdImagingHdMtlx.cpp:83-175. Returns the written documents by output
 *  filename, or null on failure (with the message upstream prints). */
async function TestHdMtlx(
  inputFilename: string,
  out: string[],
): Promise<Map<string, string> | null> {
  const written = new Map<string, string>()
  // The input is relative to the working directory, as upstream's.
  const stage = (await UsdStage.open(inputFilename))!
  const frame = new UsdTimeCode(0)

  // Hd_UnitTestNullRenderDelegate / HdRenderIndex: upstream creates them but
  // the test does not use them.

  const sceneIndices = UsdImagingCreateSceneIndices({ stage })
  const stageSceneIndex = sceneIndices.stageSceneIndex
  stageSceneIndex.SetTime(frame)

  for (const primPath of stage.traverseAll()) {
    const prim = stage.getPrim(primPath)!
    if (!prim.isA('Material')) {
      continue
    }

    // Get the MaterialX Material DataSource
    const materialPath = primPath
    const stageGlobals = new TestStageGlobals()
    const imgPrimDs = UsdImagingDataSourceMaterialPrim.new(
      materialPath, stage.getPrim(materialPath)!, stageGlobals)

    const materialDs = imgPrimDs.Get(_tokens.material)
    expect(materialDs).toBeInstanceOf(UsdImagingDataSourceMaterial)
    const mtlxNetworkDs = (materialDs as UsdImagingDataSourceMaterial).Get(_tokens.mtlx)
    const networkDs = mtlxNetworkDs instanceof HdContainerDataSource ? mtlxNetworkDs : undefined

    // Get the HdMaterialNetwork
    const hdPrim = stageSceneIndex.getPrim(materialPath)
    if (hdPrim.primType === '') {
      out.push(` - No prim type for <${materialPath}>\n`)
      return null
    }
    const hdNetInterfaceDs = new HdDataSourceMaterialNetworkInterface(
      materialPath, networkDs, hdPrim.dataSource)

    // Get the terminal node from the Material Network
    const terminalNames = hdNetInterfaceDs.getTerminalNames()
    if (terminalNames.length === 0) {
      out.push(`No terminals defined on <${materialPath}>.\n`)
      return null
    }
    const terminalType = terminalNames[0]!
    const terminalNodeConn = hdNetInterfaceDs.getTerminalConnection(terminalType)
    if (!terminalNodeConn[0]) {
      out.push(`No terminal node for type '${terminalType}'.\n`)
      return null
    }

    // Create MaterialX Document
    const stdLibraries = HdMtlxStdLibraries()
    const terminalNodeName = terminalNodeConn[1].upstreamNodeName
    const terminalNodeConnectionNames =
      hdNetInterfaceDs.getNodeInputConnectionNames(terminalNodeName)

    const mxHdData: HdMtlxTexturePrimvarData | null = null
    const mtlxDoc = HdMtlxCreateMtlxDocumentFromHdMaterialNetworkInterface(
      hdNetInterfaceDs, terminalNodeName,
      terminalNodeConnectionNames,
      stdLibraries, mxHdData)

    // Write out the MaterialX document
    const mxWriteOptions = new XmlWriteOptions()
    mxWriteOptions.elementPredicate = (elem: Element): boolean => {
      // skip writing all includes for brevity
      return !elem.hasSourceUri()
    }

    const outputFilename = _CreateMtlxFilename(inputFilename)
    written.set(outputFilename, writeToXmlString(mtlxDoc, mxWriteOptions))
  }
  return written
}

/** testUsdImagingHdMtlx.cpp:178-206 */
export async function main(inputFilename: string) {
  const out: string[] = []
  const mark = new TfErrorMark()
  const written = await TestHdMtlx(inputFilename, out)

  if (written && mark.isClean()) {
    out.push('OK\n')
  } else {
    out.push('FAILED\n')
  }
  return { stdout: out.join(''), written: written ?? new Map<string, string>() }
}

