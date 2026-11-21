#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/bin/usdauthors/usdauthors.cpp
// Copyright 2026 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdauthors (usdauthors.cpp): lists the authorship records
// (UsdMediaAuthorshipAPI) in a USD file, grouped by prim; --debug also flags
// records shadowed or applied more than once, --summary tallies them, and
// --layer reports what a single layer authors.
//
// usdauthors(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io` (the process's by default). Run as a
// script, the file is the command. Opening files is asynchronous here, so
// the tool is.
//
// FAITHFULNESS-DEBT(usdauthors-cli11-subset): upstream parses its arguments
// with CLI11 (pxr/base/tf/pxrCLI11/CLI11.h, Configure at usdauthors.cpp:46-68).
// parseArgs reads the same flags and positional input, and fails with
// CLI11's exit codes for a missing input and an unknown or extra argument;
// -h/--help prints a usage summary, not CLI11's formatted help. A port of
// pxrCLI11 would replace it.

import { TfErrorMark, TfStringify, TF_RUNTIME_ERROR, Error as TfError } from 'typescript-usd/tf'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { SdfPath } from 'typescript-usd/sdf/path'
import { GetResolver as ArGetResolver, ResolverContextBinder as ArResolverContextBinder } from 'typescript-usd/ar'
import { _isMainScript } from 'typescript-usd/ar/_internal'
import { type Attribute as UsdAttribute, Stage as UsdStage } from 'typescript-usd/usd'
import { AuthorshipAPI as UsdMediaAuthorshipAPI } from 'typescript-usd/usdMedia'
import { Array as VtArray } from 'typescript-usd/vt'

/** Where the tool writes: std::cout and std::cerr. */
export interface UsdAuthorsIO {
  stdout(text: string): void
  stderr(text: string): void
}

// Args (usdauthors.cpp:38-44).
interface Args {
  inputPath: string
  debug: boolean
  unloaded: boolean
  summary: boolean
  layer: boolean
}

// CLI::ExitCodes (CLI11.h:662-680).
const ExitCodes = { RequiredError: 106, ExtrasError: 109 } as const

const USAGE = `usdauthors : Lists authorship records in a USD file, grouped by
prim. Each record represents a single authoring step (e.g.,
generation, export, or manual cleanup).

Records are read from the composed stage. Use --debug to also flag
records hidden or collapsed by composition, or --layer to report
only what a single layer authors.

Usage: usdauthors [OPTIONS] inputPath

Positionals:
  inputPath TEXT REQUIRED     The input file to process

Options:
  -h,--help                   Print this help message and exit
  -d,--debug                  Also examine every prim spec contributing to each prim, flagging records shadowed by an explicit apiSchemas list in a stronger layer and records applied in more than one prim spec. Slower; for debugging.
  --unloaded                  Do not load payloads.
  -s,--summary                Prints a summary of found records, including software package and digital source type tallies.
  -l,--layer                  Inspects a single layer without composition. Reaches specs unreachable via composed stages, such as those inside unselected variants. Ignores --debug and --unloaded, which are about composition.
`

type Parsed = { args: Args } | { exitCode: number }

// Configure (usdauthors.cpp:46-68) and CLI11_PARSE (usdauthors.cpp:454). See
// FAITHFULNESS-DEBT(usdauthors-cli11-subset).
function parseArgs(argv: readonly string[], io: UsdAuthorsIO): Parsed {
  const args: Args = { inputPath: '', debug: false, unloaded: false, summary: false, layer: false }
  const flags: Record<string, keyof Omit<Args, 'inputPath'>> = {
    '-d': 'debug', '--debug': 'debug', '--unloaded': 'unloaded', '-s': 'summary', '--summary': 'summary',
    '-l': 'layer', '--layer': 'layer',
  }
  const fail = (message: string, exitCode: number): Parsed => {
    io.stderr(`${message}\nRun with --help for more information.\n`)
    return { exitCode }
  }
  const extras: string[] = []
  let haveInput = false
  let positionalOnly = false
  for (const arg of argv) {
    if (positionalOnly || !arg.startsWith('-') || arg === '-') {
      if (haveInput) extras.push(arg)
      else { args.inputPath = arg; haveInput = true }
      continue
    }
    if (arg === '--') { positionalOnly = true; continue }
    if (arg === '-h' || arg === '--help') { io.stdout(USAGE); return { exitCode: 0 } }
    const flag = flags[arg]
    if (flag !== undefined) { args[flag] = true; continue }
    extras.push(arg)
  }
  if (extras.length > 0) {
    return fail(`${extras.length > 1 ? 'The following arguments were not expected: '
      : 'The following argument was not expected: '}${extras.join(' ')}`, ExitCodes.ExtrasError)
  }
  if (!haveInput) return fail('inputPath is required', ExitCodes.RequiredError)
  return { args }
}

// A string array value (VtArray<std::string>), or undefined.
function stringArray(value: unknown): string[] | undefined {
  const items = value instanceof VtArray ? [...value as Iterable<unknown>] : Array.isArray(value) ? value : undefined
  return items?.every(item => typeof item === 'string') ? items as string[] : undefined
}

// GetDisplayValue (usdauthors.cpp:70-90): arrays are joined so a field stays
// on one line.
function displayValue(value: unknown): string {
  const array = stringArray(value)
  if (array) return `[${array.map(item => `"${item}"`).join(', ')}]`
  if (typeof value === 'string') return `"${value}"`
  return TfStringify(value)
}

// GetDisplayValue (usdauthors.cpp:92-101): empty if `attr` has no authored
// value.
function attrDisplayValue(attr: UsdAttribute): string {
  if (!attr.hasAuthoredValue()) return ''
  const value = attr.get()
  return value === undefined ? '' : displayValue(value)
}

// GetStringArray (usdauthors.cpp:103-111).
function getStringArray(attr: UsdAttribute): string[] {
  return attr.hasAuthoredValue() ? stringArray(attr.get()) ?? [] : []
}

// GetDisplayInputs (usdauthors.cpp:113-130): the flattened (name, value)
// inputs paired up; an odd length means the record is malformed.
function displayInputs(inputs: readonly string[]): string {
  if (inputs.length % 2 !== 0) {
    return `(malformed: ${inputs.length} element(s), expected (name, value) pairs) ${displayValue([...inputs])}`
  }
  const pairs: string[] = []
  for (let i = 0; i < inputs.length; i += 2) pairs.push(`${inputs[i]}="${inputs[i + 1]}"`)
  return pairs.join(', ')
}

// std::sort over pair<string, string>'s operator<.
function pairCompare(a: [string, string], b: [string, string]): number {
  return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0
}

// GetAuthoredFields (usdauthors.cpp:132-173): the authored fields of one
// record, read from the property namespace.
function getAuthoredFields(record: UsdMediaAuthorshipAPI): [string, string][] {
  const fields: [string, string][] = []
  const prefix = SdfPath.joinIdentifier('authorship', record.getName())
  for (const attr of record.prim.getPropertiesInNamespace(prefix)) {
    const [baseName] = SdfPath.stripPrefixNamespace(attr.name, prefix)
    // Instance names may be namespaced, so this namespace also contains the
    // properties of nested records: skip anything that is not our own field.
    if (!UsdMediaAuthorshipAPI.isSchemaPropertyBaseName(baseName)) continue
    if (!attr.hasAuthoredValue()) continue
    fields.push([baseName, baseName === 'inputs' ? displayInputs(getStringArray(attr)) : attrDisplayValue(attr)])
  }
  return fields.sort(pairCompare)
}

// RecordId (usdauthors.cpp:175-181): (prim path, instance name).
function recordId(record: UsdMediaAuthorshipAPI): string {
  return `${record.prim.path}\u0000${record.getName()}`
}

// operator< on RecordId: SdfPath's then TfToken's ordering.
function recordCompare(lhs: UsdMediaAuthorshipAPI, rhs: UsdMediaAuthorshipAPI): number {
  const order = SdfPath.compare(SdfPath.fromString(lhs.prim.path), SdfPath.fromString(rhs.prim.path))
  if (order !== 0) return order
  const x = lhs.getName()
  const y = rhs.getName()
  return x < y ? -1 : x > y ? 1 : 0
}

function printFields(fields: readonly [string, string][], out: (text: string) => void): void {
  const width = Math.max(0, ...fields.map(([name]) => name.length))
  for (const [name, value] of fields) out(`      ${name.padEnd(width)} = ${value}\n`)
}

// PrintRecords (usdauthors.cpp:183-235).
function printRecords(records: readonly UsdMediaAuthorshipAPI[], duplicates: ReadonlySet<string>, out: (text: string) => void): void {
  let currentPrimPath = ''

  for (const record of records) {
    const primPath = record.prim.path

    // Records arrive sorted by prim path, so group them under one heading.
    if (primPath !== currentPrimPath) {
      if (currentPrimPath !== '') out('\n')
      currentPrimPath = primPath
      out(primPath)
      if (record.prim.isInPrototype()) out('  (in prototype: shared by every instance)')
      if (!record.prim.isActive) out('  (inactive)')
      out('\n')
    }

    out(`  ${record.getName()}`)
    if (!record.prim.hasAPI(UsdMediaAuthorshipAPI.typeName, record.getName())) {
      out('  (shadowed: not applied on the composed prim)')
    }
    if (duplicates.has(recordId(record))) {
      out('  (applied in more than one prim spec; only the strongest opinion for each field survives composition)')
    }
    out('\n')

    const fields = getAuthoredFields(record)
    if (fields.length === 0) {
      out('      (no authored fields)\n')
      continue
    }
    printFields(fields, out)
  }
}

// std::map<std::string, ...> iteration order.
function sortedEntries<V>(map: ReadonlyMap<string, V>): [string, V][] {
  return [...map].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
}

// PrintSummary (usdauthors.cpp:237-286).
function printSummary(records: readonly UsdMediaAuthorshipAPI[], out: (text: string) => void): void {
  // Software packages are tallied per version. Keys are lowercased because
  // softwarePackage identifiers compare case-insensitively, but the first
  // spelling seen is what gets displayed.
  const softwarePackages = new Map<string, [string, number]>()
  const sourceTypes = new Map<string, number>()

  const stringValue = (attr: UsdAttribute) => {
    const value = attr.get()
    return typeof value === 'string' ? value : ''
  }
  for (const record of records) {
    const softwarePackage = stringValue(record.getSoftwarePackageAttr()) || '(unspecified)'
    const version = stringValue(record.getSoftwareVersionAttr()) || '(unspecified)'

    const display = `${softwarePackage} ${version}`
    const key = display.replace(/[A-Z]/g, c => c.toLowerCase())
    const entry = softwarePackages.get(key) ?? ['', 0]
    if (entry[1] === 0) entry[0] = display
    ++entry[1]
    softwarePackages.set(key, entry)

    const sourceType = stringValue(record.getDigitalSourceTypeAttr()) || '(unspecified)'
    sourceTypes.set(sourceType, (sourceTypes.get(sourceType) ?? 0) + 1)
  }

  out(`${records.length} record(s)\n`)

  out('\nSoftware packages:\n')
  for (const [, [display, count]] of sortedEntries(softwarePackages)) out(`  ${count}  ${display}\n`)

  out('\nDigital source types:\n')
  for (const [sourceType, count] of sortedEntries(sourceTypes)) out(`  ${count}  ${sourceType}\n`)
}

// GetAuthoredFieldsInLayer (usdauthors.cpp:288-325): a layer record's fields,
// read from the layer's attribute specs.
function getAuthoredFieldsInLayer(layer: SdfLayer, primPath: SdfPath, instanceName: string): [string, string][] {
  const fields: [string, string][] = []
  for (const propertyName of UsdMediaAuthorshipAPI.getSchemaAttributeNames(false, instanceName)) {
    const attrSpec = layer.getAttributeAtPath(primPath.appendProperty(propertyName))
    if (!attrSpec || !attrSpec.hasDefaultValue()) continue

    const value = attrSpec.getDefaultValue()
    const [baseName] = SdfPath.stripPrefixNamespace(propertyName, SdfPath.joinIdentifier('authorship', instanceName))
    const inputs = baseName === 'inputs' ? stringArray(value) : undefined
    fields.push([baseName, inputs ? displayInputs(inputs) : displayValue(value)])
  }
  return fields.sort(pairCompare)
}

// PrintLayerRecords (usdauthors.cpp:327-367).
function printLayerRecords(layer: SdfLayer, paths: readonly string[], out: (text: string) => void): void {
  let currentPrimPath = ''

  for (const pathString of paths) {
    const path = SdfPath.fromString(pathString)
    // Records inside a variant sit at a prim variant selection path, whose
    // properties GetPrimPath() would not find.
    const primPath = path.getPrimOrPrimVariantSelectionPath()
    const instanceName = UsdMediaAuthorshipAPI.isAuthorshipAPIPath(pathString)
    if (instanceName === undefined) continue

    if (primPath.toString() !== currentPrimPath) {
      if (currentPrimPath !== '') out('\n')
      currentPrimPath = primPath.toString()
      out(`${currentPrimPath}\n`)
    }

    out(`  ${instanceName}\n`)

    const fields = getAuthoredFieldsInLayer(layer, primPath, instanceName)
    if (fields.length === 0) {
      out('      (no authored fields)\n')
      continue
    }
    printFields(fields, out)
  }
}

// std::quoted.
function quoted(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// USDAuthors (usdauthors.cpp:369-437).
async function usdAuthorsRun(args: Args, io: UsdAuthorsIO): Promise<number> {
  const errMark = new TfErrorMark()
  try {
    const resolver = ArGetResolver()
    const context = resolver.createDefaultContextForAsset(args.inputPath)
    // The report is written once it is complete, as std::cout buffers it.
    let report = ''
    const out = (text: string) => { report += text }
    await new ArResolverContextBinder(context).run(async () => {
      try {
        const resolved = (await resolver.resolve(args.inputPath)).toString()
        if (!resolved) {
          TF_RUNTIME_ERROR('Cannot resolve input path')
        } else if (args.layer) {
          const layer = await SdfLayer.findOrOpen(resolved)
          if (errMark.isClean() && layer) {
            const paths = UsdMediaAuthorshipAPI.getAllInLayer(layer)
            if (paths.length === 0) out('No authorship records found.\n')
            else printLayerRecords(layer, paths, out)
          }
        } else {
          const stage = await UsdStage.open(resolved, args.unloaded ? { loadPayloads: false } : {})

          if (errMark.isClean() && stage) {
            let records = UsdMediaAuthorshipAPI.getAllOnStage(stage)
            const duplicates = new Set<string>()

            if (args.debug) {
              records = [...records, ...UsdMediaAuthorshipAPI.getAllShadowed(stage)]
              // std::sort is not stable; records with equal ids are the same
              // record, so the order among them does not show.
              records.sort(recordCompare)
              for (const record of UsdMediaAuthorshipAPI.getAllDuplicates(stage)) duplicates.add(recordId(record))
            }

            if (args.summary) printSummary(records, out)
            else if (records.length === 0) out('No authorship records found.\n')
            else printRecords(records, duplicates, out)
          }
        }
      } catch (e) {
        // A thrown error is a posted one, as a Tf error is upstream.
        errMark.capture(() => { throw e instanceof TfError ? e : new TfError(e instanceof Error ? e.message : String(e)) })
      }
    })
    io.stdout(report)

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

const processIO: UsdAuthorsIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
}

/** main (usdauthors.cpp:441-457): runs usdauthors with the arguments `argv`
 *  (without the program name) and resolves its exit code. */
export async function usdauthors(argv: readonly string[], io: UsdAuthorsIO = processIO): Promise<number> {
  const parsed = parseArgs(argv, io)
  if ('exitCode' in parsed) return parsed.exitCode
  return usdAuthorsRun(parsed.args, io)
}

// Run as a script: `usdauthors ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usdauthors(process.argv.slice(2))
