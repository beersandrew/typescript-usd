// ?env=NAME=VALUE (repeatable) sets environment settings (TfEnvSetting) before
// anything reads them, as usdview's and usdrecord's environment does.
import './apply-env-parameters'
// ?perfLog=<url> (tooling): wraps GPUDevice before the runtime opens one.
import './perf-log'
import './pipeline-cache'
import {parseStartupOptions} from './startup-options'
import {preferenceStorageKey} from './view-preferences'
import { createRuntime } from './runtime'
import { Registry as PlugRegistry } from 'typescript-usd/plug'
import { defineUsdViewer, UsdViewerElement, type ViewerScene } from './usd-viewer'
import { webProfilePlugInfo } from './profile-compatibility'
import { viewerFileUrl, viewerRoot } from './app-root'
import { startFollow } from './follow'
import { defaultSceneUrl, showsWelcome, smallScreen, tourAddress, tourPageUrl, tourSource, welcomePageUrl } from './welcome'

defineUsdViewer()
const viewer = document.createElement('usd-viewer') as UsdViewerElement
viewer.runtimeFactory = createRuntime
viewer.preferencesStorageKey=preferenceStorageKey
const startup=parseStartupOptions(location.search)
viewer.startupOptions=startup.options
viewer.scenes = []
// ?plugin=<plugInfo.json URL> (repeatable) registers plugins before the scene
// opens, as PXR_PLUGINPATH_NAME does for usdview. A failed registration is
// reported and the scene still opens.
// The viewer's own capability profile (a resource plugin, one of the viewer's
// files: app-root.ts) is registered first; ?plugin= URLs are the page's.
const plugins = [webProfilePlugInfo, ...new URLSearchParams(location.search).getAll('plugin')]
const pluginWarnings = (await Promise.allSettled(plugins.map((url, i) =>
  PlugRegistry.GetInstance().registerPluginsAsync(new URL(url, i === 0 ? viewerRoot() : document.baseURI).href))))
  .flatMap((result, i) => result.status === 'rejected' ? [`Could not register plugin ${plugins[i]}: ${String(result.reason)}`] : [])
for (const warning of pluginWarnings) console.warn(warning)
viewer.startupWarnings = [...startup.warnings, ...pluginWarnings]
// With no ?scene= the page opens the default scene (the torus) with the welcome
// banner (welcome.ts): drop a USD file onto the window, or, with a tour configured
// (?tour=, else VITE_MUSEUM_TOUR_URL), Start Museum Tour. The tour isn't loaded
// until asked for. It opens as its own page, set up from what its root layer says
// (tour-file-info.ts). On a phone-sized screen the banner keeps only the button.
const tour = tourSource(location.search, import.meta.env)
const openTour = async () => {
  const { readTourFileInfo } = await import('./tour-file-info')
  return tourPageUrl(location.href, tour!, await readTourFileInfo(new URL(tour!.url, document.baseURI).href))
}
viewer.src = new URLSearchParams(location.search).get('scene') ?? viewerFileUrl(defaultSceneUrl)
if (showsWelcome(location.search)) {
  const onDefaultScene = !new URLSearchParams(location.search).has('scene')
  const startTour = tour && onDefaultScene ? async () => location.assign(await openTour()) : undefined
  // A phone can't drop files: its banner is only the tour button, or nothing.
  if (!smallScreen() || startTour) viewer.showWelcome({ onDefaultScene, compact: smallScreen(), ...(startTour ? { startTour } : {}) })
}
document.querySelector('#viewer-host')!.append(viewer)
// File > Close Stage returns to the welcome page (the torus and its note).
viewer.addEventListener('close-stage', () => location.assign(welcomePageUrl(location.href)))
// ?play=1 plays once the first scene is open (the tour page, welcome.ts).
if (new URLSearchParams(location.search).get('play') === '1') viewer.play()
// ?follow=ws://… follows a sync leader (follow.ts).
const follow = new URLSearchParams(location.search).get('follow')
if (follow) startFollow(follow, viewer)
// ?viewerOnly=1 (Window > Toggle Viewer-Only Mode) and ?cameraMask=full|partial|none
// (Camera > Camera Masking), applied once the first scene is open: a side-by-side
// comparison uses them so both viewers show the camera's own frame at the same size.
// A phone-sized screen (narrow, or a touch screen of tablet width or less) opens in
// viewer-only mode unless the URL says otherwise (?viewerOnly=0): a web adaptation,
// so the viewport fills the screen. Window > Toggle Viewer-Only Mode still works.
const viewerOnlyParam = new URLSearchParams(location.search).get('viewerOnly')
const viewerOnly = viewerOnlyParam === '1' || (viewerOnlyParam === null && smallScreen())
const cameraMask = new URLSearchParams(location.search).get('cameraMask')
if (viewerOnly || cameraMask) viewer.addEventListener('scene-loaded', () => {
  if (viewerOnly) viewer.setViewerOnly(true)
  if (cameraMask === 'full' || cameraMask === 'partial' || cameraMask === 'none') viewer.setCameraMaskMode(cameraMask)
}, { once: true })
// A tour page (?start=tour) has read its setup above; the address bar goes back
// to the page it came from, without the setup's parameters.
const address = tourAddress(location.href)
if (address) history.replaceState(history.state, '', address)

// The examples menu lists the sample scenes bundled with the build. The dev
// server adds local review scenes from its asset mounts (dev-examples.json),
// which a static build does not have. A manifest failure must not prevent
// opening a user scene.
// Its scene URLs are viewer files, as the manifest itself.
void fetch(new URL('./assets/scenes.json', viewerRoot()))
  .then(response => { if (!response.ok) throw new Error('Example list unavailable'); return response.json() })
  .then(async (bundled: ViewerScene[]) => {
    const local: ViewerScene[] = import.meta.env.DEV ? (await import('../dev-examples.json')).default : []
    viewer.scenes = [...local, ...bundled.map(({ label, url }) => ({ label, url: viewerFileUrl(url) }))]
  })
  .catch(error => console.warn(error))
