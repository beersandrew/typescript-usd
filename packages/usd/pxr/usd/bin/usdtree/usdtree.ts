#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usd/bin/usdtree/usdtree.cpp
// Copyright 2022 Apple. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdtree (usdtree.cpp): writes the tree structure of a USD file: a single
// layer by default, the composed stage with --flatten, or the flattened root
// layer stack with --flattenLayerStack. Special metadata 'kind' and 'active'
// are always shown if authored unless --simple is given.
//
// usdtree(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io` (the process's by default). Run as a
// script, the file is the command. Opening files is asynchronous here, so
// the tool is.
//
// FAITHFULNESS-DEBT(usdtree-cli11-subset): upstream parses its arguments with
// CLI11 (pxr/base/tf/pxrCLI11/CLI11.h, Configure at usdtree.cpp:42-72).
// parseArgs reads the same options, flags and positional input, and fails
// with CLI11's exit codes for a missing input, an unknown or extra argument
// and a missing option value; -h/--help prints a usage summary, not CLI11's
// formatted help. A port of pxrCLI11 would replace it.

import { TfErrorMark, TfStringTokenize, TF_RUNTIME_ERROR, Error as TfError } from 'typescript-usd/tf'
import { Layer as SdfLayer, type PrimSpec as SdfPrimSpec } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import {
  GetResolver as ArGetResolver, ResolverContextBinder as ArResolverContextBinder,
} from 'typescript-usd/ar'
import { _isMainScript } from 'typescript-usd/ar/_internal'
import { type Prim as UsdPrim, Stage as UsdStage, StagePopulationMask as UsdStagePopulationMask } from 'typescript-usd/usd'
import { UsdUtilsFlattenLayerStack } from 'typescript-usd/usdUtils'

/** Where the tool writes: std::cout and std::cerr. */
export interface UsdTreeIO {
  stdout(text: string): void
  stderr(text: string): void
}

// Args (usdtree.cpp:31-40).
interface Args {
  inputPath: string
  unloaded: boolean
  attributes: boolean
  metadata: boolean
  simple: boolean
  flatten: boolean
  flattenLayerStack: boolean
  populationMask: string
}

// CLI::ExitCodes (CLI11.h:662-680).
const ExitCodes = { RequiredError: 106, ExtrasError: 109, ArgumentMismatch: 114 } as const

const USAGE = `usdtree : Writes the tree structure of a USD file. The default is to
inspect a single USD file. Use the --flatten argument to see the
flattened (or composed) Stage tree. Special metadata 'kind' and
'active' are always shown if authored unless --simple is provided.

Usage: usdtree [OPTIONS] inputPath

Positionals:
  inputPath TEXT REQUIRED     The input file to process

Options:
  -h,--help                   Print this help message and exit
  --unloaded                  Do not load payloads.
  -a,--attributes             Display authored attributes.
  -m,--metadata               Display authored metadata (active and kind are part of the label and not shown as individual items
  -s,--simple                 Only display prim names: no specifier, kind or active state.
  -f,--flatten                Compose the stage with the input file as the root layer and write the flattened content.
  --flattenLayerStack         Flatten the layer stack with the given root layer. Unlike --flatten, this does not flatten composition arcs (such as references).
  --mask PRIMPATH[,PRIMPATH...]
                              Limit stage population to these prims, their descendants and ancestors. To specify multiple paths, either use commas with no spaces, or quote the argument and separate paths by commas and/or spaces. Requires --flatten.
`

type Parsed = { args: Args } | { exitCode: number }

// Configure (usdtree.cpp:42-72) and CLI11_PARSE (usdtree.cpp:383). See
// FAITHFULNESS-DEBT(usdtree-cli11-subset).
function parseArgs(argv: readonly string[], io: UsdTreeIO): Parsed {
  const args: Args = {
    inputPath: '', unloaded: false, attributes: false, metadata: false, simple: false,
    flatten: false, flattenLayerStack: false, populationMask: '',
  }
  const flags: Record<string, keyof Args> = {
    '--unloaded': 'unloaded', '-a': 'attributes', '--attributes': 'attributes', '-m': 'metadata',
    '--metadata': 'metadata', '-s': 'simple', '--simple': 'simple', '-f': 'flatten', '--flatten': 'flatten',
    '--flattenLayerStack': 'flattenLayerStack',
  }
  const fail = (message: string, exitCode: number): Parsed => {
    io.stderr(`${message}\nRun with --help for more information.\n`)
    return { exitCode }
  }
  const extras: string[] = []
  let haveInput = false
  let positionalOnly = false
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i]!
    if (positionalOnly || !arg.startsWith('-') || arg === '-') {
      if (haveInput) extras.push(arg)
      else { args.inputPath = arg; haveInput = true }
      continue
    }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') { io.stdout(USAGE); return { exitCode: 0 } }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const name = eq < 0 ? arg : arg.slice(0, eq)
    const flag = flags[name]
    if (flag !== undefined && eq < 0) { (args[flag] as boolean) = true; continue }
    if (name === '--mask') {
      let value: string | undefined
      if (eq >= 0) value = arg.slice(eq + 1)
      else if (i + 1 < argv.length) value = argv[++i]
      if (value === undefined) return fail('Argument --mask requires an argument', ExitCodes.ArgumentMismatch)
      args.populationMask = value
      continue
    }
    extras.push(arg)
  }
  if (extras.length > 0) {
    return fail(`${extras.length > 1 ? 'The following arguments were not expected: '
      : 'The following argument was not expected: '}${extras.join(' ')}`, ExitCodes.ExtrasError)
  }
  if (!haveInput) return fail('inputPath is required', ExitCodes.RequiredError)
  return { args }
}

// The prim accessors of usdtree.cpp:74-158, over a composed prim or a prim
// spec.
interface TreePrim {
  children(): TreePrim[]
  name(): string
  specifier(): string
  typeName(): string
  kind(): string
  isActive(): boolean
  hasAuthoredActive(): boolean
  metadataKeys(): string[]
  propertyNames(): string[]
}

// TfEnum::GetDisplayName of an SdfSpecifier: "Def", "Over" or "Class".
const specifierDisplayName = { def: 'Def', over: 'Over', class: 'Class' } as const

function usdTreePrim(prim: UsdPrim): TreePrim {
  return {
    children: () => prim.getAllChildren().map(usdTreePrim),
    name: () => SdfPath.fromString(prim.path).name,
    specifier: () => specifierDisplayName[prim.getSpecifier()],
    typeName: () => prim.typeName,
    // UsdModelAPI(prim).GetKind(&kind).
    kind: () => prim.getKind(),
    isActive: () => prim.isActive,
    hasAuthoredActive: () => prim.hasAuthoredMetadata('active'),
    metadataKeys: () => Object.keys(prim.getAllAuthoredMetadata()),
    propertyNames: () => prim.getAuthoredPropertyNames(),
  }
}

function sdfTreePrim(prim: SdfPrimSpec): TreePrim {
  return {
    children: () => prim.getNameChildren().values().map(sdfTreePrim),
    name: () => prim.getName(),
    specifier: () => specifierDisplayName[prim.getSpecifier()],
    typeName: () => prim.getTypeName(),
    kind: () => prim.getKind(),
    isActive: () => prim.getActive(),
    hasAuthoredActive: () => prim.hasInfo('active'),
    metadataKeys: () => prim.listInfoKeys(),
    propertyNames: () => prim.getProperties().values().map(prop => prop.getName()),
  }
}

// GetPrimLabel (usdtree.cpp:160-189).
function getPrimLabel(prim: TreePrim): string {
  // The display names of specifiers are known to be ASCII only.
  const spec = prim.specifier().toLowerCase()
  const typeName = prim.typeName()
  let definition = spec
  if (typeName !== '') definition += ` ${typeName}`

  let label = `${prim.name()} [${definition}]`

  const shortMetadata: string[] = []
  if (!prim.isActive()) shortMetadata.push('active = false')
  else if (prim.hasAuthoredActive()) shortMetadata.push('active = true')

  const kind = prim.kind()
  if (kind !== '') shortMetadata.push(`kind = ${kind}`)

  if (shortMetadata.length > 0) label += ` (${shortMetadata.join(', ')})`

  return label
}

// std::sort over TfToken's operator<, a string comparison.
function tokenCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// PrintPrim (usdtree.cpp:191-256).
function printPrim(args: Args, prim: TreePrim, prefix: string, isLast: boolean, out: (text: string) => void): void {
  const hasChildren = prim.children().length > 0

  let lastStep: string
  let attrStep: string
  if (!isLast) {
    lastStep = ' |--'
    attrStep = hasChildren ? ' |   |' : ' |    '
  } else {
    lastStep = ' `--'
    attrStep = hasChildren ? '     |' : '      '
  }

  const label = args.simple ? prim.name() : getPrimLabel(prim)

  out(`${prefix}${lastStep}${label}\n`)

  const attrs: string[] = []
  if (args.metadata) {
    const metadata = prim.metadataKeys().sort(tokenCompare)
    for (const key of metadata) {
      if (key === '' || key === 'typeName' || key === 'specifier' || key === 'kind' || key === 'active') continue
      attrs.push(`(${key})`)
    }
  }

  if (args.attributes) {
    for (const prop of prim.propertyNames()) attrs.push(`.${prop}`)
  }

  attrs.forEach((attr, i) => {
    out(`${prefix}${attrStep}${i + 1 < attrs.length ? ' :--' : ' `--'}${attr}\n`)
  })
}

// PrintChildren (usdtree.cpp:259-272).
function printChildren(args: Args, prim: TreePrim, prefix: string, out: (text: string) => void): void {
  const children = prim.children()
  children.forEach((child, i) => {
    if (i + 1 < children.length) {
      printPrim(args, child, prefix, false, out)
      printChildren(args, child, `${prefix} |  `, out)
    } else {
      printPrim(args, child, prefix, true, out)
      printChildren(args, child, `${prefix}    `, out)
    }
  })
}

// PrintTree (usdtree.cpp:274-278).
function printTree(args: Args, pseudoRoot: TreePrim, out: (text: string) => void): void {
  out('/\n')
  printChildren(args, pseudoRoot, '', out)
}

// PrintTree (usdtree.cpp:280-334), errors posted to `m`. A thrown error is a
// posted one, as a Tf error is upstream.
async function printTreeAt(args: Args, resolved: string, m: TfErrorMark, out: (text: string) => void): Promise<void> {
  try {
    if (args.flatten) {
      // The mask can be provided as a comma or space delimited string.
      const mask = new UsdStagePopulationMask()
      for (const path of TfStringTokenize(args.populationMask, ', ')) mask.add(SdfPath.fromString(path).toString())

      if (!m.isClean()) return

      const options = args.unloaded ? { loadPayloads: false } : {}
      const stage = !mask.isEmpty()
        ? await UsdStage.openMasked(resolved, mask, options)
        : await UsdStage.open(resolved, options)

      if (!m.isClean() || !stage) return

      printTree(args, usdTreePrim(stage.getPrim('/')!), out)
    } else if (args.flattenLayerStack) {
      const stage = await UsdStage.open(resolved, { loadPayloads: false })
      if (!m.isClean() || !stage) return

      const layer = UsdUtilsFlattenLayerStack(stage)
      if (!m.isClean()) return

      printTree(args, sdfTreePrim(layer.getPseudoRoot()), out)
    } else {
      const layer = await SdfLayer.findOrOpen(resolved)
      if (!m.isClean() || !layer) return

      printTree(args, sdfTreePrim(layer.getPseudoRoot()), out)
    }
  } catch (e) {
    m.capture(() => { throw e instanceof TfError ? e : new TfError(e instanceof Error ? e.message : String(e)) })
  }
}

// std::quoted.
function quoted(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// USDTree (usdtree.cpp:336-369).
async function usdTreeRun(args: Args, io: UsdTreeIO): Promise<number> {
  if (args.populationMask !== '' && !args.flatten) {
    // You can only mask a stage, not a layer.
    io.stderr('error: --mask requires --flatten\n')
    return 1
  }

  const errMark = new TfErrorMark()
  try {
    const resolver = ArGetResolver()
    const context = resolver.createDefaultContextForAsset(args.inputPath)
    // The tree is written once it is complete, as std::cout buffers it.
    let tree = ''
    await new ArResolverContextBinder(context).run(async () => {
      const resolved = (await resolver.resolve(args.inputPath)).toString()
      if (!resolved) TF_RUNTIME_ERROR('Cannot resolve input path')
      else await printTreeAt(args, resolved, errMark, text => { tree += text })
    })
    io.stdout(tree)

    if (!errMark.isClean()) {
      io.stderr(`Failed to process ${quoted(args.inputPath)} - `)
      for (const err of errMark.getErrors()) io.stderr(`${err.getCommentary()}\n`)
      errMark.clear()
      return 1
    }

    return 0
  } finally {
    errMark.dispose()
  }
}

const processIO: UsdTreeIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
}

/** main (usdtree.cpp:373-386): runs usdtree with the arguments `argv`
 *  (without the program name) and resolves its exit code. */
export async function usdtree(argv: readonly string[], io: UsdTreeIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  return usdTreeRun(parsed.args, io)
}

// Run as a script: `usdtree ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usdtree(process.argv.slice(2))
