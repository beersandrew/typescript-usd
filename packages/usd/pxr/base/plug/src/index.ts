// typescript-usd/plug — plugin metadata registry (base/plug).
//
// Mirrors OpenUSD pxr/base/plug, the metadata/type-declaration slice
// UsdSchemaRegistry consumes, plus library loading: a plugin registered from
// a plugInfo URL imports its LibraryPath ES module when loaded. Filesystem
// discovery reads PXR_PLUGINPATH_NAME where the host has files (Node); a
// browser page registers plugins with resources attached or by URL (WEB-SUB).

export { PlugRegistry as Registry } from "./registry.ts";
export type { PlugDidRegisterPluginsListener as DidRegisterPluginsListener, PlugRegisterPluginsOptions as RegisterPluginsOptions, PlugRegisterPluginsAsyncOptions as RegisterPluginsAsyncOptions } from "./registry.ts";
export { PlugPlugin as Plugin, PlugFindPluginResource } from "./plugin.ts";
export { PlugNotice as Notice } from "./notice.ts";
export { PlugStaticInterface, Plug_StaticInterfaceBase } from "./staticInterface.ts";
export { Plug_InterfaceFactory } from "./interfaceFactory.ts";
export { Plug_RegistrationMetadata } from "./info.ts";
export type { PlugInfo as Info, PlugInfoPlugin as InfoPlugin, PlugInfoTypeEntry as InfoTypeEntry, PlugResources as Resources, PlugResourceLoader as ResourceLoader } from "./info.ts";
