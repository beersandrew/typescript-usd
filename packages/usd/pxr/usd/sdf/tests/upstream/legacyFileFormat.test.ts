// Ported from OpenUSD 26.11.1: pxr/usd/sdf/testenv/testSdfLegacyFileFormat.py,
//  pxr/usd/sdf/usdaFileFormat.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from pxr/usd/sdf/testenv/testSdfLegacyFileFormat.py (OpenUSD 26.11.1),
// which pxr/usd/sdf/CMakeLists.txt registers twice: testSdfLegacyFileFormat
// (SDF_FILE_FORMAT_LEGACY_IMPORT unset, default "warn") and
// testSdfLegacyFileFormat_Error (SDF_FILE_FORMAT_LEGACY_IMPORT=error).
//
// test_ReadLegacySdfFileFormat imports a string headed with the legacy
// `#sdf 1.4.32` cookie. SdfUsdaFileFormat::ReadFromString
// (usdaFileFormat.cpp:565-600) rewrites it to `#usda 1.0` under "allow" or
// "warn" (warning under "warn"), and otherwise posts a runtime error and fails,
// which Python raises as Tf.ErrorException; the TS import throws that error.
// Layer.importFromString is SdfLayer::ImportFromString.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Layer } from 'typescript-usd/sdf'
import { Error as TfError, TfDiagnosticTrap, TfDiagnosticType } from 'typescript-usd/tf'

const importStr = `#sdf 1.4.32
            def "Prim" {}
        `

function readLegacySdfFileFormat(legacyRead: string) {
  vi.stubEnv('SDF_FILE_FORMAT_LEGACY_IMPORT', legacyRead)
  const layer = Layer.createAnonymous()
  if (legacyRead === 'allow' || legacyRead === 'warn') {
    const trap = new TfDiagnosticTrap()
    try {
      expect(layer.importFromString(importStr)).toBe(true)
      expect(layer.getPrimAtPath('/Prim')).toBeTruthy()
      const warnings = trap.getWarnings().map(w => w.getCommentary())
      expect(warnings).toEqual(legacyRead === 'warn'
        ? ["'#sdf 1.4.32' is a deprecated format for reading. Use '#usda 1.0' instead."]
        : [])
    } finally {
      trap.clear()
    }
  } else if (legacyRead === 'error') {
    let raised: unknown
    try { layer.importFromString(importStr) } catch (error) { raised = error }
    expect(raised).toBeInstanceOf(TfError)
    expect((raised as TfError).getDiagnosticCode()).toBe(TfDiagnosticType.RuntimeError)
    expect((raised as TfError).getCommentary()).toBe(
      "'#sdf 1.4.32' is not a supported format for reading. Use '#usda 1.0' instead.")
    expect(layer.getPrimAtPath('/Prim')).toBeFalsy()
  }
}

afterEach(() => { vi.unstubAllEnvs() })

describe('testSdfLegacyFileFormat', () => {
  it('test_ReadLegacySdfFileFormat (default "warn")', () => {
    readLegacySdfFileFormat('warn')
  })

  // Not a registration upstream; the third value the setting documents.
  it('test_ReadLegacySdfFileFormat with "allow"', () => {
    readLegacySdfFileFormat('allow')
  })
})

describe('testSdfLegacyFileFormat_Error', () => {
  it('test_ReadLegacySdfFileFormat (SDF_FILE_FORMAT_LEGACY_IMPORT=error)', () => {
    readLegacySdfFileFormat('error')
  })
})
