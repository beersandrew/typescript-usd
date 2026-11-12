Locally authored read-only inspector fixture, under typescript-usd's
Tomorrow Open Source Technology License 1.0 (see provenance.json).
root.usda is the standalone scene; weak.usda and reference.usda are dependencies.
Native expectations: tests/fixtures/inspection/expected.json, captured using
OpenUSD 26.08 by the capture tooling kept outside this repository (FIXTURES.md). Source target: OpenUSD v26.11.1 usdviewq/appController.py
metadata (4284), composition (4427), contributing spec stacks (4590).

Known metadata parity gap (not a green compliance claim): create a Cube with
customData={string owner="viewer"}; native GetAllMetadata().customData also includes
schema userDocBrief, while current TS schema registry disallows schema customData
fallback. Authored dictionaries still compose. Repro using this fixture's Shape:
Usd.Stage.Open("root.usda").GetPrimAtPath("/World/Model/Shape").GetAllMetadata()
versus stage.getPrim('/World/Model/Shape').getAllMetadata(). Upstream counterpart:
UsdObject::GetAllMetadata / UsdStage::_GetAllMetadata and schema fallback policy.
Acceptance: metadata includes native schema documentation defaults without exposing
schema-internal apiSchema metadata. The parent typeless Model intentionally tests
authored dictionaries independently of that unresolved schema fallback feature.

Composition UI is a flat arc table, not usdviewq's recursive layer/arc tree.
The layer table shows contributing specs strongest first and authored defaults;
it does not implement layer editing, muting, or per-spec sample tables.
