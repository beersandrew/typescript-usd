// Ported from OpenUSD 26.11.1: pxr/exec/exec/pluginData.cpp,
//  pxr/usdImaging/usdImagingGL/engine.cpp
// Copyright 2016, 2025 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The viewer's switch for UsdImagingGLEngine's exec scene index
// (USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX, usdImagingGL/engine.cpp:100-105,
// default off). usdview and usdrecord read it from the environment; the page
// takes it from the URL as `env=USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX=1`
// and puts it where TfGetEnvSetting reads the environment (process.env).
//
// When it is on, the viewer imports the OpenExec plugins upstream discovers
// on the plugin path (usdExecImaging, execIr, execGeom) and loads their
// libraries before the first engine compiles a request. execGeom is a library
// plugin imported by URL (base/plug/src/plugin.ts); a bundled build cannot
// follow that URL, so its library is imported through its package entry.
// FAITHFULNESS-DEBT(openexec-plugin-load): upstream loads Exec plugins lazily
// and synchronously (exec/pluginData.cpp:42-52).

export const execSceneIndexSetting = 'USDIMAGINGGL_ENGINE_ENABLE_EXEC_SCENE_INDEX'

/** NAME=VALUE pairs of the page's `env` parameters. */
export function envParameters(search: string | URLSearchParams): Record<string, string> {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const env: Record<string, string> = {}
  for (const item of params.getAll('env')) {
    const at = item.indexOf('=')
    if (at > 0) env[item.slice(0, at)] = item.slice(at + 1)
  }
  return env
}

/** Copies the page's env parameters into the environment TfGetEnvSetting reads. */
// The environment is reached by bracket access: Vite's build replaces the
// expression `process.env` with a constant.
type Environment = Record<string, string | undefined>
export function environment(): Environment {
  const g = globalThis as Record<string, unknown>
  const proc = (g['process'] ??= {}) as Record<string, unknown>
  return (proc['env'] ??= {}) as Environment
}

export function applyEnvParameters(env: Record<string, string>): void {
  Object.assign(environment(), env)
}

/** TfGetEnvSetting's boolean reading (base/tf/src/envSetting.ts). */
function enabled(): boolean {
  const value = environment()[execSceneIndexSetting]
  return value !== undefined && /^(?:1|true|yes|on)$/i.test(value)
}

let prepared: Promise<void> | undefined

/** Registers and loads the OpenExec plugins when the exec scene index is on. */
export function prepareExecSceneIndex(): Promise<void> {
  if (!enabled()) return Promise.resolve()
  return prepared ??= (async () => {
    const [{ Registry: PlugRegistry }, , , , { _interim_ExecLoadPluginsAsync }] = await Promise.all([
      import('typescript-usd/plug'), import('typescript-usd/usdExecImaging'), import('typescript-usd/execIr'),
      import('typescript-usd/execGeom'), import('typescript-usd/exec/_internal')])
    const registry = PlugRegistry.GetInstance()
    const execGeomLibrary = registry.GetPluginWithName('execGeom')?.getPath()
    const importer = registry._moduleImporter ?? ((url: string) => import(/* @vite-ignore */ url))
    registry._moduleImporter = url => url === execGeomLibrary ? import('typescript-usd/execGeom/xformable') : importer(url)
    if (!await _interim_ExecLoadPluginsAsync()) throw new Error('OpenExec plugins failed to load')
  })().catch(error => { prepared = undefined; throw error })
}
