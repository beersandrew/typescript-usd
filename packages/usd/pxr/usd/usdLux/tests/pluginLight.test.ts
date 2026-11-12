// Ported from OpenUSD 26.11.1: pxr/usd/usdLux/pluginLight.cpp,
//  pxr/usd/usdLux/pluginLightFilter.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// UsdLuxPluginLight::GetNodeDefAPI and UsdLuxPluginLightFilter::GetNodeDefAPI
// (pluginLight.cpp:116-120, pluginLightFilter.cpp:116-120): the
// UsdShadeNodeDefAPI of the same prim.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { NodeDefAPI } from 'typescript-usd/usdShade'
import { PluginLight, PluginLightFilter } from '../src/index.ts'

describe('plugin light node definitions', () => {
  it('reads the shader id through the prim\'s UsdShadeNodeDefAPI', () => {
    const stage = Stage.createNew()
    const light = PluginLight.define(stage, '/Light')
    const filter = PluginLightFilter.define(stage, '/Filter')
    light.getNodeDefAPI().setShaderId('MyLight')
    filter.getNodeDefAPI().setShaderId('MyFilter')
    expect(light.getNodeDefAPI()).toBeInstanceOf(NodeDefAPI)
    expect(light.getNodeDefAPI().path).toBe('/Light')
    expect(NodeDefAPI.get(stage, '/Light').getShaderId()).toBe('MyLight')
    expect(filter.getNodeDefAPI().getShaderId()).toBe('MyFilter')
  })
})
