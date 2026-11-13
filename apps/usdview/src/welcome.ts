/** The default scene and the welcome note shown over it (main.ts).
 *
 * A web addition, not usdview behaviour: usdview opens the file on its command
 * line, and with none it has nothing to show. The page opens a wireframe torus
 * (public/assets/torus.usda) and a note saying a USD file can be dropped onto
 * the window; when a tour is configured, the note also offers to start it. */

/** The scene the page opens when the URL names none (?scene=). */
export const defaultSceneUrl = './assets/torus.usda'

/** Whether the page shows the welcome banner (drop a USD file onto the window):
 *  on the default scene (no ?scene=) and on the tour page this module builds
 *  (?start=tour, whether the tour was configured by ?tour= or by the build), but in
 *  neither side-by-side mode (?follow=, ?viewerOnly=1), whose page is a
 *  comparison, not a start page. */
export function showsWelcome(search: string | URLSearchParams): boolean {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  if (params.has('follow') || params.get('viewerOnly') === '1') return false
  return !params.has('scene') || params.get('start') === 'tour'
}

/** A tour the welcome note can start: its root layer and the plugins
 *  (plugInfo.json URLs) it needs registered, as a caller of usdview puts them on
 *  PXR_PLUGINPATH_NAME (e.g. a repository's variant fallbacks). */
export interface TourSource { url: string; plugins: string[] }

/** The configured tour: `?tour=<url>` (with repeatable `?tourPlugin=<plugInfo.json url>`),
 *  else the build's VITE_MUSEUM_TOUR_URL (with VITE_MUSEUM_TOUR_PLUGINS, comma-separated).
 *  Undefined when neither names one: the note then offers no tour. */
export function tourSource(search: string | URLSearchParams, env: {VITE_MUSEUM_TOUR_URL?: string, VITE_MUSEUM_TOUR_PLUGINS?: string}): TourSource | undefined {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const query = params.get('tour')?.trim()
  if (query) return { url: query, plugins: params.getAll('tourPlugin').map(p => p.trim()).filter(Boolean) }
  const url = env.VITE_MUSEUM_TOUR_URL?.trim()
  if (!url) return undefined
  return { url, plugins: (env.VITE_MUSEUM_TOUR_PLUGINS ?? '').split(',').map(p => p.trim()).filter(Boolean) }
}

/** What a tour's root layer says about how to play it. */
export interface TourFileInfo {
  /** The camera the tour plays through, if the file defines one of the conventional paths. */
  camera?: string
  /** The root layer's customLayerData has a payload load schedule ("tourLoad", load-schedule.ts). */
  loadSchedule: boolean
  /** OpenExec on (true) or off (false), from customLayerData "museum" or "museumRoute" "exec";
   *  undefined when the file doesn't say. */
  exec?: boolean
}

/** The tour camera paths, in order of preference: the first the file defines plays the tour. */
export function tourCameraCandidates(defaultPrim: string): string[] {
  return [...(defaultPrim ? [`/${defaultPrim}/cameras/tour_cam`, `/${defaultPrim}/tour/tour_cam`] : []), '/Museum/Cameras/tour_cam', '/Wing/Cameras/tour_cam', '/Tour/Cameras/main_cam']
}

/** A tour's file info from its root layer's customLayerData, defaultPrim and prims. */
export function tourFileInfo(customLayerData: unknown, defaultPrim: string, hasPrim: (path: string) => boolean): TourFileInfo {
  const data = (customLayerData && typeof customLayerData === 'object' ? customLayerData : {}) as Record<string, unknown>
  let exec: boolean | undefined
  for (const key of ['museum', 'museumRoute']) {
    const entry = data[key]
    if (entry && typeof entry === 'object' && 'exec' in entry) { exec = Boolean((entry as Record<string, unknown>).exec); break }
  }
  const camera = tourCameraCandidates(defaultPrim).find(hasPrim)
  return { ...(camera ? { camera } : {}), loadSchedule: 'tourLoad' in data, ...(exec === undefined ? {} : { exec }) }
}

/** The viewer page that plays `tour` on its own clock: the tour opened through its
 *  camera at high complexity, by its load schedule, with OpenExec as the file says,
 *  Storm's alpha to coverage off and the tour's plugins registered, playing once
 *  open (?play=1). The same page a side-by-side comparison opens as the follower,
 *  without ?follow= and viewer-only mode. `page` is the viewer page's URL; the
 *  tour's and plugins' URLs are resolved against it. */
export function tourPageUrl(page: string | URL, tour: TourSource, info: TourFileInfo): string {
  const url = new URL(page)
  url.hash = ''
  const params = new URLSearchParams()
  params.set('scene', new URL(tour.url, url).href)
  if (info.camera) { params.set('camera', info.camera); params.set('complexity', 'high') }
  if (info.exec) params.append('env', 'USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1')
  if (info.loadSchedule) params.set('loadSchedule', '1')
  params.append('env', 'TF_DEBUG=HDX_DISABLE_ALPHA_TO_COVERAGE')
  for (const plugin of tour.plugins) params.append('plugin', new URL(plugin, url).href)
  params.set('play', '1')
  carryTourConfig(url.searchParams, params)
  params.set('start', 'tour')
  url.search = params.toString()
  return url.href
}

/** The address a tour page shows once it has read its setup (?start=tour): the
 *  page it was opened from, with only the tour configuration (?tour=,
 *  ?tourPlugin=). Reloading it opens the start page again, with the tour button; null
 *  when the page isn't a tour page. */
export function tourAddress(page: string | URL): string | null {
  const url = new URL(page)
  if (url.searchParams.get('start') !== 'tour') return null
  const params = new URLSearchParams()
  carryTourConfig(url.searchParams, params)
  url.search = params.toString()
  return url.href
}

/** ?tour= and ?tourPlugin= carried from `from` to `to`, so File > Close Stage can
 *  return to a welcome page that still offers the same tour. */
function carryTourConfig(from: URLSearchParams, to: URLSearchParams): void {
  const tour = from.get('tour')
  if (tour) to.set('tour', tour)
  for (const plugin of from.getAll('tourPlugin')) to.append('tourPlugin', plugin)
}

/** File > Close Stage (not in usdview): the empty start page, the default scene
 *  with its banner (?empty=1, so a configured tour doesn't open again), keeping
 *  only the page's tour configuration (?tour=, ?tourPlugin=). */
export function welcomePageUrl(page: string | URL): string {
  const url = new URL(page)
  url.hash = ''
  const params = new URLSearchParams()
  carryTourConfig(url.searchParams, params)
  params.set('empty', '1')
  url.search = params.toString()
  return url.href
}

/** A phone-sized screen: narrow (at most 700 CSS pixels), or a touch screen at most
 *  1024 wide. The page opens it in viewer-only mode with no drop-a-file banner
 *  (main.ts): files can't be dragged onto a phone, and the panels don't fit. */
export function smallScreen(match: (query: string) => boolean = query => typeof matchMedia === 'function' && matchMedia(query).matches): boolean {
  return match('(max-width: 700px)') || match('(pointer: coarse) and (max-width: 1024px)')
}
