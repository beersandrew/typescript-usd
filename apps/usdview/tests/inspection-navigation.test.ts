import { describe, expect, it, vi } from 'vitest'
import { parseInspectionPath } from '../src/inspection-navigation'
import { inspectArray, formatPropertyValue } from '../src/inspection'

describe('typed inspection navigation and bounded array presentation', () => {
  it('preserves namespaced property names and rejects non-object paths', () => {
    expect(parseInspectionPath(' /World/Mesh.primvars:st ')).toEqual({primPath:'/World/Mesh',propertyName:'primvars:st'})
    expect(parseInspectionPath('/World')).toEqual({primPath:'/World'})
    for(const path of ['World','/World{model=A}','/World.link[/Other]']) expect(()=>parseInspectionPath(path)).toThrow()
  })
  it('reads only one bounded page and preserves vector element structure', () => {
    const get=vi.fn((i:number)=>({data:[i,i+1,i+2]})), toArray=vi.fn(()=>{throw Error('Do not expand entire array')})
    const array={length:10_000_000,get,toArray}
    const page=inspectArray(array,'point3f[]',{arrayStart:999,arrayLimit:100000})!
    expect(page.entries).toHaveLength(100)
    expect(page.entries[0]).toMatchObject({index:999,value:'[999,1000,1001]'})
    expect(page.entries.at(-1)?.index).toBe(1098)
    expect(get).toHaveBeenCalledTimes(100);expect(toArray).not.toHaveBeenCalled()
    get.mockClear();expect(formatPropertyValue(array,'point3f[]')).toContain('10000000 elements')
    expect(get).toHaveBeenCalledTimes(8)
  })
  it('handles empty arrays, stale page offsets and scalar vectors', () => {
    expect(inspectArray([],'float[]')?.entries).toEqual([])
    expect(inspectArray([3,4],'float[]',{arrayStart:100})?.entries).toEqual([{index:1,value:'4',text:'1: 4.000000'}])
    expect(inspectArray([3,4],'float[]',{arrayStart:NaN,arrayLimit:Infinity})?.start).toBe(0)
    expect(inspectArray([3,4,5],'float3')).toBeUndefined()
  })
})
