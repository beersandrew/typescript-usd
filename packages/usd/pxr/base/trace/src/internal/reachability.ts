// Private, opt-in evidence seam. Disabled mode is one undefined check and
// allocates nothing; release tooling installs a sink only around a scenario.
let sink: ((id: string) => void) | undefined

export function _setReachabilitySink(next: ((id: string) => void) | undefined): void {
  sink = next
}

export function _markReachable(id: string): void {
  sink?.(id)
}
