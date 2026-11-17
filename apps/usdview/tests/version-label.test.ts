import { describe, expect, it } from 'vitest'
import { releaseName, versionLinkHtml } from '../src/version-label'

describe('menu bar version label', () => {
  it('shows A.B.C+N as A.B.C.N', () => {
    expect(releaseName('26.11.1+3')).toBe('26.11.1.3')
    expect(releaseName('26.11.1+0')).toBe('26.11.1.0')
  })
  it('shows nothing for other versions', () => {
    expect(releaseName('0.1.0')).toBeUndefined()
    expect(releaseName(undefined)).toBeUndefined()
    expect(versionLinkHtml('0.1.0')).toBe('')
  })
  it('links to the release tag', () => {
    expect(versionLinkHtml('26.11.1+3')).toContain('href="https://github.com/beersandrew/typescript-usd/releases/tag/v26.11.1.3"')
    expect(versionLinkHtml('26.11.1+3')).toContain('>typescript-usd 26.11.1.3</a>')
  })
  it('is the build\'s library version', () => {
    expect(import.meta.env.VITE_TYPESCRIPT_USD_VERSION).toMatch(/^\d+\.\d+\.\d+\+\d+$/)
  })
})
