// Ported from OpenUSD 26.11.1: pxr/usdValidation/usdValidation/context.cpp,
//  pxr/usdValidation/usdValidation/context.h
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11.1 pxr/usdValidation/usdValidation/context.{h,cpp}.
import { Layer } from 'typescript-usd/sdf'
import {
  Prim, PrimDefaultPredicate, SchemaRegistry as UsdSchemaRegistry, Stage, TimeCode as UsdTimeCode,
  TraverseInstanceProxies as UsdTraverseInstanceProxies, type PrimPredicate as UsdPrimPredicate,
} from 'typescript-usd/usd'
import { Plugin as PlugPlugin } from 'typescript-usd/plug'
import { TF_CODING_ERROR, TF_VERIFY, TF_WARN, Type as TfType } from 'typescript-usd/tf'
import type { UsdValidationError } from './error.ts'
import { UsdValidationRegistry } from './registry.ts'
import { UsdValidationTimeRange } from './timeRange.ts'
import {
  UsdValidationValidator, UsdValidationValidatorMetadata, UsdValidationValidatorSuite,
} from './validator.ts'

// context.h (_TimeDependencyState).
enum _TimeDependencyState { All, DoTimeDependent, DoNonTimeDependent }

type _Times = UsdValidationTimeRange | readonly UsdTimeCode[]

// context.cpp:25-52 (_AppendValidatorsFromMetadata): may load plugins; a
// suite contributes its contained validators.
function _appendValidatorsFromMetadata(metadata: readonly UsdValidationValidatorMetadata[],
  outUniqueValidators: Set<UsdValidationValidator>): void {
  const validationRegistry = UsdValidationRegistry.getInstance()
  for (const m of metadata) {
    if (!m.isSuite) {
      const validator = validationRegistry.getOrLoadValidatorByName(m.name)
      if (validator) outUniqueValidators.add(validator)
    } else {
      const suite = validationRegistry.getOrLoadValidatorSuiteByName(m.name)
      if (suite) for (const validator of suite.getContainedValidators()) outUniqueValidators.add(validator)
    }
  }
}

// context.cpp:54-90 (_CollectAncestorTypeValidators).
function _collectAncestorTypeValidators(schemaTypeNames: readonly string[],
  outUniqueValidators: Set<UsdValidationValidator>): void {
  const allTypes = new Set(schemaTypeNames)
  for (const schemaType of schemaTypeNames) {
    const type = UsdSchemaRegistry.getTypeFromName(schemaType)
    if (type.isUnknown()) {
      TF_WARN(`Unknown schema type '${schemaType}' provided to validate.`)
      continue
    }
    for (const ancestorType of type.getAllAncestorTypes()) allTypes.add(ancestorType.getTypeName())
  }
  const ancestorsMetadata = UsdValidationRegistry.getInstance()
    .getValidatorMetadataForSchemaTypes([...allTypes])
  _appendValidatorsFromMetadata(ancestorsMetadata, outUniqueValidators)
}

// context.cpp:92-117 (_ShouldRunSchemaTypeValidator).
function _shouldRunSchemaTypeValidator(prim: Prim, schema: string): boolean {
  // Check if the prim is of the given schema type.
  const type = TfType.findByName(schema)
  if (type.isUnknown()) return false

  const schemaTypeName = UsdSchemaRegistry.getSchemaTypeName(type)
  if (prim.isA(schemaTypeName)) return true

  // If schema is not an API schema, then it should not be run for the prim.
  if (!UsdSchemaRegistry.isAppliedAPISchema(type)) return false

  // Check if the prim has the given API schema applied.
  return prim.getAppliedSchemas().includes(schemaTypeName)
}

function _isPrimSequence(value: unknown): value is Iterable<Prim> {
  return typeof value === 'object' && value !== null && Symbol.iterator in value
    && !(value instanceof UsdValidationTimeRange) && !Array.isArray(value)
}

/**
 * A set of validators, selected by keywords, plugins, metadata, schema types,
 * validators or suites, run over a layer, a stage or prims
 * (context.h:30-460).
 *
 * PLATFORM-DIVERGENCE(usdValidation-serial-dispatch): upstream runs each
 * validator's task on a WorkDispatcher and gathers errors under a mutex
 * (context.cpp:279-619); JavaScript has no shared-memory threads, so the
 * tasks run in order on the calling thread and the errors are in the order
 * the tasks were dispatched.
 */
export class UsdValidationContext {
  readonly #layerValidators: UsdValidationValidator[] = []
  readonly #stageValidators: UsdValidationValidator[] = []
  readonly #primValidators: UsdValidationValidator[] = []
  readonly #schemaTypeValidators: [string, UsdValidationValidator[]][] = []

  /**
   * context.cpp:119-205: validators for keywords, plugins or metadata
   * (with the validators of their schema types' ancestor types unless
   * includeAllAncestors is false); context.cpp:207-227: validators for
   * schema types and their ancestor types; context.cpp:229-235: the given
   * validators; context.cpp:237-251: the validators of the given suites.
   */
  constructor(keywords: readonly string[], includeAllAncestors?: boolean)
  constructor(plugins: readonly (PlugPlugin | null | undefined)[], includeAllAncestors?: boolean)
  constructor(metadata: readonly UsdValidationValidatorMetadata[], includeAllAncestors?: boolean)
  constructor(schemaTypes: readonly TfType[])
  constructor(validators: readonly UsdValidationValidator[])
  constructor(suites: readonly (UsdValidationValidatorSuite | null | undefined)[])
  constructor(items: readonly unknown[], includeAllAncestors = true) {
    const first = items.find(item => item !== null && item !== undefined)
    const validationRegistry = UsdValidationRegistry.getInstance()
    if (first === undefined || typeof first === 'string') {
      this.#initializeFromValidatorMetadata(
        validationRegistry.getValidatorMetadataForKeywords(items as string[]), includeAllAncestors)
    } else if (first instanceof PlugPlugin) {
      const pluginNames = (items as (PlugPlugin | null | undefined)[])
        .filter((plugin): plugin is PlugPlugin => !!plugin).map(plugin => plugin.getName())
      this.#initializeFromValidatorMetadata(
        validationRegistry.getValidatorMetadataForPlugins(pluginNames), includeAllAncestors)
    } else if (first instanceof UsdValidationValidatorMetadata) {
      this.#initializeFromValidatorMetadata(items as UsdValidationValidatorMetadata[], includeAllAncestors)
    } else if (first instanceof TfType) {
      const uniqueValidators = new Set<UsdValidationValidator>()
      _collectAncestorTypeValidators((items as TfType[]).map(type => type.getTypeName()), uniqueValidators)
      this.#distributeValidators([...uniqueValidators])
    } else if (first instanceof UsdValidationValidator) {
      this.#distributeValidators(items as UsdValidationValidator[])
    } else if (first instanceof UsdValidationValidatorSuite) {
      const uniqueValidators = new Set<UsdValidationValidator>()
      for (const suite of items as (UsdValidationValidatorSuite | null | undefined)[]) {
        if (!suite) continue
        for (const validator of suite.getContainedValidators()) uniqueValidators.add(validator)
      }
      this.#distributeValidators([...uniqueValidators])
    }
  }

  // context.cpp:153-205 (_InitializeFromValidatorMetadata).
  #initializeFromValidatorMetadata(metadata: readonly UsdValidationValidatorMetadata[],
    includeAllAncestors: boolean): void {
    const uniqueValidators = new Set<UsdValidationValidator>()
    _appendValidatorsFromMetadata(metadata, uniqueValidators)
    if (includeAllAncestors) {
      const schemaTypesFromMetadata = [...new Set(metadata.flatMap(m => m.schemaTypes))]
      // if the collected validators have schematypes metadata, collect all
      // ancestor type validators for those schema types.
      _collectAncestorTypeValidators(schemaTypesFromMetadata, uniqueValidators)
    }
    this.#distributeValidators([...uniqueValidators])
  }

  // context.cpp:253-305 (_DistributeValidators).
  #distributeValidators(validators: readonly UsdValidationValidator[]): void {
    for (const validator of validators) {
      if (validator._getValidateLayerTask()) {
        this.#layerValidators.push(validator)
      } else if (validator._getValidateStageTask()) {
        this.#stageValidators.push(validator)
      } else if (validator._getValidatePrimTask()) {
        if (validator.getMetadata().schemaTypes.length === 0) {
          this.#primValidators.push(validator)
        } else {
          // Distribute schema type validators into pairs of the schema type
          // and its validators.
          for (const schemaType of validator.getMetadata().schemaTypes) {
            const pair = this.#schemaTypeValidators.find(([type]) => type === schemaType)
            if (pair) pair[1].push(validator)
            else this.#schemaTypeValidators.push([schemaType, [validator]])
          }
        }
      }
    }
  }

  /**
   * Validates a layer (context.cpp:307-322); a stage, its used layers and
   * the prims a traversal with the predicate visits (default: the default
   * predicate with instance proxies) over a time range or at time codes
   * (context.cpp:324-396); or the given prims (context.cpp:398-438).
   * Resolves to the errors (PLATFORM-DIVERGENCE(usdValidation-async-validate),
   * validator.ts).
   */
  validate(layer: Layer): Promise<UsdValidationError[]>
  validate(stage: Stage, predicate?: UsdPrimPredicate, times?: _Times): Promise<UsdValidationError[]>
  validate(stage: Stage, times: _Times): Promise<UsdValidationError[]>
  validate(prims: Iterable<Prim>, times?: _Times): Promise<UsdValidationError[]>
  async validate(object: Layer | Stage | Iterable<Prim> | null | undefined,
    predicateOrTimes?: UsdPrimPredicate | _Times, times?: _Times): Promise<UsdValidationError[]> {
    const errors: UsdValidationError[] = []
    if (object instanceof Layer) {
      await this.#validateLayer(object, errors)
      return errors
    }
    if (object instanceof Stage) {
      let predicate: UsdPrimPredicate = UsdTraverseInstanceProxies(PrimDefaultPredicate)
      let stageTimes: _Times = new UsdValidationTimeRange()
      if (predicateOrTimes instanceof UsdValidationTimeRange || Array.isArray(predicateOrTimes)) {
        stageTimes = predicateOrTimes as _Times
      } else if (predicateOrTimes !== undefined) {
        predicate = predicateOrTimes as UsdPrimPredicate
        if (times !== undefined) stageTimes = times
      }
      await this.#validateStage(object, errors, predicate, stageTimes)
      return errors
    }
    if (_isPrimSequence(object) || Array.isArray(object)) {
      await this.#runValidatePrims([...object as Iterable<Prim>], errors,
        (predicateOrTimes as _Times | undefined) ?? new UsdValidationTimeRange())
      return errors
    }
    // context.cpp:310-313, 330-333: an invalid layer or stage.
    TF_CODING_ERROR('Invalid layer or stage provided to validate.')
    return errors
  }

  // context.cpp:440-473 (_ValidateLayer).
  async #validateLayer(layer: Layer, errors: UsdValidationError[]): Promise<void> {
    if (!TF_VERIFY(layer, 'layer')) return
    for (const validator of this.#layerValidators) errors.push(...await validator.validate(layer))
  }

  // context.cpp:475-536 (_ValidateStage).
  async #validateStage(stage: Stage, errors: UsdValidationError[], predicate: UsdPrimPredicate,
    times: _Times): Promise<void> {
    if (!TF_VERIFY(stage, 'stage')) return

    for (const layer of stage.getUsedLayers()) await this.#validateLayer(layer, errors)

    const runValidators = async (timeRange: UsdValidationTimeRange,
      timeDependencyState = _TimeDependencyState.All): Promise<void> => {
      for (const validator of this.#stageValidators) {
        if (UsdValidationContext.#skip(validator, timeDependencyState)) continue
        errors.push(...await validator.validate(stage, timeRange))
      }
      const prims = [...stage.traverse(predicate)].map(path => stage.getPrim(path)!)
      await this.#validatePrims(prims, errors, timeRange, timeDependencyState)
    }

    // Run stage and prim validators for timeRange
    if (times instanceof UsdValidationTimeRange) {
      await runValidators(times)
      return
    }
    if (times.length === 0) return

    // Run TimeNonDependent validators
    await runValidators(new UsdValidationTimeRange(), _TimeDependencyState.DoNonTimeDependent)
    for (const timeCode of times) {
      await runValidators(new UsdValidationTimeRange(timeCode), _TimeDependencyState.DoTimeDependent)
    }
  }

  // context.cpp:538-578 (_RunValidatePrims).
  async #runValidatePrims(prims: readonly Prim[], errors: UsdValidationError[], times: _Times): Promise<void> {
    if (prims.length === 0) return
    if (times instanceof UsdValidationTimeRange) {
      await this.#validatePrims(prims, errors, times)
      return
    }
    if (times.length === 0) return
    // Run only non-time dependent validators for all prims once
    await this.#validatePrims(prims, errors, new UsdValidationTimeRange(),
      _TimeDependencyState.DoNonTimeDependent)
    // Run only time dependent validators for each timeCode in timeCodes
    for (const timeCode of times) {
      await this.#validatePrims(prims, errors, new UsdValidationTimeRange(timeCode),
        _TimeDependencyState.DoTimeDependent)
    }
  }

  // context.cpp:580-639 (_ValidatePrims).
  async #validatePrims(prims: readonly Prim[], errors: UsdValidationError[],
    timeRange: UsdValidationTimeRange, timeDependencyState = _TimeDependencyState.All): Promise<void> {
    for (const validator of this.#primValidators) {
      if (UsdValidationContext.#skip(validator, timeDependencyState)) continue
      for (const prim of prims) {
        if (!prim?.isValid()) {
          TF_CODING_ERROR('Invalid prim found in the vector of prims to validate.')
          return
        }
        errors.push(...await validator.validate(prim, timeRange))
      }
    }

    for (const [schemaType, validators] of this.#schemaTypeValidators) {
      for (const prim of prims) {
        if (!prim?.isValid()) {
          TF_CODING_ERROR('Invalid prim found in the vector of prims to validate.')
          return
        }
        if (!_shouldRunSchemaTypeValidator(prim, schemaType)) continue
        for (const validator of validators) {
          if (UsdValidationContext.#skip(validator, timeDependencyState)) continue
          errors.push(...await validator.validate(prim, timeRange))
        }
      }
    }
  }

  // Skip non-time dependent validators if state is DoTimeDependent, or skip
  // time dependent validators if state is DoNonTimeDependent
  // (context.cpp:500-506, 589-595, 616-624).
  static #skip(validator: UsdValidationValidator, state: _TimeDependencyState): boolean {
    const isTimeDependent = validator.getMetadata().isTimeDependent
    return (state === _TimeDependencyState.DoTimeDependent && !isTimeDependent)
      || (state === _TimeDependencyState.DoNonTimeDependent && isTimeDependent)
  }
}
