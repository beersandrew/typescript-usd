// Portions ported from OpenUSD 26.11.1, including:
//  pxr/usdImaging/usdviewq/mainWindowUI.ui,
//  pxr/usdImaging/usdviewq/appController.py,
//  pxr/usdImaging/usdviewq/stageView.py
// Copyright 2016 Pixar. Tomorrow Open Source Technology License 1.0.
// Translated to TypeScript and modified. See LICENSE and NOTICE.

import {layerStackStyles} from './layer-stack-styles'
import {defaultSplitPercentages} from './viewer-layout'
import {branchIcons} from './usdview-icons'
import './viewer-font.css'
// Palette and pane arrangement adapted from OpenUSD usdviewq/usdviewstyle.qss
// and mainWindowUI.ui, also translated in the legacy usdviewq application.
// Browser presentation is independent of React and the rendering runtime.
// Font sizes follow usdview's defaults as rendered by Qt on macOS (72 logical DPI, so pt = px):
// BASE_FONT_SZ 10pt, SMALL_FONT_SZ round(10 * 0.8) = 8pt for header sections
// (appController.py:326-337, usdviewstyle.qss:20,318-328) and the HUD's 9pt monospace
// (stageView.py:271). Measured: tests/fixtures/font-sizes/native/fonts.json.
// Window > Preferences changes --usd-base-font/--usd-small-font (src/window-menu.ts fontSizes).
export const viewerStyles = `
:host { display:block; color:var(--usd-viewer-text,rgb(227,227,227)); background:var(--usd-viewer-background,rgb(56,56,56)); --usd-base-font:10px; --usd-small-font:8px; font:var(--usd-base-font)/1.25 UsdviewRoboto,Arial,sans-serif; --border:#2a2a2a; --selected:rgb(189,155,84); --top-split:${defaultSplitPercentages.top}%; --bottom-split:${defaultSplitPercentages.bottom}%; --vertical-split:${defaultSplitPercentages.vertical}%; }
* { box-sizing:border-box; }
[hidden] { display:none!important; }

/* usdviewstyle.qss:434-495; native Qt scrollbar extent17px (bar-metrics.json). */
*::-webkit-scrollbar { width:17px; height:17px; background:rgb(42,42,42); border:1px solid rgb(42,42,42); }
*::-webkit-scrollbar:vertical,*::-webkit-scrollbar-track:vertical { border-radius:0 12px 12px 0; background:rgb(42,42,42); }
*::-webkit-scrollbar:horizontal,*::-webkit-scrollbar-track:horizontal { border-radius:0 0 12px 12px; background:rgb(42,42,42); }
*::-webkit-scrollbar-thumb { background:rgb(90,90,90); border:1px solid rgb(90,90,90); }
*::-webkit-scrollbar-thumb:vertical { border-radius:0 12px 12px 0; border-left-color:rgb(126,126,126); min-height:45px; }
*::-webkit-scrollbar-thumb:horizontal { border-radius:0 0 12px 12px; border-top-color:rgb(126,126,126); min-width:45px; }
*::-webkit-scrollbar-button { display:none; width:0; height:0; }
*::-webkit-scrollbar-corner { background:rgb(42,42,42); }

.shell { position:relative; height:100%; min-height:350px; display:flex; flex-direction:column; overflow:hidden; background:#383838; }
button,input,select { font:inherit; color:inherit; }
button,select { border:1px solid #252525; border-radius:2px; background:linear-gradient(#595959,#4a4a4a); min-height:22px; }
button { padding:2px 8px; cursor:pointer; }
button:hover:not(:disabled) { background:#575757; }
button:disabled { color:#7a7a7a; cursor:default; }
input,select { padding:2px 4px; }
input { background:#3a3a3a; border:1px solid #252525; border-radius:2px; min-width:0; }
button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible,.prim:focus-visible,canvas:focus-visible,.splitter:focus-visible { outline:1px solid var(--selected); outline-offset:-1px; }
.menubar { min-height:26px; display:flex; align-items:center; gap:1px; padding:0 3px; background:#505050; border:2px solid #292929; }
.licenses-link { margin-left:auto; padding:4px 7px; color:#969696; font-size:var(--usd-base-font); text-decoration:none; }
.licenses-link:hover { color:#ccc; }
.app-caption { margin-left:auto; padding-right:5px; color:#969696; font-size:var(--usd-base-font); }
.menu { position:relative; }
.menu summary,.menu-button { display:block; list-style:none; min-height:23px; padding:4px 7px; cursor:pointer; border:0; border-radius:0; background:transparent; font-size:var(--usd-base-font); }
.menu summary::-webkit-details-marker { display:none; }
.menu summary:hover { background:#3b3b3b; }
.menu[open]>summary { background:#2a2a2a; }
.menubar>.menu>summary,.menubar>.menu-button { font-size:inherit; }
.menu-popup>button:hover:not(:disabled) { background:#be9c55; color:#363636; }
.menu-popup { position:absolute; left:0; top:100%; z-index:20; min-width:185px; width:max-content; padding:3px; background:#383838; border:2px solid #131313; box-shadow:2px 3px 8px #0007; }
.menu-popup>button,.menu-value { display:block; width:100%; border:0; border-radius:0; background:transparent; text-align:left; white-space:nowrap; padding:5px 10px; }
.menu-value { color:#ccc; }

kbd { float:right; margin-left:20px; font:inherit; color:#aaa; }
.menu-popup>hr,.context-menu>hr { border:0; border-top:1px solid #555; margin:3px 0; }
.menu-popup>[role=menuitemradio],.menu-popup>[role=menuitemcheckbox] { position:relative; padding-left:20px; }
[role=menuitemradio][aria-checked=true]::before,[role=menuitemcheckbox][aria-checked=true]::before { content:'✓'; position:absolute; left:6px; }
.submenu { position:relative; }
.menu .submenu>summary { display:block; padding:5px 10px; white-space:nowrap; }
.submenu>summary::after { content:'▸'; float:right; margin-left:20px; }
.submenu[open]>summary { background:#2a2a2a; }
.submenu>.submenu-popup { left:100%; top:-5px; }
/* QAction menu indicators: retain native input semantics without platform form boxes.
 * usdviewstyle.qss:529–549, Qt QAction checkable item indicator. Timeline inputs stay native. */
.menu-popup input[type=checkbox],.menu-popup input[type=radio] { appearance:none; -webkit-appearance:none; flex:none; width:12px; height:12px; min-height:0; margin:0; padding:0; border:0; border-radius:0; background:transparent; cursor:pointer; }
.menu-popup input[type=checkbox]:checked,.menu-popup input[type=radio]:checked { background:currentColor; -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 6l3 3 5-6' fill='none' stroke='black' stroke-width='1.5'/%3E%3C/svg%3E") center/12px 12px no-repeat; mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2 6l3 3 5-6' fill='none' stroke='black' stroke-width='1.5'/%3E%3C/svg%3E") center/12px 12px no-repeat; }
.menu-popup label:has(input:disabled) { color:rgb(122,122,122); }
.menu-popup input:disabled { cursor:default; }
.menu-popup label:has(input:focus-visible) { outline:1px solid var(--selected); outline-offset:1px; }
.menu-popup label:has(input):hover:not(:has(input:disabled)) { background:#be9c55; color:#363636; }
.menu-popup { padding:0; }
.menu-popup>button,.menu-popup>label,.menu-popup>.submenu>summary { height:calc(var(--usd-base-font) * 1.25 + .5px); min-height:calc(var(--usd-base-font) * 1.25 + .5px); line-height:1.25; margin:0; padding:0 16px; }
.menu-popup>button {padding-left:20px;}
.menu-popup>label {padding-left:4px;}
.menu-popup>.submenu>summary {padding-left:20px;}
.menu-popup>hr {height:1px;margin:0;border:0;background:#252525;}
.menu-popup input[type=checkbox],.menu-popup input[type=radio] {color:inherit;}
.menu-popup.context-menu { position:fixed; z-index:40; }
.shell[data-viewer-only] .hierarchy,.shell[data-viewer-only] [data-split=top],.shell[data-viewer-only] [data-split=vertical],.shell[data-viewer-only] .bottom-row { display:none; }
.shell[data-viewer-only] .workbench { grid-template-rows:minmax(0,1fr); }
.shell[data-viewer-only] .top-row { grid-template-columns:minmax(0,1fr); }
.file-popup { min-width:240px; }
.display-popup { min-width:185px; }
.menu-popup label { display:flex; align-items:center; gap:4px; margin:0; white-space:nowrap; }
.display-popup select { margin-left:auto; }
.display-popup p { max-width:240px; font-size:var(--usd-base-font); color:#ccc; }
.file-label { display:block; margin:3px 0 5px; color:#c9c7c3; }
.url-form { display:flex; gap:5px; margin-bottom:11px; }
.url { flex:1; }
.scene-select { width:100%; }
.current-path { flex:none; height:23px; margin:3px 8px 7px; padding:2px 5px; border:2px solid #2f2f2f; background:#383838; }
.workbench { flex:1; min-height:0; margin:0 8px; display:grid; grid-template-rows:minmax(0,var(--vertical-split)) 5px minmax(0,1fr); }
.top-row,.bottom-row { display:grid; min-height:0; min-width:0; overflow:visible; }
.top-row { grid-template-columns:minmax(var(--prim-panel-min,0px),var(--top-split)) 5px minmax(0,1fr); }
.bottom-row { grid-template-columns:minmax(0,var(--bottom-split)) 5px minmax(0,1fr); }
.panel { min-width:0; min-height:0; display:flex; flex-direction:column; background:#383838; border:1px solid #202020; }
.panel-menubar { display:flex; height:33px; min-height:33px; flex:none; align-items:flex-start; padding-left:8px; background:#383838; }
/* usdviewstyle.qss:500-508: panel bars use SMALL_FONT_SZ; main bar/popups use BASE. */
.panel-menubar > .menu > summary { font-size:var(--usd-small-font); min-height:calc(var(--usd-small-font) + 6px); line-height:normal; padding:2px 5px; }
.splitter { background:#202020; cursor:col-resize; touch-action:none; }
.splitter.horizontal { cursor:row-resize; }
.splitter:hover,.splitter:focus-visible { background:#606060; }
.tree-columns { font-size:var(--usd-small-font); display:grid; grid-template-columns:var(--prim-columns,minmax(0,1fr) 80px 29px 47px 0px); flex:none; min-height:23px; color:#c9c7c3; background:#4e5054; border-top:1px solid #2a2a2a; border-bottom:1px solid #2a2a2a; }
.tree-columns span { padding:3px 5px; border-right:1px solid #434343; white-space:nowrap; overflow:hidden; }
.tree-host { flex:1; overflow:auto; min-height:0; background:#373737; }
.tree { list-style:none; margin:0; padding:0; }
.tree ul { list-style:none; margin:0; padding:0; }
.prim-row { position:relative; display:grid; grid-template-columns:16px minmax(0,1fr); align-items:center; padding-left:calc(var(--depth)*20px); height:16px; min-height:16px; background:#373737; }
.prim-row[data-alternate] { background:#3b3b3b; }
.prim-row:hover { background:rgb(70,70,70); }
.prim-row.ancestor { background:rgba(189,155,84,.196); }
.prim-row.ancestor:hover { background:rgba(189,155,84,.392); }
.prim-row.selected { background:rgb(189,155,84); }
.prim-row.selected:hover { background:rgb(227,186,101); }
.toggle { width:16px; height:16px; min-height:16px; border:0; background:transparent center/16px 16px no-repeat; padding:0; color:inherit; font-size:var(--usd-base-font); }
.toggle.open { background-image:url("${branchIcons.open}"); }
.toggle.closed { background-image:url("${branchIcons.closed}"); }
.prim-row.selected .toggle.open { background-image:url("${branchIcons.openSelected}"); }
.prim-row.selected .toggle.closed { background-image:url("${branchIcons.closedSelected}"); }
.toggle.spacer { visibility:hidden; }
.prim { display:grid; grid-template-columns:var(--prim-columns,minmax(0,1fr) 80px 29px 47px 0px); align-items:center; width:100%; padding:0; min-height:16px; height:16px; line-height:16px; background:transparent; border:0; border-radius:0; text-align:left; color:var(--prim-color); }
.prim:hover:not(:disabled) { background:transparent; }
.prim[data-font=bold] { font-weight:700; }
.prim[data-font=italic] { font-weight:300; font-style:italic; }
.prim[data-font=normal] { font-weight:400; }
.prim-name,.prim-type,.prim-vis,.prim-guides,.prim-draw-mode { min-width:0; height:16px; padding:0 3px; border-right:1px solid rgb(41,41,41); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.prim-name,.prim-type { color:var(--prim-color); }
.prim-vis,.prim-guides { text-align:center; }
.prim-vis[data-inherited],.prim-guides[data-inherited] { font-weight:300; font-style:italic; }
.prim-guides[data-inherited] { opacity:.5; }
.prim-draw-mode[data-inherited] { font-weight:700; font-style:italic; }
.draw-mode-editor { position:absolute;right:0;top:0;display:flex;gap:0;height:16px;width:116px; }
.draw-mode-editor:not([data-editor-active]) .draw-mode-select {opacity:0}
.draw-mode-editor:not([data-editor-active]) .draw-mode-clear {visibility:hidden!important}
.draw-mode-select { width:100px;min-height:16px;height:16px;padding:0 2px;border-radius:0;font-size:var(--usd-font); }
.draw-mode-clear { width:16px;height:16px;min-height:16px;padding:0;border-radius:0;font-size:var(--usd-font); }
.hierarchy[data-hide-column-4] .prim-draw-mode,.hierarchy[data-hide-column-4] .draw-mode-editor {display:none}
.find-form { display:flex; flex:none; gap:5px; padding:4px; border-top:1px solid #2a2a2a; }
.prim-search { flex:1; }
.find-form button { font-size:var(--usd-base-font); }
.render-panel { overflow:visible; }
.render-menus { flex-wrap:wrap; }
.viewport { position:relative; flex:1; min-width:0; min-height:0; background:#333; overflow:hidden; }
canvas { display:block; width:100%; height:100%; touch-action:none; }
/* stageView.py drawHUD: gold (.733,.604,.333), 15px line spacing,
   top-right at width-160, bottom-right at width-210; drawn over the scene. */
.viewport-hud { position:absolute; inset:0; pointer-events:none; color:rgb(187,154,85); font:9px/15px UsdviewMono,monospace; text-shadow:1px 1px #080808; overflow:hidden; }

.submenu[aria-disabled=true]>summary,.unavailable-submenu>summary {color:#7a7a7a;cursor:default;pointer-events:none}
.hud-info {position:absolute;top:14px;left:0;white-space:pre}
.rollover-info {position:absolute;z-index:12;background:#ffffdc;color:#161616;pointer-events:none;max-width:240px;padding:4px 6px;border:1px solid #555;overflow-wrap:anywhere}
.prim-draw-mode {min-width:0;overflow:hidden;white-space:nowrap;padding:0 3px}
.hierarchy[data-hide-column-0] .prim-name,.hierarchy[data-hide-column-0] .tree-columns>span:nth-child(1) {visibility:hidden}
.hierarchy[data-hide-column-1] .prim-type,.hierarchy[data-hide-column-1] .tree-columns>span:nth-child(2) {visibility:hidden}
.hierarchy[data-hide-column-2] .prim-vis,.hierarchy[data-hide-column-2] .tree-columns>span:nth-child(3) {visibility:hidden}
.hierarchy[data-hide-column-3] .prim-guides,.hierarchy[data-hide-column-3] .tree-columns>span:nth-child(4) {visibility:hidden}
.hierarchy[data-hide-column-4] .prim-draw-mode,.hierarchy[data-hide-column-4] .tree-columns>span:nth-child(5) {visibility:hidden}

.hud-renderer { position:absolute; top:14px; right:20px; width:140px; white-space:pre; }
.hud-performance { position:absolute; bottom:4px; left:0; white-space:pre; text-align:left; }
/* Not part of usdview: marks this viewer as the TypeScript port, so screenshots and side-by-side
   compares are never mistaken for OpenUSD's usdview. In the window's bottom-left corner, under the
   frame slider's start fields (the scrub settings row is centered, so that corner is empty);
   a page overlay, not drawn into the image. */
.ts-sticker { position:absolute; left:8px; bottom:4px; z-index:5; width:92px; height:46px; transform:rotate(-8deg); pointer-events:none; filter:drop-shadow(1px 2px 2px #0008); }
.ts-sticker svg { display:block; width:100%; height:100%; }
.ts-sticker polygon { fill:#FF06B5; stroke:#fff; stroke-width:3; stroke-linejoin:round; }
.ts-sticker text { fill:#fff; font:800 20px/1 system-ui,-apple-system,sans-serif; letter-spacing:-0.2px; }
.ts-sticker .ts-sticker-edition { font-size:16px; font-weight:700; letter-spacing:0.5px; }
.hud-camera { position:absolute; bottom:4px; right:0; width:210px; white-space:nowrap; text-align:center; overflow:hidden; text-overflow:ellipsis; }
@media(max-width:900px) { .hud-camera { width:150px; font-size:var(--usd-base-font); } }

.overlay { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); max-width:90%; width:350px; text-align:center; padding:14px; background:#383838ef; border:1px solid #555; pointer-events:none; }
.overlay strong { display:block; margin-bottom:5px; font-weight:400; }
.overlay p { margin:0; color:#b8b8b8; overflow-wrap:anywhere; }
.overlay .load-progress { margin-top:6px; color:#b8b8b8; font-variant-numeric:tabular-nums; }
.overlay .load-progress:empty { display:none; }
.overlay .load-cancel { margin-top:8px; pointer-events:auto; }
.overlay[data-streaming] { left:8px; top:auto; bottom:8px; transform:none; width:auto; max-width:min(420px,60%); text-align:left; padding:8px 10px; }
.overlay[data-streaming] p { display:none; }
.welcome { position:absolute; left:50%; top:10px; transform:translateX(-50%); z-index:4; max-width:calc(100% - 24px); display:flex; align-items:center; gap:10px; padding:8px 8px 8px 14px; background:#2b2b2bf0; border:1px dashed #9a9a9a; border-radius:4px; box-shadow:0 2px 8px #0006; }
.welcome[hidden] { display:none; }
.welcome p { margin:0; color:#d0d0d0; }
.welcome p strong { color:#fff; }
.welcome .welcome-dismiss { padding:2px 7px; min-width:0; background:none; border:none; color:#aaa; }
.welcome .welcome-dismiss:hover { color:#fff; }
.welcome button { flex:none; }
.property-content { min-height:0; flex:1; overflow:auto; }
.property-table { width:100%; table-layout:fixed; border-collapse:collapse; font-size:var(--usd-base-font); }
.property-table th { position:sticky; top:0; z-index:1; text-align:left; color:#c9c7c3; font-weight:400; background:#4e5054; border:1px solid #333; padding:3px 5px; }
.property-table th:first-child { width:43%; }
.property-table th:nth-child(2) { width:23%; }
.property-table tr { background:#373737; }
.property-table tr:nth-child(even) { background:#3b3b3b; }
.property-table td { padding:2px 5px; height:21px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; border-right:1px solid #434343; }
.property-table td:first-child { color:#d8c498; }
.property-table button { display:block; width:100%; text-align:left; overflow:hidden; text-overflow:ellipsis; background:transparent; border:0; min-height:17px; padding:0; color:inherit; }
.property-table tr.selected { background:var(--selected); color:#161616; }
.property-table tr.selected td { color:#161616; }
/* Native Qt tab bar: 15px at10px font,20px at14px; usdviewstyle.qss:334–403. */
.tabs { display:flex; flex:none; align-items:end; height:calc(var(--usd-base-font) * 1.25 + 3.5px); border-bottom:1px solid #222; background:#383838; padding:0 10px; gap:0; }
.tabs button { white-space:nowrap; font-size:var(--usd-base-font); line-height:1.25; border-radius:3px 3px 0 0; min-height:0; min-width:78px; height:calc(var(--usd-base-font) * 1.25 + 2.5px); padding:0 10px; margin-top:0; }
.tabs button[aria-selected=true] { background:#383838; border-bottom-color:#383838; margin-top:0; }
.inspector-content { flex:1; min-height:0; overflow:auto; background:#383838; }
.empty { margin:0; padding:10px 7px; color:#929292; }
.value-fields { display:grid; grid-template-columns:44px minmax(0,1fr); margin:7px; gap:5px; font-size:var(--usd-base-font); }
.value-fields dt { color:#c9c7c3; padding:4px 0; }
.value-fields dd { margin:0; min-width:0; padding:4px 6px; background:#323232; border:1px solid #282828; overflow-wrap:anywhere; white-space:pre-wrap; font:var(--usd-base-font)/1.4 ui-monospace,monospace; max-height:280px; overflow:auto; }
/* mainWindowUI.ui frameSlider/rangeBegin/rangeEnd/redrawOnScrub/playButton:
   wide range row, centered scrub settings, separate right-hand Play/Frame panel. */
.timeline { flex:none; display:flex; gap:12px; margin:12px 8px 10px; height:86px; color:rgb(227,227,227); font-size:var(--usd-base-font); }
.playback-range { flex:1; min-width:0; display:flex; flex-direction:column; justify-content:space-between; }
.range-controls { display:flex; align-items:center; gap:10px; height:45px; }
.range-controls>input { width:80px; height:22px; flex-shrink:0; }
.timeline input:disabled { background:#323232; border:2px solid #2f2f2f; color:#7a7a7a; opacity:1; }
.timeline[data-disabled] { color:rgb(122,122,122); }
.frame-slider { position:relative; flex:1; min-width:45px; height:40px; border:2px solid #2f2f2f; background:rgb(58,58,58); }
.frame-slider[aria-disabled=false] { cursor:pointer; touch-action:none; }
.frame-slider:focus-visible { outline:1px solid #de9e2e; outline-offset:2px; }
.frame-handle { position:absolute; top:0; bottom:0; left:0; width:24px; border:2px solid #2a2a2a; border-radius:10px; background:linear-gradient(rgb(207,151,53),rgb(229,162,44)); }
.frame-slider[aria-disabled=true] { background:rgb(50,50,50); }
.frame-slider[aria-disabled=true] .frame-handle { background:linear-gradient(rgb(177,161,134),rgb(188,165,125)); }
.scrub-settings { display:flex; justify-content:center; align-items:center; gap:18px; height:28px; }
.scrub-settings label { display:flex; align-items:center; gap:6px; white-space:nowrap; }
.scrub-settings input[type=checkbox] { appearance:none; width:13px; height:13px; padding:0; margin:0; min-width:13px; border:1px solid #1a1a1a; border-radius:3px; background:rgb(229,162,44); }
.scrub-settings input[type=checkbox]:checked:disabled { background:linear-gradient(rgb(177,161,134),rgb(188,165,125)); }
.scrub-settings input[type=checkbox]:not(:checked) { background:#383838; }
.scrub-settings input:not([type=checkbox]) { width:54px; height:21px; text-align:center; }
.playback-current { flex:none; width:145px; border-left:1px solid #2a2a2a; padding-left:16px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; }
.playback-current>button { height:36px; padding:5px 10px; background:linear-gradient(#444,#383838); }
.playback-current label { display:flex; align-items:center; gap:10px; align-self:stretch; }
.playback-current input { width:80px; height:36px; text-align:right; }
@media(max-width:750px) { .timeline { gap:6px; } .range-controls { gap:4px; } .range-controls>input { width:40px; } .playback-current { width:105px; padding-left:6px; } .playback-current input { width:55px; } .scrub-settings { gap:8px; font-size:9px; } }
/* Feedback floats above the timeline; the live region remains in the DOM when quiet. */
.statusbar { position:absolute; right:8px; bottom:8px; z-index:25; display:flex; align-items:end; gap:8px; max-width:calc(100% - 16px); pointer-events:none; color:#de9e2e; font-size:var(--usd-base-font); }
.status { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
.statusbar[data-feedback] .status,.status[data-error=true] { position:static; min-width:0; width:auto; height:auto; clip-path:none; max-width:min(640px,80vw); padding:4px 8px; border:1px solid #252525; background:#383838; box-shadow:0 2px 8px #0006; overflow:hidden; text-overflow:ellipsis; pointer-events:auto; }
.status[data-error=true] { color:#e9b287; white-space:pre-wrap; overflow-wrap:anywhere; max-height:30vh; overflow:auto; }
@media(max-width:750px) { .timeline-note,.app-caption { display:none; } .tabs button { padding:0 4px; min-width:0; }  .panel-menubar { font-size:var(--usd-base-font); } .menu summary,.menu-button { padding:4px; font-size:var(--usd-base-font); } }

.inspection-table td{white-space:pre-wrap;overflow-wrap:anywhere;min-width:100px;max-width:380px}
/* mainWindowUI.ui metadataView: native two-column table, first column sized to
   contents; appController.py:4426. Fixed rows do not grow with value length. */
.metadata-table { table-layout:auto; }
.metadata-table th:first-child { width:1%; white-space:nowrap; }
.metadata-table th:nth-child(2) { width:auto; }
.metadata-table td,.metadata-table td:first-child { color:rgb(227,227,227); white-space:nowrap; overflow-wrap:normal; min-width:0; max-width:none; height:30px; }
.metadata-table td:nth-child(2) { max-width:0; text-overflow:ellipsis; }
.inspection-path{overflow-wrap:anywhere;font-weight:600}

.path-form{display:flex;gap:5px;margin:3px 8px 7px;flex:none}
.path-form .current-path{flex:1;min-width:0;margin:0}
.find-property-form button,.array-page-controls button{padding:2px 9px}
.find-property-form{display:flex;gap:8px;padding:7px;border-top:1px solid #292929}
.property-search{flex:1;min-width:0;padding:3px 6px}
.array-page-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:9px 0}
.array-start{width:95px}.array-count{color:#aaa}.array-value-table td{white-space:pre-wrap;overflow-wrap:anywhere}
.current-path[aria-invalid=true]{border-color:#cb7777}

:host([data-file-drag]) .viewport { outline: 3px solid #b9a17b; outline-offset: -3px; }
.local-root-form[hidden] { display:none; }
.local-root-form { display:grid; gap:6px; padding-top:8px; border-top:1px solid #222; }
.local-root { max-width:100%; }
.local-root-help { white-space:normal; }

/* usdview mainWindowUI.ui property columns; appController.py:3988–4110.
 * Native metrics: tests/fixtures/ui-density/native/metrics.json. QTreeWidget keeps
 * a 20px branch area + 5px icon inset, even on leaf rows; qss:245–255/317–328. */
.property-content .property-table { table-layout:auto; }
.property-content .property-table th:first-child { width:1%; }
.property-content .property-table th:nth-child(2) { width:1%; }
.property-content .property-table th { padding:3px; font-size:var(--usd-small-font); white-space:nowrap; color:rgb(201,199,195); background:rgb(78,80,84); }
.property-content .property-table td { padding:1px 3px; height:max(22px,calc(var(--usd-base-font) * 1.25 + 5.5px)); border-right:1px solid rgb(41,41,41); }
.property-content .property-type { position:relative; width:57px; min-width:57px; white-space:nowrap; padding:1px 0 1px 25px; }
.property-content .property-type .toggle { position:absolute; left:2px; top:50%; transform:translateY(-50%); width:16px; min-height:16px; }
.property-icon { display:inline-block; width:16px; height:16px; vertical-align:middle; background:center/contain no-repeat; flex-shrink:0; }
.property-content .property-name,.property-content .property-value { color:var(--property-color); }
.property-content .property-name { font-weight:700; }
.property-content .property-name button { font-weight:inherit; font-style:inherit; }
.property-content .property-value { width:100%; max-width:0; font-weight:400; }
.property-content [data-interpolated] .property-name,.property-content [data-interpolated] .property-value { font-weight:300; font-style:italic; }
.property-content .property-value[data-targets] { font-weight:700; }
.property-inherited { font-size:8px; font-style:italic; padding-left:5px; }
.property-content .property-target td:first-child { min-width:77px; padding-left:45px; padding-right:0; }
.property-content .property-target td:nth-child(2) { padding-left:3px; font-weight:400; }
.property-content .property-table tr.selected { background:rgb(189,155,84); }
.legend-button { min-width:18px; padding:0 4px; }
.legend-button.selected { background:rgb(189,155,84); color:rgb(227,227,227); }
.legend { padding:8px; flex:none; border-top:1px solid #292929; background:#383838; }
.legend p { margin:5px 0; }
.legend-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px 12px; }
.legend-colors { grid-template-columns:repeat(4,minmax(0,1fr)); }
.legend-grid>span { display:flex; align-items:center; gap:4px; min-width:0; }
.legend-swatch { display:inline-block; width:12px; height:12px; border:1px solid #222; flex-shrink:0; }
pre.value-text { white-space:pre-wrap; margin:6px; font-size:var(--usd-base-font); }
/* Native composition tree: mainWindowUI.ui:1105-1147; usdviewstyle.qss:248-307. */
.composition-tree { border-collapse:collapse; width:100%; font-size:var(--usd-base-font); color:rgb(227,227,227); }
.composition-tree th { position:sticky; top:0; z-index:1; background:rgb(78,80,84); color:rgb(201,199,195); font-size:var(--usd-small-font); font-weight:400; text-align:left; padding:3px 5px; border-right:1px solid #292929; white-space:nowrap; }
.composition-tree td { height:22px; padding:0 5px; white-space:nowrap; border-right:1px solid #292929; }
.composition-tree th:nth-child(3),.composition-tree td:nth-child(3) { width:100%; }
.composition-tree td:nth-child(3) { max-width:0; overflow:hidden; text-overflow:ellipsis; }
.composition-tree tr.alternate { background:rgb(59,59,59); }
.composition-tree tr.dimmed { color:rgb(140,140,140); }
.composition-tree tr.selected { background:rgb(189,155,84); color:rgb(227,227,227); }
.composition-tree tr:focus { outline:none; }
.composition-toggle,.composition-leaf { display:inline-block; width:15px; height:15px; vertical-align:middle; }
.composition-toggle { border:0; padding:0; margin:0; min-height:0; border-radius:0; background:transparent; position:relative; }
.composition-toggle::before { content:''; display:block; width:0; height:0; margin:auto; border-left:5px solid currentColor; border-top:4px solid transparent; border-bottom:4px solid transparent; }
.composition-toggle.open::before { transform:rotate(90deg); }
/* Browser asset choices belong to Open; File retains native action inventory. */
.open-dialog { width:560px; max-width:calc(100vw - 32px); max-height:calc(100vh - 32px); overflow:auto; padding:18px; color:rgb(227,227,227); background:#383838; border:1px solid #888; box-shadow:0 8px 30px #0008; }
.open-dialog::backdrop { background:#0005; }
.open-dialog h2 { margin:0 0 14px; font-size:14px; font-weight:400; }
.open-dialog input[type=file] { display:block; width:100%; margin-bottom:12px; }
.open-dialog p { margin:6px 0 14px; line-height:1.4; color:#bbb; }
.open-dialog .local-root-form { margin:12px 0; padding:12px; border:1px solid #666; }
.open-dialog .local-root-form select { width:100%; margin:5px 0 10px; }
.open-dialog footer { display:flex; justify-content:flex-end; margin-top:16px; }
${layerStackStyles}
`
