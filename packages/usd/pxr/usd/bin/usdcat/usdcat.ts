#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdcat/usdcat.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdcat (usdcat.cpp): writes usd file(s) either as text to stdout or to a
// specified output file, optionally flattening the composed stage or its
// root layer stack.
//
// usdcat(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io` (the process's by default). Run as a
// script, the file is the command. Opening and writing files is
// asynchronous here, so the tool is.
//
// FAITHFULNESS-DEBT(usdcat-cli11-subset): upstream parses its arguments with
// CLI11 (pxr/base/tf/pxrCLI11/CLI11.h, Configure at usdcat.cpp:45-104).
// parseArgs reads the same options, flags and positional inputs, and fails
// with CLI11's exit codes for a missing input, an unknown argument, a
// missing option value and a --usdFormat outside usda|usdc; -h/--help prints
// a usage summary, not CLI11's formatted help. A port of pxrCLI11 would
// replace it.

import {
  TfErrorMark, TfGetExtension, TfStringTokenize, TF_RUNTIME_ERROR, Error as TfError,
} from 'typescript-usd/tf'
import { FileFormat as SdfFileFormat, Layer as SdfLayer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  GetResolver as ArGetResolver, ResolverContextBinder as ArResolverContextBinder,
} from 'typescript-usd/ar'
import { _isMainScript, _isWritable, _pathExists, _rename } from 'typescript-usd/ar/_internal'
import { Stage as UsdStage, StagePopulationMask as UsdStagePopulationMask } from 'typescript-usd/usd'
import { UsdUtilsCopyLayerMetadata, UsdUtilsFlattenLayerStack } from 'typescript-usd/usdUtils'

/** Where the tool writes: std::cout and std::cerr. */
export interface UsdCatIO {
  stdout(text: string): void
  stderr(text: string): void
}

// Args (usdcat.cpp:33-43).
interface Args {
  inputFiles: string[]
  output: string
  usdFormat: string
  mask: string
  loadOnly: boolean
  flatten: boolean
  flattenLayerStack: boolean
  skipSourceFileComment: boolean
  layerMetadata: boolean
}

// CLI::ExitCodes (CLI11.h:662-680).
const ExitCodes = { ValidationError: 105, RequiredError: 106, ExtrasError: 109, ArgumentMismatch: 114 } as const

const DESCRIPTION = 'Write usd file(s) either as text to stdout or to a specified output file.'

const USAGE = `${DESCRIPTION}
Usage: usdcat [OPTIONS] inputFiles...

Positionals:
  inputFiles ...              A list of input files

Options:
  -h,--help                   Print this help message and exit
  -o,--out file               Write a single input file to this output file instead of stdout.
  --usdFormat usda|usdc       Use this underlying file format for output files
                              with the extension 'usd'.
  -l,--loadOnly               Attempt to load the specified input files and report 'OK'
                              or 'ERR' for each one.
  -f,--flatten                Compose stages with the input files as root layers
                              and write their flattened content.
  --flattenLayerStack         Flatten the layer stack with the given root layer, and
                              write out the results.
  --skipSourceFileComment     If --flatten is specified, skip adding a comment regarding the
                              source of the flattened layer.
  --mask PRIMPATH[,PRIMPATH...]
                              Limit stage population to these prims, their descendants and
                              ancestors. Requires --flatten.
  --layerMetadata             Load only layer metadata in the USD file.
`

type Parsed = { args: Args } | { exitCode: number }

// Configure (usdcat.cpp:45-104) and CLI11_PARSE (usdcat.cpp:324). See
// FAITHFULNESS-DEBT(usdcat-cli11-subset).
function parseArgs(argv: readonly string[], io: UsdCatIO): Parsed {
  const args: Args = {
    inputFiles: [], output: '', usdFormat: '', mask: '', loadOnly: false, flatten: false,
    flattenLayerStack: false, skipSourceFileComment: false, layerMetadata: false,
  }
  const flags: Record<string, keyof Args> = {
    '-l': 'loadOnly', '--loadOnly': 'loadOnly', '-f': 'flatten', '--flatten': 'flatten',
    '--flattenLayerStack': 'flattenLayerStack', '--skipSourceFileComment': 'skipSourceFileComment',
    '--layerMetadata': 'layerMetadata',
  }
  const options: Record<string, 'output' | 'usdFormat' | 'mask'> = {
    '-o': 'output', '--out': 'output', '--usdFormat': 'usdFormat', '--mask': 'mask',
  }
  const fail = (message: string, exitCode: number): Parsed => {
    io.stderr(`${message}\nRun with --help for more information.\n`)
    return { exitCode }
  }
  const extras: string[] = []
  let positionalOnly = false
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i]!
    if (positionalOnly || !arg.startsWith('-') || arg === '-') {
      args.inputFiles.push(arg)
      continue
    }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') {
      io.stdout(USAGE)
      return { exitCode: 0 }
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const name = eq < 0 ? arg : arg.slice(0, eq)
    const flag = flags[name]
    if (flag !== undefined && eq < 0) {
      (args[flag] as boolean) = true
      continue
    }
    const option = options[name]
    if (option === undefined) {
      extras.push(arg)
      continue
    }
    let value: string | undefined
    if (eq >= 0) value = arg.slice(eq + 1)
    else if (i + 1 < argv.length) value = argv[++i]
    if (value === undefined) return fail(`Argument ${name} requires an argument`, ExitCodes.ArgumentMismatch)
    if (option === 'usdFormat') {
      // CLI::IsMember({"usda", "usdc"}, CLI::ignore_case) gives the member.
      const member = ['usda', 'usdc'].find(m => m === value!.toLowerCase())
      if (member === undefined) {
        return fail(`--usdFormat: ${value} not in {usda,usdc}`, ExitCodes.ValidationError)
      }
      value = member
    }
    args[option] = value
  }
  if (extras.length > 0) {
    return fail(`${extras.length > 1 ? 'The following arguments were not expected: '
      : 'The following argument was not expected: '}${extras.join(' ')}`, ExitCodes.ExtrasError)
  }
  if (args.inputFiles.length === 0) return fail('inputFiles is required', ExitCodes.RequiredError)
  return { args }
}

// std::quoted(s, delim): `s` between `delim`s, with `delim` and backslash
// escaped.
function quoted(s: string, delim = '"'): string {
  return delim + s.replace(/\\/g, '\\\\').replaceAll(delim, `\\${delim}`) + delim
}

function commentaries(mark: TfErrorMark): string[] {
  return mark.getErrors().map(err => err.getCommentary())
}

// Quarantine (usdcat.cpp:106-120).
async function quarantine(filepath: string, io: UsdCatIO): Promise<void> {
  if (!_pathExists(filepath)) return

  const newName = `${filepath}.quarantine`
  try {
    await _rename(filepath, newName)
  } catch (e) {
    io.stderr(`Failed to rename possibly corrupt output file from ${filepath} to ${newName} : ` +
      `${e instanceof Error ? e.message : String(e)}\n`)
    return
  }

  io.stderr(`Possibly corrupt output file renamed to ${newName}\n`)
}

// UsdCat (usdcat.cpp:122-315).
async function usdCat(args: Args, io: UsdCatIO): Promise<number> {
  // If --out was specified, it must either not exist or must be writable,
  // the extension must correspond to a known Sdf file format, and we must
  // have exactly one input file.
  if (args.output !== '') {
    if (_pathExists(args.output) && !_isWritable(args.output)) {
      io.stderr(`error: no write permission for existing output file ${quoted(args.output, "'")}\n`)
      return 1
    }

    if (args.inputFiles.length !== 1) {
      io.stderr('error: must supply exactly one input file when writing to an output file.\n')
      return 1
    }

    const ext = TfGetExtension(args.output)
    if (args.usdFormat !== '' && ext !== 'usd') {
      io.stderr("error: use of --usdFormat requires output file end with '.usd' extension.\n")
      return 1
    }

    if (!SdfFileFormat.findByExtension(ext)) {
      io.stderr('error: unknown output file extension.\n')
      return 1
    }
  } else if (args.usdFormat !== '' && args.usdFormat !== 'usda') {
    // If --out was not specified, then --usdFormat must be unspecified or
    // must be 'usda'.
    io.stderr("error: --usdFormat must be unspecified or 'usda' if writing to stdout; " +
      'specify an output file with -o/--out to write other formats.\n')
    return 1
  }

  if (args.mask !== '' && !args.flatten) {
    // You can only mask a stage, not a layer.
    io.stderr('error: --mask requires --flatten\n')
    return 1
  }

  if (args.layerMetadata && (args.flatten || args.flattenLayerStack)) {
    // Cannot parse only metadata when flattening.
    io.stderr(`error: --layerMetadata cannot be used together with ${
      args.flatten ? '--flatten' : '--flattenLayerStack'}\n`)
    return 1
  }

  let exitCode = 0

  // SdfUsdFileFormatTokens->FormatArg (sdf/usdFileFormat.h:25).
  const formatArgs = new Map<string, string>()
  if (args.usdFormat !== '') formatArgs.set('format', args.usdFormat)

  const resolver = ArGetResolver()
  for (const input of args.inputFiles) {
    // Capture errors that are emitted so we can do error handling below.
    const errMark = new TfErrorMark()
    try {
      // Create and bind a context for opening layers.
      const context = resolver.createDefaultContextForAsset(input)
      await new ArResolverContextBinder(context).run(async () => {
        let layer: SdfLayer | undefined
        let stage: UsdStage | undefined

        // A thrown error is a posted one, as a Tf error is upstream.
        try {
          // Either open a layer or compose a stage, depending on whether or
          // not --flatten was specified.
          if (args.flatten) {
            // Create context layer for stage opening. A null root layer opens
            // no stage (stage.cpp:1067-1068).
            const ctxLayer = await SdfLayer.findOrOpen(input)
            if (ctxLayer) {
              if (args.mask === '') {
                stage = await UsdStage.open(ctxLayer, { resolverContext: context })
              } else {
                // Mask can be provided as a comma or space delimited string.
                const mask = new UsdStagePopulationMask()
                for (const path of TfStringTokenize(args.mask, ', ')) mask.add(SdfPath.fromString(path).toString())
                stage = await UsdStage.openMasked(ctxLayer, mask, { resolverContext: context })
              }
            }
          } else if (args.flattenLayerStack) {
            // Create context layer for stage opening.
            const ctxLayer = await SdfLayer.findOrOpen(input)
            if (ctxLayer) {
              stage = await UsdStage.open(ctxLayer, { resolverContext: context, loadPayloads: false })
            }
            if (stage) {
              layer = UsdUtilsFlattenLayerStack(stage)
            }
          } else if (args.layerMetadata) {
            const srcLayer = await SdfLayer.openAsAnonymous(input, /* metadataOnly = */ true)
            // Not all file format plugins support metadata-only parsing.
            // Create a new anonymous layer and copy just the layer metadata.
            layer = SdfLayer.createAnonymous('.usda')
            UsdUtilsCopyLayerMetadata(srcLayer, layer)
          } else {
            layer = await SdfLayer.findOrOpen(input)
          }
        } catch (e) {
          errMark.capture(() => { throw e instanceof TfError ? e : new TfError(e instanceof Error ? e.message : String(e)) })
        }

        if (!layer && !stage) {
          // If we failed to open a layer or stage, generate a generic error
          // message if one hasn't already been emitted above.
          if (errMark.isClean()) TF_RUNTIME_ERROR('Could not open layer')
        }

        if (errMark.isClean()) {
          if (args.loadOnly) {
            io.stdout(`OK  ${input}\n`)
            return
          }
        } else {
          if (args.loadOnly) {
            io.stdout(`ERR ${input}\n`)
            for (const commentary of commentaries(errMark)) io.stdout(`\t${commentary}\n`)
          } else {
            io.stderr(`Failed to open ${quoted(input)} - `)
            for (const commentary of commentaries(errMark)) io.stderr(`${commentary}\n`)
          }

          errMark.clear()
          exitCode = 1
          return
        }

        // Write to either stdout or the specified output file.
        if (args.output !== '') {
          try {
            if (layer) await layer.export(args.output, formatArgs)
            else await stage!.export(args.output, !args.skipSourceFileComment, formatArgs)
          } catch (e) {
            errMark.capture(() => { throw e })
          }

          if (!errMark.isClean()) {
            exitCode = 1

            // Let the user know an error occurred.
            io.stderr(`Error exporting ${quoted(input)} to ${quoted(args.output)} - `)
            for (const commentary of commentaries(errMark)) io.stderr(`${commentary}\n`)

            // If the output file exists, let's try to rename it with
            // '.quarantine' appended and let the user know.
            await quarantine(args.output, io)
          }
        } else {
          let usdString = ''
          errMark.capture(() => {
            usdString = layer ? layer.exportToString() : stage!.exportToString()
          })

          if (errMark.isClean()) {
            io.stdout(usdString)
          } else {
            exitCode = 1

            io.stderr(`Error writing ${quoted(input)} to stdout - `)
            for (const commentary of commentaries(errMark)) io.stderr(`${commentary}\n`)
          }
        }
      })
    } finally {
      errMark.dispose()
    }
  }

  return exitCode
}

const processIO: UsdCatIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
}

/** main (usdcat.cpp:317-326): runs usdcat with the arguments `argv` (without
 *  the program name) and resolves its exit code. */
export async function usdcat(argv: readonly string[], io: UsdCatIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  return usdCat(parsed.args, io)
}

// Run as a script: `usdcat ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usdcat(process.argv.slice(2))
