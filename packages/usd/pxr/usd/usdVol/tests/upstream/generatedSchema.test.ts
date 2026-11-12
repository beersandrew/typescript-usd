// Ported from OpenUSD 26.11.1: pxr/usd/usdVol/plugInfo.json,
//  pxr/usd/usdVol/schema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd's check that every usdVol schema class carries the members
// usdGenSchema generates for it from OpenUSD 26.11.1
// pxr/usd/usdVol/schema.usda (schemaClass.h/.cpp templates), with the base
// class and Apply/CanApply its plugInfo.json schema kind calls for.
import * as UsdVol from 'typescript-usd/usdVol'
import { describeGeneratedSchemaMembers } from '../../../../testing/generatedSchemaMembers.ts'

describeGeneratedSchemaMembers('usdVol', new URL('../../plugin/plugInfo.json', import.meta.url),
  UsdVol as unknown as Record<string, unknown>)
