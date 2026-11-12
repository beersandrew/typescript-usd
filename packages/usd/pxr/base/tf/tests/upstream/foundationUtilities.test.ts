// Ports applicable contracts from the registered OpenUSD v26.08 programs
// TfHash, TfUnicodeUtils, TfPatternMatcher, TfStopwatch, TfEnum, and TfNotice.
import { describe, expect, it, vi } from 'vitest'
import {
  Enum as TfEnum, Hash as TfHash, HashCombine, Notice as TfNotice,
  PatternMatcher, Stopwatch, Utf8CodePoint, Utf8CodePointFromAscii,
  Utf8CodePointView, Utf8InvalidCodePoint, IsUtf8CodePointXidContinue,
  IsUtf8CodePointXidStart,
} from '../../src/index.ts'

describe('TfHash', () => {
  it('is structural, deterministic, order-sensitive, and canonicalizes zero', () => {
    expect(TfHash('hello')).toBe(TfHash('hello'))
    expect(TfHash(-0)).toBe(TfHash(0))
    expect(HashCombine(1, 2)).not.toBe(HashCombine(2, 1))
    expect(TfHash([1, 2, 3])).toBe(TfHash([1, 2, 3]))
  })
})

describe('TfUnicodeUtils', () => {
  it('validates scalars, iterates code points, and identifies XID classes', () => {
    expect(new Utf8CodePoint(0x10ffff).asUInt32()).toBe(0x10ffff)
    expect(new Utf8CodePoint(0x110000).equals(Utf8InvalidCodePoint)).toBe(true)
    expect(new Utf8CodePoint(0xd800).equals(Utf8InvalidCodePoint)).toBe(true)
    expect(Utf8CodePointFromAscii('a').asUInt32()).toBe(97)
    expect([...new Utf8CodePointView('ⅈ75_hgòð㤻')]).toHaveLength(9)
    expect(IsUtf8CodePointXidStart(0x43)).toBe(true)
    expect(IsUtf8CodePointXidContinue(0x30)).toBe(true)
  })
})

describe('TfPatternMatcher', () => {
  it('ports the registered glob and regex cases', () => {
    const matcher = new PatternMatcher()
    matcher.setPattern('oast')
    matcher.setIsGlobPattern(true)
    matcher.setIsCaseSensitive(true)
    expect(matcher.match('i like toast')).toBe(true)
    expect(matcher.match('i like ToaST')).toBe(false)
    matcher.setPattern('oast\\')
    expect(matcher.isValid()).toBe(false)
    const date = new PatternMatcher(
      '^[0-9]{4}/[0-9]{2}/[0-9]{2}(:[0-9]{2}:[0-9]{2}:[0-9]{2})?',
    )
    expect(date.match('2009/01/01:12:34:56')).toBe(true)
    expect(date.match('01/01/2009')).toBe(false)
  })
})

describe('TfStopwatch', () => {
  it('restarts, samples every Stop, and reports only accumulated time', () => {
    const clock = vi.spyOn(Date, 'now')
    clock.mockReturnValueOnce(100)
    clock.mockReturnValueOnce(150)
    clock.mockReturnValueOnce(200)
    clock.mockReturnValueOnce(250)

    const watch = new Stopwatch()
    watch.Start()
    watch.Start()
    expect(watch.getMilliseconds()).toBe(0)
    expect(watch.getSampleCount()).toBe(0)
    watch.Stop()
    expect(watch.getMilliseconds()).toBe(50)
    expect(watch.getSampleCount()).toBe(1)
    watch.Stop()
    expect(watch.getMilliseconds()).toBe(150)
    expect(watch.getSampleCount()).toBe(2)

    const other = new Stopwatch()
    other.addFrom(watch)
    expect(other.getMilliseconds()).toBe(150)
    expect(other.getSampleCount()).toBe(2)
    watch.Reset()
    expect(watch.getMilliseconds()).toBe(0)
    expect(watch.getSampleCount()).toBe(0)
    clock.mockRestore()
  })
})

describe('TfEnum', () => {
  it('registers names and display names by value', () => {
    TfEnum.addName(7, 'Seven', 'Seven Items', 'Example::Seven')
    const value = new TfEnum(7)
    expect(value.getName()).toBe('Seven')
    expect(value.getDisplayName()).toBe('Seven Items')
    expect(value.getFullName()).toBe('Example::Seven')
  })
})

describe('TfNotice', () => {
  it('delivers synchronously, filters senders, and revokes registrations', () => {
    class Changed extends TfNotice {}
    const sender = {}
    const calls: object[] = []
    const key = TfNotice.Register(Changed, (_notice, actual) => calls.push(actual!), sender)
    expect(new Changed().send({})).toBe(0)
    expect(new Changed().send(sender)).toBe(1)
    expect(calls).toEqual([sender])
    key.revoke()
    expect(new Changed().send(sender)).toBe(0)
  })
})
