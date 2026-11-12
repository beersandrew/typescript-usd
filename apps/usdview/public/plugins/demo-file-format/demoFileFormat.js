// A toy Sdf file format: one prim per line.
//
//   # comment
//   Xform /World
//   Sphere /World/ball radius=2 color=1,0.5,0
//   Cube /World/box size=1
//
// Each line is a type name, an absolute prim path, and name=value
// attributes. A number becomes a double attribute; color=r,g,b becomes
// primvars:displayColor (color3f[]). Missing ancestors are defined as
// typeless prims. The structure follows extras/usd/examples/usdObj
// (fileFormat.cpp): Read authors the layer's specs from the parsed text.
//
// The module imports the library by its bare specifier, so the page's
// import map or bundler must give it the same typescript-usd instance the
// stage uses.
import {
  AttributeSpec, DefineFileFormat, FileFormat, PrimSpec, ValueTypeNames,
} from 'typescript-usd/sdf'

export class DemoFileFormat extends FileFormat {
  formatId = 'demo'
  extensions = ['demo']
  capabilities = { reading: true, writing: false, editing: false }

  read(bytes, layer) {
    const text = new TextDecoder().decode(bytes)
    const lines = text.split(/\r?\n/)
    lines.forEach((raw, index) => {
      const line = raw.replace(/#.*/, '').trim()
      if (!line) return
      const [typeName, path, ...fields] = line.split(/\s+/)
      if (!path?.startsWith('/') || path === '/') {
        throw new Error(`${layer.identifier}:${index + 1}: expected '<Type> </absolute/path> [name=value ...]'`)
      }
      const prim = definePrim(layer, path, typeName === '-' ? '' : typeName)
      for (const field of fields) {
        const eq = field.indexOf('=')
        if (eq <= 0) throw new Error(`${layer.identifier}:${index + 1}: expected name=value, got '${field}'`)
        const name = field.slice(0, eq)
        const value = field.slice(eq + 1)
        if (name === 'color') {
          const rgb = value.split(',').map(Number)
          if (rgb.length !== 3 || rgb.some(Number.isNaN)) {
            throw new Error(`${layer.identifier}:${index + 1}: color must be r,g,b`)
          }
          const attr = attribute(prim, 'primvars:displayColor', ValueTypeNames.Color3fArray)
          attr.setDefaultValue([rgb])
          continue
        }
        const number = Number(value)
        if (value === '' || Number.isNaN(number)) {
          throw new Error(`${layer.identifier}:${index + 1}: '${name}' must be a number`)
        }
        attribute(prim, name, ValueTypeNames.Double).setDefaultValue(number)
      }
    })
  }
}

function definePrim(layer, path, typeName) {
  let parent = layer.getPseudoRoot()
  const names = path.split('/').slice(1)
  names.forEach((name, i) => {
    const last = i === names.length - 1
    const existing = layer.getPrimAtPath(`${parent.getPath().pathString === '/' ? '' : parent.getPath().pathString}/${name}`)
    const prim = existing ?? PrimSpec.new(parent, name, 'def', last ? typeName : '')
    if (existing && last && typeName) prim.setTypeName(typeName)
    parent = prim
  })
  return parent
}

function attribute(prim, name, typeName) {
  const path = prim.getPath().appendProperty(name)
  return prim.getLayer().getAttributeAtPath(path) ?? AttributeSpec.new(prim, name, typeName)
}

// SDF_DEFINE_FILE_FORMAT(DemoFileFormat, SdfFileFormat), run when Sdf loads
// this plugin.
DefineFileFormat('DemoFileFormat', DemoFileFormat)
