#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdresolve/usdresolve.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdresolve (usdresolve.py): resolves an asset path using a fully
// configured USD asset resolver.
//
// usdresolve(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io` (the process's by default). Run as a
// script, the file is the command. Resolving is asynchronous here, so the
// tool is. Ar here is Ar 2.0: it has CreateIdentifier and no
// ConfigureResolverForAsset, so the script's branches for those
// (usdresolve.py:15-19, 64-92) are taken that way: --createContextForAsset
// and --createContextFromString configure the context and --anchorPath runs
// CreateIdentifier.
//
// FAITHFULNESS-DEBT(usdresolve-argparse-subset): upstream parses its
// arguments with Python's argparse (usdresolve.py:58-95). parseArgs reads the
// same input path and options, and fails with argparse's exit code 2 for a
// missing or extra input, an unknown argument, a missing option value and
// both of the mutually exclusive context options; -h/--help prints a usage
// summary, not argparse's formatted help. A port of argparse's behaviour
// would replace it.

import {
  GetResolver as ArGetResolver, ResolvedPath as ArResolvedPath, type Resolver as ArResolver,
  ResolverContextBinder as ArResolverContextBinder, type ResolverContext as ArResolverContext,
} from 'typescript-usd/ar'
import { _isMainScript } from 'typescript-usd/ar/_internal'

/** Where the tool writes: sys.stdout and sys.stderr. */
export interface UsdResolveIO {
  stdout(text: string): void
  stderr(text: string): void
}

interface Args {
  inputPath: string
  createContextForAsset: string | undefined
  createContextFromString: string[] | undefined
  anchorPath: string | undefined
}

const PROG = 'usdresolve'
const USAGE = `usage: ${PROG} [-h] [--createContextForAsset CREATECONTEXTFORASSET | ` +
  '--createContextFromString CREATECONTEXTFROMSTRING] [--anchorPath ANCHORPATH] inputPath'
const HELP = `${USAGE}

Resolves an asset path using a fully configured USD Asset Resolver.

positional arguments:
  inputPath             An asset path to be resolved by the USD Asset Resolver.

options:
  -h, --help            show this help message and exit
  --createContextForAsset CREATECONTEXTFORASSET
                        Run CreateDefaultContextForAsset with the given asset
                        path to create the context used for resolution.
  --createContextFromString CREATECONTEXTFROMSTRING
                        Run CreateContextFromString with the given string to
                        create the context used for resolution. This accepts
                        strings like [<URI Scheme>:]<Configuration String> and
                        may be specified multiple times.
  --anchorPath ANCHORPATH
                        Run CreateIdentifier with the input path and this
                        anchor asset path and resolve the result.
`

type Parsed = { args: Args } | { exitCode: number }

// usdresolve.py:58-95. See FAITHFULNESS-DEBT(usdresolve-argparse-subset).
function parseArgs(argv: readonly string[], io: UsdResolveIO): Parsed {
  const fail = (message: string): Parsed => {
    io.stderr(`${USAGE}\n${PROG}: error: ${message}\n`)
    return { exitCode: 2 }
  }
  const positionals: string[] = []
  const extras: string[] = []
  const args: Args = {
    inputPath: '', createContextForAsset: undefined, createContextFromString: undefined, anchorPath: undefined,
  }
  const options = ['--createContextForAsset', '--createContextFromString', '--anchorPath'] as const
  let positionalOnly = false
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i]!
    if (positionalOnly || !arg.startsWith('-') || arg === '-') { positionals.push(arg); continue }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') { io.stdout(HELP); return { exitCode: 0 } }
    const eq = arg.indexOf('=')
    const name = eq < 0 ? arg : arg.slice(0, eq)
    const option = options.find(o => o === name)
    if (option === undefined) { extras.push(arg); continue }
    let value: string | undefined
    if (eq >= 0) value = arg.slice(eq + 1)
    else {
      value = argv[i + 1]
      if (value === undefined || (value.startsWith('-') && value !== '-')) {
        return fail(`argument ${option}: expected one argument`)
      }
      ++i
    }
    if (option === '--createContextFromString') {
      if (args.createContextForAsset !== undefined) {
        return fail('argument --createContextFromString: not allowed with argument --createContextForAsset')
      }
      (args.createContextFromString ??= []).push(value)
    } else if (option === '--createContextForAsset') {
      if (args.createContextFromString !== undefined) {
        return fail('argument --createContextForAsset: not allowed with argument --createContextFromString')
      }
      args.createContextForAsset = value
    } else {
      args.anchorPath = value
    }
  }
  if (positionals.length === 0) return fail('the following arguments are required: inputPath')
  extras.push(...positionals.slice(1))
  if (extras.length > 0) return fail(`unrecognized arguments: ${extras.join(' ')}`)
  args.inputPath = positionals[0]!
  return { args }
}

// _ConfigureAssetResolver (usdresolve.py:27-45), without
// ConfigureResolverForAsset.
function configureAssetResolver(args: Args, resolver: ArResolver): ArResolverContext {
  if (args.createContextForAsset) return resolver.createDefaultContextForAsset(args.createContextForAsset)
  if (args.createContextFromString) {
    const configStrs: [string, string][] = []
    for (const s of args.createContextFromString) {
      // s.split(":", 1): a string without ':' is a configuration string for
      // the primary resolver.
      const colon = s.indexOf(':')
      configStrs.push(colon < 0 ? ['', s] : [s.slice(0, colon), s.slice(colon + 1)])
    }
    return resolver.createContextFromStrings(configStrs)
  }
  return resolver.createDefaultContextForAsset(args.inputPath)
}

// _AnchorRelativePath (usdresolve.py:47-54), with CreateIdentifier.
function anchorRelativePath(args: Args, resolver: ArResolver): string {
  if (args.anchorPath) return resolver.createIdentifier(args.inputPath, new ArResolvedPath(args.anchorPath))
  return args.inputPath
}

// main (usdresolve.py:57-116).
async function main(args: Args, io: UsdResolveIO): Promise<number> {
  let exitCode = 0

  const resolver = ArGetResolver()

  let resolved: ArResolvedPath | undefined
  try {
    const resolverContext = configureAssetResolver(args, resolver)
    resolved = await new ArResolverContextBinder(resolverContext).run(async () => {
      const inputPath = anchorRelativePath(args, resolver)
      return resolver.resolve(inputPath)
    })
  } catch (e) {
    io.stderr(`Failed to resolve '${args.inputPath}' - ${e instanceof Error ? e.message : String(e)}\n`)
    exitCode = 1
  }

  if (!resolved || resolved.toString() === '') {
    io.stderr(`Failed to resolve '${args.inputPath}'\n`)
    exitCode = 1
  } else {
    io.stdout(`${resolved.toString()}\n`)
  }

  return exitCode
}

const processIO: UsdResolveIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
}

/** Runs usdresolve with the arguments `argv` (without the program name) and
 *  resolves its exit code. */
export async function usdresolve(argv: readonly string[], io: UsdResolveIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  return main(parsed.args, io)
}

// Run as a script: `usdresolve ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usdresolve(process.argv.slice(2))
