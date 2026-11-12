// Ported from OpenUSD 26.11.1: pxr/imaging/hd/timeSampleArray.cpp,
//  pxr/imaging/hd/timeSampleArray.h
// Copyright 2016, 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Mirrors pxr/imaging/hd/timeSampleArray.{h,cpp} — time-sample resampling
// utilities and the HdTimeSampleArray struct-of-arrays container.
//
// These are the convenience helpers Hd uses to reconstruct a value at an
// arbitrary time from an ordered set of authored time samples, using a linear
// reconstruction filter. The function is treated as CONSTANT outside the
// supplied sample range (clamped, not extrapolated).
//
// Upstream HdResampleNeighbors is templated over T (and specialized for
// GfQuatf/VtArray/VtValue). Here we port the scalar (number) path that the
// testenv exercises; the VtValue type-mismatch / empty-value coding-error
// cases are a C++ VtValue type-system artifact and are not modeled.

// Resample two neighboring scalar samples by fraction alpha. Mirrors
// HdResampleNeighbors -> GfLerp(alpha, v0, v1): exact at the endpoints,
// interpolating for alpha in [0,1] and EXTRAPOLATING outside it.
export function HdResampleNeighbors(alpha: number, v0: number, v1: number): number {
  return v0 + alpha * (v1 - v0)
}

// Resample a function described by an ordered array of samples, using a linear
// reconstruction filter evaluated at parametric position u. The function is
// constant outside the supplied sample range (clamped to the endpoints).
//
// Upstream returns T() and raises a coding error when numSamples == 0; we
// mirror the value (0) but omit the diagnostic emission (C++ TF_CODING_ERROR).
export function HdResampleRawTimeSamples(
  u: number,
  numSamples: number,
  us: readonly number[],
  vs: readonly number[]
): number {
  if (numSamples === 0) {
    // Zero samples provided (coding error upstream); return the default value.
    return 0
  }

  let i = 0
  for (; i < numSamples; ++i) {
    if (us[i] === u) {
      // Fast path for exact parameter match.
      return vs[i]!
    }
    if (us[i]! > u) {
      break
    }
  }
  if (i === 0) {
    // u is before the first sample.
    return vs[0]!
  } else if (i === numSamples) {
    // u is after the last sample.
    return vs[numSamples - 1]!
  } else if (us[i] === us[i - 1]) {
    // Neighboring samples have identical parameter; arbitrarily choose one.
    return vs[i - 1]!
  } else {
    // Linear blend of neighboring samples.
    const alpha = (u - us[i - 1]!) / (us[i]! - us[i - 1]!)
    return HdResampleNeighbors(alpha, vs[i - 1]!, vs[i]!)
  }
}

// Result of HdGetContributingSampleTimesForInterval: the contributing sample
// times for the interval, and whether the value is changing over it (i.e.
// whether more than one sample contributes). Mirrors the bool return + the
// out-vector of the upstream free function.
export interface HdContributingSampleTimes {
  changing: boolean
  sampleTimes: number[]
}

// Returns contributing sample times for the interval [startTime, endTime].
//
// If there is no sample exactly at startTime, the sample just before it (if any)
// is included; similarly the first sample at/after endTime closes the interval.
// `changing` is true iff more than one sample contributes. With no samples in
// range, the first sample's time is returned (held constant) and changing=false.
// Mirrors HdGetContributingSampleTimesForInterval.
export function HdGetContributingSampleTimesForInterval(
  count: number,
  sampleTimes: readonly number[],
  startTime: number,
  endTime: number
): HdContributingSampleTimes {
  const outSampleTimes: number[] = []
  let numOutSamples = 0

  for (let i = 0; i < count; ++i) {
    const t = sampleTimes[i]!
    if (numOutSamples === 0) {
      if (t > startTime && i > 0) {
        // Include the sample just before the start time.
        numOutSamples++
        outSampleTimes.push(sampleTimes[i - 1]!)
      }
      if (t >= startTime) {
        // Include the sample at, or the first sample after, the start time.
        numOutSamples++
        outSampleTimes.push(t)
      }
    } else {
      numOutSamples++
      outSampleTimes.push(t)
    }
    if (t >= endTime) {
      // Found the sample at or beyond the end time; we are done.
      break
    }
  }

  if (numOutSamples === 0) {
    if (count > 0) {
      outSampleTimes.push(sampleTimes[0]!)
    }
    return { changing: false, sampleTimes: outSampleTimes }
  }

  return { changing: numOutSamples > 1, sampleTimes: outSampleTimes }
}

// An array of a value sampled over time, in struct-of-arrays layout. A
// convenience for time-sampling attributes. Upstream is templated over a static
// CAPACITY (TfSmallVector); here the buffers grow dynamically.
export class HdTimeSampleArray<TYPE = number> {
  count: number = 0
  times: number[] = []
  values: TYPE[] = []

  // Resize the internal buffers and set count.
  resize(newSize: number): void {
    this.times.length = newSize
    this.values.length = newSize
    this.count = newSize
  }

  // Convenience method for invoking HdResampleRawTimeSamples on this array.
  // (Scalar value path, matching the ported HdResampleRawTimeSamples.)
  resample(u: number): TYPE {
    return HdResampleRawTimeSamples(
      u,
      this.count,
      this.times,
      this.values as unknown as readonly number[]
    ) as unknown as TYPE
  }

  // See HdGetContributingSampleTimesForInterval.
  GetContributingSampleTimesForInterval(
    startTime: number,
    endTime: number
  ): HdContributingSampleTimes {
    return HdGetContributingSampleTimesForInterval(
      this.count,
      this.times,
      startTime,
      endTime
    )
  }
}
