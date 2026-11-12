// Ported from OpenUSD 26.11.1:
//  pxr/usd/usdUtils/testenv/TestUsdUtilsLocalizeExternalAssetDependencies_plugin.cpp,
//  pxr/usd/usdUtils/testenv/testUsdUtilsAssetLocalization.py,
//  pxr/usd/usdUtils/testenv/testUsdUtilsDependencies.py
// Copyright 2020, 2025, 2026 Pixar. Tomorrow Open Source Technology License
//  1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// The test plugin TestUsdUtilsLocalizeExternalAssetDependencies
// (pxr/usd/usdUtils/testenv/TestUsdUtilsLocalizeExternalAssetDependencies_plugin.cpp
// and its plugInfo.json, OpenUSD 26.11.1, copied unmodified into fixtures/),
// which testUsdUtilsDependencies and testUsdUtilsAssetLocalization register
// with Plug.Registry().RegisterPlugins. Its plugInfo.json is registered as
// is, with the build's @TEST_PLUG_INFO_*@ placeholders left empty; the
// format the plugin's library defines is defined here with
// SdfDefineFileFormat. The plugin reads the host file system, as its C++
// does.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DefineFileFormat, FileFormat, type Layer } from 'typescript-usd/sdf'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'
import { TfGetBaseName, TfGetPathName, TfNormPath, TfStringCatPaths, TfStringGetBeforeSuffix } from 'typescript-usd/tf'

const FIXTURES = path.join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures')

// glob(3) of `dir`/<one or more components>, where each '*' matches within a
// component and '**' is '*' (POSIX glob has no recursive wildcard), with
// ARCH_GLOB_MARK.
function glob(pattern: string): string[] {
  const components = pattern.split('/')
  let matches = [pattern.startsWith('/') ? '/' : '.']
  for (const component of components.filter(c => c !== '')) {
    const next: string[] = []
    const regExp = new RegExp(`^${component.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '[^/]*')}$`)
    for (const base of matches) {
      if (!component.includes('*')) {
        next.push(path.posix.join(base, component))
        continue
      }
      let names: string[] = []
      try { names = readdirSync(base).sort() } catch { /* not a directory */ }
      for (const name of names) {
        if (!name.startsWith('.') && regExp.test(name)) next.push(path.posix.join(base, name))
      }
    }
    matches = next
  }
  return matches.filter(match => existsSync(match))
    .map(match => statSync(match).isDirectory() ? `${match}/` : match)
}

// ExternalAssetFileFormat (TestUsdUtilsLocalizeExternalAssetDependencies_plugin.cpp:24-123):
// a simple file format which is used to test External Asset Dependencies.
class ExternalAssetFileFormat extends FileFormat {
  readonly formatId = 'testformat'
  readonly extensions = ['testformat']

  // Read (plugin.cpp:84-91): reads every file as an empty layer.
  read(_bytes: Uint8Array, layer: Layer, args: ReadonlyMap<string, string>): void {
    layer._setDataFromFileFormat(this.initData(args))
  }

  // Simple approach to generating a list of external asset dependencies.
  // Return path to all files which have the `.external` extension in the
  // same, child directory or the parent layer as this layer
  // (plugin.cpp:93-121).
  override getExternalAssetDependencies(layer: Layer): string[] {
    const layerDir = TfGetPathName(layer.resolvedPath)
    const parentDir = TfGetPathName(layerDir.slice(0, layerDir.length - 1))

    const results = new Set<string>()
    const files = [
      ...glob(TfStringCatPaths(parentDir, '*.external')),
      ...glob(TfStringCatPaths(layerDir, '*.external')),
      ...glob(TfStringCatPaths(layerDir, '**/*.external')),
    ]
    for (const file of files) results.add(TfNormPath(file))

    // this is a special testing case for external assets with a name the
    // same as the layer but without an extension. It is meant to exercise
    // downstream packaging of such files.
    const specialAssetName = TfStringCatPaths(layerDir,
      TfStringGetBeforeSuffix(TfGetBaseName(layer.resolvedPath)))
    if (existsSync(specialAssetName)) results.add(TfNormPath(specialAssetName))

    return [...results].sort()
  }
}

let registered = false

// Plug.Registry().RegisterPlugins(".../TestUsdUtilsLocalizeExternalAssetDependencies*/Resources/")
export function registerExternalAssetFileFormatPlugin(): void {
  if (registered) return
  registered = true
  const text = readFileSync(
    path.join(FIXTURES, 'TestUsdUtilsLocalizeExternalAssetDependencies_plugInfo.json'), 'utf8')
    .replace(/@TEST_PLUG_INFO_[A-Z_]+@/g, '')
  PlugRegistry.GetInstance().RegisterPlugins(JSON.parse(text) as PlugInfo)
  // TF_REGISTRY_FUNCTION(TfType) { SDF_DEFINE_FILE_FORMAT(...) } (plugin.cpp:62-65)
  DefineFileFormat('ExternalAssetFileFormat', ExternalAssetFileFormat)
}
