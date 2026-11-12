// Ported from OpenUSD 26.11.1: pxr/base/tf/stopwatch.cpp,
//  pxr/base/tf/stopwatch.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of OpenUSD v26.08 pxr/base/tf/stopwatch.{h,cpp}.

const now = (): number => Date.now()

export class TfStopwatch {
  #elapsedMilliseconds = 0
  #startTick = 0
  #sampleCount = 0

  Start(): void {
    this.#startTick = now()
  }
  Stop(): void {
    this.#elapsedMilliseconds += now() - this.#startTick
    ++this.#sampleCount
  }
  Reset(): void {
    this.#elapsedMilliseconds = 0
    this.#sampleCount = 0
  }
  addFrom(other: TfStopwatch): void {
    this.#elapsedMilliseconds += other.#elapsedMilliseconds
    this.#sampleCount += other.#sampleCount
  }
  getSeconds(): number { return this.#elapsedMilliseconds / 1000 }
  getMilliseconds(): number { return this.#elapsedMilliseconds }
  getMicroseconds(): number { return this.#elapsedMilliseconds * 1000 }
  getNanoseconds(): number { return this.#elapsedMilliseconds * 1_000_000 }
  getSampleCount(): number { return this.#sampleCount }
}
