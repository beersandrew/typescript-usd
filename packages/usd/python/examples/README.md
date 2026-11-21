# Test-only example scripts

Not part of the library. These are API-only adaptations of two public apps by this port's author,
[usd-thumbnail-generator](https://github.com/beersandrew/usd-thumbnail-generator)
(`generate_thumbnail.py`) and
[usd-cards-generator](https://github.com/beersandrew/usd-cards-generator)
(`src/generate_cards.py`), kept here to exercise the `pxr` forwarding layer
(`python/pxr`) under Pyodide. They keep the apps' camera framing, bounding-box
math, layer and schema authoring, and drop rendering (`usdrecord`), `usdzip`
(replaced by `UsdUtils.CreateNewUsdzPackage`) and temporary files (stages are
built in memory). Run them with native OpenUSD or with `python/runScript.ts`.
