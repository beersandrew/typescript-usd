#!/usr/bin/env node
// Ported from OpenUSD 26.11.1:
//  pxr/bin/usdfixbrokenpixarschemas/usdfixbrokenpixarschemas.py
// Copyright 2022 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdfixbrokenpixarschemas (usdfixbrokenpixarschemas.py): fixes a usd or
// usdz layer by applying the fixes UsdUtils.FixBrokenPixarSchemas defines.
// If the given usd file has any fixes to be saved, a backup is created for
// that file. If a usdz package is provided, it is extracted recursively at a
// temporary location, and fixes are applied on each layer individually,
// which are then packaged into a new usdz package, while creating a backup
// of the original.
//
// usdfixbrokenpixarschemas(argv, io) runs the tool in process and resolves
// its exit code; standard output and error go to `io` (the process's by
// default). Run as a script, the file is the command. An uncaught Python
// exception (the traceback, exit code 1) is the thrown error's message on
// standard error and exit code 1.
//
// FAITHFULNESS-DEBT(usdfixbrokenpixarschemas-argparse-subset): upstream
// parses its arguments with Python's argparse (usdfixbrokenpixarschemas.py:
// 88-106). parseArgs reads the same optional input file, --backup and
// -v/--verbose, and fails with argparse's exit code 2 for an unknown
// argument, a second input file or a missing --backup value; -h/--help
// prints a usage summary, not argparse's formatted help. A port of
// argparse's behaviour would replace it.

// The libraries this program loads. A library registers its schemas and
// validators when it is imported here, the analog of upstream loading its
// plugin: UsdUtils.FixBrokenPixarSchemas imports UsdSkel for the
// SkelBindingAPI definition (fixBrokenPixarSchemas.py:146-150), and
// GetOrLoadAllValidators loads every plugin that declares validators
// (usdValidation/registry.cpp:360-381).
import 'typescript-usd/usdSkel'
import 'typescript-usd/usdGeomValidators'
import 'typescript-usd/usdLodValidators'
import 'typescript-usd/usdLuxValidators'
import 'typescript-usd/usdMediaValidators'
import 'typescript-usd/usdPhysicsValidators'
import 'typescript-usd/usdShadeValidators'
import 'typescript-usd/usdSkelValidators'
import 'typescript-usd/usdUtilsValidators'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { _isMainScript, _pathExists, _readFile, _rename, _writeFile } from 'typescript-usd/ar/_internal'
import { Stage as UsdStage } from 'typescript-usd/usd'
import { FixBrokenPixarSchemas as UsdUtilsFixBrokenPixarSchemas, UsdzAssetIterator } from 'typescript-usd/usdUtils'
import {
  ValidationContext as UsdValidationContext, ValidationErrorType as UsdValidationErrorType,
  ValidationRegistry as UsdValidationRegistry,
} from 'typescript-usd/usdValidation'

/** Where the tool writes: sys.stdout and sys.stderr. */
export interface UsdFixBrokenPixarSchemasIO {
  stdout(text: string): void
  stderr(text: string): void
}

const PROG = 'usdfixbrokenpixarschemas'
const USAGE = `usage: ${PROG} [-h] [--backup BACKUPFILE] [-v] [inputFile]`
const HELP = `${USAGE}

Fixes usd / usdz layer by applying appropriate fixes defined in the
UsdUtils.FixBrokenPixarSchemas. If the given usd file has any fixes to be
saved, a backup is created for that file. If a usdz package is provided, it
is extracted recursively at a temp location, and fixes are applied on each
layer individually, which are then packaged into a new usdz package, while
creating a backup of the original.

positional arguments:
  inputFile             Name of the input file to inspect and fix.

options:
  -h, --help            show this help message and exit
  --backup BACKUPFILE   optional backup file path, if none provided creates a
                        <inputFile>.bck.<usda|usdc|usdz> at the inputFile
                        location
  -v, --verbose         Enable verbose mode.
`

// _AllowedUsdzExtensions and _AllowedUsdExtensions
// (usdfixbrokenpixarschemas.py:20-24).
const allowedUsdzExtensions = ['.usdz']
const allowedUsdExtensions = ['.usd', '.usda', '.usdc']

// os.path.splitext(path): [root, ext], the extension of the last component
// with its dot; leading dots do not start one.
function splitExt(path: string): [string, string] {
  const slash = path.lastIndexOf('/')
  const base = path.slice(slash + 1)
  const leadingDots = base.length - base.replace(/^\.+/, '').length
  const dot = base.lastIndexOf('.')
  if (dot < leadingDots) return [path, '']
  return [path.slice(0, slash + 1 + dot), base.slice(dot)]
}

// shutil.copyfile.
async function copyFile(src: string, dst: string): Promise<void> {
  await _writeFile(dst, await _readFile(src))
}

// _FixUsdAsset (usdfixbrokenpixarschemas.py:26-41).
async function fixUsdAsset(usdAsset: string): Promise<boolean> {
  const usdLayer = await SdfLayer.findOrOpen(usdAsset)
  if (!usdLayer) return false
  const usdLayerFixer = new UsdUtilsFixBrokenPixarSchemas(usdLayer)
  usdLayerFixer.fixupMaterialBindingAPI()
  usdLayerFixer.fixupSkelBindingAPI()
  await usdLayerFixer.fixupUpAxis()
  usdLayerFixer.fixupCoordSysAPI()
  usdLayerFixer.fixupRenderSettingsTerminalsAPI()
  if (usdLayerFixer.isLayerUpdated()) {
    await usdLayer.save()
    return true
  }
  return false
}

// _ValidateFileNames (usdfixbrokenpixarschemas.py:43-59).
function validateFileNames(inputFile: string, backupFile: string, isUsdzFile: boolean): boolean {
  const allowedInputExtension = [...allowedUsdzExtensions, ...allowedUsdExtensions]

  if (!allowedInputExtension.includes(splitExt(inputFile)[1])) return false

  if (isUsdzFile) {
    // Make sure the backup also has a usdz extension.
    if (!allowedUsdzExtensions.includes(splitExt(backupFile)[1])) return false
  } else {
    // Make sure the backup has a valid usd extension.
    if (!allowedUsdExtensions.includes(splitExt(backupFile)[1])) return false
  }
  return true
}

// _ValidateUsdz (usdfixbrokenpixarschemas.py:61-85): runs UsdValidation on
// the given layer and reports errors; true if no errors or failed checks
// were reported.
async function validateUsdz(rootLayer: string, err: (msg: string) => void): Promise<boolean> {
  const validators = UsdValidationRegistry.getInstance().getOrLoadAllValidators()
  const validationContext = new UsdValidationContext(validators)
  const stage = await UsdStage.open(rootLayer)
  if (!stage) throw new Error(`Failed to open layer @${rootLayer}@`)
  const errors = await validationContext.validate(stage)
  let errorsFound = false
  for (const error of errors) {
    if (error.getType() === UsdValidationErrorType.Error) {
      errorsFound = true
      err(`Error: ${error.getMessage()}`)
    }
  }
  let warningsReported = false
  for (const error of errors) {
    if (error.getType() === UsdValidationErrorType.Warn) {
      if (!warningsReported) {
        err('*********************************************\n' +
          'Possible correctness problems to investigate:\n' +
          '*********************************************\n')
        warningsReported = true
      }
      err(`Warning: ${error.getMessage()}`)
    }
  }
  return !errorsFound
}

type Parsed = { inputFile: string | undefined, backupFile: string | undefined, verbose: boolean } | { exitCode: number }

// usdfixbrokenpixarschemas.py:88-106. See
// FAITHFULNESS-DEBT(usdfixbrokenpixarschemas-argparse-subset).
function parseArgs(argv: readonly string[], io: UsdFixBrokenPixarSchemasIO): Parsed {
  const fail = (message: string): Parsed => {
    io.stderr(`${USAGE}\n${PROG}: error: ${message}\n`)
    return { exitCode: 2 }
  }
  const positionals: string[] = []
  const extras: string[] = []
  let backupFile: string | undefined
  let verbose = false
  let positionalOnly = false
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i]!
    if (positionalOnly || !arg.startsWith('-') || arg === '-') { positionals.push(arg); continue }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') { io.stdout(HELP); return { exitCode: 0 } }
    if (arg === '-v' || arg === '--verbose') { verbose = true; continue }
    if (arg === '--backup') {
      const value = argv[i + 1]
      if (value === undefined || (value.startsWith('-') && value !== '-')) {
        return fail('argument --backup: expected one argument')
      }
      backupFile = value
      ++i
      continue
    }
    if (arg.startsWith('--backup=')) { backupFile = arg.slice('--backup='.length); continue }
    extras.push(arg)
  }
  extras.push(...positionals.slice(1))
  if (extras.length > 0) return fail(`unrecognized arguments: ${extras.join(' ')}`)
  return { inputFile: positionals[0], backupFile, verbose }
}

// main (usdfixbrokenpixarschemas.py:87-152).
async function main(
  inputFile: string, backupFileArg: string | undefined, verbose: boolean, io: UsdFixBrokenPixarSchemasIO,
): Promise<number> {
  const err = (msg: string): void => io.stderr(`${msg}\n`)
  const inputFileExt = splitExt(inputFile)[1]
  const backupFile = backupFileArg ? backupFileArg : `${splitExt(inputFile)[0]}.bck${inputFileExt}`
  const isUsdzFile = allowedUsdzExtensions.includes(inputFileExt)

  if (!validateFileNames(inputFile, backupFile, isUsdzFile)) {
    err(`Invalid extensions on input (${inputFile}) or backup (${backupFile}) filename.`)
    return 1
  }

  let success = true

  if (!_pathExists(inputFile)) {
    err(`Input file ('${inputFile}') doesn't exist.`)
    return 1
  }

  if (isUsdzFile) {
    await copyFile(inputFile, backupFile)
    // UsdzAssetIterator will make sure to extract and pack when done!
    try {
      await new UsdzAssetIterator(inputFile, verbose).with(async usdAssetItr => {
        // Generators for usdAssets giving us recursive lazy access to
        // usdAssets within the usdz package for applying fixes.
        for await (const usdAsset of usdAssetItr.usdAssets()) {
          if (usdAsset) {
            const fixed = await fixUsdAsset(usdAsset)
            success = success || fixed
          }
        }
      })
    } catch (e) {
      err(`Error fixing or repacking usdz: ${e instanceof Error ? e.message : String(e)}`)
      success = false
    }
  } else {
    await copyFile(inputFile, backupFile)
    success = await fixUsdAsset(inputFile)
  }

  if (success) {
    await validateUsdz(inputFile, err)
  } else {
    err(`Unable to fix or no fixes required for input layer '${inputFile}'.`)

    // shutil.move.
    await _rename(backupFile, inputFile)
    return 1
  }

  return 0
}

const processIO: UsdFixBrokenPixarSchemasIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
}

/** Runs usdfixbrokenpixarschemas with the arguments `argv` (without the
 *  program name) and resolves its exit code. */
export async function usdfixbrokenpixarschemas(
  argv: readonly string[], io: UsdFixBrokenPixarSchemasIO = processIO,
): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  try {
    // os.path.splitext(None) raises TypeError when no input file is given.
    if (parsed.inputFile === undefined) throw new TypeError('expected str, bytes or os.PathLike object, not NoneType')
    return await main(parsed.inputFile, parsed.backupFile, parsed.verbose, io)
  } catch (e) {
    io.stderr(`${e instanceof Error ? e.name : 'Exception'}: ${e instanceof Error ? e.message : String(e)}\n`)
    return 1
  }
}

// Run as a script: `usdfixbrokenpixarschemas ...` on the command line.
if (await _isMainScript(import.meta.url)) {
  process.exitCode = await usdfixbrokenpixarschemas(process.argv.slice(2))
}
