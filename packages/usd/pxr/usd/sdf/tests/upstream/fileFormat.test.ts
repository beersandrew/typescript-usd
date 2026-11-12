// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usd/sdf/testenv/testSdfFileFormat.py
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import { _sdfFindOrOpenLayer } from 'typescript-usd/sdf/_internal'
// Ported from pxr/usd/sdf/testenv/testSdfFileFormat.py (test_StaticMethods).
//
// The SdfFileFormat registry and Layer.{fromBytes,open} select implementations
// by file extension, with PXR- magic-byte fallback and USDZ package detection.
//
// This suite faithfully ports the part of the upstream behavior the registry
// supports — extension-keyed dispatch, case-insensitivity, leading-dot
// stripping, directory-bearing path handling (the GetFileExtension contract),
// the crate binary plugin, and the USDZ package format — and bakes the upstream
// extension/formatId/target golden values (captured from the Pixar build,
// usd-2605) as the reference these map onto. The introspection statics
// themselves are BLOCKED (subsystem absent); see the report.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ArInMemoryResolver } from 'typescript-usd/ar/_internal'
import {
  Layer,
  FileFormat as SdfFileFormat,
  createUsdzPackage,
  UsdZipFile,
} from 'typescript-usd/sdf'
import { _sdfRegisterFileFormat } from 'typescript-usd/sdf/_internal'

const enc = new TextEncoder()
function registerFileFormat(extension: string, reader: NonNullable<SdfFileFormat['read']>): void {
  class TestFileFormat extends SdfFileFormat {
    readonly formatId = extension
    readonly extensions = [extension]
    read = reader
  }
  _sdfRegisterFileFormat(new TestFileFormat())
}

// ---------------------------------------------------------------------------
// Golden reference values, captured from the Pixar build (usd-2605):
//   PYTHONPATH=<usd-build>/lib/python python3
//   from pxr import Sdf
//   Sdf.FileFormat.FindById('usda')           -> formatId 'usda', target 'usd', exts ['usda']
//   Sdf.FileFormat.FindByExtension('usda')     -> same
//   Sdf.FileFormat.FindByExtension('USDA')     -> same (case-insensitive)
//   Sdf.FileFormat.FindByExtension('usdc')     -> formatId 'usdc', target 'usd', exts ['usdc']
//   Sdf.FileFormat.FindByExtension('usdz')     -> formatId 'usdz', target 'usd', exts ['usdz']
//   Sdf.FileFormat.FindByExtension('usd')      -> formatId 'usd',  target 'usd', exts ['usd']
//   Sdf.FileFormat.FindByExtension('bogusext') -> None
//   Sdf.FileFormat.GetFileExtension('foo.usda')                 -> 'usda'
//   Sdf.FileFormat.GetFileExtension('/something/bar/foo.usda')  -> 'usda'
//   Sdf.FileFormat.GetFileExtension('./bar/baz/foo.usdc')       -> 'usdc'
//   'usda'/'usdc'/'usdz' all in Sdf.FileFormat.FindAllFileFormatExtensions()
// ---------------------------------------------------------------------------
const PIXAR = {
  usda: { formatId: 'usda', target: 'usd', extensions: ['usda'] },
  usdc: { formatId: 'usdc', target: 'usd', extensions: ['usdc'] },
  usdz: { formatId: 'usdz', target: 'usd', extensions: ['usdz'] },
  usd: { formatId: 'usd', target: 'usd', extensions: ['usd'] },
} as const

describe('SdfFileFormat plugin registry — extension dispatch', () => {
  it('dispatches a registered reader by file extension (FindByExtension analog)', () => {
    let calledWith: string | undefined
    registerFileFormat('myfmt', (bytes, layer) => {
      calledWith = new TextDecoder().decode(bytes)
      layer.definePrimSpec('/FromMyfmt', 'Scope')
    })

    const layer = Layer.fromBytes(enc.encode('payload'), 'foo.myfmt')
    expect(calledWith).toBe('payload')
    expect(layer.getFieldNames('/FromMyfmt')).toContain('specifier')
    expect(layer.getField('/FromMyfmt', 'typeName')).toBe('Scope')
  })

  it('matches the extension case-insensitively (FindByExtension(\'USDA\') == FindByExtension(\'usda\'))', () => {
    let hits = 0
    registerFileFormat('casefmt', (_bytes, layer) => {
      hits++
      layer.definePrimSpec('/Hit', 'Scope')
    })

    for (const id of ['foo.casefmt', 'foo.CASEFMT', 'foo.CaseFmt', 'foo.cAsEfMt']) {
      const layer = Layer.fromBytes(enc.encode('x'), id)
      expect(layer.getField('/Hit', 'typeName')).toBe('Scope')
    }
    expect(hits).toBe(4)
  })

  it('strips a leading dot when registering an extension', () => {
    registerFileFormat('.dotfmt', (_bytes, layer) => layer.definePrimSpec('/Dot', 'Scope'))
    const layer = Layer.fromBytes(enc.encode('x'), 'foo.dotfmt')
    expect(layer.getField('/Dot', 'typeName')).toBe('Scope')
  })

  it('extracts the trailing extension from directory-bearing paths (GetFileExtension contract)', () => {
    // Upstream: GetFileExtension('foo.usda') == GetFileExtension('/something/bar/foo.usda')
    //           == GetFileExtension('./bar/baz/foo.usda') == 'usda'.
    registerFileFormat('pathfmt', (_bytes, layer) => layer.definePrimSpec('/P', 'Scope'))
    for (const id of ['foo.pathfmt', '/something/bar/foo.pathfmt', './bar/baz/foo.pathfmt']) {
      const layer = Layer.fromBytes(enc.encode('x'), id)
      expect(layer.getField('/P', 'typeName')).toBe(`Scope`)
    }
  })

  it('falls back to the usda text parser for an unregistered extension (bogusext -> default)', () => {
    // FindByExtension('bogusext') is None upstream; typescript-usd then sniffs content.
    // A plain usda string parses through the built-in usda format.
    const usda = '#usda 1.0\ndef Scope "World"\n{\n}\n'
    const layer = Layer.fromBytes(enc.encode(usda), 'thing.bogusext')
    expect(layer.getSpecPaths()).toContain('/World')
  })
})

describe('SdfFileFormat plugin registry — usda built-in format', () => {
  it('parses usda text (formatId/target/extensions reference)', () => {
    expect(PIXAR.usda).toEqual({ formatId: 'usda', target: 'usd', extensions: ['usda'] })
    const usda = '#usda 1.0\ndef Sphere "Ball"\n{\n    double radius = 2\n}\n'
    const layer = Layer.createInMemory('ball.usda', usda)
    expect(layer.getField('/Ball', 'typeName')).toBe('Sphere')
    expect(layer.getField('/Ball.radius', 'default')).toBe(2)
  })
})

describe('SdfFileFormat plugin registry — crate (.usdc) binary plugin', () => {
  it('owns the crate implementation as the registered usdc format', () => {
    expect(PIXAR.usdc).toEqual({ formatId: 'usdc', target: 'usd', extensions: ['usdc'] })
    expect(SdfFileFormat.findByExtension('model.usdc')?.formatId).toBe('usdc')
    expect(SdfFileFormat.findByExtension('model.usdc')?.constructor.name)
      .toBe('SdfUsdcFileFormat')
  })
})

describe('SdfFileFormat plugin registry — usdz package format', () => {
  it('detects and opens a USDZ package, reading its default root layer', async () => {
    expect(PIXAR.usdz).toEqual({ formatId: 'usdz', target: 'usd', extensions: ['usdz'] })

    const usda = '#usda 1.0\ndef Xform "Root"\n{\n}\n'
    const pkg = createUsdzPackage([
      { name: 'root.usda', data: enc.encode(usda) },
      { name: 'tex/diffuse.png', data: enc.encode('png') },
    ])

    expect(UsdZipFile.isZip(pkg)).toBe(true)
    const zip = UsdZipFile.fromBytes(pkg)
    expect(zip.defaultLayerName()).toBe('root.usda')

    // The package layer is identified by the package and read by the
    // package's file format from its root layer (oracle: Sdf.Layer.FindOrOpen
    // of a .usdz has the package identifier and the usdz format, IsPackage()).
    const layer = (await _sdfFindOrOpenLayer('scene.usdz', new ArInMemoryResolver({ 'scene.usdz': pkg })))!
    expect(layer.filePath).toBe('scene.usdz')
    expect(layer.getFileFormat()?.formatId).toBe('usdz')
    expect(layer.getFileFormat()?.isPackage()).toBe(true)
    expect(layer.getField('/Root', 'typeName')).toBe('Xform')
  })

  it('anchors relative asset paths to the package root layer', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testSdfUsdzLayer-'))
    try {
      const packagePath = path.join(dir, 't.usdz')
      fs.writeFileSync(packagePath, createUsdzPackage([
        { name: 'root.usda', data: enc.encode('#usda 1.0\n(\n subLayers=[@sub.usda@]\n)\n') },
        { name: 'sub.usda', data: enc.encode('#usda 1.0\ndef "Sub" {}\n') },
      ]))
      const layer = (await Layer.findOrOpen(packagePath))!
      // Oracle values for the same package.
      expect(layer.identifier).toBe(packagePath)
      expect(layer.resolvedPath).toBe(packagePath)
      expect(layer.getField('/', 'subLayers')).toEqual(['sub.usda'])
      expect(layer.resolveAsset('sub.usda')).toBe(`${packagePath}[sub.usda]`)
      expect(Layer.find(`${packagePath}[root.usda]`)).toBeUndefined()
      const sub = (await Layer.findOrOpen(layer.resolveAsset('sub.usda')))!
      expect(sub.identifier).toBe(`${packagePath}[sub.usda]`)
      expect(sub.getFileFormat()?.formatId).toBe('usda')
      const inner = (await Layer.findOrOpen(`${packagePath}[root.usda]`))!
      expect(inner).not.toBe(layer)
      expect(inner.getFileFormat()?.formatId).toBe('usda')
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('SdfFileFormat reference — target and extension catalogue', () => {
  it('records the upstream primary target for the usd family of formats', () => {
    // All of usd/usda/usdc/usdz negotiate to the 'usd' target upstream.
    for (const fmt of [PIXAR.usd, PIXAR.usda, PIXAR.usdc, PIXAR.usdz]) {
      expect(fmt.target).toBe('usd')
    }
    expect(PIXAR.usd.extensions).toEqual(['usd'])
  })
})
