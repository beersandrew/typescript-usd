import {expect,it} from 'vitest'
import {displayResolvedPath} from '../src/resolved-path-display'
import {scalarToString} from '../src/python-format'
// usdview shows the file a resolved path names; the load handle is internal.
it('shows the URL of a usdview-load resolved path',()=>{
 expect(displayResolvedPath('usdview-load:7:https://example.com/a/tex.png')).toBe('https://example.com/a/tex.png')
 expect(displayResolvedPath('https://example.com/a/tex.png')).toBe('https://example.com/a/tex.png')
 expect(displayResolvedPath('')).toBe('')
})
it('formats an asset value with the URL as its resolved path',()=>{
 const asset={getAuthoredPath:()=>'./tex.png',getEvaluatedPath:()=>'',getResolvedPath:()=>'usdview-load:3:https://example.com/a/tex.png'}
 const text=scalarToString(asset,'asset')
 expect(text).toContain("resolvedPath='https://example.com/a/tex.png'")
 expect(text).not.toContain('usdview-load')
})
