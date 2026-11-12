// Ported from OpenUSD 26.11.1: pxr/usd/usdShade/plugInfo.json,
//  pxr/usd/usdShade/schema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd's check that every usdShade schema class carries the members
// usdGenSchema generates for it from OpenUSD 26.11.1
// pxr/usd/usdShade/schema.usda (schemaClass.h/.cpp templates), with the base
// class and Apply/CanApply its plugInfo.json schema kind calls for.
// The apiName overrides are those of pxr/usd/usdShade/schema.usda (lines 194-215, 334, 348).
import * as UsdShade from 'typescript-usd/usdShade'
import { describeGeneratedSchemaMembers } from '../../../../testing/generatedSchemaMembers.ts'

describeGeneratedSchemaMembers('usdShade', new URL('../../plugin/plugInfo.json', import.meta.url),
  UsdShade as unknown as Record<string, unknown>,
  {
  'outputs:surface': 'surface', 'outputs:displacement': 'displacement', 'outputs:volume': 'volume',
  'info:implementationSource': 'implementationSource', 'info:id': 'id',
})
