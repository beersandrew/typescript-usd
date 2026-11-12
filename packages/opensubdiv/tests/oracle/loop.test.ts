import {fileURLToPath} from 'node:url'
import {dirname,join} from 'node:path'
import {readFileSync} from 'node:fs'
import {describe,it,expect} from 'vitest'
import {TopologyRefinerFactory,PrimvarRefiner} from '../../src/far/index.ts'
import {SchemeType,Options,VtxBoundaryInterpolation} from '../../src/sdc/index.ts'
const fixture=JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)),'fixtures/loop.json'),'utf8'))
describe('uniform Loop vs native OpenSubdiv3.7.0',()=>{
 for(const sample of fixture.cases)it(sample.name,()=>{
  const options=new Options();options.setVtxBoundaryInterpolation(VtxBoundaryInterpolation.EDGE_AND_CORNER)
  const r=TopologyRefinerFactory.create({numVertices:sample.points.length/3,vertsPerFace:sample.counts,vertIndicesPerFace:sample.indices,holeIndices:sample.holes,...(sample.crease?{creaseIndexPairs:[0,1,1,2],creaseWeights:[2,2]}:{})},{schemeType:SchemeType.LOOP,schemeOptions:options})
  r.refineUniform({refinementLevel:2,orderVerticesFromFacesFirst:sample.facesFirst});const pr=new PrimvarRefiner(r);let src=sample.points,uniform=Array.from({length:sample.counts.length*3},(_,i)=>Math.fround(i/10))
  for(let level=1;level<=2;level++){
   const expected=sample.levels[level-1],l=r.GetLevel(level),dst=new Float32Array(l.getNumVertices()*3),faceDst=new Float32Array(l.getNumFaces()*3)
   pr.interpolate(level,3,src,dst);pr.interpolateFaceUniform(level,3,uniform,faceDst)
   expect(Array.from(l.getFaceVertexCounts())).toEqual(expected.counts);expect(Array.from(l.getFaceVertexIndices())).toEqual(expected.indices)
   expect(Array.from(r.getLevel(level)._edgeVertIndices)).toEqual(expected.edgeVertices)
   expect(Array.from({length:l.getNumFaces()},(_,f)=>l.getFaceParentFace(f))).toEqual(expected.parents)
   expect(Array.from({length:l.getNumFaces()},(_,f)=>Number(l.isFaceHole(f)))).toEqual(expected.holeFlags)
   expect(dst.length).toBe(expected.points.length);dst.forEach((v,i)=>expect(Math.abs(v-expected.points[i])).toBeLessThan(1e-6))
   faceDst.forEach((v,i)=>expect(Math.abs(v-expected.uniform[i])).toBeLessThan(1e-6));src=Array.from(dst);uniform=Array.from(faceDst)
  }
 })
})
