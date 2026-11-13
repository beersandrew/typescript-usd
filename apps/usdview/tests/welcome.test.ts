// @vitest-environment jsdom
// The default scene and the welcome note (src/welcome.ts): a web addition with no
// usdview counterpart, so these check the page's own rules, not USD behaviour.
// The tour page's parameters are the browser side of a side-by-side comparison's
// follower page, without ?follow= and viewer-only mode.
import { readFile } from 'node:fs/promises'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PrimSummary, ViewerRuntime } from '../src/contracts'
import { defineUsdViewer, type UsdViewerElement } from '../src/usd-viewer'
import { defaultSceneUrl, showsWelcome, tourCameraCandidates, tourFileInfo, tourPageUrl, tourSource, welcomePageUrl, tourAddress, smallScreen } from '../src/welcome'
import { readTourFileInfo } from '../src/tour-file-info'

const tick = async () => { for (let n = 0; n < 5; n++) await Promise.resolve() }
const tree: PrimSummary[] = [{ path: '/torus', name: 'torus', typeName: 'Xform', children: [] }]

describe('default scene', () => {
  it('is the bundled wireframe torus', async () => {
    expect(defaultSceneUrl).toBe('./assets/torus.usda')
    expect((await readFile(new URL('../public/' + defaultSceneUrl.slice(2), import.meta.url), 'utf8')).startsWith('#usda 1.0')).toBe(true)
  })
  it('shows the welcome note only on the default scene, not with ?scene=, ?follow= or ?viewerOnly=1', () => {
    expect(showsWelcome('')).toBe(true)
    expect(showsWelcome('?tour=/t.usda&camera=/cam')).toBe(true)
    expect(showsWelcome('?viewerOnly=0')).toBe(true)
    expect(showsWelcome('?scene=./assets/cube.usda')).toBe(false)
    expect(showsWelcome('?follow=ws://127.0.0.1:8765')).toBe(false)
    expect(showsWelcome('?viewerOnly=1')).toBe(false)
    // The tour page (?start=tour) shows the banner too, however the tour was configured:
    // by ?tour= or by the build (VITE_MUSEUM_TOUR_URL, no ?tour= on the page).
    expect(showsWelcome('?scene=/m.usda&play=1&tour=/m.usda&start=tour')).toBe(true)
    expect(showsWelcome('?scene=/m.usda&play=1&start=tour')).toBe(true)
    expect(showsWelcome('?scene=/m.usda&play=1')).toBe(false)
    expect(showsWelcome('?scene=/m.usda&follow=ws://x&start=tour')).toBe(false)
  })
})

describe('tour configuration', () => {
  it('takes ?tour= over the build configuration, and is absent when neither names one', () => {
    const env = { VITE_MUSEUM_TOUR_URL: '/museum/tour.usda', VITE_MUSEUM_TOUR_PLUGINS: '/museum/config/a/plugInfo.json, /museum/config/b/plugInfo.json' }
    expect(tourSource('', env)).toEqual({ url: '/museum/tour.usda', plugins: ['/museum/config/a/plugInfo.json', '/museum/config/b/plugInfo.json'] })
    expect(tourSource('?tour=https://h/t.usda&tourPlugin=https://h/p/plugInfo.json', env)).toEqual({ url: 'https://h/t.usda', plugins: ['https://h/p/plugInfo.json'] })
    expect(tourSource('', { VITE_MUSEUM_TOUR_URL: '/t.usda' })).toEqual({ url: '/t.usda', plugins: [] })
    expect(tourSource('', {})).toBeUndefined()
    expect(tourSource('?tour=', { VITE_MUSEUM_TOUR_URL: ' ' })).toBeUndefined()
  })

  it('reads the tour camera, load schedule and OpenExec from the root layer data, as the comparison tools do', () => {
    expect(tourCameraCandidates('museum')).toEqual(['/museum/cameras/tour_cam', '/museum/tour/tour_cam', '/Museum/Cameras/tour_cam', '/Wing/Cameras/tour_cam', '/Tour/Cameras/main_cam'])
    expect(tourCameraCandidates('')).toEqual(['/Museum/Cameras/tour_cam', '/Wing/Cameras/tour_cam', '/Tour/Cameras/main_cam'])
    const prims = new Set(['/museum/tour/tour_cam', '/Tour/Cameras/main_cam'])
    expect(tourFileInfo({ museum: { exec: 0 }, tourLoad: { carriers: {} } }, 'museum', p => prims.has(p)))
      .toEqual({ camera: '/museum/tour/tour_cam', loadSchedule: true, exec: false })
    expect(tourFileInfo({ museumRoute: { exec: true } }, '', p => prims.has(p))).toEqual({ camera: '/Tour/Cameras/main_cam', loadSchedule: false, exec: true })
    expect(tourFileInfo(undefined, 'x', () => false)).toEqual({ loadSchedule: false })
  })

  it('builds the tour page: camera at high complexity, schedule, OpenExec, alpha to coverage off, plugins, playing; no follow or viewer-only', () => {
    const page = 'http://127.0.0.1:5173/?tour=/museum/tour.usda#x'
    const tour = { url: '/museum/tour.usda', plugins: ['/museum/config/variantFallbacks/plugInfo.json'] }
    const url = new URL(tourPageUrl(page, tour, { camera: '/museum/tour/tour_cam', loadSchedule: true, exec: false }))
    expect(url.origin + url.pathname).toBe('http://127.0.0.1:5173/')
    expect(url.hash).toBe('')
    expect([...url.searchParams]).toEqual([
      ['scene', 'http://127.0.0.1:5173/museum/tour.usda'],
      ['camera', '/museum/tour/tour_cam'], ['complexity', 'high'],
      ['loadSchedule', '1'],
      ['env', 'TF_DEBUG=HDX_DISABLE_ALPHA_TO_COVERAGE'],
      ['plugin', 'http://127.0.0.1:5173/museum/config/variantFallbacks/plugInfo.json'],
      ['play', '1'],
      ['tour', '/museum/tour.usda'],
      ['start', 'tour'],
    ])
    const exec = new URL(tourPageUrl('https://example.org/viewer/index.html', { url: 'wing/tour.usda', plugins: [] }, { loadSchedule: false, exec: true }))
    expect(exec.searchParams.get('scene')).toBe('https://example.org/viewer/wing/tour.usda')
    expect(exec.searchParams.getAll('env')).toEqual(['USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1', 'TF_DEBUG=HDX_DISABLE_ALPHA_TO_COVERAGE'])
    for (const key of ['camera', 'complexity', 'loadSchedule', 'follow', 'viewerOnly', 'cameraMask']) expect(exec.searchParams.has(key)).toBe(false)
  })

  it('reads a tour root layer over HTTP', async () => {
    const layer = `#usda 1.0
(
    customLayerData = {
        dictionary museum = {
            bool exec = 0
        }
        dictionary tourLoad = {
            dictionary carriers = {
                int2 "/museum/hall" = (0, 10)
            }
        }
    }
    defaultPrim = "museum"
)
def Xform "museum"
{
    def Xform "tour"
    {
        def Camera "tour_cam"
        {
        }
    }
}
`
    const fetchAsset: typeof fetch = async input => String(input) === 'https://tour.example/museum/tour.usda' ? new Response(layer) : new Response('', { status: 404 })
    expect(await readTourFileInfo('https://tour.example/museum/tour.usda', fetchAsset)).toEqual({ camera: '/museum/tour/tour_cam', loadSchedule: true, exec: false })
  })
})

describe('welcome note', () => {
  beforeAll(() => {
    defineUsdViewer()
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  })
  afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })
  function setup() {
    const runtime: ViewerRuntime = { open: vi.fn().mockResolvedValue(tree), openFile: vi.fn().mockResolvedValue(tree), select: vi.fn(() => ({ path: null, properties: [] })), frameSelection: vi.fn(), resize: vi.fn(), dispose: vi.fn() }
    const viewer = document.createElement('usd-viewer') as UsdViewerElement
    viewer.runtimeFactory = vi.fn(async () => runtime)
    viewer.src = defaultSceneUrl
    document.body.append(viewer)
    const root = viewer.shadowRoot!
    return { viewer, runtime, note: root.querySelector<HTMLElement>('.welcome')!, button: root.querySelector<HTMLButtonElement>('.start-tour')!, root }
  }

  it('is hidden unless shown, and offers the tour only when one is configured', async () => {
    const { viewer, note, button } = setup()
    await tick()
    expect(note.hidden).toBe(true)
    viewer.showWelcome()
    expect(note.hidden).toBe(false)
    expect(note.textContent).toContain('Drop a USD file (.usd, .usda, .usdc, .usdz), or its folder if it references other files, anywhere on this window')
    expect(button.hidden).toBe(true)
    const startTour = vi.fn()
    viewer.showWelcome({ startTour })
    expect(button.hidden).toBe(false)
    button.click()
    await tick()
    expect(startTour).toHaveBeenCalledTimes(1)
  })

  it('reports a tour that fails to start in the status bar', async () => {
    const { viewer, button, root } = setup()
    await tick()
    viewer.showWelcome({ startTour: async () => { throw new Error('Could not open the tour: /museum/tour.usda') } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    button.click()
    await tick(); await tick()
    expect(root.querySelector('.status')!.textContent).toBe('Could not open the tour: /museum/tour.usda')
    expect(button.disabled).toBe(false)
  })

  it('plays once the scene being opened is ready (?play=1, the tour page)', async () => {
    const opened: {resolve?: (tree: PrimSummary[]) => void} = {}
    let state = { start: 0, end: 100, current: 0, framesPerSecond: 24, timeCodesPerSecond: 24 }
    const runtime: ViewerRuntime = { open: vi.fn(() => new Promise<PrimSummary[]>(resolve => { opened.resolve = resolve })), select: vi.fn(() => ({ path: null, properties: [] })), frameSelection: vi.fn(), resize: vi.fn(), dispose: vi.fn(),
      setPlaybackActive: vi.fn(), getTimeState: () => state, setTime: vi.fn(async (time: number) => { state = { ...state, current: time }; return state }) }
    const viewer = document.createElement('usd-viewer') as UsdViewerElement
    viewer.runtimeFactory = vi.fn(async () => runtime)
    viewer.src = '/museum/tour.usda'
    viewer.play()
    document.body.append(viewer)
    await tick()
    expect(runtime.setPlaybackActive).not.toHaveBeenCalledWith(true)
    opened.resolve!(tree)
    await tick()
    expect(runtime.setPlaybackActive).toHaveBeenCalledWith(true)
    expect(viewer.shadowRoot!.querySelector('.playback-current button')!.textContent).toBe('Stop')
    viewer.remove()
  })

  it('stays over the default scene and is dismissed once a file or another scene is opened', async () => {
    const { viewer, runtime, note, root } = setup()
    viewer.showWelcome({ startTour: () => {} })
    await tick()
    expect(runtime.open).toHaveBeenCalledWith(defaultSceneUrl, expect.any(AbortSignal))
    expect(note.hidden).toBe(false)
    const input = root.querySelector<HTMLInputElement>('.local-file')!
    const file = new File(['#usda 1.0'], 'dropped.usdz')
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
    expect(runtime.openFile).toHaveBeenCalledWith(file, expect.any(AbortSignal))
    expect(note.hidden).toBe(true)
    expect(viewer.welcomeShown).toBe(false)

    viewer.showWelcome()
    viewer.src = './assets/cube.usda'
    await tick()
    expect(note.hidden).toBe(true)
  })
})

describe('File > Close Stage', () => {
  it('returns to the welcome page with the same tour configuration', () => {
    const tourPage = new URL(tourPageUrl('http://127.0.0.1:8765/viewer/?tour=/museum/museum.usda&tourPlugin=/kit/a/plugInfo.json&tourPlugin=/kit/b/plugInfo.json',
      { url: '/museum/museum.usda', plugins: ['/kit/a/plugInfo.json', '/kit/b/plugInfo.json'] }, { loadSchedule: true }))
    expect(tourPage.searchParams.get('tour')).toBe('/museum/museum.usda')
    const home = new URL(welcomePageUrl(tourPage))
    expect(home.pathname).toBe('/viewer/')
    expect([...home.searchParams.keys()]).toEqual(['tour', 'tourPlugin', 'tourPlugin', 'empty'])
    expect(home.searchParams.getAll('tourPlugin')).toEqual(['/kit/a/plugInfo.json', '/kit/b/plugInfo.json'])
    expect(showsWelcome(home.search)).toBe(true)
    expect(welcomePageUrl('https://example.org/viewer/?scene=/x.usda&play=1#f')).toBe('https://example.org/viewer/?empty=1')
  })
})


describe('the tour page address', () => {
  it('goes back to the page the tour opened from, keeping only the tour configuration', () => {
    const page = tourPageUrl('https://andrew.beer/s/usdview/', { url: '../usd-museum/tour.usda', plugins: ['../usd-museum/config/variantFallbacks/plugInfo.json'] }, { camera: '/museum/tour/tour_cam', loadSchedule: true })
    expect(tourAddress(page)).toBe('https://andrew.beer/s/usdview/')
    const local = tourPageUrl('http://127.0.0.1:8765/viewer/?tour=/museum/museum.usda', { url: '/museum/museum.usda', plugins: [] }, { loadSchedule: true })
    expect(tourAddress(local)).toBe('http://127.0.0.1:8765/viewer/?tour=%2Fmuseum%2Fmuseum.usda')
    expect(tourAddress('https://andrew.beer/s/usdview/?scene=/x.usda')).toBeNull()
  })
})

describe('phone-sized screens', () => {
  it('counts a narrow screen, or a touch screen of tablet width or less', () => {
    const screen = (width: number, touch: boolean) => (query: string) =>
      query === '(max-width: 700px)' ? width <= 700 : query === '(pointer: coarse) and (max-width: 1024px)' ? touch && width <= 1024 : false
    expect(smallScreen(screen(390, true))).toBe(true)
    expect(smallScreen(screen(820, true))).toBe(true)
    expect(smallScreen(screen(650, false))).toBe(true)
    expect(smallScreen(screen(1280, true))).toBe(false)
    expect(smallScreen(screen(1440, false))).toBe(false)
  })
})
