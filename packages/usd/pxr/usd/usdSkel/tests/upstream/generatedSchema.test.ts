// Ported from OpenUSD 26.11.1: pxr/usd/usdSkel/plugInfo.json,
//  pxr/usd/usdSkel/schema.usda
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// typescript-usd's check that every usdSkel schema class carries the members
// usdGenSchema generates for it from OpenUSD 26.11.1
// pxr/usd/usdSkel/schema.usda (schemaClass.h/.cpp templates), with the base
// class and Apply/CanApply its plugInfo.json schema kind calls for.
// The apiName overrides are those of pxr/usd/usdSkel/schema.usda (lines 180-238).
import * as UsdSkel from 'typescript-usd/usdSkel'
import { describeGeneratedSchemaMembers } from '../../../../testing/generatedSchemaMembers.ts'

describeGeneratedSchemaMembers('usdSkel', new URL('../../plugin/plugInfo.json', import.meta.url),
  UsdSkel as unknown as Record<string, unknown>,
  {
  'primvars:skel:skinningMethod': 'skinningMethod', 'primvars:skel:geomBindTransform': 'geomBindTransform',
  'skel:joints': 'joints', 'primvars:skel:jointIndices': 'jointIndices',
  'primvars:skel:jointWeights': 'jointWeights', 'skel:blendShapes': 'blendShapes',
})
