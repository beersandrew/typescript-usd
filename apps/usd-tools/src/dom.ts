/** document.createElement with properties and children. */
export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Record<string, unknown> = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = Object.assign(document.createElement(tag), props) as HTMLElementTagNameMap[K]
  node.append(...children)
  return node
}
