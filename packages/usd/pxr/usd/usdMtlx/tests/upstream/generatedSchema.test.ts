// Ported from OpenUSD 26.11.1: pxr/usd/usdMtlx/plugInfo.json,
//  pxr/usd/usdMtlx/schema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd's check that every usdMtlx schema class carries the members
// usdGenSchema generates for it from OpenUSD 26.11.1
// pxr/usd/usdMtlx/schema.usda (schemaClass.h/.cpp templates), with the base
// class and Apply/CanApply its plugInfo.json schema kind calls for.
import * as UsdMtlx from 'typescript-usd/usdMtlx'
import { describeGeneratedSchemaMembers } from '../../../../testing/generatedSchemaMembers.ts'

describeGeneratedSchemaMembers('usdMtlx', new URL('../../plugin/plugInfo.json', import.meta.url),
  UsdMtlx as unknown as Record<string, unknown>)
