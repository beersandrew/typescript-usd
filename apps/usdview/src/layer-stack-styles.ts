// Ported from OpenUSD 26.11.1: pxr/usdImaging/usdviewq/common.py,
//  pxr/usdImaging/usdviewq/mainWindowUI.ui
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

// usdviewq/mainWindowUI.ui:1013-1101: fixed30px rows, single-line contents,
// no grid, alternating backgrounds; source colors common.py:58-65.
export const layerStackStyles = `
.layer-stack-table { table-layout:auto; width:100%; }
.layer-stack-table th { white-space:nowrap; font-size:var(--usd-small-font); font-weight:400; padding:3px; color:rgb(201,199,195); background:rgb(78,80,84); }
.layer-stack-table th:first-child,.layer-stack-table th:nth-child(2),.layer-stack-table th:nth-child(4) { width:1%; }
.layer-stack-table th:nth-child(3) { width:50%; min-width:30px; }
.layer-stack-table th:nth-child(4) { width:50%; }
.layer-stack-table[data-root=true] th:nth-child(2) { width:auto; }
.layer-stack-table tr { height:30px; }
.property-content .layer-stack-table td,.layer-stack-table td,.layer-stack-table td:first-child { color:rgb(227,227,227); height:30px; box-sizing:border-box; white-space:pre; overflow-wrap:normal; min-width:0; max-width:none; border:0; border-right:1px solid rgb(41,41,41); padding-top:1px; padding-bottom:1px; }
.layer-stack-table td[data-value-source=default] { color:rgb(135,206,250); }
.layer-stack-table td[data-value-source=samples] { color:rgb(177,207,153); }
.layer-stack-table tr.muted td { color:rgb(151,151,151); }
.layer-stack-table tr.selected td { color:rgb(227,227,227); }
.layer-stack-table tr.selected td[data-value-source=default] { color:rgb(135,206,250); }
.layer-stack-table tr.selected td[data-value-source=samples] { color:rgb(177,207,153); }
.layer-stack-table [hidden] { display:none; }
`
