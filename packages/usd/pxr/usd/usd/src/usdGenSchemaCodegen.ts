// Ported from OpenUSD 26.11.1: pxr/usd/usd/codegenTemplates/schemaClass.cpp,
//  pxr/usd/usd/codegenTemplates/schemaClass.h, pxr/usd/usd/tokens.h,
//  pxr/usd/usd/usdGenSchema.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdGenSchema code generation — the TypeScript counterpart of
// pxr/usd/usd/usdGenSchema.py GenerateCode (py:1365-1520) and its Jinja
// templates in pxr/usd/usd/codegenTemplates/ (schemaClass.h/.cpp,
// tokens.h/.cpp). Upstream renders C++ headers, sources and Python wrappers;
// this renders one TypeScript module per schema class plus tokens.ts, with
// the members the templates generate:
//
//   * Get / Define / GetAll, CanApply / Apply, IsSchemaPropertyBaseName,
//     Is<Schema>Path (schemaClass.cpp:43-190),
//   * Get<Name>Attr / Create<Name>Attr and Get<Name>Rel / Create<Name>Rel
//     for every property with a non-empty apiName (schemaClass.cpp:222-300),
//   * GetSchemaAttributeNames (schemaClass.cpp:302-354),
//   * reflected API schema accessors (schemaClass.cpp:356-410).
//
// Custom code: like _ExtractCustomCode (py:1086-1105), everything after the
// "// --(BEGIN CUSTOM CODE)--" marker of an existing module is kept. The
// marker sits inside the class body, as in the generated header, so custom
// members belong to the class and the class's closing brace is part of the
// custom section; module-level custom code follows it.

import type { ClassInfo, AttrTokenInfo, RelTokenInfo, UsdGenSchemaCodegenInput } from './usdGenSchema.ts'

// Generated modules import other libraries through the package entries.
const PACKAGE = 'typescript-usd'

export const CUSTOM_CODE_MARKER = '// --(BEGIN CUSTOM CODE)--'
const DEFAULT_CUSTOM_CODE = `  ${CUSTOM_CODE_MARKER}\n}\n`

// _ProperCase (py:261).
function properCase(s: string): string {
  if (s.length > 1) {
    return s.split(/[^A-Za-z0-9_]+/).filter(p => p.length > 0)
      .map(p => p[0]!.toUpperCase() + p.slice(1)).join('')
  }
  return s.toUpperCase()
}

function camelCase(s: string): string {
  const p = properCase(s)
  return p.length > 1 ? p[0]!.toLowerCase() + p.slice(1) : p.toLowerCase()
}

// _SanitizeDoc (py:121-130), as a JSDoc block at the given indent.
function docComment(doc: string, indent: string): string {
  if (doc.trim() === '') return ''
  const lines = doc.split('\n').map(l => l.trimStart().replace(/\*\//g, '*\\/'))
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  while (lines.length > 0 && lines[0] === '') lines.shift()
  return `${indent}/**\n${lines.map(l => (l === '' ? `${indent} *` : `${indent} * ${l}`)).join('\n')}\n${indent} */\n`
}

/** The TypeScript export name of a schema class: its className without the
 *  library prefix (the C++ name is libraryPrefix + className). */
export function tsClassName(cls: Pick<ClassInfo, 'className'>): string {
  return cls.className
}

/** tokens.ts: the TfStaticData token struct of tokens.h/tokens.cpp. */
export function renderTokens(input: UsdGenSchemaCodegenInput, header: string): string {
  const lines = input.tokens.map(t => `  ${t.id}: ${JSON.stringify(t.value)},`)
  return `${header}export const ${input.libPrefix}Tokens = Object.freeze({\n${lines.join('\n')}\n})\n`
}

interface RenderContext {
  input: UsdGenSchemaCodegenInput
  header: (cls: ClassInfo) => string
}

function lookupClass(input: UsdGenSchemaCodegenInput, name: string): ClassInfo | undefined {
  return input.classes.find(c => c.usdPrimTypeName === name) ?? input.reflectedClasses.get(name)
}

function attrMembers(cls: ClassInfo, tokens: string, attr: AttrTokenInfo): string {
  const proper = properCase(attr.apiName)
  const multi = cls.isMultipleApply && cls.propertyNamespacePrefix !== null
  const nameExpr = multi
    ? `_namespacedPropertyName(this._name, ${tokens}.${attr.tokenId})`
    : `${tokens}.${attr.tokenId}`
  let out = docComment(attr.doc, '  ')
  if (attr.apiGet !== 'custom') {
    out += `  get${proper}Attr(): Attribute {\n    return this.prim.getAttr(${nameExpr})!\n  }\n`
  }
  out += `  create${proper}Attr(defaultValue?: unknown, writeSparsely = false): Attribute {\n`
    + `    return this._createAttr(${nameExpr}, ${JSON.stringify(attr.typeName)}, ${attr.custom}, `
    + `${JSON.stringify(attr.variability)}, defaultValue, writeSparsely)\n  }\n`
  return out
}

function relMembers(cls: ClassInfo, tokens: string, rel: RelTokenInfo): string {
  const proper = properCase(rel.apiName)
  const multi = cls.isMultipleApply && cls.propertyNamespacePrefix !== null
  const nameExpr = multi
    ? `_namespacedPropertyName(this._name, ${tokens}.${rel.tokenId})`
    : `${tokens}.${rel.tokenId}`
  let out = docComment(rel.doc, '  ')
  if (rel.apiGet !== 'custom') {
    out += `  get${proper}Rel(): Rel {\n    return this.prim.rel(${nameExpr})\n  }\n`
  }
  out += `  create${proper}Rel(): Rel {\n    return this.prim.createRelationship(${nameExpr}, ${rel.custom})\n  }\n`
  return out
}

/** One schema class module (schemaClass.h + schemaClass.cpp). Returns the
 *  generated part, ending at the custom-code marker line exclusive. */
export function renderClass(ctx: RenderContext, cls: ClassInfo): string {
  const { input } = ctx
  const name = tsClassName(cls)
  const tokens = `${input.libPrefix}Tokens`
  const isAPISchemaBase = cls.cppClassName === 'UsdAPISchemaBase'
  const multi = cls.isMultipleApply
  const multiNs = multi && cls.propertyNamespacePrefix !== null

  // Imports. The core usd library's own classes (UsdTyped, UsdModelAPI,
  // ...) import the usd modules directly rather than through the package
  // entry they are part of; their root parent is UsdSchemaBase, which
  // schema.usda does not define (py:157-158, py:565-569).
  const inUsd = input.libName === 'usd'
  const usdImports = new Set<string>(['type Attribute', 'type Prim', 'type Stage'])
  const imports: string[] = []
  const parentName = cls.parentClassName === '' ? 'SchemaBase' : cls.parentClassName
  if (cls.parentClassName === '') {
    usdImports.add('SchemaBase')
  } else if (cls.parentLibName === input.libName) {
    const parent = input.classes.find(c => c.className === cls.parentClassName)!
    imports.push(`import { ${parent.className} } from './${parent.baseFileName}.ts'`)
  } else if (cls.parentLibName === 'usd') {
    usdImports.add(cls.parentClassName)
  } else {
    imports.push(`import { ${cls.parentClassName} } from '${PACKAGE}/${cls.parentLibName}'`)
  }
  // Reflected schemas must be single-apply (py:1436-1444).
  const reflected = cls.reflectedAPISchemas
    .map(n => lookupClass(input, n))
    .filter((c): c is ClassInfo => c !== undefined && c.schemaKind === 'singleApplyAPI')
  if ([cls, ...reflected].some(c => c.rels.some(r => r.apiName !== ''))) usdImports.add('type Rel')
  if (multi) usdImports.add('SchemaRegistry')
  for (const r of reflected) {
    imports.push(input.classes.includes(r)
      ? `import { ${r.className} } from './${r.baseFileName}.ts'`
      : `import { ${r.className} } from '${PACKAGE}/${libNameOfReflected(r)}'`)
  }
  const needTokens = cls.attrs.some(a => a.apiName !== '') || cls.rels.some(r => r.apiName !== '')
    || multiNs
  if (needTokens) imports.push(`import { ${tokens} } from './tokens.ts'`)

  const sortedUsd = [...usdImports].sort((a, b) =>
    a.replace(/^type /, '').localeCompare(b.replace(/^type /, '')))
  let out = ctx.header(cls)
  if (inUsd) {
    // The usd modules that define each imported name.
    const modules: Record<string, [string, string]> = {
      Attribute: ['Attribute', './prim.ts'], Prim: ['Prim', './prim.ts'],
      Stage: ['Stage', './stage.ts'], Rel: ['UsdRel as Rel', './relationship.ts'],
      SchemaBase: ['SchemaBase', './schemaBase.ts'],
      SchemaRegistry: ['UsdSchemaRegistry as SchemaRegistry', './schemaRegistry.ts'],
    }
    const byModule = new Map<string, string[]>()
    for (const imp of sortedUsd) {
      const isType = imp.startsWith('type ')
      const [binding, from] = modules[imp.replace(/^type /, '')]!
      byModule.set(from, [...(byModule.get(from) ?? []), isType ? `type ${binding}` : binding])
    }
    for (const [from, names] of [...byModule].sort((a, b) => a[0].localeCompare(b[0]))) {
      out += `import { ${names.join(', ')} } from '${from}'\n`
    }
  } else {
    out += `import { ${sortedUsd.join(', ')} } from '${PACKAGE}/usd'\n`
  }
  out += imports.map(l => l + '\n').join('')
  out += '\n'
  if (multiNs) {
    out += '// UsdSchemaRegistry::MakeMultipleApplyNameInstance (schemaClass.cpp:205-210).\n'
      + 'function _namespacedPropertyName(instanceName: string, propName: string): string {\n'
      + '  return SchemaRegistry.makeMultipleApplyNameInstance(propName, instanceName)\n}\n\n'
  }
  out += docComment(cls.doc, '')
  out += `export class ${name} extends ${parentName} {\n`
  out += `  static readonly typeName: string = ${JSON.stringify(cls.usdPrimTypeName)}\n`

  // Constructor.
  if (multi) {
    out += '\n  private readonly _name: string\n'
      + '  constructor(prim: Prim | undefined, stage?: Stage, name = \'\') {\n'
      + '    super(prim, stage)\n    this._name = name\n  }\n'
      + '  /** The instance name of this multiple-apply schema. */\n'
      + '  getName(): string { return this._name }\n'
  }

  // Get / GetAll / Define.
  if (!isAPISchemaBase) {
    out += '\n'
    if (multi) {
      out += `  static get(stage: Stage, path: string): ${name}\n`
        + `  static get(prim: Prim, name: string): ${name}\n`
        + `  static get(stageOrPrim: Stage | Prim, pathOrName: string): ${name} {\n`
        + `    if (!('getPrim' in stageOrPrim)) return new ${name}(stageOrPrim, stageOrPrim.getStage(), pathOrName)\n`
      if (multiNs) {
        out += `    const name = ${name}.is${cls.usdPrimTypeName}Path(pathOrName)\n`
          + `    if (name === undefined) return new ${name}(undefined, stageOrPrim)\n`
          + `    return new ${name}(stageOrPrim.getPrim(pathOrName.slice(0, pathOrName.indexOf('.'))), stageOrPrim, name)\n`
      } else {
        out += `    return new ${name}(stageOrPrim.getPrim(pathOrName), stageOrPrim)\n`
      }
      out += '  }\n'
      out += `  static getAll(prim: Prim): ${name}[] {\n`
        + `    // UsdAPISchemaBase::_GetMultipleApplyInstanceNames (apiSchemaBase.cpp:31-75).\n`
        + `    const prefix = ${JSON.stringify(cls.usdPrimTypeName + ':')}\n`
        + '    return prim.getAppliedSchemas().filter(s => s.startsWith(prefix))\n'
        + `      .map(s => new ${name}(prim, prim.getStage(), s.slice(prefix.length)))\n  }\n`
    } else {
      out += `  static get(stage: Stage, path: string): ${name} {\n`
        + `    return new ${name}(stage.getPrim(path), stage)\n  }\n`
    }
  }
  if (cls.isConcrete) {
    out += `  static define(stage: Stage, path: string): ${name} {\n`
      + `    return new ${name}(stage.definePrim(path, ${JSON.stringify(cls.usdPrimTypeName)}), stage)\n  }\n`
  }

  if (multiNs) {
    const baseNames = [...cls.attrs, ...cls.rels]
      .map(p => `SchemaRegistry.getMultipleApplyNameTemplateBaseName(${tokens}.${p.tokenId})`)
    out += `\n  static isSchemaPropertyBaseName(baseName: string): boolean {\n`
      + `    const attrsAndRels = [\n${baseNames.map(b => `      ${b},\n`).join('')}    ]\n`
      + '    return attrsAndRels.includes(baseName)\n  }\n'
    const nsToken = cls.propertyNamespacePrefix!
    out += `  /** The instance name when path is a ${cls.usdPrimTypeName} path, else undefined. */\n`
      + `  static is${cls.usdPrimTypeName}Path(path: string): string | undefined {\n`
      + '    const dot = path.lastIndexOf(\'.\')\n'
      + '    if (dot < 0 || path.slice(dot + 1).includes(\'[\')) return undefined\n'
      + '    const propertyName = path.slice(dot + 1)\n'
      + '    const tokens = propertyName.split(\':\')\n'
      + `    if (${name}.isSchemaPropertyBaseName(tokens[tokens.length - 1]!)) return undefined\n`
      + `    if (tokens.length >= 2 && tokens[0] === ${JSON.stringify(nsToken)}) {\n`
      + `      return propertyName.slice(${JSON.stringify(nsToken)}.length + 1)\n    }\n`
      + '    return undefined\n  }\n'
  }

  // _IsCompatible (typed.cpp:98-104, apiSchemaBase.cpp:115-137).
  if (cls.isTyped && cls.cppClassName !== 'UsdTyped') {
    out += `\n  isValid(): boolean {\n    return super.isValid() && this.prim.isA(${name}.typeName)\n  }\n`
  } else if (cls.isAppliedAPISchema) {
    out += multi
      ? `\n  isValid(): boolean {\n    return super.isValid() && this._name !== '' && this.prim.hasAPI(${name}.typeName, this._name)\n  }\n`
      : `\n  isValid(): boolean {\n    return super.isValid() && this.prim.hasAPI(${name}.typeName)\n  }\n`
  }

  if (cls.isAppliedAPISchema) {
    out += '\n'
    if (multi) {
      out += `  static canApply(prim: Prim, name: string): boolean {\n`
        + `    return prim.canApplyAPI(${name}.typeName, name)\n  }\n`
        + `  static apply(prim: Prim, name: string): ${name} {\n`
        + `    if (prim.applyAPI(${name}.typeName, name)) return new ${name}(prim, prim.getStage(), name)\n`
        + `    return new ${name}(undefined, prim.getStage())\n  }\n`
    } else {
      out += `  static canApply(prim: Prim): boolean {\n`
        + `    return prim.canApplyAPI(${name}.typeName)\n  }\n`
        + `  static apply(prim: Prim): ${name} {\n`
        + `    if (prim.applyAPI(${name}.typeName)) return new ${name}(prim, prim.getStage())\n`
        + `    return new ${name}(undefined, prim.getStage())\n  }\n`
    }
  }

  // GetSchemaAttributeNames.
  const localNames = cls.attrs.filter(a => a.apiName !== '').map(a => a.generatedSchemaPropName)
  const allNames = input.allSchemaAttributeNames.get(cls.primName) ?? localNames
  out += '\n'
  out += `  static getSchemaAttributeNames(includeInherited = true${multi ? ', instanceName = \'\'' : ''}): string[] {\n`
  out += `    const names = includeInherited\n      ? ${JSON.stringify(allNames)}\n      : ${JSON.stringify(localNames)}\n`
  if (multi) {
    out += '    if (instanceName === \'\') return names\n'
      + '    return names.map(n => SchemaRegistry.makeMultipleApplyNameInstance(n, instanceName))\n'
  } else {
    out += '    return names\n'
  }
  out += '  }\n'

  // Properties.
  for (const attr of cls.attrs) {
    if (attr.apiName === '') continue
    out += '\n' + attrMembers(cls, tokens, attr)
  }
  for (const rel of cls.rels) {
    if (rel.apiName === '') continue
    out += '\n' + relMembers(cls, tokens, rel)
  }

  // Reflected API schemas.
  for (const r of reflected) {
    out += `\n  ${camelCase(r.usdPrimTypeName)}(): ${r.className} {\n    return new ${r.className}(this.prim, this.stage)\n  }\n`
    for (const attr of r.attrs) {
      if (attr.apiName === '') continue
      const proper = properCase(attr.apiName)
      if (attr.apiGet !== 'custom') {
        out += `  get${proper}Attr(): Attribute {\n    return this.${camelCase(r.usdPrimTypeName)}().get${proper}Attr()\n  }\n`
      }
      out += `  create${proper}Attr(defaultValue?: unknown, writeSparsely = false): Attribute {\n`
        + `    return this.${camelCase(r.usdPrimTypeName)}().create${proper}Attr(defaultValue, writeSparsely)\n  }\n`
    }
    for (const rel of r.rels) {
      if (rel.apiName === '') continue
      const proper = properCase(rel.apiName)
      if (rel.apiGet !== 'custom') {
        out += `  get${proper}Rel(): Rel {\n    return this.${camelCase(r.usdPrimTypeName)}().get${proper}Rel()\n  }\n`
      }
      out += `  create${proper}Rel(): Rel {\n    return this.${camelCase(r.usdPrimTypeName)}().create${proper}Rel()\n  }\n`
    }
  }
  return out + '\n'
}

function libNameOfReflected(cls: ClassInfo): string {
  // Reflected API schemas from another library are imported from that
  // library's package entry; the C++ prefix 'UsdFoo' names library 'usdFoo'.
  const prefix = cls.cppClassName.slice(0, cls.cppClassName.length - cls.className.length)
  return prefix[0]!.toLowerCase() + prefix.slice(1)
}

/** Splices the custom section of an existing module onto freshly generated
 *  text (_ExtractCustomCode, py:1086-1105). */
export function withCustomCode(generated: string, existing: string | undefined): string {
  const at = existing?.indexOf(CUSTOM_CODE_MARKER) ?? -1
  if (existing === undefined || at < 0) return generated + DEFAULT_CUSTOM_CODE
  const lineStart = existing.lastIndexOf('\n', at) + 1
  return generated + existing.slice(lineStart)
}

/** All generated modules of a schema library, by file name relative to the
 *  library's src/ directory: one per class plus tokens.ts. */
export function usdGenSchemaCode(
  input: UsdGenSchemaCodegenInput,
  header: (fileDescription: string) => string,
): Map<string, string> {
  const files = new Map<string, string>()
  const ctx: RenderContext = {
    input,
    header: cls => header(`class ${cls.usdPrimTypeName} (${input.libraryPath}/${cls.baseFileName}.{h,cpp})`),
  }
  for (const cls of input.classes) files.set(`${cls.baseFileName}.ts`, renderClass(ctx, cls))
  files.set('tokens.ts', renderTokens(input, header(`tokens (${input.libraryPath}/tokens.{h,cpp})`)))
  return files
}
