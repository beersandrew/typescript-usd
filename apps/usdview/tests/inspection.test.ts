import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Stage } from 'typescript-usd/usd'
import 'typescript-usd/usdGeom'
import { inspectObject } from '../src/inspection'
import { createHttpResolverContext } from '../src/http-resolver'
import expected from './fixtures/inspection/expected.json'
const base = 'https://inspection.example/'
const root = new URL('../public/assets/inspectionControls/', import.meta.url)
async function open() {
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input))
    try { return new Response(await readFile(new URL(url.pathname.slice(1), root), 'utf8')) }
    catch { return new Response('', { status: 404 }) }
  }
  return (await Stage.open(base + 'root.usda', { resolverContext: createHttpResolverContext(base + 'root.usda', undefined, fetcher) }))!
}
const basename = (path: string) => path.split('/').pop()!
describe('read-only USD inspection from native26.08 captures', () => {
  it('shows composed prim/property metadata and strongest-first authored spec stacks', async () => {
    const stage = await open()
    try {
      const prim = inspectObject(stage, '/World/Model')!, prop = inspectObject(stage, '/World/Model', 'weight')!
      const metadata = Object.fromEntries(prim.metadata.map(row => [row.name, JSON.parse(row.value)]))
      expect(metadata).toMatchObject(expected.primMetadata)
      expect(Object.fromEntries(prop.metadata.map(row => [row.name, JSON.parse(row.value)]))).toEqual(expected.weightMetadata)
      const stack = (s: typeof prim) => s.layers.map(({ layer,specPath,offset,scale }) => ({ layer: basename(layer),specPath,offset,scale }))
      expect(stack(prim)).toEqual(expected.primStack)
      expect(stack(prop)).toEqual(expected.weightStack)
      expect(prim.composition.map(row => ({...row,targetLayer:basename(row.targetLayer),introducingLayer:basename(row.introducingLayer)}))).toEqual(expected.composition)
    } finally { stage.dispose() }
  })
  it('presents typed array elements sampled at the current review time', async () => {
    const stage=await open()
    try {
      for(const row of expected.arraySamples){
        const page=inspectObject(stage,'/World/Model','samples',row.time,{arrayStart:1})!.array!
        expect(page.typeName).toBe(row.typeName)
        expect(page.length).toBe(row.values.length)
        expect(page.entries.map(entry=>JSON.parse(entry.value))).toEqual(row.values.slice(1))
        expect(page.entries[0]!.index).toBe(1)
      }
    }finally{stage.dispose()}
  })
  it('preserves relationship/property targets and exposes unresolved targets without navigating', async () => {
    const stage = await open()
    try {
      const related = inspectObject(stage, '/World/Model', 'related')!, driven = inspectObject(stage, '/World/Model', 'driven')!
      expect(related.targets.map(row => row.path)).toEqual(expected.targets)
      expect(driven.targets.map(row => row.path)).toEqual(expected.connections)
      for (const row of [...related.targets,...driven.targets]) {
        expect(row.exists).toBe(row.path !== '/World/Missing')
        if (row.propertyName) expect(row.propertyName).toBe('output')
      }
      expect(inspectObject(stage, '/World/Missing')).toBeNull()
      expect(inspectObject(stage, '/World/Model', 'missing')).toBeNull()
    } finally { stage.dispose() }
  })
})
