// Ported from OpenUSD 26.11.1: pxr/usd/sdf/layer.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// OpenUSD 26.11 validates these paths while parsing. Exercise Pcp's own
// error paths by loading a valid scaffold and then using SdfLayer::SetField
// (sdf/layer.h:724-749), as a native capture demonstrates.
import { readFileSync } from 'node:fs'
import { Layer, ListOp, Reference } from 'typescript-usd/sdf'

export function museumInvalidOpinionRoot(program: string, identifier: string): Layer | undefined {
  const mode = program.replace('testPcpMuseum_', '')
  if (!['BasicInherits', 'ErrorRelocateWithVariantSelection', 'SubrootReferenceAndVariants'].includes(mode)) return undefined
  const source = readFileSync(identifier, 'utf8')
  let scaffold: string
  if (mode === 'BasicInherits') {
    scaffold = source.replace('inherits = [</ModelWithVariant{vset=sel}_class>]', '')
  } else if (mode === 'ErrorRelocateWithVariantSelection') {
    const start = source.indexOf('    relocates = {')
    const closing = source.indexOf('\n    }', start)
    if (start < 0 || closing < 0) throw new Error(`Missing invalid museum relocates: ${mode}`)
    const end = closing + '\n    }'.length
    scaffold = source.slice(0, start) + source.slice(end)
  } else {
    scaffold = source.replace('references = @./group.usda@</Group{v=x}Model>', '')
  }
  if (scaffold === source) throw new Error(`Missing invalid museum opinion: ${mode}`)
  const layer = Layer.createInMemory(identifier, scaffold)
  if (mode === 'BasicInherits') {
    layer.setField('/ModelWithVariant{vset=vsel}InvalidInherit', 'inheritPaths',
      ListOp.createExplicit(['/ModelWithVariant{vset=sel}_class']).toValue())
  } else if (mode === 'ErrorRelocateWithVariantSelection') {
    layer.setField('/', Layer.LayerRelocatesKey, [
      ['/Model_1{vset=vsel}PrimOnlyInVariantSet', '/Model_1/TryOutsideVariantSet'],
      ['/Model_1/A/B', '/Model_1{vset=vsel}TryInsideVariantSet'],
    ])
  } else {
    layer.setField('/InvalidSubrootRefWithVariantSelection', 'references',
      ListOp.createExplicit([new Reference('./group.usda', '/Group{v=x}Model')]).toValue())
  }
  return layer
}
