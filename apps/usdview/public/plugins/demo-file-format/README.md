# Demo file format plugin

A toy Sdf file format plugin loaded at runtime with `import()`. Open it with:

    ?plugin=./plugins/demo-file-format/plugInfo.json&scene=./plugins/demo-file-format/scene.demo

Copied unchanged from typescript-usd `examples/demo-file-format` (branch
`work/runtime-plugins`, commit d9c94c1), under that repository's license.
`demoFileFormat.js` imports `typescript-usd/sdf`; the viewer's import map
resolves it to the viewer's own library instance.
