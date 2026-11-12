// Ported from OpenUSD 26.11.1: pxr/base/tf/testenv/probe.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Partial behavioral slices informed by OpenUSD v26.08
// pxr/base/tf/testenv/probe.cpp; not a 1:1 program port.
import { describe, expect, it } from 'vitest'
import { Notice } from '../../src/index.ts'

describe('TfNotice probe', () => {
  it('brackets the one probed send and delivery', () => {
    class ProbeNotice extends Notice {}
    const counts = { beginSend: 0, endSend: 0, beginDelivery: 0, endDelivery: 0, delivered: 0 }
    const probe = {
      beginSend: () => { counts.beginSend++ }, endSend: () => { counts.endSend++ },
      beginDelivery: () => { counts.beginDelivery++ }, endDelivery: () => { counts.endDelivery++ },
    }
    const key = Notice.Register(ProbeNotice, () => { counts.delivered++ })
    Notice.insertProbe(probe)
    new ProbeNotice().send()
    Notice.removeProbe(probe)
    new ProbeNotice().send()
    key.revoke()
    expect(counts).toEqual({ beginSend: 1, endSend: 1, beginDelivery: 1, endDelivery: 1, delivered: 2 })
  })
})
