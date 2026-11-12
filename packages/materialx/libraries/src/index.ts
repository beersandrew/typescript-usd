// The MaterialX v1.39.5 data libraries (see scripts/generate.mjs), served
// through @mtlx/format's virtual file system so library loading and shader
// source resolution work the same in browsers and in Node.

import type { VirtualFileSystem } from '@mtlx/format'
import { MATERIALX_LIBRARY_FILES } from './generated/files.ts'

export { MATERIALX_LIBRARY_FILES }

/** The MaterialX release the files come from. */
export const MATERIALX_LIBRARIES_VERSION = '1.39.5'

/** Registers every library file under `<root>/` of `vfs` (paths relative to
 *  upstream's libraries/ directory, e.g. stdlib/stdlib_defs.mtlx). */
export function mountMaterialXLibraries(vfs: VirtualFileSystem, root: string): void {
  for (const [path, contents] of MATERIALX_LIBRARY_FILES) vfs.addFile(`${root}/${path}`, contents)
}
