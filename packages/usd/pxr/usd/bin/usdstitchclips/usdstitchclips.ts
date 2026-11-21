#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdstitchclips/usdstitchclips.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdstitchclips (usdstitchclips.py): stitches multiple usd files together
// into one using value clips, producing a result layer and its topology and
// manifest layers.
//
// usdstitchclips(argv, io) runs the tool in process and resolves its exit
// code; standard output and error go to `io` (the process's by default). Run
// as a script, the file is the command. The script's failed asserts are
// Python's AssertionError ending the process (exit code 1, the message on
// standard error); a Tf error the UsdUtils calls post is the
// Tf.ErrorException the Python binding raises, and sys.exit(e) is its message
// on standard error and exit code 1. The generated-with comment names the
// program 'usdstitchclips' where upstream joins sys.argv, whose first entry
// is the script's path. Opening and writing files is asynchronous here, so
// the tool is.
//
// FAITHFULNESS-DEBT(usdstitchclips-argparse-subset): upstream parses its
// arguments with Python's argparse (usdstitchclips.py:14-52). parseArgs reads
// the same files, options and flags, and fails with argparse's exit code 2
// for no files, an unknown argument and a missing option value; -h/--help
// prints a usage summary, not argparse's formatted help. A port of argparse's
// behaviour would replace it.

import { TfErrorMark } from 'typescript-usd/tf'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { _deleteFile, _isFile, _isMainScript } from 'typescript-usd/ar/_internal'
import {
  UsdUtilsGenerateClipManifestName, UsdUtilsGenerateClipTopologyName, UsdUtilsStitchClips,
  UsdUtilsStitchClipsManifest, UsdUtilsStitchClipsTemplate, UsdUtilsStitchClipsTopology,
} from 'typescript-usd/usdUtils'

/** Where the tool writes: sys.stdout and sys.stderr. */
export interface UsdStitchClipsIO {
  stdout(text: string): void
  stderr(text: string): void
}

interface Results {
  usdFiles: string[]
  out: string | undefined
  clipPath: string | undefined
  startTimeCode: string | undefined
  stride: string | undefined
  endTimeCode: string | undefined
  templateMetadata: boolean
  templatePath: string | undefined
  clipSet: string | undefined
  activeOffset: string | undefined
  interpolateMissingClipValues: boolean
  noComment: boolean
}

const PROG = 'usdstitchclips'
const USAGE = `usage: ${PROG} [-h] [-o OUT] [-c CLIPPATH] [-s STARTTIMECODE] [-r STRIDE] [-e ENDTIMECODE] [-t] ` +
  '[-p TEMPLATEPATH] [--clipSet CLIPSET] [--activeOffset ACTIVEOFFSET] [--interpolateMissingClipValues] [-n] ' +
  'usdFiles [usdFiles ...]'
const HELP = `${USAGE}

Stitch multiple usd file(s) together into one using value clips.
An example command is:

usdstitchclips --out result.usd --clipPath /World/fx/Particles_Splash clip1.usd clip2.usd

This will produce two files, a result.topology.usd and a result.usd.

positional arguments:
  usdFiles

options:
  -h, --help            show this help message and exit
  -o, --out OUT         specify the filename for the top-level result file, which also serves as base-name for the topology and manifest files.
  -c, --clipPath CLIPPATH
                        specify a prim path at which to begin stitching clip data.
  -s, --startTimeCode STARTTIMECODE
                        specify the time at which the clips will become active
  -r, --stride STRIDE   specify a stride for the numeric component of filenames for template metadata
  -e, --endTimeCode ENDTIMECODE
                        specify the time at which the clips will cease being active
  -t, --templateMetadata
                        author template clip metadata in the root layer.
  -p, --templatePath TEMPLATEPATH
                        specify a template asset path to author
  --clipSet CLIPSET     specify a named clipSet in which to author clip metadata, so that multiple sets of clips can be applied on the same prim.
  --activeOffset ACTIVEOFFSET
                        specify an offset for template-based clips, offsetting the frame number of each clip file.
  --interpolateMissingClipValues
                        specify whether values for clips without authored samples are interpolated from surrounding clips if no default value is authored in any clip.
  -n, --noComment       do not write a comment specifying how the usd file was generated
`

type Parsed = { results: Results } | { exitCode: number }

type ValueOption = 'out' | 'clipPath' | 'startTimeCode' | 'stride' | 'endTimeCode' | 'templatePath' | 'clipSet' |
  'activeOffset'

// usdstitchclips.py:14-52. See
// FAITHFULNESS-DEBT(usdstitchclips-argparse-subset).
function parseArgs(argv: readonly string[], io: UsdStitchClipsIO): Parsed {
  const fail = (message: string): Parsed => {
    io.stderr(`${USAGE}\n${PROG}: error: ${message}\n`)
    return { exitCode: 2 }
  }
  const results: Results = {
    usdFiles: [], out: undefined, clipPath: undefined, startTimeCode: undefined, stride: undefined,
    endTimeCode: undefined, templateMetadata: false, templatePath: undefined, clipSet: undefined,
    activeOffset: undefined, interpolateMissingClipValues: false, noComment: false,
  }
  const options: Record<string, [ValueOption, string]> = {
    '-o': ['out', '-o/--out'], '--out': ['out', '-o/--out'],
    '-c': ['clipPath', '-c/--clipPath'], '--clipPath': ['clipPath', '-c/--clipPath'],
    '-s': ['startTimeCode', '-s/--startTimeCode'], '--startTimeCode': ['startTimeCode', '-s/--startTimeCode'],
    '-r': ['stride', '-r/--stride'], '--stride': ['stride', '-r/--stride'],
    '-e': ['endTimeCode', '-e/--endTimeCode'], '--endTimeCode': ['endTimeCode', '-e/--endTimeCode'],
    '-p': ['templatePath', '-p/--templatePath'], '--templatePath': ['templatePath', '-p/--templatePath'],
    '--clipSet': ['clipSet', '--clipSet'], '--activeOffset': ['activeOffset', '--activeOffset'],
  }
  const flags: Record<string, 'templateMetadata' | 'interpolateMissingClipValues' | 'noComment'> = {
    '-t': 'templateMetadata', '--templateMetadata': 'templateMetadata',
    '--interpolateMissingClipValues': 'interpolateMissingClipValues', '-n': 'noComment', '--noComment': 'noComment',
  }
  const extras: string[] = []
  let positionalOnly = false
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i]!
    if (positionalOnly || !arg.startsWith('-') || arg === '-') { results.usdFiles.push(arg); continue }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') { io.stdout(HELP); return { exitCode: 0 } }
    const flag = flags[arg]
    if (flag !== undefined) { results[flag] = true; continue }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const name = eq < 0 ? arg : arg.slice(0, eq)
    const option = options[name]
    if (option === undefined) { extras.push(arg); continue }
    let value: string | undefined
    if (eq >= 0) value = arg.slice(eq + 1)
    else {
      value = argv[i + 1]
      // A value that looks like a negative number is a value, as argparse
      // takes it when no option looks like one.
      if (value === undefined || (value.startsWith('-') && !/^-\d|^-\.\d/.test(value))) {
        return fail(`argument ${option[1]}: expected one argument`)
      }
      ++i
    }
    results[option[0]] = value
  }
  if (results.usdFiles.length === 0) return fail('the following arguments are required: usdFiles')
  if (extras.length > 0) return fail(`unrecognized arguments: ${extras.join(' ')}`)
  return { results }
}

// Python's AssertionError, NameError and Tf.ErrorException, raised by the
// script.
class AssertionError extends Error {}
class NameError extends Error {}
class ErrorException extends Error {}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new AssertionError(message)
}

// float(s): Python's parse of a float literal.
function pyFloat(s: string): number {
  const t = s.trim().replace(/_/g, '')
  if (/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return Number(t)
  if (/^[+-]?(inf|infinity)$/i.test(t)) return t.startsWith('-') ? -Infinity : Infinity
  if (/^[+-]?nan$/i.test(t)) return NaN
  throw new Error(`could not convert string to float: '${s}'`)
}

// The script body (usdstitchclips.py:54-150).
async function stitchClips(results: Results, argv: readonly string[], io: UsdStitchClipsIO): Promise<void> {
  // Verify the integrity of the inputs.
  assert(results.out !== undefined, 'must specify output file(--out)')
  assert(results.clipPath !== undefined, 'must specify a clip path(--clipPath)')
  const out = results.out
  const clipPath = results.clipPath

  if (_isFile(out)) io.stdout('Warning: merging with current result layer\n')

  let outLayerGenerated = false
  let topologyLayerGenerated = false
  let topologyLayerName = ''
  // Unset until the manifest layer is found or created, as in the script.
  let manifestLayerGenerated: boolean | undefined
  let manifestLayerName = ''

  // A Tf error a call posts is the Tf.ErrorException the binding raises.
  const mark = new TfErrorMark()
  const raiseErrors = () => {
    if (mark.isClean()) return
    const message = mark.getErrors().map(err => err.getCommentary()).join('\n')
    mark.clear()
    throw new ErrorException(message)
  }

  try {
    let outLayer = await SdfLayer.findOrOpen(out)
    mark.clear()
    if (!outLayer) {
      outLayerGenerated = true
      outLayer = await SdfLayer.createNew(out)
      raiseErrors()
    }

    topologyLayerName = UsdUtilsGenerateClipTopologyName(out)
    let topologyLayer = await SdfLayer.findOrOpen(topologyLayerName)
    mark.clear()
    if (!topologyLayer) {
      topologyLayerGenerated = true
      topologyLayer = await SdfLayer.createNew(topologyLayerName)
      raiseErrors()
    }

    manifestLayerName = UsdUtilsGenerateClipManifestName(out)
    let manifestLayer = await SdfLayer.findOrOpen(manifestLayerName)
    mark.clear()
    if (!manifestLayer) {
      manifestLayerGenerated = true
      manifestLayer = await SdfLayer.createNew(manifestLayerName)
      raiseErrors()
    }

    // `if results.x: results.x = float(results.x)`: an empty string stays
    // unset.
    const startTimeCode = results.startTimeCode ? pyFloat(results.startTimeCode) : undefined
    const endTimeCode = results.endTimeCode ? pyFloat(results.endTimeCode) : undefined
    const stride = results.stride ? pyFloat(results.stride) : undefined
    const activeOffset = results.activeOffset ? pyFloat(results.activeOffset) : undefined

    if (results.templateMetadata) {
      const checkMissingTemplateArg = (argName: string, argValue: string | number | undefined) => {
        if (!argValue) throw new ErrorException(`Error: ${argName} must be specified when --templateMetadata is`)
      }

      checkMissingTemplateArg('templatePath', results.templatePath)
      checkMissingTemplateArg('endTimeCode', endTimeCode)
      checkMissingTemplateArg('startTimeCode', startTimeCode)
      checkMissingTemplateArg('stride', stride)

      await UsdUtilsStitchClipsTopology(topologyLayer!, results.usdFiles)
      raiseErrors()
      await UsdUtilsStitchClipsManifest(manifestLayer!, topologyLayer!, results.usdFiles, clipPath)
      raiseErrors()
      await UsdUtilsStitchClipsTemplate(outLayer!, topologyLayer, manifestLayer, clipPath, results.templatePath!,
        startTimeCode!, endTimeCode!, stride!, activeOffset, results.interpolateMissingClipValues, results.clipSet)
      raiseErrors()
    } else {
      if (results.templatePath) {
        throw new ErrorException('Error: templatePath cannot be specified without --templateMetadata')
      }
      if (activeOffset) throw new ErrorException('Error: activeOffset cannot be specified without --templateMetadata')
      if (stride) throw new ErrorException('Error: stride cannot be specified without --templateMetadata')

      await UsdUtilsStitchClips(outLayer!, results.usdFiles, clipPath, startTimeCode, endTimeCode,
        results.interpolateMissingClipValues, results.clipSet)
      raiseErrors()
    }

    if (!results.noComment) {
      outLayer!.setComment(`Generated with ${[PROG, ...argv].join(' ')}`)
      await outLayer!.save()
      raiseErrors()
    }
  } catch (e) {
    if (!(e instanceof ErrorException)) throw e
    // If something in the authoring fails, remove the output files.
    if (outLayerGenerated && _isFile(out)) await _deleteFile(out)
    if (topologyLayerGenerated && _isFile(topologyLayerName)) await _deleteFile(topologyLayerName)
    if (manifestLayerGenerated === undefined) throw new NameError("name 'manifestLayerGenerated' is not defined")
    if (manifestLayerGenerated && _isFile(manifestLayerName)) await _deleteFile(manifestLayerName)
    // sys.exit(e).
    io.stderr(`${e.message}\n`)
    throw new SystemExit(1)
  } finally {
    mark.dispose()
  }
}

class SystemExit {
  constructor(readonly code: number) {}
}

const processIO: UsdStitchClipsIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
}

/** Runs usdstitchclips with the arguments `argv` (without the program name)
 *  and resolves its exit code. */
export async function usdstitchclips(argv: readonly string[], io: UsdStitchClipsIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  try {
    await stitchClips(parsed.results, argv, io)
    return 0
  } catch (e) {
    if (e instanceof SystemExit) return e.code
    // An uncaught exception: Python prints the traceback and exits with 1.
    const name = e instanceof AssertionError ? 'AssertionError' : e instanceof NameError ? 'NameError'
      : e instanceof Error ? e.name : 'Exception'
    io.stderr(`${name}: ${e instanceof Error ? e.message : String(e)}\n`)
    return 1
  }
}

// Run as a script: `usdstitchclips ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usdstitchclips(process.argv.slice(2))
