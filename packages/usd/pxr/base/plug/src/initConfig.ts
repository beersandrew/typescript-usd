// Ported from OpenUSD 26.11.1: pxr/base/plug/initConfig.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Ported from OpenUSD 26.11.1 pxr/base/plug/initConfig.cpp: the plugin search
// paths (Plug_InitConfig) and the name of the environment variable that holds
// them. The variable is read where the host has an environment (Node); a
// browser page has none, so it registers plugins explicitly
// (PlugRegistry.RegisterPluginsAsync).
let pluginPathName = 'PXR_PLUGINPATH_NAME'

export function Plug_SetPluginPathName(name: string): void {
  pluginPathName = name
}

export function Plug_GetPluginPathName(): string {
  return pluginPathName
}

/** The process environment, where the host has one (Node). */
function environment(): Record<string, string | undefined> | undefined {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
}

/** The variable's value read as TfGetenvBool reads it (getenv.cpp:47-54). */
export function Plug_GetenvBool(name: string): boolean {
  return /^(?:1|true|yes|on)$/i.test(environment()?.[name] ?? '')
}

/**
 * The plugin search paths of Plug_InitConfig (initConfig.cpp:64-122): the
 * environment locations, PXR_PLUGINPATH_NAME split on ':' (ARCH_PATH_LIST_SEP;
 * empty entries skipped), each relative path anchored to the directory of
 * this library (`libraryDirectory`, upstream the Plug shared library's
 * directory, _AppendPathList initConfig.cpp:33-62), keeping a trailing '/'.
 * The build and install fallback locations (initConfig.cpp:107-116) have no
 * analog: this build's own plugins register when their modules load.
 */
export function Plug_GetPaths(libraryDirectory: string): string[] {
  const value = environment()?.[pluginPathName] ?? ''
  const result: string[] = []
  for (const path of value.split(':')) {
    if (path === '') continue
    if (path.startsWith('/')) { result.push(path); continue }
    const joined = `${libraryDirectory.replace(/\/+$/, '')}/${path}`
    result.push(normalizePath(joined) + (path.endsWith('/') ? '/' : ''))
  }
  return result
}

// TfStringCatPaths / ArchNormPath for absolute POSIX paths: '.' and '..'
// segments resolved, repeated and trailing '/' removed.
function normalizePath(path: string): string {
  const parts: string[] = []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return '/' + parts.join('/')
}
