// Ported from OpenUSD 26.11.1: pxr/imaging/hd/testenv/testHdUtils.cpp
// Copyright 2024 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Faithful TypeScript equivalent of OpenUSD's testHdUtils.cpp.
//
// Builds a 3-node material network (Texture -> MaterialLayer -> StandIn),
// converts it via HdUtils.ConvertHdMaterialNetworkToHdMaterialSchema, and
// asserts the resulting container's structure matches the C++ test's golden
// baseline (testenv/testHdUtils/baseline/testHdUtils_material.txt).

import { describe, it, expect } from 'vitest'
import {
  HdContainerDataSource,
  HdRetainedTypedSampledDataSource,
} from '../../src/dataSource.ts'
import { HdUtils } from '../../src/utils.ts'
import {
  HdMaterialNetwork,
  HdMaterialNetworkMap,
  HdMaterialNode,
} from '../../src/material.ts'
import { HdVectorDataSource } from '../../src/dataSource.ts'

// ---- Build the network exactly as testHdUtils.cpp::BasicTest does ----

function buildNetworkMap(): HdMaterialNetworkMap {
  const materialNetwork = new HdMaterialNetwork()

  const textureNode = new HdMaterialNode()
  textureNode.path = '/Asset/Looks/Material/Texture'
  textureNode.identifier = 'Texture_5'
  textureNode.parameters.set(
    'inputs:filename', 'studio/patterns/checkerboard/checkerboard.tex')
  materialNetwork.nodes.push(textureNode)

  const materialLayerNode = new HdMaterialNode()
  materialLayerNode.path = '/Asset/Looks/Material/MaterialLayer'
  materialLayerNode.identifier = 'MaterialLayer_3'
  materialNetwork.nodes.push(materialLayerNode)

  const standInNode = new HdMaterialNode()
  standInNode.path = '/Asset/Looks/Material/StandIn'
  standInNode.identifier = 'PbsNetworkMaterialStandIn_3'
  materialNetwork.nodes.push(standInNode)

  // Texture.resultRGB -> MaterialLayer.albedo
  materialNetwork.relationships.push({
    inputId: textureNode.path,
    inputName: 'resultRGB',
    outputId: materialLayerNode.path,
    outputName: 'albedo',
  })

  // MaterialLayer.pbsMaterialOut -> StandIn.multiMaterialIn
  materialNetwork.relationships.push({
    inputId: materialLayerNode.path,
    inputName: 'pbsMaterialOut',
    outputId: standInNode.path,
    outputName: 'multiMaterialIn',
  })

  const networkMap = new HdMaterialNetworkMap()
  networkMap.map.set('surface', materialNetwork)
  return networkMap
}

// ---- Small structural-walk helpers ----

function getContainer(
  parent: HdContainerDataSource | undefined,
  name: string,
): HdContainerDataSource | undefined {
  const ds = parent?.Get(name)
  return ds instanceof HdContainerDataSource ? ds : undefined
}

function getToken(
  parent: HdContainerDataSource | undefined,
  name: string,
): unknown {
  const ds = parent?.Get(name)
  return ds instanceof HdRetainedTypedSampledDataSource
    ? ds.getTypedValue(0)
    : undefined
}

const TEXTURE = '/Asset/Looks/Material/Texture'
const MATERIAL_LAYER = '/Asset/Looks/Material/MaterialLayer'
const STAND_IN = '/Asset/Looks/Material/StandIn'

describe('HdUtils.ConvertHdMaterialNetworkToHdMaterialSchema', () => {
  const result = HdUtils.convertHdMaterialNetworkToHdMaterialSchema(
    buildNetworkMap())

  // Top level is keyed by render context; universalRenderContext is "".
  const network = getContainer(result, '')

  it('wraps the network under the universalRenderContext ("") key', () => {
    expect(result.getNames()).toEqual([''])
    expect(network).toBeInstanceOf(HdContainerDataSource)
  })

  it('exposes config / nodes / terminals containers', () => {
    expect(network!.getNames().sort()).toEqual(['config', 'nodes', 'terminals'])
    expect(getContainer(network, 'config')).toBeInstanceOf(HdContainerDataSource)
    expect(getContainer(network, 'config')!.getNames()).toEqual([])
  })

  // ---- nodes ----

  const nodes = getContainer(network, 'nodes')

  it('contains all three node paths', () => {
    expect(nodes!.getNames().sort()).toEqual([MATERIAL_LAYER, STAND_IN, TEXTURE])
  })

  it('Texture node: identifier, filename parameter, no input connections', () => {
    const tex = getContainer(nodes, TEXTURE)
    expect(getToken(tex, 'nodeIdentifier')).toBe('Texture_5')

    const params = getContainer(tex, 'parameters')
    expect(params!.getNames()).toEqual(['inputs:filename'])
    const filename = getContainer(params, 'inputs:filename')
    expect(getToken(filename, 'value')).toBe(
      'studio/patterns/checkerboard/checkerboard.tex')

    expect(getContainer(tex, 'inputConnections')!.getNames()).toEqual([])
  })

  it('MaterialLayer node: identifier, albedo <- Texture.resultRGB', () => {
    const ml = getContainer(nodes, MATERIAL_LAYER)
    expect(getToken(ml, 'nodeIdentifier')).toBe('MaterialLayer_3')
    expect(getContainer(ml, 'parameters')!.getNames()).toEqual([])

    const conns = getContainer(ml, 'inputConnections')
    expect(conns!.getNames()).toEqual(['albedo'])

    const albedo = conns!.Get('albedo')
    expect(albedo).toBeInstanceOf(HdVectorDataSource)
    const vec = albedo as HdVectorDataSource
    expect(vec.getNumElements()).toBe(1)

    const conn = vec.getElement(0)
    expect(conn).toBeInstanceOf(HdContainerDataSource)
    const c = conn as HdContainerDataSource
    expect(getToken(c, 'upstreamNodePath')).toBe(TEXTURE)
    expect(getToken(c, 'upstreamNodeOutputName')).toBe('resultRGB')
  })

  it('StandIn node: identifier, multiMaterialIn <- MaterialLayer.pbsMaterialOut', () => {
    const si = getContainer(nodes, STAND_IN)
    expect(getToken(si, 'nodeIdentifier')).toBe('PbsNetworkMaterialStandIn_3')

    const conns = getContainer(si, 'inputConnections')
    expect(conns!.getNames()).toEqual(['multiMaterialIn'])

    const vec = conns!.Get('multiMaterialIn') as HdVectorDataSource
    expect(vec.getNumElements()).toBe(1)
    const c = vec.getElement(0) as HdContainerDataSource
    expect(getToken(c, 'upstreamNodePath')).toBe(MATERIAL_LAYER)
    expect(getToken(c, 'upstreamNodeOutputName')).toBe('pbsMaterialOut')
  })

  // ---- terminals ----

  it('terminal "surface" points at the last node (StandIn) with output "surface"', () => {
    const terminals = getContainer(network, 'terminals')
    expect(terminals!.getNames()).toEqual(['surface'])

    const surface = getContainer(terminals, 'surface')
    expect(getToken(surface, 'upstreamNodePath')).toBe(STAND_IN)
    expect(getToken(surface, 'upstreamNodeOutputName')).toBe('surface')
  })
})
