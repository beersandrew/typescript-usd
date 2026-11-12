// Ported from OpenUSD 26.11.1: pxr/usd/usd/codegenTemplates/schemaClass.h
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// Checks that a schema library's exported classes carry the members
// usdGenSchema generates for them (pxr/usd/usd/codegenTemplates/schemaClass.h
// and schemaClass.cpp): Get/Create<Name>Attr for every schema attribute, and
// Apply/CanApply exactly for applied API schemas. The classes and their
// schema kinds come from the library's plugin/plugInfo.json, upstream's file
// verbatim.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { APISchemaBase, SchemaBase } from 'typescript-usd/usd'

interface PlugType { schemaKind?: string, bases?: string[] }
type SchemaClass = typeof SchemaBase & {
  typeName: string
  getSchemaAttributeNames(includeInherited?: boolean): string[]
  apply?: unknown
  canApply?: unknown
}

// _ProperCase (usdGenSchema.py:261).
function properCase(s: string): string {
  return s.split(/[^A-Za-z0-9_]+/).filter(p => p.length > 0).map(p => p[0]!.toUpperCase() + p.slice(1)).join('')
}

/**
 * @param library the library name, e.g. 'usdShade'.
 * @param plugInfoUrl the library's plugin/plugInfo.json.
 * @param module the library's package entry.
 * @param apiNames the schema.usda apiName overrides, attribute name -> apiName.
 */
export function describeGeneratedSchemaMembers(
  library: string, plugInfoUrl: URL, module: Record<string, unknown>,
  apiNames: Record<string, string> = {},
): void {
  const text = readFileSync(plugInfoUrl, 'utf8').split('\n').filter(l => !l.trimStart().startsWith('#')).join('\n')
  const types = JSON.parse(text).Plugins[0].Info.Types as Record<string, PlugType>
  const prefix = library[0]!.toUpperCase() + library.slice(1)
  const schemaTypes = Object.entries(types).filter(([, t]) => t.schemaKind !== undefined)
  const classes = schemaTypes.map(([cppName, t]): [string, string, SchemaClass] =>
    [cppName.slice(prefix.length), t.schemaKind!, module[cppName.slice(prefix.length)] as SchemaClass])

  describe(`${library} generated schema members`, () => {
    it.each(classes)('%s (%s) is exported, with the upstream base', (name, kind, cls) => {
      expect(typeof cls, name).toBe('function')
      // UsdSchemaBase, listed in usd's plugInfo.json, is the root itself.
      if (cls !== SchemaBase) expect(cls.prototype).toBeInstanceOf(kind.endsWith('API') ? APISchemaBase : SchemaBase)
    })

    it.each(classes)('%s (%s) has Get/Create<Name>Attr for each schema attribute', (_name, _kind, cls) => {
      const proto = cls.prototype as unknown as Record<string, unknown>
      for (const attr of cls.getSchemaAttributeNames(false)) {
        // A multiple-apply template property's apiName defaults to its
        // schema.usda name, the part after the instance name (py:370-371).
        const base = apiNames[attr] ?? attr.replace(/^.*__INSTANCE_NAME__:?/, '')
        const proper = properCase(base)
        expect(typeof proto[`get${proper}Attr`], attr).toBe('function')
        expect(typeof proto[`create${proper}Attr`], attr).toBe('function')
      }
    })

    it.each(classes)('%s (%s) has Apply/CanApply exactly when applied', (_name, kind, cls) => {
      const applied = kind === 'singleApplyAPI' || kind === 'multipleApplyAPI'
      if (applied) {
        expect(typeof cls.apply).toBe('function')
        expect(typeof cls.canApply).toBe('function')
      } else {
        // Only Function.prototype.apply: no generated static Apply.
        expect(cls.apply).toBe(Function.prototype.apply)
        expect('canApply' in cls).toBe(false)
      }
    })
  })
}
