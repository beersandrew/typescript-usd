// Registers the Stagehand schema plugin (resources/) with PlugRegistry, as
// PlugRegistry::RegisterPlugins does for a plugin folder. Node only (reads the
// files); a browser build passes the same JSON and schema text.

import { readFileSync } from 'node:fs'
import { Registry as PlugRegistry, type Info as PlugInfo } from 'typescript-usd/plug'

let _registered = false

export function registerStagehandPlugin(): void {
  if (_registered) return
  _registered = true
  const resources = new URL('./resources/', import.meta.url)
  const plugInfo = JSON.parse(readFileSync(new URL('plugInfo.json', resources), 'utf8')) as PlugInfo
  PlugRegistry.GetInstance().RegisterPlugins(plugInfo, {
    stagehand: { 'generatedSchema.usda': readFileSync(new URL('generatedSchema.usda', resources), 'utf8') },
  })
}
