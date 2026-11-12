import { SdfPath } from 'typescript-usd/sdf/path'

/** Viewer navigation accepts scene prim/property paths, not relationship-target
 * paths or variant-selection syntax. Validation happens before changing selection. */
export function parseInspectionPath(text: string): { primPath: string; propertyName?: string } {
  const value = text.trim()
  const message = 'Enter an absolute prim or property path, such as /World/Mesh.points.'
  if (!SdfPath.isValidPathString(value)) throw new Error(message)
  const path = SdfPath.fromString(value)
  if (!path.isAbsolutePath() || path.containsPrimVariantSelection() ||
      !(path.isAbsoluteRootOrPrimPath() || path.isPropertyPath())) {
    throw new Error(message)
  }
  return path.isPropertyPath() ? { primPath: path.getPrimPath().pathString, propertyName: path.name }
    : { primPath: path.pathString }
}
