#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usd/bin/usddumpcrate/usddumpcrate.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usddumpcrate (usddumpcrate.py): writes information about usd crate (usdc)
// files to stdout: each file's version, its summary statistics and, unless
// --summary, its structural sections (SdfCrateInfo).
//
// usddumpcrate(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io` (the process's by default). Run as a
// script, the file is the command. Opening files is asynchronous here, so
// the tool is.
//
// FAITHFULNESS-DEBT(usddumpcrate-argparse-subset): upstream parses its
// arguments with Python's argparse (usddumpcrate.py:31-39). parseArgs reads
// the same files and -s/--summary, and fails with argparse's exit code 2 for
// no files and an unknown argument; -h/--help prints a usage summary, not
// argparse's formatted help. A port of argparse's behaviour would replace it.

import { CrateInfo as SdfCrateInfo } from 'typescript-usd/sdf'
import { TfErrorMark } from 'typescript-usd/tf'
import { _isMainScript } from 'typescript-usd/ar/_internal'

/** Where the tool writes: sys.stdout and sys.stderr. */
export interface UsdDumpCrateIO {
  stdout(text: string): void
  stderr(text: string): void
}

const PROG = 'usddumpcrate'
const USAGE = `usage: ${PROG} [-h] [-s] inputFiles [inputFiles ...]`
const HELP = `${USAGE}

Write information about a usd crate (usdc) file to stdout

positional arguments:
  inputFiles

options:
  -h, --help     show this help message and exit
  -s, --summary  report only a short summary
`

type Parsed = { inputFiles: string[], summary: boolean } | { exitCode: number }

// usddumpcrate.py:31-39. See FAITHFULNESS-DEBT(usddumpcrate-argparse-subset).
function parseArgs(argv: readonly string[], io: UsdDumpCrateIO): Parsed {
  const fail = (message: string): Parsed => {
    io.stderr(`${USAGE}\n${PROG}: error: ${message}\n`)
    return { exitCode: 2 }
  }
  const inputFiles: string[] = []
  const extras: string[] = []
  let summary = false
  let positionalOnly = false
  for (const arg of argv) {
    if (positionalOnly || !arg.startsWith('-') || arg === '-') { inputFiles.push(arg); continue }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') { io.stdout(HELP); return { exitCode: 0 } }
    if (arg === '-s' || arg === '--summary') { summary = true; continue }
    extras.push(arg)
  }
  if (inputFiles.length === 0) return fail('the following arguments are required: inputFiles')
  if (extras.length > 0) return fail(`unrecognized arguments: ${extras.join(' ')}`)
  return { inputFiles, summary }
}

// PrintReport (usddumpcrate.py:15-28).
function printReport(fname: string, info: SdfCrateInfo, summaryOnly: boolean, out: (text: string) => void): void {
  out(`@${fname}@ file version ${info.getFileVersion()}\n`)
  const ss = info.getSummaryStats()
  out(`  ${ss.numSpecs} specs, ${ss.numUniquePaths} paths, ${ss.numUniqueTokens} tokens, ` +
    `${ss.numUniqueStrings} strings, ${ss.numUniqueFields} fields, ${ss.numUniqueFieldSets} field sets\n`)
  if (summaryOnly) return
  out('  Structural Sections:\n')
  for (const sec of info.getSections()) {
    // '    %16s %16d bytes at offset 0x%X'.
    out(`    ${sec.name.padStart(16)} ${String(sec.size).padStart(16)} bytes at offset 0x` +
      `${sec.start.toString(16).toUpperCase()}\n`)
  }
  out('\n')
}

const processIO: UsdDumpCrateIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
}

/** main (usddumpcrate.py:30-52): runs usddumpcrate with the arguments `argv`
 *  (without the program name) and resolves its exit code. */
export async function usddumpcrate(argv: readonly string[], io: UsdDumpCrateIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  const err = (msg: string) => io.stderr(`Error: ${msg}\n`)

  io.stdout(`Usd crate software version ${SdfCrateInfo.create().getSoftwareVersion()}\n`)

  for (const fname of parsed.inputFiles) {
    // Sdf.CrateInfo.Open raises Tf.ErrorException when it posts errors.
    const mark = new TfErrorMark()
    let info: SdfCrateInfo
    try {
      info = await SdfCrateInfo.open(fname)
      if (!mark.isClean()) {
        const e = mark.getErrors().map(error => error.getCommentary()).join('\n')
        mark.clear()
        err(`Failed to read ${fname}\n ${e}`)
        continue
      }
      if (!info.isValid()) {
        err(`Failed to read ${fname}`)
        continue
      }
    } catch (e) {
      err(`Failed to read ${fname}\n ${e instanceof Error ? e.message : String(e)}`)
      continue
    } finally {
      mark.dispose()
    }
    printReport(fname, info, parsed.summary, t => io.stdout(t))
  }
  return 0
}

// Run as a script: `usddumpcrate ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usddumpcrate(process.argv.slice(2))
