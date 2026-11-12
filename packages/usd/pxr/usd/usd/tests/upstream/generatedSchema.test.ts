// Ported from OpenUSD 26.11.1: pxr/usd/usd/codegenTemplates/schemaClass.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd's check that every usd schema class carries the members
// usdGenSchema generates for it from OpenUSD 26.11.1 pxr/usd/usd/schema.usda
// (schemaClass.h/.cpp templates), with the base class and Apply/CanApply its
// plugInfo.json schema kind calls for.
// The apiName overrides are those of pxr/usd/usd/schema.usda (line 483).
import * as Usd from 'typescript-usd/usd'
import { describeGeneratedSchemaMembers } from '../../../../testing/generatedSchemaMembers.ts'

describeGeneratedSchemaMembers('usd', new URL('../../plugin/plugInfo.json', import.meta.url),
  Usd as unknown as Record<string, unknown>,
  { 'collection:__INSTANCE_NAME__': 'Collection' })
