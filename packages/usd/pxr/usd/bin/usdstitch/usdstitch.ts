#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdstitch/usdstitch.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdstitch (usdstitch.py): stitches multiple usd files together into one.
// Opinion strength is the order the files are given in, the first file
// strongest; time samples are merged as a union across the input layers, the
// stronger layer winning a conflicting key.
//
// usdstitch(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io` (the process's by default). Run as a
// script, the file is the command. The script's failed asserts are Python's
// AssertionError ending the process (exit code 1, the message on standard
// error), and a Tf error UsdUtils.StitchLayers or Save posts is the
// Tf.ErrorException the Python binding raises. Opening and writing files is
// asynchronous here, so the tool is.
//
// FAITHFULNESS-DEBT(usdstitch-argparse-subset): upstream parses its
// arguments with Python's argparse (usdstitch.py:14-29). parseArgs reads the
// same positional files and -o/--out, and fails with argparse's exit code 2
// for a missing file list, an unknown argument or a missing --out value;
// -h/--help prints a usage summary, not argparse's formatted help. A port of
// argparse's behaviour would replace it.

import { TfErrorMark } from 'typescript-usd/tf'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { _deleteFile, _isFile, _isMainScript } from 'typescript-usd/ar/_internal'
import { UsdUtilsStitchLayers } from 'typescript-usd/usdUtils'

/** Where the tool writes: sys.stdout and sys.stderr. */
export interface UsdStitchIO {
  stdout(text: string): void
  stderr(text: string): void
}

const PROG = 'usdstitch'

const DESCRIPTION = 'Stitch multiple usd file(s) together into one. Opinion strength is ' +
  'determined by the order in which the file is given, with the first file getting the ' +
  'highest strength. The exception to this general behavior is in time samples, which are ' +
  'merged together as a union across the input layers. It is consistent in that, if two ' +
  'time sample keys conflict, the strong layer takes precedence.'

const USAGE = `usage: ${PROG} [-h] [-o OUT] usdFiles [usdFiles ...]`

const HELP = `${USAGE}

${DESCRIPTION}

positional arguments:
  usdFiles

options:
  -h, --help         show this help message and exit
  -o OUT, --out OUT  specify a file to write out to
`

type Parsed = { usdFiles: string[], out: string | undefined } | { exitCode: number }

// usdstitch.py:14-29. See FAITHFULNESS-DEBT(usdstitch-argparse-subset).
function parseArgs(argv: readonly string[], io: UsdStitchIO): Parsed {
  const fail = (message: string): Parsed => {
    io.stderr(`${USAGE}\n${PROG}: error: ${message}\n`)
    return { exitCode: 2 }
  }
  const usdFiles: string[] = []
  const extras: string[] = []
  let out: string | undefined
  let positionalOnly = false
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i]!
    if (positionalOnly || !arg.startsWith('-') || arg === '-') {
      usdFiles.push(arg)
      continue
    }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') {
      io.stdout(HELP)
      return { exitCode: 0 }
    }
    let value: string | undefined
    if (arg === '-o' || arg === '--out') {
      value = argv[i + 1]
      if (value === undefined || (value.startsWith('-') && value !== '-')) {
        return fail(`argument -o/--out: expected one argument`)
      }
      ++i
    } else if (arg.startsWith('--out=')) {
      value = arg.slice('--out='.length)
    } else if (arg.startsWith('-o') && arg.length > 2) {
      value = arg.slice(2)
    } else {
      extras.push(arg)
      continue
    }
    out = value
  }
  if (usdFiles.length === 0) return fail('the following arguments are required: usdFiles')
  if (extras.length > 0) return fail(`unrecognized arguments: ${extras.join(' ')}`)
  return { usdFiles, out }
}

// Python's AssertionError, ending the script.
class AssertionError extends Error {}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new AssertionError(message)
}

// The errors `mark` holds, raised as the Python binding raises them.
function raiseErrors(mark: TfErrorMark): void {
  if (mark.isClean()) return
  const message = mark.getErrors().map(err => err.getCommentary()).join('\n')
  mark.clear()
  throw new Error(message)
}

// The script body (usdstitch.py:30-59).
async function stitch(usdFiles: string[], out: string | undefined, io: UsdStitchIO): Promise<void> {
  assert(out !== undefined, 'must specify output file')

  if (_isFile(out)) io.stdout('Warning: overwriting pre-existing file\n')

  // Fold over the files, left file takes precedence on op. strength.
  const outLayer = await SdfLayer.createNew(out)

  // Open up all of the files into memory before stitching. If one is
  // missing, this will allow us to fail without doing the extra computation
  // and fail more gracefully.
  //
  // Try opening all files.
  const openedFiles = await Promise.all(usdFiles.map(fname => SdfLayer.findOrOpen(fname)))
  // Grab the index of all, if any, files which failed to open.
  const unopened = openedFiles.flatMap((opened, i) => opened === undefined ? [i] : [])
  // Grab the filenames of the failed files for error messaging.
  const erroredFiles = unopened.map(i => usdFiles[i]).join(' ')
  // If we failed to open any files, error out.
  assert(unopened.length === 0, `unable to open file(s) ${erroredFiles}`)

  try {
    for (const usdFile of openedFiles) {
      const mark = new TfErrorMark()
      try {
        // UsdUtils.StitchLayers(None, ...) is a Python argument error.
        if (!outLayer) throw new Error(`Python argument types in UsdUtils.StitchLayers did not match C++ signature`)
        UsdUtilsStitchLayers(outLayer, usdFile!)
        raiseErrors(mark)
        await outLayer.save()
        raiseErrors(mark)
      } finally {
        mark.dispose()
      }
    }
  } catch (e) {
    // If something in the authoring fails, remove the output file.
    io.stdout(`Failed to complete stitching, removing output file ${out}\n`)
    io.stdout(`${e instanceof Error ? e.message : String(e)}\n`)
    // os.remove raises when the file cannot be removed.
    if (!await _deleteFile(out)) {
      throw new Error(`[Errno 2] No such file or directory: '${out}'`)
    }
  }
}

const processIO: UsdStitchIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
}

/** Runs usdstitch with the arguments `argv` (without the program name) and
 *  resolves its exit code. */
export async function usdstitch(argv: readonly string[], io: UsdStitchIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  try {
    await stitch(parsed.usdFiles, parsed.out, io)
    return 0
  } catch (e) {
    // An uncaught exception: Python prints the traceback and exits with 1.
    const name = e instanceof AssertionError ? 'AssertionError' : e instanceof Error ? e.name : 'Exception'
    io.stderr(`${name}: ${e instanceof Error ? e.message : String(e)}\n`)
    return 1
  }
}

// Run as a script: `usdstitch ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usdstitch(process.argv.slice(2))
