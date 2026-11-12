// Ported from OpenUSD 26.11.1: pxr/base/tf/ostreamMethods.h,
//  pxr/exec/execUsd/testenv/testExecUsdConstantInput.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Shared plumbing for the ports of OpenUSD v26.11.1
// pxr/exec/execUsd/testenv/*.cpp (tests/upstream/*.test.ts). It holds only
// the mechanics the C++ test programs get from their test environment and
// the C++ standard library; every expectation stays in the test files.
//
// - _RegisterTestResources: main()'s
//   `PlugRegistry::GetInstance().RegisterPlugins(TfAbsPath("resources"))`.
//   Each testenv/<test>/resources directory is copied verbatim to
//   fixtures/<test>/resources; plugInfo.json comment lines ('#') are dropped
//   as PlugRegistry's JSON reader does, and generatedSchema.usda is handed
//   to the plugin as its resource.
// - _OpenStage: SdfLayer::CreateAnonymous(".usda"), ImportFromString and
//   UsdStage::Open. Opening a stage is asynchronous in typescript-usd.
// - _NormalizeDotFile: testenv/<test>/normalizeDotFiles.py, the
//   POST_COMMAND whose output DIFF_COMPARE checks against baseline/*.out.
//   testExecUsdConstantInput's copy also drops the constant node indices
//   (_NormalizeConstantInputDotFile).
// - _MakeTestDirectory / _DiffCompare: the test's working directory, where
//   GraphNetwork writes its .dot files, and DIFF_COMPARE of the normalized
//   <name>.out against testenv/<test>/baseline/<name>.out.
// - _OstreamPathVector: operator<<(std::ostream&, const std::vector<T>&)
//   (pxr/base/tf/ostreamMethods.h:77-87) for SdfPathVector, as TfStringify
//   prints it.

import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { Registry as PlugRegistry, type Info as PlugInfo, type Plugin as PlugPlugin } from 'typescript-usd/plug'
import { TF_AXIOM } from 'typescript-usd/tf'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import type { SdfPath } from 'typescript-usd/sdf/path'
import { Stage as UsdStage, type TimeCode as UsdTimeCode } from 'typescript-usd/usd'

const _fixtures = new URL('./fixtures/', import.meta.url)

/** The fixtures directory of the upstream test `testName`. */
export function _FixtureUrl(testName: string, relativePath: string): URL {
  return new URL(`${testName}/${relativePath}`, _fixtures)
}

/**
 * PlugRegistry::GetInstance().RegisterPlugins(TfAbsPath("resources")) for
 * the testenv resources of `testName`.
 */
export function _RegisterTestResources(testName: string): PlugPlugin[] {
  const resources = _FixtureUrl(testName, 'resources/')
  const plugInfo = JSON.parse(readFileSync(new URL('plugInfo.json', resources), 'utf8')
    .split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n')) as PlugInfo
  const pluginResources: Record<string, Record<string, string>> = {}
  for (const entry of plugInfo.Plugins ?? []) {
    if (typeof entry?.Name === 'string') {
      pluginResources[entry.Name] = {
        'generatedSchema.usda': readFileSync(new URL('generatedSchema.usda', resources), 'utf8'),
      }
    }
  }
  return PlugRegistry.GetInstance().RegisterPlugins(plugInfo, pluginResources)
}

/**
 * SdfLayer::CreateAnonymous(".usda"); layer->ImportFromString(contents);
 * UsdStage::Open(layer).
 */
export async function _OpenStage(layerContents: string): Promise<UsdStage> {
  const layer = SdfLayer.createAnonymous('.usda')
  const imported = layer.importFromString(layerContents)
  TF_AXIOM(layer)
  TF_AXIOM(imported)
  const stage = await UsdStage.open(layer)
  TF_AXIOM(stage)
  return stage
}

/**
 * normalizeDotFiles.py: replaces all hex values (`0x\w*`) with 'xxxxxxx'
 * and sorts the lines, comparing them without their line endings.
 */
export function _NormalizeDotFile(contents: string): string {
  const lines = contents.split(/(?<=\n)/).map(line => line.replace(/0x\w*/g, 'xxxxxxx'))
  const key = (line: string): string => line.replace(/[\r\n]+$/, '')
  lines.sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
  return lines.join('')
}

/**
 * testenv/testExecUsdConstantInput/normalizeDotFiles.py: as
 * _NormalizeDotFile, and on each line that matches constantPattern
 * (normalizeDotFiles.py:24-27, 38-40) the constant node index is dropped:
 * `match[1] + match[2] + "\n"`.
 */
export function _NormalizeConstantInputDotFile(contents: string): string {
  const constantPattern = /^(.*disambiguatingId=&apos;constant_.*_)[0-9]+(&apos;.*)/
  return _NormalizeDotFile(contents.split(/(?<=\n)/).map((line) => {
    const updatedLine = line.replace(/0x\w*/g, 'xxxxxxx')
    const match = constantPattern.exec(updatedLine)
    return match ? match[1]! + match[2]! + '\n' : updatedLine
  }).join(''))
}

/** A new, empty working directory for the test program `testName`. */
export function _MakeTestDirectory(testName: string): string {
  return mkdtempSync(join(tmpdir(), `${testName}-`))
}

/**
 * POST_COMMAND normalizeDotFiles.py <name>.dot, then DIFF_COMPARE <name>.out
 * against the upstream baseline.
 */
export function _DiffCompare(
  testName: string, directory: string, name: string,
  normalize: (contents: string) => string = _NormalizeDotFile): void {
  const normalized = normalize(readFileSync(join(directory, `${name}.dot`), 'utf8'))
  const baseline = readFileSync(_FixtureUrl(testName, `baseline/${name}.out`), 'utf8')
  expect(normalized, `DIFF_COMPARE ${name}.out`).toBe(baseline)
}

/** std::ostream << SdfPathVector (pxr/base/tf/ostreamMethods.h:77-87). */
export function _OstreamPathVector(paths: readonly SdfPath[]): string {
  let out = '[ '
  for (const path of paths) {
    out += path.pathString + ' '
  }
  return out + ']'
}

/** UsdTimeCode::operator== (pxr/usd/usd/timeCode.h:165-171). */
export function _TimeCodeEquals(lhs: UsdTimeCode, rhs: UsdTimeCode): boolean {
  if (lhs.isDefault() && rhs.isDefault()) {
    return true
  }
  return lhs.GetValue() === rhs.GetValue() &&
    lhs.isPreTime() === rhs.isPreTime()
}
