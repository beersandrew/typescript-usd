// Ported from OpenUSD 26.11.1: pxr/usd/sdr/registry.cpp
// Copyright 2018 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Port of the lookup/validation branches in OpenUSD v26.11.1
// pxr/usd/sdr/registry.cpp:194-254,472-503,1305-1331.
import { expect, it, vi } from 'vitest'
import { Registry, Version, ShaderNode, ShaderProperty, type NodeDiscoveryResult } from '../../src/index.ts'
const discovery = (system = 'glslfx'): NodeDiscoveryResult => ({identifier:'test',name:'test',function:'test',version:new Version(),sourceType:system,discoveryType:'usda',uri:'test.usda',resolvedUri:'test.usda'})
const parsed = (dr:NodeDiscoveryResult, valid=true, identifier=dr.identifier) => new ShaderNode(identifier,dr.version,dr.name,dr.function,'usda',dr.sourceType,dr.uri,dr.resolvedUri,valid?[new ShaderProperty('out','float',0,true)]:[])
it('selects the discovery-format parser rather than the shading-system parser',()=>{
 const r=new Registry(), dr=discovery(), right=parsed(dr)
 r.addDiscoveryResult(dr)
 const wrong=vi.fn(()=>parsed(dr))
 r.setExtraParserPlugins({usda:{parseShaderNode:()=>right},glslfx:{parseShaderNode:wrong}})
 expect(r.getShaderNodeByIdentifier('test')).toBe(right)
 expect(wrong).not.toHaveBeenCalled()
})
it('stops a single-node lookup after the first returned handle',()=>{
 const r=new Registry(), dr=discovery()
 r.addDiscoveryResult(dr);r.addDiscoveryResult({...discovery('other'),discoveryType:'other'})
 const lower=vi.fn(()=>{throw new Error('must not parse a lower-priority alternative')})
 r.setExtraParserPlugins({usda:{parseShaderNode:parsed},other:{parseShaderNode:lower}})
 expect(r.getShaderNodeByIdentifier('test')?.getShadingSystem()).toBe(dr.sourceType)
 expect(r.getShaderNodeByName('test',[],'allVersions')?.getShadingSystem()).toBe(dr.sourceType)
 expect(lower).not.toHaveBeenCalled()
})
it('retains invalid parsed handles rather than treating them as absent',()=>{
 const r=new Registry(),dr=discovery(),invalid=parsed(dr,false),parse=vi.fn(()=>invalid)
 r.addDiscoveryResult(dr);r.setExtraParserPlugins({usda:{parseShaderNode:parse}})
 expect(r.getShaderNodeByIdentifier('test')).toBe(invalid)
 expect(r.getShaderNodeByIdentifier('test')).toBe(invalid)
 expect(parse).toHaveBeenCalledTimes(1)
})
it('does not cache valid nodes with mismatched discovery identity',()=>{
 const r=new Registry(),dr=discovery(),correct=parsed(dr)
 const parse=vi.fn().mockReturnValueOnce(parsed(dr,true,'wrong')).mockReturnValueOnce(correct)
 r.addDiscoveryResult(dr);r.setExtraParserPlugins({usda:{parseShaderNode:parse}})
 expect(r.getShaderNodeByIdentifier('test')).toBeUndefined()
 expect(r.getShaderNodeByIdentifier('test')).toBe(correct)
 expect(parse).toHaveBeenCalledTimes(2)
})
