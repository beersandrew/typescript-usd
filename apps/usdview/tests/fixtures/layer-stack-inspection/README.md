Native OpenUSD 26.11.1 Layer Stack table captures, made by the capture tooling kept outside this repository (`FIXTURES.md`). The capture checks the pinned source commit, calls the real `AppController._updateLayerStackView` with a small controller/data-model stub, and renders a real Qt table with the native stylesheet and UI table settings. Input scenes are the adjacent, self-authored composition, metadata and sampled-inspection fixtures; no restricted assets are used.

They are recaptured with the capture tooling kept outside this repository (`FIXTURES.md`) against the OpenUSD 26.11.1 reference build.

`expected.json` records headers, hidden columns, row order/text, foreground overrides, default text palette, row heights and column widths. A null foreground means the controller leaves the native palette unchanged. PNGs show the actual Qt table; they are not Safari results.

Metadata dictionaries are semantically unordered. Native `SdfSchema::GetMetadataFields` iterates a `TfHashMap` (`schema.cpp:230–241`), whereas the TypeScript registry retains insertion order. Tests compare every metadata key/value string while leaving dictionary ordering unscored. Other row and cell text is compared exactly.
