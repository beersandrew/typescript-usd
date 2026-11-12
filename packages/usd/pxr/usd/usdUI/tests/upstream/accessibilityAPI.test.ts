// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUI/testenv/testUsdUIAccessibilityAPI.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD v26.11.1 pxr/usd/usdUI/testenv/testUsdUIAccessibilityAPI.cpp
//
// The C++ test is a single main() of TF_AXIOMs; each is an expect() here, in
// upstream order.
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import { AccessibilityAPI, Tokens as UsdUITokens } from 'typescript-usd/usdUI'

describe('testUsdUIAccessibilityAPI', () => {
  it('main', () => {
    const stage = Stage.createNew()

    const prim = stage.definePrim('/Root')
    let value: unknown

    // Test Default
    const defaultAPI = AccessibilityAPI.applyDefaultAPI(prim)
    const namedAPI = AccessibilityAPI.apply(prim, 'foo')

    // Make sure we create it with the right name
    const label = 'The root prim'
    const defaultLabelName = 'accessibility:default:label'
    let defaultLabel = defaultAPI.createLabelAttr(label)
    expect(defaultLabel.name).toBe(defaultLabelName)

    // Make sure we get the same name back and the values are correct
    defaultLabel = defaultAPI.getLabelAttr()
    expect(defaultLabel.name).toBe(defaultLabelName)

    value = defaultLabel.getValue()
    expect(typeof value).toBe('string')
    expect(value).toBe(label)

    // Make sure we create the description with the right name
    const description = 'The greatest prim of all time'
    const defaultDescriptionName = 'accessibility:default:description'
    let defaultDescription = defaultAPI.createDescriptionAttr(description)
    expect(defaultDescription.name).toBe(defaultDescriptionName)

    // Make sure we get the same name and value back
    defaultDescription = defaultAPI.getDescriptionAttr()
    expect(defaultDescription.name).toBe(defaultDescriptionName)
    value = defaultDescription.getValue()
    expect(typeof value).toBe('string')
    expect(value).toBe(description)

    // Make sure we create the priority with the right name
    const priority = UsdUITokens.high
    const defaultPriorityName = 'accessibility:default:priority'
    let defaultPriority = defaultAPI.createPriorityAttr(priority)
    expect(defaultPriority.name).toBe(defaultPriorityName)

    // Make sure we get the same name and value back
    defaultPriority = defaultAPI.getPriorityAttr()
    expect(defaultPriority.name).toBe(defaultPriorityName)
    value = defaultPriority.getValue()
    // value.IsHolding<TfToken>(): tokens are strings; the attribute is token-typed.
    expect(defaultPriority.typeName).toBe('token')
    expect(value).toBe(priority)

    // Check that the named APIs are created with the correct names and come
    // back with the same name
    const namedLabelName = 'accessibility:foo:label'
    const namedDescriptionName = 'accessibility:foo:description'
    const namedPriorityName = 'accessibility:foo:priority'

    let namedLabel = namedAPI.createLabelAttr(label)
    expect(namedLabel.name).toBe(namedLabelName)
    namedLabel = namedAPI.getLabelAttr()
    expect(namedLabel.name).toBe(namedLabelName)

    let namedDescription = namedAPI.createDescriptionAttr(description)
    expect(namedDescription.name).toBe(namedDescriptionName)
    namedDescription = namedAPI.getDescriptionAttr()
    expect(namedDescription.name).toBe(namedDescriptionName)

    let namedPriority = namedAPI.createPriorityAttr(priority)
    expect(namedPriority.name).toBe(namedPriorityName)
    namedPriority = namedAPI.getPriorityAttr()
    expect(namedPriority.name).toBe(namedPriorityName)
  })
})
