// Ported from OpenUSD 26.11.1:
//  pxr/usdImaging/usdImaging/dataSourceRenderPrims.cpp
// Copyright 2023 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Render prim adapters (renderSettingsAdapter, renderProductAdapter,
// renderVarAdapter, renderPassAdapter), their data sources
// (dataSourceRenderPrims.cpp, usdRender{Settings,Product,Var}Schema) and
// UsdImagingRenderSettingsFlatteningSceneIndex, checked against the OpenUSD
// 26.11.1 reference build for fixtures/renderPrims/renderPrims.usda.
//
// pxr/usdImaging/usdImaging/CMakeLists.txt registers no upstream test for
// these files. The expectation is fixtures/renderPrims/renderPrims.typed.txt,
// printed by the native capture (FIXTURES.md): the
// __usdRenderSettings, __usdRenderProduct, __usdRenderVar and renderPass data
// sources of UsdImagingStageSceneIndex and the renderSettings and
// __dependencies data sources of UsdImagingRenderSettingsFlatteningSceneIndex,
// with the VtValue type name of every value. The comparison is on the parsed
// tree: names, structure, values (stringified as TfStringify does) and a
// check that each value's TypeScript form is the port's form of the C++ type.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ContainerDataSource as HdContainerDataSource,
  DataSourceLocator as HdDataSourceLocator,
  SampledDataSource as HdSampledDataSource,
  SceneIndexPrimView as HdSceneIndexPrimView,
  VectorDataSource as HdVectorDataSource,
  type DataSourceBase as HdDataSourceBase,
  type SceneIndexBase as HdSceneIndexBase,
} from 'typescript-usd/hd'
import { Vec2i as GfVec2i, Vec4f as GfVec4f } from 'typescript-usd/gf'
import { Array as VtArray } from 'typescript-usd/vt'
import { Stage as UsdStage, TimeCode as UsdTimeCode } from 'typescript-usd/usd'
// Direct imports: the usdImaging barrel pulls in every adapter of the port.
import { UsdImagingAdapterRegistry } from '../src/adapterRegistry.ts'
import { UsdImagingStageSceneIndex } from '../src/stageSceneIndex.ts'
import { UsdImagingRenderPassAdapter } from '../src/renderPassAdapter.ts'
import { UsdImagingRenderProductAdapter } from '../src/renderProductAdapter.ts'
import { UsdImagingRenderSettingsAdapter } from '../src/renderSettingsAdapter.ts'
import { UsdImagingRenderSettingsFlatteningSceneIndex } from '../src/renderSettingsFlatteningSceneIndex.ts'
import { UsdImagingRenderVarAdapter } from '../src/renderVarAdapter.ts'

// pxr/usdImaging/usdImaging/plugInfo.json entries of the four adapters.
UsdImagingAdapterRegistry.registerTypes([
  { typeName: 'UsdImagingRenderPassAdapter', isInternal: true, primTypeName: 'RenderPass',
    primAdapterFactory: () => new UsdImagingRenderPassAdapter() },
  { typeName: 'UsdImagingRenderSettingsAdapter', isInternal: true, primTypeName: 'RenderSettings',
    primAdapterFactory: () => new UsdImagingRenderSettingsAdapter() },
  { typeName: 'UsdImagingRenderProductAdapter', isInternal: true, primTypeName: 'RenderProduct',
    primAdapterFactory: () => new UsdImagingRenderProductAdapter() },
  { typeName: 'UsdImagingRenderVarAdapter', isInternal: true, primTypeName: 'RenderVar',
    primAdapterFactory: () => new UsdImagingRenderVarAdapter() },
])

const fixtures = new URL('./fixtures/renderPrims/', import.meta.url)

/** The C++ VtValue type of a printed value, as the native capture prints it. */
interface Leaf { type: string, value: string }
type Node = { kind: 'container', children: Map<string, Node> }
  | { kind: 'vector', elements: Node[] }
  | { kind: 'leaf', leaf: Leaf }

/** Parses one indented block of the native capture's _Print output. */
function parseBlock(lines: string[], start: number, level: number): [Node, number] {
  const indent = '\t'.repeat(level)
  let i = start
  if (i < lines.length && lines[i]!.startsWith(indent) && !lines[i]!.startsWith(indent + '\t')
      && !lines[i]!.slice(level).startsWith('[')) {
    const text = lines[i]!.slice(level)
    const m = /^(SdfPathVector|HdDataSourceLocator|\S+) ?(.*)$/.exec(text)!
    return [{ kind: 'leaf', leaf: { type: m[1]!, value: m[2]! } }, i + 1]
  }
  const children = new Map<string, Node>()
  const elements: Node[] = []
  let isVector = false
  while (i < lines.length && lines[i]!.startsWith(indent + '[')
         && !lines[i]!.startsWith(indent + '\t')) {
    const name = lines[i]!.slice(level + 1, lines[i]!.length - 1)
    const [child, next] = parseBlock(lines, i + 1, level + 1)
    if (/^\d+$/.test(name)) {
      isVector = true
      elements.push(child)
    } else {
      children.set(name, child)
    }
    i = next
  }
  return [isVector ? { kind: 'vector', elements } : { kind: 'container', children }, i]
}

/** Parses the native capture's output: scene index name -> prim path -> node. */
function parseCapture(text: string): Map<string, Map<string, { type: string, node: Node }>> {
  const lines = text.split('\n').filter(l => l !== '' && l !== 'OK')
  const result = new Map<string, Map<string, { type: string, node: Node }>>()
  let current: Map<string, { type: string, node: Node }> | undefined
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.startsWith('# ')) {
      current = new Map()
      result.set(line.slice(2), current)
      i++
      continue
    }
    const m = /^(\S+) type=(.*)$/.exec(line)!
    const [node, next] = parseBlock(lines, i + 1, 1)
    current!.set(m[1]!, { type: m[2]!, node })
    i = next
  }
  return result
}

/** TfStringify of the port's value forms. */
function stringify(value: unknown): string {
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(Number(value.toPrecision(6)))
  if (typeof value === 'string') return value
  if (value instanceof HdDataSourceLocator) return value.GetString()
  if (value instanceof VtArray) return stringify([...(value as Iterable<unknown>)])
  if (Array.isArray(value)) return `[${value.map(stringify).join(', ')}]`
  if (value instanceof GfVec2i || value instanceof GfVec4f) return value.toString()
  return String(value)
}

/** Whether a value is the port's form of the C++ type the native capture printed. */
function hasPortType(cppType: string, value: unknown): boolean {
  switch (cppType) {
    case 'TfToken': case 'SdfPath': case 'string': return typeof value === 'string'
    case 'bool': return typeof value === 'boolean'
    case 'int': case 'float': case 'double': return typeof value === 'number'
    // SdfPathVector and VtArray<SdfPath> held by retained data sources are
    // plain arrays (dataSourceTypeDefs.ts); UsdImagingDataSourceAttribute
    // values of token[] attributes are VtArray.
    case 'SdfPathVector': case 'VtArray<SdfPath>':
      return Array.isArray(value) && value.every(e => typeof e === 'string')
    case 'VtArray<TfToken>':
      return (Array.isArray(value) || value instanceof VtArray)
        && [...(value as Iterable<unknown>)].every(e => typeof e === 'string')
    case 'HdDataSourceLocator': return value instanceof HdDataSourceLocator
    case 'GfVec2i': return value instanceof GfVec2i
    case 'GfVec4f': return value instanceof GfVec4f
    default: return false
  }
}

/** The port's value of a sampled data source: the typed value when the
 *  data source holds a VtValue (UsdImagingDataSourceAttribute). */
function sampledValue(ds: HdSampledDataSource): unknown {
  const value = ds.GetValue(0) as { IsEmpty?: () => boolean, Get?: () => unknown } | unknown
  const vt = value as { UncheckedGet?: () => unknown, Get?: () => unknown }
  if (value && typeof value === 'object' && typeof vt.UncheckedGet === 'function') return vt.UncheckedGet()
  return value
}

function compare(where: string, expected: Node, actual: HdDataSourceBase | undefined, errors: string[]): void {
  if (expected.kind === 'container') {
    if (!(actual instanceof HdContainerDataSource)) {
      errors.push(`${where}: expected a container`)
      return
    }
    const names = actual.getNames().filter(n => actual.Get(n) !== undefined).sort()
    const expectedNames = [...expected.children.keys()].sort()
    if (names.join(',') !== expectedNames.join(',')) {
      errors.push(`${where}: names ${names.join(',')} != ${expectedNames.join(',')}`)
    }
    for (const [name, child] of expected.children) compare(`${where}/${name}`, child, actual.Get(name), errors)
  } else if (expected.kind === 'vector') {
    if (!(actual instanceof HdVectorDataSource)) {
      errors.push(`${where}: expected a vector`)
      return
    }
    if (actual.getNumElements() !== expected.elements.length) {
      errors.push(`${where}: ${actual.getNumElements()} elements != ${expected.elements.length}`)
    }
    expected.elements.forEach((e, i) => compare(`${where}[${i}]`, e, actual.getElement(i), errors))
  } else {
    if (!(actual instanceof HdSampledDataSource)) {
      errors.push(`${where}: expected a sampled data source`)
      return
    }
    const value = sampledValue(actual)
    if (!hasPortType(expected.leaf.type, value)) {
      errors.push(`${where}: ${stringify(value)} is not the port form of ${expected.leaf.type}`)
    }
    if (stringify(value) !== expected.leaf.value) {
      errors.push(`${where}: ${stringify(value)} != ${expected.leaf.value}`)
    }
  }
}

function compareScene(
  si: HdSceneIndexBase, names: string[], expected: Map<string, { type: string, node: Node }>,
): string[] {
  const errors: string[] = []
  const seen: string[] = []
  for (const path of new HdSceneIndexPrimView(si)) {
    const prim = si.getPrim(path)
    if (!prim.dataSource) continue
    const present = names.filter(n => prim.dataSource!.Get(n) !== undefined)
    if (present.length === 0) continue
    seen.push(path)
    const exp = expected.get(path)
    if (!exp) {
      errors.push(`${path}: unexpected prim`)
      continue
    }
    if (prim.primType !== exp.type) errors.push(`${path}: type ${prim.primType} != ${exp.type}`)
    const container = exp.node.kind === 'container' ? exp.node.children : new Map()
    if (present.join(',') !== [...container.keys()].join(',')) {
      errors.push(`${path}: data sources ${present.join(',')} != ${[...container.keys()].join(',')}`)
    }
    for (const [name, node] of container) compare(`${path}.${name}`, node, prim.dataSource.Get(name), errors)
  }
  if (seen.join(',') !== [...expected.keys()].join(',')) {
    errors.push(`prims ${seen.join(',')} != ${[...expected.keys()].join(',')}`)
  }
  return errors
}

async function openScene(): Promise<UsdImagingStageSceneIndex> {
  const stage = await UsdStage.open(new URL('renderPrims.usda', fixtures).pathname)
  const stageSi = UsdImagingStageSceneIndex.new()
  stageSi.SetStage(stage)
  stageSi.SetTime(new UsdTimeCode(0))
  return stageSi
}

const expected = parseCapture(readFileSync(new URL('renderPrims.typed.txt', fixtures), 'utf8'))

describe('render prims (reference capture fixtures/renderPrims)', () => {
  it('UsdImagingStageSceneIndex render prim data sources match the reference build', async () => {
    const stageSi = await openScene()
    expect(compareScene(stageSi,
      ['__usdRenderSettings', '__usdRenderProduct', '__usdRenderVar', 'renderPass'],
      expected.get('UsdImagingStageSceneIndex')!)).toEqual([])
  })

  it('UsdImagingRenderSettingsFlatteningSceneIndex renderSettings and __dependencies match the reference build', async () => {
    const stageSi = await openScene()
    const flattening = UsdImagingRenderSettingsFlatteningSceneIndex.new(stageSi)
    expect(compareScene(flattening, ['renderSettings', '__dependencies'],
      expected.get('UsdImagingRenderSettingsFlatteningSceneIndex')!)).toEqual([])
  })
})
