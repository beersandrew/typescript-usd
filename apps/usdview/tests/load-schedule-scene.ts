// A scene with a payload load schedule (docs/viewer-contracts.md)
// (tests/load-schedule.test.ts, tests/load-prefetch.test.ts,
// tests/runtime-lifecycle.test.ts).
import { Stage } from 'typescript-usd/usd'
import { createHttpResolverContext } from '../src/http-resolver'
// The carrier layout: each carrier holds a Unit and a Labels payload and has no
// payload itself.
const carrier = (name: string) => `    def Xform "${name}"
    {
        def Xform "Unit" (
            prepend payload = @./unit.usda@</Unit>
        )
        {
        }
        def Xform "Labels" (
            prepend payload = @./labels.usda@
        )
        {
        }
    }
`
const files: Record<string, string | Uint8Array> = {
  '/root.usda': `#usda 1.0
(
    startTimeCode = 1
    endTimeCode = 600
    customLayerData = {
        dictionary tourLoad = {
            dictionary carriers = {
                int2 "/Scene/Units/U01_A" = (-47, 217)
                int2 "/Scene/Units/U01_B" = (133, 397)
                int2 "/Scene/Units/U01_C" = (313, 577)
            }
            int lead = 48
        }
    }
)
def Xform "Scene"
{
    def Xform "Units"
    {
${carrier('U01_A')}${carrier('U01_B')}${carrier('U01_C')}    }
    def Xform "Loose" (
        prepend payload = @./unit.usda@</Unit>
    )
    {
    }
}
`,
  '/unit.usda': `#usda 1.0
def Xform "Unit"
{
    def Mesh "M"
    {
        int[] faceVertexCounts = [3]
        int[] faceVertexIndices = [0, 1, 2]
        point3f[] points = [(0, 0, 0), (1, 0, 0), (0, 1, 0)]
    }
}
`,
  '/labels.usda': `#usda 1.0
(
    defaultPrim = "L"
)
def Xform "L"
{
    def Shader "Tex"
    {
        uniform token info:id = "UsdUVTexture"
        asset inputs:file = @./tex.png@
    }
}
`,
  // An image the labels name (tests/load-prefetch.test.ts: read ahead): a 1x1 PNG.
  '/tex.png': Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), c => c.charCodeAt(0)),
}
export const A = '/Scene/Units/U01_A', B = '/Scene/Units/U01_B', C = '/Scene/Units/U01_C'
export const scheduleSceneUrl = 'https://schedule.example/root.usda'
/** The files fetched, by path, in order (tests/load-prefetch.test.ts). */
export const fetched: string[] = []
export function scheduleSceneContext() {
  const fetcher: typeof fetch = async input => { const path = new URL(String(input)).pathname; fetched.push(path); const body = files[path]; return body === undefined ? new Response('', {status: 404}) : new Response(body as BodyInit) }
  return createHttpResolverContext(scheduleSceneUrl, undefined, fetcher)
}
export async function open(loadPayloads = false) {
  return (await Stage.open(scheduleSceneUrl, {resolverContext: scheduleSceneContext(), loadPayloads}))!
}

