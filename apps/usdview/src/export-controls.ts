import type { ViewerRuntime } from './contracts'
import type { StageExportKind } from './stage-export'

export const exportMenu = `<hr><button type="button" class="save-overrides" disabled>Save Overrides As…</button><button type="button" class="save-session" disabled>Save Session Edits As…</button><button type="button" class="save-flattened" disabled>Save Flattened As…</button><p class="export-help">Downloads USDA without changing source files. Overrides reference the original scene; raw session edits require it separately. Flattened export saves current composition; external assets are not bundled.</p><p class="export-status" role="status" aria-live="polite"></p>`

export class ExportControls {
  private blocked = true
  private working = false
  private generation = 0
  constructor(private root: ShadowRoot, private runtime: () => ViewerRuntime | undefined, private range?: () => {start:number,end:number}) {}
  bind(signal: AbortSignal) {
    signal.addEventListener('abort', () => { this.generation++; this.blocked = true }, {once:true})
    for (const [selector,kind] of [['.save-overrides','overrides'],['.save-session','session'],['.save-flattened','flattened']] as const) {
      this.root.querySelector(selector)!.addEventListener('click', () => { void this.save(kind) }, {signal})
    }
  }
  busy(value: boolean) {
    if (value && !this.blocked) this.generation++
    this.blocked = value; this.refresh()
  }
  private refresh() {
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.save-overrides,.save-session,.save-flattened')) button.disabled = this.blocked || this.working || !this.runtime()?.exportStage
  }
  private async save(kind: StageExportKind) {
    const runtime = this.runtime()
    if (this.blocked || this.working || !runtime?.exportStage) return
    const generation = this.generation
    this.working = true; this.refresh()
    const status = this.root.querySelector('.export-status')!
    status.textContent = 'Preparing download…'
    try {
      const result = await runtime.exportStage(kind, this.range?.())
      if (this.blocked || generation !== this.generation) return
      const url = URL.createObjectURL(new Blob([result.text], {type:'text/plain;charset=utf-8'}))
      try {
        const link = document.createElement('a')
        link.href = url; link.download = result.fileName; link.hidden = true
        this.root.append(link)
        try { link.click() } finally { link.remove() }
      } finally {
        // Safari may consume the blob after the click handler returns.
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
      }
      status.textContent = `Download requested: ${result.fileName}. ${result.warnings.join(' ')}`
    } catch (error) {
      if (generation === this.generation) status.textContent = `Export failed: ${error instanceof Error ? error.message : String(error)}`
    } finally { this.working = false; this.refresh() }
  }
}
