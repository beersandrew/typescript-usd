// Ported from OpenUSD 26.11.1: pxr/base/plug/info.cpp
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The host files plugin discovery reads (Plug_ReadPlugInfo, info.cpp:130-186,
// 716-764): on a host with a filesystem (Node), the plugInfo documents on the
// plugin search path. A browser page has no files to search; it registers
// plugins with PlugRegistry.RegisterPluginsAsync. Loaded the way
// ar/platformFilesystem.ts loads the host filesystem, so a browser build
// imports nothing.

export interface PlugHostFiles {
  /** The directory of this library, which relative search paths are anchored
   *  to (upstream the Plug shared library's directory, initConfig.cpp:64-93). */
  readonly libraryDirectory: string
  /** The file's text, or undefined when it cannot be opened (info.cpp:147-151). */
  readText(path: string): string | undefined
  /** TfIsDir(path, resolveSymlinks=true). */
  isDirectory(path: string): boolean
  pathToUrl(path: string): string
  urlToPath(url: string): string
}

let hostFiles: PlugHostFiles | undefined

if (typeof process !== 'undefined' && process.versions?.node) {
  const fsSpecifier = ['node', 'fs'].join(':')
  const urlSpecifier = ['node', 'url'].join(':')
  const [fs, url] = await Promise.all([
    import(/* @vite-ignore */ fsSpecifier),
    import(/* @vite-ignore */ urlSpecifier),
  ]) as unknown as [
    { readFileSync(path: string, encoding: 'utf8'): string, statSync(path: string): { isDirectory(): boolean } },
    { pathToFileURL(path: string): URL, fileURLToPath(url: string | URL): string },
  ]
  hostFiles = {
    // The directory of this module's file (a bundle's, once bundled); '/' when
    // the module was not loaded from a file.
    libraryDirectory: libraryDirectory(url.fileURLToPath),
    readText: path => { try { return fs.readFileSync(path, 'utf8') } catch { return undefined } },
    isDirectory: path => { try { return fs.statSync(path).isDirectory() } catch { return false } },
    pathToUrl: path => url.pathToFileURL(path).href,
    urlToPath: href => url.fileURLToPath(href),
  }
}

function libraryDirectory(fileURLToPath: (url: string) => string): string {
  try { return fileURLToPath(String(import.meta.url)).replace(/\/[^/]*$/, '') || '/' } catch { return '/' }
}

/** The host's files, or undefined in a browser. */
export function Plug_HostFiles(): PlugHostFiles | undefined {
  return hostFiles
}
