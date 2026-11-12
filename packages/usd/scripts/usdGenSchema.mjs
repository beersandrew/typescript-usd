// Ported from OpenUSD 26.11.1: pxr/usd/usd/usdGenSchema.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to JavaScript and modified. See LICENSE and NOTICE.

// Runs this repository's usdGenSchema port (pxr/usd/usd/src/usdGenSchema.ts
// and usdGenSchemaCodegen.ts) over OpenUSD 26.11.1 schema libraries, the way
// upstream's build runs pxr/usd/usd/usdGenSchema.py over each schema.usda:
//
//   node scripts/usdGenSchema.mjs [--check] [--openusd <dir>] <library...>
//   node scripts/usdGenSchema.mjs [--check] [--openusd <dir>] --all
//
// --all runs every schema library this repository generates: each
// pxr/<group>/<lib> with a plugin/generatedSchema.usda.
//
// For each library (e.g. usdLux) it reads pxr/<group>/<lib>/schema.usda (and
// userDoc/schemaUserDoc.usda when present) from the OpenUSD checkout, and
//   * requires the generated generatedSchema.usda to be byte-identical to
//     upstream's checked-in generatedSchema.usda, and every generated plugInfo
//     Types entry to equal upstream's plugInfo.json entry;
//   * writes pxr/<group>/<lib>/plugin/{generatedSchema.usda,plugInfo.json}
//     (plugInfo.json is upstream's file, which keeps hand-maintained entries
//     usdGenSchema does not generate), src/plugin/plugData.ts embedding both,
//     src/tokens.ts, and one module per schema class, keeping each module's
//     custom code after the "// --(BEGIN CUSTOM CODE)--" marker.
// <group> is usd for the pxr/usd schema libraries and exec for OpenExec's
// (pxr/exec/execIr): the group whose upstream directory holds <lib>/schema.usda.
// Sublayer asset paths (@usd/schema.usda@) resolve against upstream pxr/usd,
// as upstream's build resolves them against the installed lib/usd resources.
// --check writes nothing and exits nonzero when any output would change.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const check = argv.includes('--check')
const sourceFlag = argv.indexOf('--openusd')
const openusd = path.resolve(sourceFlag >= 0 ? argv[sourceFlag + 1]
  : process.env.OPENUSD_SOURCE ?? path.join(root, '..', '..', '..', 'OpenUSD-26.11.1'))
const allLibs = () => ['usd', 'exec'].flatMap(group =>
  readdirSync(path.join(root, 'pxr', group), { withFileTypes: true })
    .filter(d => d.isDirectory()
      && existsSync(path.join(root, 'pxr', group, d.name, 'plugin', 'generatedSchema.usda')))
    .map(d => d.name)).sort()
const libs = argv.includes('--all') ? allLibs()
  : argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--openusd')
if (libs.length === 0) {
  console.error('usage: node scripts/usdGenSchema.mjs [--check] [--openusd <dir>] (<library...> | --all)')
  process.exit(2)
}

if (!existsSync(path.join(openusd, 'pxr', 'usd', 'usd', 'schema.usda'))) {
  console.error(`usdGenSchema: no OpenUSD 26.11.1 source at ${openusd}; set OPENUSD_SOURCE or pass --openusd <dir>`)
  process.exit(2)
}

const server = await createServer({
  configFile: false, root, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] },
})
let stale = 0
try {
  const { usdGenSchema } = await server.ssrLoadModule('typescript-usd/usd')
  const { usdGenSchemaCode, withCustomCode } = await server.ssrLoadModule('typescript-usd/usd/_internal')
  const { Registry: PlugRegistry } = await server.ssrLoadModule('typescript-usd/plug')
  const upstreamUsd = path.join(openusd, 'pxr', 'usd')
  const readUpstream = rel => readFileSync(path.join(upstreamUsd, rel), 'utf8')
  const groupOf = lib => ['usd', 'exec'].find(group =>
    existsSync(path.join(openusd, 'pxr', group, lib, 'schema.usda'))) ?? 'usd'
  const stripComments = text => text.split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n')

  for (const lib of libs) {
    const group = groupOf(lib)
    const upstreamLib = path.join(openusd, 'pxr', group, lib)
    const readUpstreamLib = rel => readFileSync(path.join(upstreamLib, rel), 'utf8')
    const userDocPath = path.join(upstreamLib, 'userDoc', 'schemaUserDoc.usda')
    const upstreamPlugInfoText = readUpstreamLib('plugInfo.json')
    const upstreamPlugInfo = JSON.parse(stripComments(upstreamPlugInfoText))
    // usdGenSchema.py runs with the library's plugin discoverable, so the
    // SdfMetadata fields its plugInfo.json declares (execIr's irRole,
    // irIsInvertible) are known when the schema is read. Registering a plugin
    // name that is already registered is a no-op.
    PlugRegistry.GetInstance().RegisterPlugins(upstreamPlugInfo)
    const result = await usdGenSchema(readUpstreamLib('schema.usda'), {
      resolveAsset: async p => readUpstream(p),
      ...(existsSync(userDocPath) ? { userDocSchemaUsda: readFileSync(userDocPath, 'utf8') } : {}),
    })
    const upstreamSchema = readUpstreamLib('generatedSchema.usda')
    if (result.generatedSchemaUsda !== upstreamSchema) {
      throw new Error(`${lib}: generated generatedSchema.usda differs from upstream's`)
    }
    const upstreamTypes = upstreamPlugInfo.Plugins[0].Info.Types
    for (const [name, entry] of Object.entries(result.plugInfo.Plugins[0].Info.Types)) {
      if (JSON.stringify(sortKeys(entry)) !== JSON.stringify(sortKeys(upstreamTypes[name]))) {
        throw new Error(`${lib}: generated plugInfo type ${name} differs from upstream's`)
      }
    }

    const libDir = path.join(root, 'pxr', group, lib)
    const outputs = new Map()
    outputs.set('plugin/generatedSchema.usda', result.generatedSchemaUsda)
    outputs.set('plugin/plugInfo.json', upstreamPlugInfoText)
    outputs.set('src/plugin/plugData.ts',
      licenceHeader([`pxr/${group}/${lib}/plugInfo.json`, `pxr/${group}/${lib}/schema.usda`,
        `pxr/${group}/${lib}/generatedSchema.usda`], 'Copyright 2016 Pixar')
      + `// OpenUSD 26.11.1 ${lib} plugin/schema artifacts, as in ../../plugin/:\n`
      + `// plugInfo.json verbatim from pxr/${group}/${lib}/plugInfo.json, and the\n`
      + `// generatedSchema.usda scripts/usdGenSchema.mjs generates from\n`
      + `// pxr/${group}/${lib}/schema.usda, byte-identical to upstream's. Generated; do not edit.\n`
      + `import type {Info as PlugInfo} from 'typescript-usd/plug'\n`
      + `export const plugInfo:PlugInfo = ${JSON.stringify(upstreamPlugInfo, null, 2)}\n`
      + `export const generatedSchemaUsda = ${JSON.stringify(result.generatedSchemaUsda)}\n`)
    const header = what => {
      // what names the upstream generated sources: "... (pxr/<group>/<lib>/<file>.{h,cpp})"
      const base = /\((pxr\/[^)]+)\.\{h,cpp\}\)/.exec(what)?.[1]
      const sources = base ? [`${base}.h`, `${base}.cpp`, `pxr/${group}/${lib}/schema.usda`]
        : [`pxr/${group}/${lib}/schema.usda`]
      return licenceHeader(sources, base ? upstreamCopyright(`${base}.h`) : 'Copyright 2016 Pixar')
        + headerBody(what)
    }
    const headerBody = what =>
      `// Generated by usdGenSchema (scripts/usdGenSchema.mjs) from OpenUSD v26.11.1\n`
      + `// pxr/${group}/${lib}/schema.usda: ${what}.\n`
      + `// Edits above the custom-code marker are overwritten on regeneration.\n`
    for (const [file, text] of usdGenSchemaCode(result._codegen, header)) {
      const full = path.join(libDir, 'src', file)
      const existing = existsSync(full) ? readFileSync(full, 'utf8') : undefined
      outputs.set(`src/${file}`, file === 'tokens.ts' ? text : withCustomCode(text, existing))
    }

    for (const [rel, text] of outputs) {
      const full = path.join(libDir, rel)
      const current = existsSync(full) ? readFileSync(full, 'utf8') : undefined
      if (current === text) continue
      if (check) {
        console.error(`stale: pxr/${group}/${lib}/${rel}`)
        stale++
        continue
      }
      mkdirSync(path.dirname(full), { recursive: true })
      writeFileSync(full, text)
      console.log(`wrote pxr/${group}/${lib}/${rel}`)
    }
    console.log(`${lib}: generatedSchema.usda byte-identical to upstream; ${result._codegen.classes.length} classes`)
  }
} finally {
  await server.close()
}
if (stale > 0) process.exit(1)

// The upstream copyright/licence header every generated module starts with
// (the same form as the ported sources' headers).
function licenceHeader(sources, copyright) {
  const lines = []
  let cur = '// Ported from OpenUSD 26.11.1:'
  sources.forEach((src, i) => {
    const piece = src + (i < sources.length - 1 ? ',' : '')
    if (cur.length + 1 + piece.length > 79) { lines.push(cur); cur = '//  ' + piece } else cur += ' ' + piece
  })
  lines.push(cur)
  lines.push(`// ${copyright}. Tomorrow Open Source Technology License 1.0.`)
  lines.push('// Translated to TypeScript and modified. See LICENSE and NOTICE.')
  return lines.join('\n') + '\n\n'
}

function upstreamCopyright(rel) {
  const file = path.join(openusd, rel)
  const match = existsSync(file) && /Copyright \d{4} [^\n]+/.exec(readFileSync(file, 'utf8').slice(0, 2000))
  return match ? match[0].trim() : 'Copyright 2016 Pixar'
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortKeys(value[k])]))
  }
  return value
}
