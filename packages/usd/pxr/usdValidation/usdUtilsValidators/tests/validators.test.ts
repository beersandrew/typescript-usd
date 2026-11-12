// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdValidation/usdUtilsValidators/validators.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd's own checks of the usdUtilsValidators upstream bugs fixed
// in src/validators.ts (upstream-issues UI-4733, UI-4734). OpenUSD 26.11.1
// reports the upper-case extensions and passes the shared-prefix sibling; the
// expectations here are the documented behavior instead.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { _resetResolverForTest } from 'typescript-usd/ar/_internal'
import { ZipFileWriter as SdfZipFileWriter } from 'typescript-usd/sdf'
import { Stage } from 'typescript-usd/usd'
import { ValidationRegistry as UsdValidationRegistry } from 'typescript-usd/usdValidation'
import { ValidatorNameTokens as UsdUtilsValidatorNameTokens } from '../src/index.ts'

let dir = ''
beforeAll(() => { dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'usdUtilsValidators-'))) })
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))
beforeEach(() => _resetResolverForTest())

function write(file: string, text: string): string {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

async function writePackage(pkg: string, files: Record<string, string>): Promise<string> {
  const writer = await SdfZipFileWriter.createNew(pkg)
  for (const [inArchive, src] of Object.entries(files)) writer.addFile(src, inArchive)
  await writer.save()
  return pkg
}

describe('usdUtilsValidators upstream bugs fixed here', () => {
  // UI-4733: plugInfo.json's doc lists ".M4A, .MP3, .WAV"; upstream compares
  // case-sensitively (validators.cpp:113-116,149-150).
  it('FileExtensionValidator accepts supported extensions in any case', async () => {
    const root = write(path.join(dir, 'ext', 'root.usda'), '#usda 1.0\n')
    const blob = write(path.join(dir, 'ext', 'blob.bin'), 'x'.repeat(16))
    const pkg = await writePackage(path.join(dir, 'ext', 'pkg.usdz'), {
      'root.usda': root, 'sound.MP3': blob, 'tex.PNG': blob, 'clip.Wav': blob,
      'cube.INVALID': blob,
    })
    const validator = UsdValidationRegistry.getInstance().getOrLoadValidatorByName(
      UsdUtilsValidatorNameTokens.fileExtensionValidator)!
    const stage = (await Stage.open(pkg))!
    const messages = (await validator.validate(stage)).map(e => e.getMessage())
    expect(messages).toEqual([
      `File 'cube.INVALID' in package '${stage.getRootLayer().identifier}' has an unknown `
      + "unsupported extension 'INVALID'.",
    ])
  })

  // UI-4734: upstream's TfStringStartsWith(path, packagePath)
  // (validators.cpp:75,90) treats "<dir>/pkg.usdz_extra/..." as inside
  // "<dir>/pkg.usdz".
  it('PackageEncapsulationValidator flags a sibling that shares the package path prefix', async () => {
    const layerText = '#usda 1.0\n(defaultPrim = "O")\ndef "O" {}\n'
    const sibling = write(path.join(dir, 'enc', 'pkg.usdz_extra', 'outside.usda'), layerText)
    const siblingAsset = write(path.join(dir, 'enc', 'pkg.usdz_extra', 'tex.png'), 'x')
    const root = write(path.join(dir, 'enc', 'root.usda'), `#usda 1.0
def "A" (references = @${sibling}@)
{
    asset tex = @${siblingAsset}@
}
`)
    const pkg = await writePackage(path.join(dir, 'enc', 'pkg.usdz'), { 'root.usda': root })
    const validator = UsdValidationRegistry.getInstance().getOrLoadValidatorByName(
      UsdUtilsValidatorNameTokens.packageEncapsulationValidator)!
    const stage = (await Stage.open(pkg))!
    const errors = await validator.validate(stage)
    const packagePath = stage.getRootLayer().realPath
    expect(errors.map(e => e.getIdentifier())).toEqual([
      'usdUtilsValidators:PackageEncapsulationValidator.LayerNotInPackage',
      'usdUtilsValidators:PackageEncapsulationValidator.AssetNotInPackage',
    ])
    expect(errors[0]!.getMessage()).toBe(
      `Found referenced layer '${sibling}' that does not belong to the package '${packagePath}'.`)
    expect(errors[1]!.getMessage()).toBe(
      `Found asset reference '${siblingAsset}' that does not belong to the package '${packagePath}'.`)
  })
})
