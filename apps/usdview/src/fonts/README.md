Roboto-Regular.ttf and LICENSE.txt are copied unchanged from OpenUSD v26.11.1, pxr/usdImaging/usdviewq/fonts/Roboto/. The font is bundled locally under its Apache 2.0 license. Native usdview loads this same family in appController.py; no external font service is used.

RobotoMono-Regular.ttf and RobotoMono-LICENSE.txt come from the adjacent OpenUSD Roboto_Mono directory and supply the native HUD family.

Roboto-Bold.ttf, Roboto-Italic.ttf and Roboto-LightItalic.ttf are also copied unchanged from that pinned native Roboto directory, under the same Apache 2.0 license. They supply the actual weights/styles used by prim/property views; synthesizing bold/italic from Regular changes their appearance and metrics. Base font size remains 10px (native 10pt at 72 logical DPI on this Mac).
