// Ported from OpenUSD 26.11.1: pxr/usd/usdSemantics/plugInfo.json,
//  pxr/usd/usdSemantics/schema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd's check that every usdSemantics schema class carries the members
// usdGenSchema generates for it from OpenUSD 26.11.1
// pxr/usd/usdSemantics/schema.usda (schemaClass.h/.cpp templates), with the base
// class and Apply/CanApply its plugInfo.json schema kind calls for.
// The apiName overrides are those of pxr/usd/usdSemantics/schema.usda (line 33).
import * as UsdSemantics from 'typescript-usd/usdSemantics'
import { describeGeneratedSchemaMembers } from '../../../../testing/generatedSchemaMembers.ts'

describeGeneratedSchemaMembers('usdSemantics', new URL('../../plugin/plugInfo.json', import.meta.url),
  UsdSemantics as unknown as Record<string, unknown>,
  { 'semantics:labels:__INSTANCE_NAME__': 'Labels' })
