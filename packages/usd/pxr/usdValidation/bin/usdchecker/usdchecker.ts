#!/usr/bin/env node
// Ported from OpenUSD 26.11.1: pxr/usdValidation/bin/usdchecker/usdchecker.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdchecker (usdchecker.cpp): checks the compliance of a USD stage or a
// USDZ package with the validators of the validation framework, in the
// default variant selections and in combinations of variant selections.
//
// usdchecker(argv, io) runs the tool in process and resolves its exit code;
// standard output and error go to `io` (the process's by default). Run as a
// script, the file is the command. Validating and changing variant
// selections are asynchronous here, so the tool is.
//
// FAITHFULNESS-DEBT(usdchecker-cli11-subset): upstream parses its arguments
// with CLI11 (pxr/base/tf/pxrCLI11/CLI11.h, _Configure at
// usdchecker.cpp:59-127). parseArgs reads the same option, flags and
// positional input, with --variants and --variantSets taking every
// following argument up to the next option, and fails with CLI11's exit
// codes for an unknown or extra argument and a missing option value;
// -h/--help prints a usage summary, not CLI11's formatted help. A port of
// pxrCLI11 would replace it.

// The libraries this program loads. A library registers its validators (and
// the schemas they check) when it is imported here, the analog of upstream's
// registry reading every plugin's validator metadata from plugInfo and
// loading the plugin when a validator is asked for
// (usdValidation/registry.cpp:76-190, 360-381).
import 'typescript-usd/usdGeomValidators'
import 'typescript-usd/usdLodValidators'
import 'typescript-usd/usdLuxValidators'
import 'typescript-usd/usdMediaValidators'
import 'typescript-usd/usdPhysicsValidators'
import 'typescript-usd/usdShadeValidators'
import 'typescript-usd/usdSkelValidators'
import 'typescript-usd/usdUtilsValidators'
// SdrRegistry discovers the usdShaders plugin's shader definitions
// (UsdPreviewSurface, UsdUVTexture, ...), which the ShaderSdrCompliance
// validator looks up; here they are registered by an asynchronous call
// before validating (FAITHFULNESS-DEBT(sdr-shaderdefs-stage-open),
// usd/plugin/usdShaders/src/discoveryPlugin.ts).
import { UsdShaders_RegisterShaderNodesAsync } from 'typescript-usd/usdShaders'

import { TF_WARN, TfStringTokenize } from 'typescript-usd/tf'
import { _isMainScript, _writeFile } from 'typescript-usd/ar/_internal'
import {
  EditContext as UsdEditContext, EditTarget as UsdEditTarget, type Prim as UsdPrim, Stage as UsdStage,
  TimeCode as UsdTimeCode,
} from 'typescript-usd/usd'
import {
  type ValidationError as UsdValidationError, ValidationContext as UsdValidationContext,
  ValidationErrorType as UsdValidationErrorType, ValidationRegistry as UsdValidationRegistry,
  type ValidatorMetadata as UsdValidationValidatorMetadata, ValidatorNameTokens as UsdValidatorNameTokens,
} from 'typescript-usd/usdValidation'
import { ValidatorNameTokens as UsdUtilsValidatorNameTokens } from 'typescript-usd/usdUtilsValidators'

/** Where the tool writes: std::cout and std::cerr, and whether each is a
 *  terminal (ArchFileIsaTTY), which colors the report. */
export interface UsdCheckerIO {
  stdout(text: string): void
  stderr(text: string): void
  stdoutIsTTY?: boolean
  stderrIsTTY?: boolean
}

// usdchecker.cpp:35-40.
const _ErrorColor = '\x1b[91m'
const _WarningColor = '\x1b[93m'
const _InfoColor = '\x1b[94m'
const _SuccessColor = '\x1b[92m'
// Default limit set to restrict the number of variants validation calls.
const _DefaultVariantsValidationLimit = 1000

// Args (usdchecker.cpp:44-57).
interface Args {
  inputFile: string
  outFile: string
  variants: string[]
  variantSets: string[]
  includeKeywords: string
  skipVariants: boolean
  disableVariantValidationLimit: boolean
  rootPackageOnly: boolean
  noAssetChecks: boolean
  dumpRules: boolean
  verbose: boolean
  strict: boolean
}

// CLI::ExitCodes (CLI11.h:662-680).
const ExitCodes = { ExtrasError: 109, ArgumentMismatch: 114 } as const

const DESCRIPTION = 'Utility for checking the compliance of a given USD stage or a USDZ package.  ' +
  'Only the first sample of any relevant time-sampled attribute is checked, currently.'

const usage = (prog: string) => `${DESCRIPTION}
Usage: ${prog} [OPTIONS] [inputFile]

Positionals:
  inputFile FILE              Name of the input file to inspect.

Options:
  -h,--help                   Print this help message and exit
  --includeKeywords KEYWORDS  If specified, only validators from the included keywords are run.
  -s,--skipVariants           Only check the prims present in the default variants.
  -p,--rootPackageOnly        Check only the specified package.
  -o,--out FILE               The file to which all the failed checks are output.
  --noAssetChecks             Do NOT perform extra asset checks.
  -d,--dumpRules              Dump the enumerated set of rules being checked.
  -v,--verbose                Enable verbose output mode.
  -t,--strict                 Return failure code even if only warnings are issued.
  --variantSets ...           List of variantSets to validate.
  --variants ...              List of ',' separated variantSet:variant pairs to validate.
  --disableVariantValidationLimit
                              Disable the limit on the number of variants validation calls.
`

type Parsed = { args: Args } | { exitCode: number }

// _Configure (usdchecker.cpp:59-127) and CLI11_PARSE (usdchecker.cpp:667).
// See FAITHFULNESS-DEBT(usdchecker-cli11-subset).
function parseArgs(argv: readonly string[], prog: string, io: UsdCheckerIO): Parsed {
  const args: Args = {
    inputFile: '', outFile: 'stdout', variants: [], variantSets: [], includeKeywords: '',
    skipVariants: false, disableVariantValidationLimit: false, rootPackageOnly: false,
    noAssetChecks: false, dumpRules: false, verbose: false, strict: false,
  }
  const flags: Record<string, keyof Args> = {
    '-s': 'skipVariants', '--skipVariants': 'skipVariants', '-p': 'rootPackageOnly',
    '--rootPackageOnly': 'rootPackageOnly', '--noAssetChecks': 'noAssetChecks', '-d': 'dumpRules',
    '--dumpRules': 'dumpRules', '-v': 'verbose', '--verbose': 'verbose', '-t': 'strict', '--strict': 'strict',
    '--disableVariantValidationLimit': 'disableVariantValidationLimit',
  }
  const options: Record<string, 'includeKeywords' | 'outFile'> = {
    '--includeKeywords': 'includeKeywords', '-o': 'outFile', '--out': 'outFile',
  }
  const vectorOptions: Record<string, 'variants' | 'variantSets'> = {
    '--variants': 'variants', '--variantSets': 'variantSets',
  }
  const fail = (message: string, exitCode: number): Parsed => {
    io.stderr(`${message}\nRun with --help for more information.\n`)
    return { exitCode }
  }
  const isOption = (arg: string) => arg.startsWith('-') && arg !== '-'
  const extras: string[] = []
  let haveInput = false
  for (let i = 0; i < argv.length; ++i) {
    const arg = argv[i]!
    if (!isOption(arg)) {
      if (haveInput) extras.push(arg)
      else { args.inputFile = arg; haveInput = true }
      continue
    }
    if (arg === '-h' || arg === '--help') {
      io.stdout(usage(prog))
      return { exitCode: 0 }
    }
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1
    const name = eq < 0 ? arg : arg.slice(0, eq)
    const flag = flags[name]
    if (flag !== undefined && eq < 0) {
      (args[flag] as boolean) = true
      continue
    }
    const vector = vectorOptions[name]
    if (vector !== undefined) {
      const values: string[] = []
      if (eq >= 0) values.push(arg.slice(eq + 1))
      else while (i + 1 < argv.length && !isOption(argv[i + 1]!)) values.push(argv[++i]!)
      if (values.length === 0) return fail(`Argument ${name} requires at least 1 argument`, ExitCodes.ArgumentMismatch)
      args[vector].push(...values)
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
    args[option] = value
  }
  if (extras.length > 0) {
    return fail(`${extras.length > 1 ? 'The following arguments were not expected: '
      : 'The following argument was not expected: '}${extras.join(' ')}`, ExitCodes.ExtrasError)
  }
  return { args }
}

// _ValidateArgs (usdchecker.cpp:129-146).
function validateArgs(args: Args, io: UsdCheckerIO): boolean {
  // Check conflicting options.
  if (args.rootPackageOnly && args.skipVariants) {
    io.stderr('Error: The options --rootPackageOnly and --skipVariants are mutually exclusive.\n')
    return false
  }

  if (!args.dumpRules && args.inputFile === '') {
    io.stderr('Error: Either an inputFile or the --dumpRules option must be specified.\n')
    return false
  }

  return true
}

// An output stream: std::cout, std::cerr or an std::ofstream.
interface Output {
  write(text: string): void
  isTTY: boolean
}

// Used for reporting validation errors for each combination of variants
// (usdchecker.cpp:148-152).
interface VariantInfo {
  primPath: string
  variants: string[]
}

// _PrintMessage (usdchecker.cpp:154-167): colored when the output is a
// terminal.
function printMessage(output: Output, msg: string, color = ''): void {
  if (color !== '' && output.isTTY) output.write(`${color}${msg}\x1b[0m\n`)
  else output.write(`${msg}\n`)
}

// _ReportValidationErrors (usdchecker.cpp:170-245).
function reportValidationErrors(
  errors: readonly UsdValidationError[], output: Output, strict: boolean, io: UsdCheckerIO,
  variantInfo?: VariantInfo,
): boolean {
  let reportFailure = false
  let reportWarning = false

  if (variantInfo && variantInfo.primPath !== '') {
    printMessage(output,
      `\nValidation Result for Variants: ${variantInfo.variants.join(',')} on Prim: ${variantInfo.primPath}`,
      _InfoColor)
  } else {
    printMessage(output, '\nValidation Result with no explicit variants set', _InfoColor)
  }

  for (const error of errors) {
    switch (error.getType()) {
      case UsdValidationErrorType.Error: {
        reportFailure = true
        printMessage(output, error.getErrorAsString(), _ErrorColor)
        const fixers = error.getFixers()
        if (fixers.length > 0) {
          printMessage(output, '\tPossible Fixes which can be applied:', _InfoColor)
          const stage = error.getSites()[0]?.getStage()
          for (const fixer of fixers) {
            if (stage && fixer.canApplyFix(error, new UsdEditTarget(stage.getRootLayer()), UsdTimeCode.Default())) {
              printMessage(output, `\t- ${fixer.getName()}: ${fixer.getDescription()}.`, _InfoColor)
            }
          }
        }
        break
      }
      case UsdValidationErrorType.Warn:
        if (strict) reportFailure = true
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
  return true
}

// _VariantsLimitChecker (usdchecker.cpp:247-295): if the validation limit is
// reached, skip the remaining variants, unless the limit is disabled.
class VariantsLimitChecker {
  private _variantValidationCounter = 0

  constructor(private readonly _output: Output, private readonly _disableVariantValidationLimit: boolean) {}

  checkLimit(): boolean {
    const limitReached = !this._disableVariantValidationLimit &&
      this._variantValidationCounter >= _DefaultVariantsValidationLimit
    if (limitReached) {
      printMessage(this._output,
        `Validation limit of ${_DefaultVariantsValidationLimit} variants validated reached. ` +
        'Skipping remaining variants.', _WarningColor)
    }
    return limitReached
  }

  incrementAndCheckLimit(): boolean {
    ++this._variantValidationCounter
    return this.checkLimit()
  }

  printCounter(): void {
    printMessage(this._output, `Number of variants validated so far: ${this._variantValidationCounter}`, _InfoColor)
  }
}

interface ValidateRun {
  stage: UsdStage
  ctx: UsdValidationContext
  output: Output
  strict: boolean
  io: UsdCheckerIO
  limit: VariantsLimitChecker
}

// _ValidatePrimVariants (usdchecker.cpp:297-391): recursively validates all
// the combinations of variants for `prim`, setting each variant selection
// and validating the stage; only the variant sets in explicitVariantSets
// when it is not empty.
async function validatePrimVariants(
  run: ValidateRun, prim: UsdPrim, variantToValidate: string[], visitedSets: Set<string>,
  explicitVariantSets: readonly string[],
): Promise<boolean> {
  const variantSets = prim.getVariantSets()
  const variantSetNames = explicitVariantSets.length === 0 ? variantSets.getNames() : explicitVariantSets
  let success = true

  // Iterate through the variant sets.
  for (const setName of variantSetNames) {
    // Reached the limit: nothing to clean, stop iterating further.
    if (run.limit.checkLimit()) break

    // Possible in case of explicit variantSets, that the variantSet is not
    // present in the prim.
    if (!variantSets.hasVariantSet(setName)) continue

    // Skip if this variantSet has already been visited.
    if (visitedSets.has(setName)) continue
    visitedSets.add(setName)

    const currentSet = variantSets.getVariantSet(setName)
    // Get all variants, including the empty variant (no selection).
    const variants = [...currentSet.getVariantNames(), '']

    for (const variant of variants) {
      // Reached the limit: stop iterating further, nothing to clean.
      if (run.limit.checkLimit()) break
      // Set the current variant selection (UsdVariantSets::SetSelection,
      // variantSets.cpp:266-276).
      await variantSets.getVariantSet(setName).setVariantSelection(variant)
      // Helps in reporting the variant selection for the prim, in case of
      // validation errors.
      variantToValidate.push(`${setName}:${variant}`)

      // Validate this combination of variants for the prim.
      const errors = await run.ctx.validate(run.stage)
      success = reportValidationErrors(errors, run.output, run.strict, run.io,
        { primPath: prim.path, variants: variantToValidate }) && success

      if (run.limit.incrementAndCheckLimit()) {
        // Reached the limit: stop recursing further.
        variantToValidate.pop()
        break
      }

      // Recursively validate the next variantSets.
      success = await validatePrimVariants(run, prim, variantToValidate, visitedSets, explicitVariantSets) &&
        success

      variantToValidate.pop()
    }

    // Done with this currentSet, clear the variant selection on it.
    await currentSet.clearVariantSelection()

    // Remove the variantSet from the visitedSets after processing all the
    // variants in the variantSet, so that it is visited again when it is
    // encountered in a different path.
    visitedSets.delete(setName)
  }
  return success
}

// _ValidateVariants (usdchecker.cpp:393-529).
async function validateVariants(
  run: ValidateRun, variantPairs: readonly string[], variantSets: readonly string[],
): Promise<boolean> {
  let success = true
  // The prims of the default stage (UsdPrimRange range = stage->Traverse()).
  // Every prim's selections are cleared before the next prim is visited, so
  // the stage is back in its default composition at each step; the paths are
  // collected first rather than walking a stage that recomposes under the
  // iteration.
  const range = [...run.stage.traverse()]

  // Use UsdEditContext to temporarily set the edit target to the session
  // layer.
  const editContext = new UsdEditContext(run.stage, run.stage.getSessionLayer())
  try {
    // For all prims in the stage, check if the prim has variants and if so,
    // set each combination of variant selection on the stage's session
    // layer.
    for (const primPath of range) {
      // Reached the limit: stop iterating further.
      if (run.limit.checkLimit()) break

      const prim = run.stage.getPrim(primPath)
      if (!prim || !prim.hasVariantSets()) continue

      // Validates the combinations of variants in the given variantSets.
      const validateVariantSets = (variantToValidate: string[], sets: readonly string[]) =>
        validatePrimVariants(run, prim, variantToValidate, new Set(), sets)

      if (variantPairs.length === 0) {
        // If no explicit variants are specified, validate all the possible
        // combinations of variants from all variantSets on the prim or from
        // the explicitly specified variantSets. variantToValidate keeps track
        // of the variant selections, for reporting.
        success = await validateVariantSets([], variantSets) && success
      } else {
        for (const variantPairCombination of variantPairs) {
          // Reached the limit: stop iterating further.
          if (run.limit.checkLimit()) break
          // The variantSets specified in the variantPairs, to ignore the same
          // variantSet in the --variantSets option, since a specific variant
          // of this variantSet is already asked to be validated.
          const setsInVariantPairs = new Set<string>()
          const variantSetVariants = TfStringTokenize(variantPairCombination, ',')
          for (const variantSetVariant of variantSetVariants) {
            const variantSetAndVariant = TfStringTokenize(variantSetVariant, ':')
            if (variantSetAndVariant.length === 2) {
              // Both variantSet and variantName are provided, set the
              // specified variant to be validated.
              const [variantSet, variant] = variantSetAndVariant as [string, string]
              setsInVariantPairs.add(variantSet)
              await prim.getVariantSets().getVariantSet(variantSet).setVariantSelection(variant)
            } else {
              TF_WARN(`Invalid variant pair: ${variantSetVariant}. Skipping`)
            }
          }
          if (variantSets.length === 0) {
            // No variantSets are specified, validate the variants explicitly
            // set above.
            const errors = await run.ctx.validate(run.stage)
            success = reportValidationErrors(errors, run.output, run.strict, run.io,
              { primPath: prim.path, variants: variantSetVariants }) && success
            // Reached the limit: stop iterating further.
            if (run.limit.incrementAndCheckLimit()) break
          } else {
            // Validate the above variants in combination with variants from
            // the explicitly specified variantSets, skipping the variantSets
            // a variantSet:variant pair above already set.
            const prunedVariantSets: string[] = []
            for (const variantSet of variantSets) {
              if (!setsInVariantPairs.has(variantSet)) {
                prunedVariantSets.push(variantSet)
              } else {
                TF_WARN(`VariantSet ${variantSet} is specified in both --variants and --variantSets. ` +
                  'Skipping the variantSet.')
              }
            }

            // variantSetVariants keeps track of variants for reporting in
            // combination with the variants from the explicit variantSets.
            success = await validateVariantSets(variantSetVariants, prunedVariantSets) && success
          }
          // Clear the variant selection after validation runs of this
          // variantPairCombination.
          for (const variantSet of setsInVariantPairs) {
            await prim.getVariantSets().getVariantSet(variantSet).clearVariantSelection()
          }
        }
      }
    }
  } finally {
    editContext.close()
  }
  return success
}

// _UsdChecker (usdchecker.cpp:531-654).
async function usdCheckerRun(args: Args, io: UsdCheckerIO): Promise<number> {
  if (!validateArgs(args, io)) return 1

  const validationReg = UsdValidationRegistry.getInstance()

  let metadata: UsdValidationValidatorMetadata[]
  if (args.includeKeywords === '') {
    metadata = validationReg.getAllValidatorMetadata()
  } else {
    const allKeywords = TfStringTokenize(args.includeKeywords, ',')
    metadata = validationReg.getValidatorMetadataForKeywords(allKeywords)
  }
  if (args.noAssetChecks) {
    // Remove metadata which have the stageMetadataChecker validator name.
    metadata = metadata.filter(meta => meta.name !== UsdValidatorNameTokens.stageMetadataChecker)
  }
  if (args.rootPackageOnly) {
    // Remove UsdUtilsValidators:UsdzPackageValidator.
    metadata = metadata.filter(meta => meta.name !== UsdUtilsValidatorNameTokens.usdzPackageValidator)
  } else {
    // Remove UsdUtilsValidators:RootPackageValidator.
    metadata = metadata.filter(meta => meta.name !== UsdUtilsValidatorNameTokens.rootPackageValidator)
  }

  // Sort metadata based on the name of the validator. Helps with
  // deterministic dumping of validation rules. (std::sort over TfToken's
  // operator<, a string comparison.)
  metadata.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

  if (args.dumpRules) {
    for (const meta of metadata) {
      io.stdout(`[${meta.name}]:\n`)
      io.stdout(`\tDoc: ${meta.doc}\n`)
      if (meta.keywords.length > 0) io.stdout(`\tKeywords: ${meta.keywords.join(', ')}\n`)
      if (meta.schemaTypes.length > 0) io.stdout(`\tSchemaTypes: ${meta.schemaTypes.join(', ')}\n`)
      io.stdout(`\tisSuite: ${meta.isSuite ? 'True' : 'False'}\n`)
    }
  }

  if (args.inputFile === '') return 0

  await UsdShaders_RegisterShaderNodesAsync()
  const stage = await UsdStage.open(args.inputFile)
  if (!stage) {
    io.stderr('Error: Failed to open stage.\n')
    return 1
  }
  const ctx = new UsdValidationContext(metadata)

  // Do a validation run without any variants set, to get default stage
  // validation errors.
  const errors = await ctx.validate(stage)

  let fileText: string | undefined
  let output: Output
  if (args.outFile === 'stderr') {
    output = { write: t => io.stderr(t), isTTY: io.stderrIsTTY ?? false }
  } else if (args.outFile === 'stdout') {
    output = { write: t => io.stdout(t), isTTY: io.stdoutIsTTY ?? false }
  } else {
    // std::ofstream: opened (and truncated) now, written as the report is.
    try {
      await _writeFile(args.outFile, new Uint8Array())
    } catch {
      io.stderr(`Error: Failed to open output file ${args.outFile} for writing.\n`)
      return 1
    }
    fileText = ''
    output = { write: t => { fileText += t }, isTTY: false }
  }

  const run: ValidateRun = {
    stage, ctx, output, strict: args.strict, io,
    limit: new VariantsLimitChecker(output, args.disableVariantValidationLimit),
  }
  let success = reportValidationErrors(errors, output, args.strict, io)

  // If skipVariants is not set, validate the given variants.
  if (!args.skipVariants) {
    success = await validateVariants(run, args.variants, args.variantSets) && success
  }

  if (fileText !== undefined) await _writeFile(args.outFile, new TextEncoder().encode(fileText))
  return success ? 0 : 1
}

const processIO: UsdCheckerIO = {
  stdout: text => { process.stdout.write(text) },
  stderr: text => { process.stderr.write(text) },
  get stdoutIsTTY() { return process.stdout.isTTY === true },
  get stderrIsTTY() { return process.stderr.isTTY === true },
}

/** main (usdchecker.cpp:656-669): runs usdchecker with the arguments `argv`
 *  (without the program name) and resolves its exit code. */
export async function usdchecker(
  argv: readonly string[], io: UsdCheckerIO = processIO, prog = 'usdchecker',
): Promise<number> {
  const parsed = parseArgs(argv, prog, io)
  if ('exitCode' in parsed) return parsed.exitCode
  return usdCheckerRun(parsed.args, io)
}

// Run as a script: `usdchecker ...` on the command line.
if (await _isMainScript(import.meta.url)) process.exitCode = await usdchecker(process.argv.slice(2))
