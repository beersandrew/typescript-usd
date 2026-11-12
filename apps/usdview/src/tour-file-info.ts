/** Reads what a tour's root layer says about how to play it (welcome.ts,
 * tourFileInfo): its tour camera, load schedule and OpenExec. Loaded only when
 * the welcome note's tour button is pressed (main.ts imports it dynamically).
 *
 * Only the root layer is read (no composition), so a tour camera counts when
 * the root layer has a prim spec at its path, which is where tour files define
 * it; a camera that only a sublayer defines is not found, and the tour then
 * opens through the free camera. */
import { ResolverContextBinder as ArResolverContextBinder } from 'typescript-usd/ar'
import { Layer as SdfLayer } from 'typescript-usd/sdf'
import { createHttpResolverContext } from './http-resolver'
import { tourFileInfo, type TourFileInfo } from './welcome'

export async function readTourFileInfo(url: string, fetchAsset?: typeof fetch): Promise<TourFileInfo> {
  const binder = new ArResolverContextBinder(createHttpResolverContext(url, undefined, fetchAsset))
  // The binder's scope is synchronous (load-prefetch.ts, withContext): the open
  // keeps the context it read when it started.
  const layer = await binder.run(() => ({ started: SdfLayer.findOrOpen(url) })).started
  if (!layer) throw new Error(`Could not open the tour: ${url}`)
  return tourFileInfo(layer.getField('/', 'customLayerData'), layer.getDefaultPrim(), path => layer.getPrimAtPath(path) !== undefined)
}
