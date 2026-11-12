# Workspace operating rules

The library's binding rules live in `packages/usd/AGENTS.md`; the viewer's in
`apps/usdview/AGENTS.md`.

`packages/materialx/`, `packages/opensubdiv/` and `packages/openvdb/` are
partial TypeScript ports of MaterialX, OpenSubdiv and OpenVDB/NanoVDB that
exist only so OpenUSD works in TypeScript. They are maintained here: change
them in this repository. Each package's README.md says which upstream release
it follows, what is and is not ported, and its licence; PROVENANCE.md records
where each part comes from. Port what OpenUSD uses, following the upstream
release the package names and citing its file:line; start every ported file
with the upstream copyright header (the form the existing files use); and keep
code ported from OpenVDB 10.1.0 in files marked MPL-2.0.
