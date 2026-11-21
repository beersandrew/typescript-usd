// Files dropped on a page, or picked: their paths relative to what was
// dropped (a folder keeps its layout), and the root layer to work on.

export interface DroppedFile { path: string, file: File }

export const isUsd = (name: string): boolean => /\.(usd|usda|usdc|usdz)$/i.test(name)
export const stem = (name: string): string => name.replace(/\.[^./]+$/, '')

/** Every file under a dropped entry, with its path from the drop. */
async function walk(entry: FileSystemEntry): Promise<DroppedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject))
    return [{ path: entry.fullPath.replace(/^\//, ''), file }]
  }
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  const children: FileSystemEntry[] = []
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
    if (!batch.length) break
    children.push(...batch)
  }
  return (await Promise.all(children.map(walk))).flat()
}

/** The files of a picker's selection (a folder pick keeps its layout). */
export function pickedFiles(input: HTMLInputElement): DroppedFile[] {
  return [...input.files ?? []].map(file => ({
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, file,
  }))
}

/** The drag type of a sample file dragged from the page itself; its data is
 *  the sample's path (see sampleChip in usdcat.ts). */
export const SAMPLE_DRAG = 'application/x-usd-tools-sample'

/** Calls `onFiles` with what is dropped on the page (hidden files left
 *  out), `onSample` with the path of a sample dragged from the page, and
 *  `onDragging` as a drag enters and leaves it. With `within`, only a drop
 *  released over that element counts (it gets the class `over` while a drag
 *  is over it); a drop anywhere else does nothing. */
export function acceptDrops(onFiles: (files: DroppedFile[]) => void, onDragging?: (on: boolean) => void, onSample?: (path: string) => void, within?: HTMLElement): void {
  let depth = 0
  const inside = (e: DragEvent) => !within || within.contains(e.target as Node)
  const dragging = (on: boolean) => { document.body.classList.toggle('dragging', on); onDragging?.(on); if (!on) within?.classList.remove('over') }
  addEventListener('dragenter', e => { e.preventDefault(); if (++depth === 1) dragging(true) })
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; dragging(false) } })
  addEventListener('dragover', e => {
    // Always prevented, so a file let go elsewhere is not opened by the browser.
    e.preventDefault()
    const over = inside(e)
    within?.classList.toggle('over', over)
    if (e.dataTransfer) e.dataTransfer.dropEffect = over ? 'copy' : 'none'
  })
  addEventListener('drop', async e => {
    e.preventDefault()
    depth = 0
    dragging(false)
    if (!inside(e)) return
    const sample = e.dataTransfer?.getData(SAMPLE_DRAG)
    if (sample) { onSample?.(sample); return }
    const entries = [...e.dataTransfer?.items ?? []].map(i => i.webkitGetAsEntry?.()).filter((x): x is FileSystemEntry => !!x)
    const files = entries.length
      ? (await Promise.all(entries.map(walk))).flat()
      : [...e.dataTransfer?.files ?? []].map(file => ({ path: file.name, file }))
    onFiles(files.filter(f => !f.path.split('/').some(part => part.startsWith('.'))))
  })
}

/** The likely root layer among `layers` (absolute paths): one named after
 *  its folder (variants/variants.usda), else the shallowest, else the first
 *  by name. */
export function pickRoot(layers: readonly string[]): string | undefined {
  const depth = (p: string) => p.split('/').length
  const named = (p: string) => {
    const parts = p.split('/')
    return parts.length > 3 && stem(parts.at(-1)!) === parts.at(-2) ? 0 : 1
  }
  return [...layers].sort((a, b) => named(a) - named(b) || depth(a) - depth(b) || a.localeCompare(b))[0]
}

/** The layers to work on: each dropped folder's root layer, and every loose
 *  USD file. `paths` are mounted at /files/<dropped path>. */
export function rootsOf(paths: readonly string[]): string[] {
  const layers = paths.filter(isUsd)
  const byFolder = new Map<string, string[]>()
  const loose: string[] = []
  for (const layer of layers) {
    const parts = layer.split('/')
    if (parts.length === 3) loose.push(layer)
    else byFolder.set(parts[2]!, [...byFolder.get(parts[2]!) ?? [], layer])
  }
  return [...[...byFolder.values()].map(group => pickRoot(group)!), ...loose]
}

/** Whether this browser cannot pick folders (iOS and iPadOS). */
export const cannotPickFolders = (): boolean =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
