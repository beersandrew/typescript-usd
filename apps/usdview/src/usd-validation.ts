// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/validationWidget.py
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD v26.11.1 usdviewq/validationWidget.py: the USD side of Window > USD
// Validation (the validator list, running a validation context, and the
// result rows). Imported on demand by the runtime, so the validation
// libraries stay out of the viewer's entry chunk.
import { Interval as GfInterval } from 'typescript-usd/gf'
import { PrimRange as UsdPrimRange, type Prim, type Stage } from 'typescript-usd/usd'
import {
  ValidationContext, ValidationErrorType, ValidationRegistry, ValidationTimeRange, type ValidationError,
} from 'typescript-usd/usdValidation'
import 'typescript-usd/usdGeomValidators'
import 'typescript-usd/usdShadeValidators'
import 'typescript-usd/usdSkelValidators'
import 'typescript-usd/usdPhysicsValidators'
import 'typescript-usd/usdLuxValidators'
import 'typescript-usd/usdMediaValidators'
import 'typescript-usd/usdLodValidators'
import 'typescript-usd/usdUtilsValidators'
import type { ValidationRequest, ValidationResultRow, ValidatorEntry, ViewerTimeState } from './contracts'

/** validationWidget.py:32-46 (_PopulateValidatorAndSuitesByPlugin): every
 *  registered validator and suite, by plugin ("Uncategorized" without one). */
export function listValidators(): ValidatorEntry[] {
  return ValidationRegistry.getInstance().getAllValidatorMetadata().map(metadata => {
    const pluginName = metadata.plugin ? metadata.plugin.getName() : 'Uncategorized'
    const name = pluginName !== 'Uncategorized' ? metadata.name.split(':')[1] ?? metadata.name : metadata.name
    return { pluginName, name, fullName: metadata.name, isSuite: metadata.isSuite, doc: metadata.doc }
  })
}

/** validationWidget.py:716-730 (onRunValidation's time range). */
function timeRange(request: ValidationRequest, time: ViewerTimeState | null): ValidationTimeRange {
  const { mode, includeDefaultTime } = request.timeRange
  const interval = mode === 'currentFrame' ? new GfInterval(time?.current ?? 0)
    : mode === 'playbackRange' ? new GfInterval(time?.start ?? 0, time?.end ?? 0)
      : new GfInterval(request.timeRange.startTime ?? 0, request.timeRange.endTime ?? 1)
  return new ValidationTimeRange(interval, includeDefaultTime)
}

/** validationWidget.py:500-515 (populateResultsAndUpdateWidget): an error's
 *  sites as prim paths, property paths or layer identifiers. */
function resultRow(error: ValidationError, stage: Stage): ValidationResultRow {
  const sites: string[] = [], primPaths: string[] = [], propertyPaths: string[] = []
  for (const site of error.getSites()) {
    if (site.isPrim()) { sites.push(site.getPath()); primPaths.push(site.getPath()) }
    else if (site.isProperty()) { sites.push(site.getPath()); propertyPaths.push(site.getPath()) }
    else sites.push(site.getLayer()?.identifier ?? stage.getRootLayer().identifier)
  }
  return {
    validatorName: error.getValidator()?.getMetadata().name ?? '', errorName: error.getName(), sites,
    primPaths, propertyPaths, message: error.getMessage(), type: ValidationErrorType[error.getType()] as ValidationResultRow['type'],
  }
}

/**
 * validationWidget.py:693-743 (onRunValidation): a validation context from
 * the selected validators' metadata, run over the stage, or over the
 * selected prims (with their descendants when asked).
 *
 * Two departures from upstream, which are usdview bugs: upstream computes
 * the time range from the options but passes it to none of its Validate
 * calls (validationWidget.py:716-741), and appends descendant ranges' errors
 * to the previous run's results (validationWidget.py:733-736; upstream-issues UI-4703). Here every
 * branch validates over the chosen time range and each run starts from no
 * results.
 */
export async function runValidation(stage: Stage, request: ValidationRequest, time: ViewerTimeState | null): Promise<ValidationResultRow[]> {
  const registry = ValidationRegistry.getInstance()
  const validatorsMetadata = request.validatorNames.map(name => registry.getValidatorMetadata(name))
    .filter(metadata => metadata !== undefined)
  const context = new ValidationContext(validatorsMetadata)
  const range = timeRange(request, time)

  const primsToValidate: Prim[] = []
  // If absolute root is in the explicitly picked paths, we should do the
  // whole stage anyhow, ignore the rest.
  if (request.primPaths && !request.primPaths.includes('/')) {
    for (const path of request.primPaths) {
      const prim = stage.getPrim(path)
      if (prim) primsToValidate.push(prim)
    }
  }
  let errors: ValidationError[]
  if (primsToValidate.length > 0) {
    if (request.includeDescendantPrims) {
      errors = []
      for (const prim of primsToValidate) errors.push(...await context.validate(UsdPrimRange.fromPrim(prim), range))
    } else {
      errors = await context.validate(primsToValidate, range)
    }
  } else {
    errors = await context.validate(stage, range)
  }
  return errors.map(error => resultRow(error, stage))
}
