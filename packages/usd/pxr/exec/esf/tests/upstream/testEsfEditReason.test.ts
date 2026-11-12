// Ported from OpenUSD 26.11.1: pxr/exec/esf/testenv/testEsfEditReason.cpp
// Copyright 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.11.1 pxr/exec/esf/testenv/testEsfEditReason.cpp
//
// The constexpr locals of testEsfEditReason.cpp:15-18 are module constants;
// `TF_AXIOM(reason)` is `reason.AsBool()`.
import { describe, expect, it } from 'vitest'
import { EsfEditReason } from '../../src/editReason.ts'

const none = EsfEditReason.None
const resyncedObject = EsfEditReason.ResyncedObject
const changedPropertyList = EsfEditReason.ChangedPropertyList
const many = resyncedObject.or(changedPropertyList)

describe('testEsfEditReason', () => {
  it('TestBitwiseLogic', () => {
    expect(!none.asBool()).toBe(true)
    expect(resyncedObject.asBool()).toBe(true)
    expect(resyncedObject.or(none).Equals(resyncedObject)).toBe(true)
    expect(resyncedObject.and(none).Equals(none)).toBe(true)
    expect(many.and(resyncedObject).asBool()).toBe(true)
    expect(many.and(changedPropertyList).asBool()).toBe(true)
    expect(many.contains(resyncedObject)).toBe(true)
    expect(!resyncedObject.contains(many)).toBe(true)
  })

  it('TestGetDescription', () => {
    expect(none.getDescription()).toBe('None')
    expect(resyncedObject.getDescription()).toBe('ResyncedObject')
    expect(changedPropertyList.getDescription()).toBe('ChangedPropertyList')
    expect(many.getDescription()).toBe('ResyncedObject, ChangedPropertyList')
  })
})
