// Ported from OpenUSD 26.11.1:
//  pxr/imaging/hd/testenv/testHdTimeSampleArray.cpp
// Copyright 2021 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/testenv/testHdTimeSampleArray.cpp
//
// The C++ testenv exercises the free functions through VtValue; here we port the
// numeric assertions faithfully against the scalar (number) path. The VtValue
// type-mismatch / empty-value coding-error cases are a C++ VtValue type-system
// artifact and are intentionally not ported.
import { describe, it, expect } from 'vitest'
import {
  HdResampleNeighbors,
  HdResampleRawTimeSamples,
  HdTimeSampleArray
} from '../../src/timeSampleArray.ts'

describe('HdResampleNeighbors', () => {
  it('returns exact values at the endpoints', () => {
    expect(HdResampleNeighbors(0.0, 0.0, 256.0)).toBe(0.0)
    expect(HdResampleNeighbors(1.0, 0.0, 256.0)).toBe(256.0)
  })

  it('interpolates between the endpoints', () => {
    // Bounds mirror the testenv intervals (we don't pin exact float values).
    expect(HdResampleNeighbors(0.25, 0.0, 256.0)).toBeGreaterThan(63.0)
    expect(HdResampleNeighbors(0.25, 0.0, 256.0)).toBeLessThan(65.0)
    expect(HdResampleNeighbors(0.5, 0.0, 256.0)).toBeGreaterThan(127.0)
    expect(HdResampleNeighbors(0.5, 0.0, 256.0)).toBeLessThan(129.0)
    expect(HdResampleNeighbors(0.75, 0.0, 256.0)).toBeGreaterThan(191.0)
    expect(HdResampleNeighbors(0.75, 0.0, 256.0)).toBeLessThan(193.0)
  })

  it('extrapolates outside the [0,1] range', () => {
    expect(HdResampleNeighbors(-1.0, 0.0, 256.0)).toBeGreaterThan(-257.0)
    expect(HdResampleNeighbors(-1.0, 0.0, 256.0)).toBeLessThan(-255.0)
    expect(HdResampleNeighbors(+2.0, 0.0, 256.0)).toBeGreaterThan(511.0)
    expect(HdResampleNeighbors(+2.0, 0.0, 256.0)).toBeLessThan(513.0)
  })
})

describe('HdResampleRawTimeSamples', () => {
  const times = [0.0, 1.0]
  const values = [0.0, 256.0]

  it('returns exact values at the endpoints', () => {
    expect(HdResampleRawTimeSamples(0.0, 2, times, values)).toBe(0.0)
    expect(HdResampleRawTimeSamples(1.0, 2, times, values)).toBe(256.0)
  })

  it('interpolates between samples', () => {
    expect(HdResampleRawTimeSamples(0.25, 2, times, values)).toBeGreaterThan(63.0)
    expect(HdResampleRawTimeSamples(0.25, 2, times, values)).toBeLessThan(65.0)
    expect(HdResampleRawTimeSamples(0.5, 2, times, values)).toBeGreaterThan(127.0)
    expect(HdResampleRawTimeSamples(0.5, 2, times, values)).toBeLessThan(129.0)
    expect(HdResampleRawTimeSamples(0.75, 2, times, values)).toBeGreaterThan(191.0)
    expect(HdResampleRawTimeSamples(0.75, 2, times, values)).toBeLessThan(193.0)
  })

  it('holds constant (clamps) outside the sample range', () => {
    // Unlike HdResampleNeighbors, this does NOT extrapolate.
    expect(HdResampleRawTimeSamples(-1.0, 2, times, values)).toBe(0.0)
    expect(HdResampleRawTimeSamples(+2.0, 2, times, values)).toBe(256.0)
  })

  // The empty-sample-list case is a TF_CODING_ERROR upstream; we don't assert
  // the diagnostic emission, only that it returns the default value.
  it('returns the default value for an empty sample list', () => {
    expect(HdResampleRawTimeSamples(0.5, 0, times, values)).toBe(0.0)
  })
})

describe('HdTimeSampleArray', () => {
  describe('Construction', () => {
    it('empty array has count 0 and no samples', () => {
      const a = new HdTimeSampleArray()
      expect(a.count).toBe(0)
      expect(a.times).toHaveLength(0)
      expect(a.values).toHaveLength(0)
    })

    it('Resize sets count and allocates times/values arrays of that length', () => {
      const a = new HdTimeSampleArray()
      a.resize(3)
      expect(a.count).toBe(3)
      expect(a.times).toHaveLength(3)
      expect(a.values).toHaveLength(3)
    })
  })

  describe('Resample', () => {
    const make = (): HdTimeSampleArray => {
      const a = new HdTimeSampleArray()
      a.resize(2)
      a.times = [0.0, 1.0]
      a.values = [0.0, 256.0]
      return a
    }

    it('at an exact sample time returns that sample value', () => {
      const a = make()
      expect(a.resample(0.0)).toBe(0.0)
      expect(a.resample(1.0)).toBe(256.0)
    })

    it('between two samples linearly interpolates scalar values', () => {
      const a = make()
      expect(a.resample(0.5)).toBe(128.0)
      expect(a.resample(0.25)).toBe(64.0)
    })

    it('before the first sample clamps to the first value', () => {
      const a = make()
      expect(a.resample(-1.0)).toBe(0.0)
    })

    it('after the last sample clamps to the last value', () => {
      const a = make()
      expect(a.resample(+2.0)).toBe(256.0)
    })
  })

  describe('GetContributingSampleTimesForInterval', () => {
    const make = (): HdTimeSampleArray => {
      const a = new HdTimeSampleArray()
      a.resize(4)
      a.times = [0.0, 1.0, 2.0, 3.0]
      a.values = [0.0, 10.0, 20.0, 30.0]
      return a
    }

    it('returns the sample times that fall within [startTime, endTime]', () => {
      const a = make()
      const r = a.GetContributingSampleTimesForInterval(1.0, 2.0)
      expect(r.sampleTimes).toEqual([1.0, 2.0])
      expect(r.changing).toBe(true)
    })

    it('includes the bracketing samples just before/after the interval', () => {
      const a = make()
      // start/end land between samples, so the surrounding samples contribute.
      const r = a.GetContributingSampleTimesForInterval(1.5, 2.5)
      expect(r.sampleTimes).toEqual([1.0, 2.0, 3.0])
      expect(r.changing).toBe(true)
    })

    it('returns a single (held) sample when the value is constant over the interval', () => {
      const a = make()
      // Interval collapsed onto one exact sample: only that sample contributes.
      const r = a.GetContributingSampleTimesForInterval(2.0, 2.0)
      expect(r.sampleTimes).toEqual([2.0])
      expect(r.changing).toBe(false)
    })

    it('returns empty when there are no samples at all', () => {
      const a = new HdTimeSampleArray()
      const r = a.GetContributingSampleTimesForInterval(0.0, 1.0)
      expect(r.sampleTimes).toEqual([])
      expect(r.changing).toBe(false)
    })
  })
})
