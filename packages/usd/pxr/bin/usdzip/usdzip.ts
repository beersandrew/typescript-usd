#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/bin/usdzip/usdzip.cpp
// Copyright 2025 Apple. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdzip (usdzip.cpp): creates a .usdz file from files or from an asset and
// its dependencies, and lists or dumps the contents of an existing one.
//
// usdzip(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io` (the process's by default). Run as a
// script, the file is the command. Reading and writing files is asynchronous
// here, so the tool is.
//
// FAITHFULNESS-DEBT(usdzip-cli11-subset): upstream parses its arguments with
// CLI11 (pxr/base/tf/pxrCLI11/CLI11.h, Configure at usdzip.cpp:40-84).
// parseArgs reads the same options, flags and positionals (the usdz file,
// then every other positional as an input file), and fails with CLI11's
// exit codes for an unknown argument and a missing option value; -h/--help
// prints a usage summary, not CLI11's formatted help. A port of pxrCLI11
// would replace it.

// The libraries this program loads: --checkCompliance runs every validator
// (usdValidation/registry.cpp:360-381), which register when imported here.
import 'typescript-usd/usdGeomValidators'
import 'typescript-usd/usdLodValidators'
import 'typescript-usd/usdLuxValidators'
import 'typescript-usd/usdMediaValidators'
import 'typescript-usd/usdPhysicsValidators'
import 'typescript-usd/usdShadeValidators'
import 'typescript-usd/usdSkelValidators'
import 'typescript-usd/usdUtilsValidators'

import { Debug as TfDebug, TfGetExtension } from 'typescript-usd/tf'
import { AssetPath as SdfAssetPath, Layer as SdfLayer, UsdZipFile as SdfZipFile, ZipFileWriter as SdfZipFileWriter } from 'typescript-usd/sdf'
import { GetResolver as ArGetResolver, ResolverContextBinder as ArResolverContextBinder } from 'typescript-usd/ar'
import { _isDir, _isMainScript, _listDir, _pathExists, _readFile, _writeFile } from 'typescript-usd/ar/_internal'
import {
  ValidationContext as UsdValidationContext, ValidationErrorType as UsdValidationErrorType,
  ValidationRegistry as UsdValidationRegistry,
} from 'typescript-usd/usdValidation'
import { UsdUtilsCreateNewUsdzPackage } from 'typescript-usd/usdUtils'

/** Where the tool writes: std::cout and std::cerr, and whether each is a
 *  terminal (ArchFileIsaTTY), which colors compliance messages. */
export interface UsdZipIO {
  stdout(text: string): void
  stderr(text: string): void
  stdoutIsTTY?: boolean
}

// Args (usdzip.cpp:29-38).
interface Args {
  usdzFile: string
  inputFiles: string[]
  recurse: boolean
  asset: string
  checkCompliance: boolean
  listTarget: string
  dumpTarget: string
  verbose: boolean
}

// CLI::ExitCodes (CLI11.h:662-680).
const ExitCodes = { ExtrasError: 109, ArgumentMismatch: 114 } as const

const USAGE = `Utility for creating a .usdz file containing USD assets and for inspecting existing .usdz files.
Usage: usdzip [OPTIONS] [usdzFile] [inputFiles...]

Positionals:
  usdzFile TEXT               Name of the .usdz file to create or to inspect the contents of.
  inputFiles TEXT ...         Files to include in the .usdz files

Options:
  -h,--help                   Print this help message and exit
  -r,--recurse                If specified, files in sub-directories are recursively added to the package
  -a,--asset TEXT             Resolvable asset path pointing to the root layer of the asset to be isolated and copied into the package.
  -c,--checkCompliance        Perform compliance checking of the input files.
  -l,--list TEXT              List contents of the specified usdz file.
  -d,--dump TEXT              Dump contents of the specified usdz file.
  -v,--verbose                Enable verbose mode.
`

type Parsed = { args: Args } | { exitCode: number }

// Configure (usdzip.cpp:40-84) and CLI11_PARSE (usdzip.cpp:417). See
// FAITHFULNESS-DEBT(usdzip-cli11-subset).
function parseArgs(argv: readonly string[], io: UsdZipIO): Parsed {
  const args: Args = {
    usdzFile: '', inputFiles: [], recurse: false, asset: '', checkCompliance: false,
    listTarget: '', dumpTarget: '', verbose: false,
  }
  const flags: Record<string, 'recurse' | 'checkCompliance' | 'verbose'> = {
    '-r': 'recurse', '--recurse': 'recurse', '-c': 'checkCompliance', '--checkCompliance': 'checkCompliance',
    '-v': 'verbose', '--verbose': 'verbose',
  }
  const options: Record<string, 'asset' | 'listTarget' | 'dumpTarget'> = {
    '-a': 'asset', '--asset': 'asset', '-l': 'listTarget', '--list': 'listTarget', '-d': 'dumpTarget',
    '--dump': 'dumpTarget',
  }
  const fail = (message: string, exitCode: number): Parsed => {
    io.stderr(`${message}\nRun with --help for more information.\n`)
    return { exitCode }
  }
  const positionals: string[] = []
  const extras: string[] = []
  let positionalOnly = false
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i]!
    if (positionalOnly || !arg.startsWith('-') || arg === '-') { positionals.push(arg); continue }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') { io.stdout(USAGE); return { exitCode: 0 } }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const name = eq < 0 ? arg : arg.slice(0, eq)
    const flag = flags[name]
    if (flag !== undefined && eq < 0) { args[flag] = true; continue }
    const option = options[name]
    if (option === undefined) { extras.push(arg); continue }
    let value: string | undefined
    if (eq >= 0) value = arg.slice(eq + 1)
    else if (i + 1 < argv.length) value = argv[++i]
    if (value === undefined) return fail(`Argument ${name} requires an argument`, ExitCodes.ArgumentMismatch)
    args[option] = value
  }
  if (extras.length > 0) {
    return fail(`${extras.length > 1 ? 'The following arguments were not expected: '
      : 'The following argument was not expected: '}${extras.join(' ')}`, ExitCodes.ExtrasError)
  }
  args.usdzFile = positionals[0] ?? ''
  args.inputFiles = positionals.slice(1)
  return { args }
}

// An output stream: std::cout or an std::ofstream.
interface Output {
  write(text: string): void
  isTTY: boolean
}

// _PrintMessage (usdzip.cpp:86-101).
function printMessage(output: Output, msg: string, color = ''): void {
  if (color !== '' && output.isTTY) output.write(`${color}${msg}\x1b[0m\n`)
  else output.write(`${msg}\n`)
}

// CheckCompliance (usdzip.cpp:103-164), ported from usdchecker's
// _ReportValidationErrors. Note that it reports failure (false) when any
// error, warning or info was reported, as upstream does.
async function checkCompliance(rootLayer: string, output: Output, io: UsdZipIO): Promise<boolean> {
  const _ErrorColor = '\x1b[91m'
  const _WarningColor = '\x1b[93m'
  const _InfoColor = '\x1b[94m'
  const _SuccessColor = '\x1b[92m'

  const validators = UsdValidationRegistry.getInstance().getOrLoadAllValidators()
  const ctx = new UsdValidationContext(validators)

  const layer = await SdfLayer.findOrOpen(rootLayer)
  if (!layer) return false

  const errors = await ctx.validate(layer)
  if (errors.length === 0) return true

  let reportFailure = false
  let reportWarning = false

  for (const error of errors) {
    switch (error.getType()) {
      case UsdValidationErrorType.Error:
        reportFailure = true
        printMessage(output, error.getErrorAsString(), _ErrorColor)
        break
      case UsdValidationErrorType.Warn:
        reportWarning = true
        printMessage(output, error.getErrorAsString(), _WarningColor)
        break
      case UsdValidationErrorType.Info:
      case UsdValidationErrorType.None:
        printMessage(output, error.getErrorAsString(), _InfoColor)
        break
      default:
        io.stderr('Error: Unknown error type.\n')
        break
    }
  }

  if (reportFailure) {
    printMessage(output, 'Failed!', _ErrorColor)
    return false
  }

  if (reportWarning) printMessage(output, 'Success with warnings...', _WarningColor)
  else printMessage(output, 'Success!', _SuccessColor)

  return false
}

// TfListDir(path, recursive) (tf/fileUtils.cpp:648-675): every entry under
// `path` top-down, each as `path`/name, directories with a trailing '/'.
function tfListDir(path: string, recursive: boolean): string[] {
  const result: string[] = []
  const walk = (dirpath: string) => {
    const names = _listDir(dirpath)
    const dirnames = names.filter(n => _isDir(`${dirpath}/${n}`))
    const filenames = names.filter(n => !_isDir(`${dirpath}/${n}`))
    for (const d of dirnames) result.push(`${dirpath}/${d}/`)
    for (const f of filenames) result.push(`${dirpath}/${f}`)
    if (recursive) for (const d of dirnames) walk(`${dirpath}/${d}`)
  }
  walk(path)
  return result
}

// ArchGetFileLength: the file's length, or -1 when it cannot be read.
async function fileLength(path: string): Promise<number> {
  if (!_pathExists(path) || _isDir(path)) return -1
  try {
    return (await _readFile(path)).length
  } catch {
    return -1
  }
}

// std::sort over std::string's operator<.
function stringCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// CreateUsdzPackage (usdzip.cpp:166-219).
async function createUsdzPackage(
  usdzFile: string, filesToAdd: readonly string[], recurse: boolean, check: boolean, verbose: boolean,
  io: UsdZipIO,
): Promise<boolean> {
  const fileList: string[] = []
  for (const path of filesToAdd) {
    if (_isDir(path)) {
      const paths = tfListDir(path, recurse).sort(stringCompare)
      for (const p of paths) {
        if (!_isDir(p) && await fileLength(p) > 0) {
          if (verbose) io.stdout(`.. adding: ${p}\n`)
          fileList.push(p)
        }
      }
    } else if (await fileLength(path) > 0) {
      if (verbose) io.stdout(`.. adding: ${path}\n`)
      fileList.push(path)
    }
  }

  if (fileList.length === 0) {
    io.stderr('No files to package\n')
    return false
  }

  if (check && !await checkCompliance(fileList[0]!, { write: t => io.stdout(t), isTTY: io.stdoutIsTTY ?? false }, io)) {
    return false
  }

  const writer = await SdfZipFileWriter.createNew(usdzFile)
  for (const f of fileList) {
    if (writer.addFile(f) === '') {
      io.stderr(`Failed to add file ${f} to package. Discarding package\n`)
      if (writer.isValid()) await writer.discard()
      return false
    }
  }

  // ~SdfZipFileWriter saves the archive (zipFile.cpp:965-970).
  if (writer.isValid()) await writer.save()
  return true
}

// The zip file's entry names, in archive order.
function fileNames(zipfile: SdfZipFile): string[] {
  return zipfile.getFileNames()
}

// std::cout, or an std::ofstream on `path` written when the block is done.
async function withOutput(path: string, io: UsdZipIO, body: (out: (text: string) => void) => void): Promise<void> {
  if (path === '-') {
    body(t => io.stdout(t))
    return
  }
  let text = ''
  body(t => { text += t })
  await _writeFile(path, new TextEncoder().encode(text))
}

// ListContents (usdzip.cpp:221-239).
async function listContents(path: string, zipfile: SdfZipFile, io: UsdZipIO): Promise<void> {
  await withOutput(path, io, out => {
    for (const fn of fileNames(zipfile)) out(`${fn}\n`)
  })
}

// DumpContents (usdzip.cpp:241-271).
async function dumpContents(path: string, zipfile: SdfZipFile, io: UsdZipIO): Promise<void> {
  await withOutput(path, io, out => {
    const filenames = fileNames(zipfile)

    out('    Offset\t      Comp\t    Uncomp\tName\n')
    out('    ------\t      ----\t    ------\t----\n')

    for (const fn of filenames) {
      const info = zipfile.getFileInfo(fn)!
      const w = (n: number) => String(n).padStart(10)
      out(`${w(info.dataOffset)}\t${w(info.size)}\t${w(info.uncompressedSize)}\t${fn}\n`)
    }

    out(`----------\n${filenames.length} files total\n`)
  })
}

// USDZip (usdzip.cpp:273-406).
async function usdZipRun(args: Args, io: UsdZipIO): Promise<number> {
  if (args.inputFiles.length > 0 && args.asset !== '') {
    io.stderr('Specify either inputFiles or an asset (via --asset)\n')
    return 1
  }

  // If usdzFile is not specified directly as an argument, check if it has
  // been specified as an argument to the --list or --dump options. In these
  // cases, output the list or the contents to stdout.
  let listTarget = args.listTarget
  let dumpTarget = args.dumpTarget
  let usdzFile = args.usdzFile
  if (usdzFile === '') {
    if (listTarget !== '' && listTarget !== '-' && TfGetExtension(listTarget.toLowerCase()) === 'usdz' &&
        _pathExists(listTarget)) {
      usdzFile = listTarget
      listTarget = '-'
    } else if (dumpTarget !== '' && dumpTarget !== '-' && TfGetExtension(dumpTarget.toLowerCase()) === 'usdz' &&
               _pathExists(dumpTarget)) {
      usdzFile = dumpTarget
      dumpTarget = '-'
    } else {
      io.stderr('No usdz file specified.\n')
      return 1
    }
  }

  // In package creation mode with verbose mode enabled, print some useful
  // information.
  if (args.asset !== '' || args.inputFiles.length > 0) {
    if (TfGetExtension(usdzFile.toLowerCase()) !== 'usdz') usdzFile += '.usdz'

    if (args.verbose) {
      if (_pathExists(usdzFile)) io.stdout(`File at path ${usdzFile} already exists. Overwriting file.\n`)

      if (args.inputFiles.length > 0) {
        io.stdout(`Creating package ${usdzFile} with files ${args.inputFiles.map(i => `${i}, `).join('')}\n`)
      }

      if (args.asset !== '') TfDebug.setDebugSymbolsByName('USDUTILS_CREATE_USDZ_PACKAGE', true)

      if (!args.recurse) io.stdout('Not recursing into sub-directories.\n')
    }
  } else if (args.checkCompliance) {
    io.stderr("--checkCompliance should only be specified when creating a usdz package. Please use 'usdchecker' to" +
      'check compliance of an existing .usdz file.\n')
    return 1
  }

  let success = true
  if (args.inputFiles.length > 0) {
    success = await createUsdzPackage(usdzFile, args.inputFiles, args.recurse, args.checkCompliance, args.verbose, io)
  } else if (args.asset !== '') {
    const resolver = ArGetResolver()
    const resolvedAsset = (await resolver.resolve(args.asset)).toString()
    if (args.checkCompliance) {
      success = await checkCompliance(resolvedAsset, { write: t => io.stdout(t), isTTY: io.stdoutIsTTY ?? false }, io)
    }

    const context = resolver.createDefaultContextForAsset(resolvedAsset)
    // Create the package only if the compliance check was passed.
    success = success && await new ArResolverContextBinder(context).run(() =>
      UsdUtilsCreateNewUsdzPackage(new SdfAssetPath(args.asset), args.usdzFile))
  }

  if (!success) {
    io.stderr('Failed to author USDZ file\n')
    return 1
  }

  if (listTarget !== '' || dumpTarget !== '') {
    if (!_pathExists(usdzFile)) {
      io.stderr(`Can't find usdz file at path ${usdzFile}\n`)
      return 1
    }
    const zipfile = await SdfZipFile.open(usdzFile)
    if (!zipfile) {
      io.stderr(`Failed to open usdz file at path ${usdzFile}\n`)
      return 1
    }
    if (dumpTarget !== '') {
      if (dumpTarget === usdzFile) {
        io.stderr(`The file into which the contents will be dumped ${usdzFile} must be different from the file itself.\n`)
        return 1
      }
      await dumpContents(dumpTarget, zipfile, io)
    }
    if (listTarget !== '') {
      if (listTarget === usdzFile) {
        io.stderr(`The file into which the contents will be listed ${usdzFile} must be different from the file itself.\n`)
        return 1
      }
      await listContents(listTarget, zipfile, io)
    }
  }

  return 0
}

const processIO: UsdZipIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
  get stdoutIsTTY() { return process.stdout.isTTY === true },
}

/** main (usdzip.cpp:408-419): runs usdzip with the arguments `argv`
 *  (without the program name) and resolves its exit code. */
export async function usdzip(argv: readonly string[], io: UsdZipIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  return usdZipRun(parsed.args, io)
}

// Run as a script: `usdzip ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usdzip(process.argv.slice(2))
