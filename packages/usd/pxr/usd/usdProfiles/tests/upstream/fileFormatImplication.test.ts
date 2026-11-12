// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdProfiles/testenv/TestUsdProfilesPhonyFileFormat.cpp,
//  pxr/usd/usdProfiles/testenv/testUsdProfilesFileFormatImplication.cpp,
//  pxr/usd/usdProfiles/testenv/testUsdProfilesFileFormatImplicationPy.py
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdProfiles/testenv/
// testUsdProfilesFileFormatImplicationPy.py and testUsdProfilesFileFormatImplication.cpp. The phony
// plugin's plugInfo.json is vendored verbatim; as upstream's
// TestUsdProfilesPhonyFileFormat.cpp defines the format in the plugin's
// library, this file defines it with SdfDefineFileFormat. Its plugin is
// registered as part of this build (no library to load).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { Stage, ColorSpaceAPI } from 'typescript-usd/usd'
import { DefineFileFormat, FileFormat, type Layer } from 'typescript-usd/sdf'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { Type as TfType } from 'typescript-usd/tf'
import { ClaimsAPI as CA, ProfileRegistry as PR, QueryStatus as QS } from 'typescript-usd/usdProfiles'

const fixtures = new URL('../fixtures/testenv/', import.meta.url)
const phonyPath = fileURLToPath(new URL('testUsdProfilesFileFormatImplication/minimal.phony', fixtures))

// TestUsdProfilesPhonyFileFormat.cpp:22-55: reads any file as an empty layer.
class UsdProfilesTestPhonyFileFormat extends FileFormat {
  readonly formatId = 'phony'
  readonly extensions = ['phony']
  read(_bytes: Uint8Array, layer: Layer, args: ReadonlyMap<string, string>): void {
    layer._setDataFromFileFormat(this.initData(args))
  }
}

beforeAll(() => {
  // The build substitutes the @TEST_PLUG_INFO_*@ placeholders.
  const text = readFileSync(new URL('TestUsdProfilesPhonyFileFormat_plugInfo.json', fixtures), 'utf8')
    .replace(/@TEST_PLUG_INFO_[A-Z_]+@/g, '')
  const plugins = PlugRegistry.GetInstance().RegisterPlugins(JSON.parse(text) as PlugInfo)
  expect(plugins.map(p => p.getName())).toEqual(['TestUsdProfilesPhonyFileFormat'])
  DefineFileFormat('UsdProfilesTestPhonyFileFormat', UsdProfilesTestPhonyFileFormat)
})

async function stageWithPhonySublayer(): Promise<Stage> {
  const stage = Stage.createNew()
  stage.getRootLayer().insertSubLayerPath(phonyPath)
  await stage.flushChanges()
  return stage
}

describe('TestPhonyCapabilityGraph', () => {
  it('TestCapabilityPresent', () => expect(PR.hasCapability('test')).toBe(true))
  it('PhonyCapabilityPresent', () => expect(PR.hasCapability('test.phony')).toBe(true))
  it('PhonyFileFormatCapabilityPresent', () => expect(PR.hasCapability('test.phony.fileformat')).toBe(true))
  it('PhonyFileFormatTransitivelyReachesTest', () => {
    expect(PR.hasPredecessor('test.phony.fileformat', 'test')).toBe(QS.ValidPath)
  })
})

describe('TestFileFormatRegistryQuery', () => {
  it('PhonyFileFormatImpliesFileFormatCapability', () => {
    const t = TfType.findByName('UsdProfilesTestPhonyFileFormat')
    expect(t.isUnknown()).toBe(false)
    expect(PR.getFileFormatImpliedCapabilities(t)).toContain('test.phony.fileformat')
  })
  it('UnknownTypeReturnsEmpty', () => {
    expect(PR.getFileFormatImpliedCapabilities(TfType.getUnknownType())).toEqual([])
  })
  it('ResultIsCached', () => {
    const t = TfType.findByName('UsdProfilesTestPhonyFileFormat')
    expect(PR.getFileFormatImpliedCapabilities(t)).toEqual(PR.getFileFormatImpliedCapabilities(t))
  })
})

describe('TestFileFormatAggregation', () => {
  it('PhonySublayerContributesCapabilityAtDefaultHard', async () => {
    const stage = await stageWithPhonySublayer()
    const claims = CA.Apply(stage.definePrim('/Root'))
    const merged = claims.populateCapabilityUsages()
    expect(merged['test.phony.fileformat']).toBe('hard')
    expect(claims.getCapabilityUsages()).toEqual(merged)
  })
  it('NoPhonySublayerNoCapability', () => {
    const stage = Stage.createNew()
    expect(CA.Apply(stage.definePrim('/Root')).populateCapabilityUsages()).not.toHaveProperty(['test.phony.fileformat'])
  })
  it('MixedSchemaAndFileFormatCapabilities', async () => {
    const stage = await stageWithPhonySublayer()
    const root = stage.definePrim('/Root')
    ColorSpaceAPI.apply(root)
    const merged = CA.Apply(root).populateCapabilityUsages()
    expect(merged['usd.core.colorspace']).toBe('hard')
    expect(merged['test.phony.fileformat']).toBe('hard')
  })
  it('AuthoredEnhancementWinsOverDefault', async () => {
    const stage = await stageWithPhonySublayer()
    const claims = CA.Apply(stage.definePrim('/Root'))
    claims.setCapabilityUsage('test.phony.fileformat', 'enhancement')
    expect(claims.populateCapabilityUsages()['test.phony.fileformat']).toBe('enhancement')
  })
  it('AnonymousLayerNotCounted', () => {
    const stage = Stage.createNew()
    expect(CA.Apply(stage.definePrim('/Root')).populateCapabilityUsages()).not.toHaveProperty(['test.phony.fileformat'])
  })
})
