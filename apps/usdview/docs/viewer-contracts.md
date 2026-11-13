# Viewer contracts: follow mode and load schedules

Two features of typescript-usdview that go beyond upstream usdview. Neither depends on any other
repository: this page is their specification. Tools that drive or feed the viewer (for example a
sync relay or a tour builder) implement these contracts; the viewer does not know about them.

## Follow mode (`?follow=ws://host:port`)

The viewer follows a **leader** (any program, typically upstream usdview with a sync plugin) that
broadcasts its clock over a WebSocket. The scene is animated in the file, so following is only the
frame, the play state and, optionally, the camera, the file and the refinement complexity.

**Message.** One JSON text message, version 1:

```json
{"v": 1, "file": "<path>", "camera": "<prim path or null>", "frame": 12.0, "playing": true,
 "complexity": "high"}
```

- `file`: the scene the leader shows. A new `file` reopens the viewer; a relative or absolute path
  resolves against the first `?scene=`.
- `camera`: the prim path the leader looks through. `null` means a free camera; the follower keeps
  the camera it has.
- `frame`, `playing`: the leader's time code and play state.
- `complexity` (optional): `low`, `medium`, `high` or `veryhigh`. The follower sets Display >
  Complexity to match; absent, it keeps its own.

**Follower behaviour** (`src/follow.ts`): the follower never runs a clock of its own. Play and frame
stepping are disabled while following. At most one seek is in flight: messages that arrive
meanwhile are dropped except the newest, and when the leader pauses the follower lands on its exact
frame. If the connection drops, the follower stays where it is and reconnects once a second. The
HUD shows `leader · shown · behind <n> frames · render <ms>`.

A server that relays the leader's messages to followers should send each joining client the last
message at once, so a late follower lands on the current frame.

## Load schedule (on when the scene has one; `?loadSchedule=0` turns it off)

A scene may carry a payload **load schedule** in its root layer's metadata:

```usda
customLayerData = {
    dictionary tourLoad = {
        dictionary carriers = {
            int2 "/World/Hall_A" = (1755, 2312)
        }
        int lead = 48
    }
}
```

- Each **carrier** is a prim path with an inclusive frame window `(first, last)`.
- At frame f the viewer loads every carrier whose window holds f, with its descendants, and unloads
  the others, in one `UsdStage::LoadAndUnload` per change (`src/load-schedule.ts`).
- A carrier counts as loaded when any of its children with payloads is loaded; the carrier itself
  has no payload.
- The stage opens unloaded and the start frame's carriers load before the first draw. Payloads
  outside every carrier load as they would without a schedule. This is the default for a scene whose
  root layer has a schedule (`PLATFORM-DIVERGENCE(usdview-load-schedule-default)`: usdview applies
  one only through a load-schedule plugin and `--unloaded`). `?loadSchedule=0` or `?progressive=0` loads
  every payload, as usdview does; `?loadSchedule=1` asks for the schedule and warns when the scene
  has none.
- `lead` is informational: how many frames before the camera arrives a window opens.
- **Read ahead** (`src/load-prefetch.ts`), a web adaptation: in usdview the `LoadAndUnload` opens
  the payloads' layers synchronously; in the browser each open is a fetch and a parse. So for the
  48 frames before a carrier's window opens, the viewer opens, in the background and under the
  stage's resolver context, the layers that carrier's payloads will bring in (the payload layers
  and, transitively, the sublayers, references and payloads they name) and holds them through the
  window's first frame. The load at that frame finds them open and only composes. The images those
  layers name (asset-valued attributes with an image extension) are read and decoded ahead too, and
  held until 24 frames after the window opens: usdview's first draw after the load opens the new
  textures synchronously, while Storm here draws nothing until they are read
  (`PLATFORM-DIVERGENCE(hio-image-read-ahead)`). Nothing loads early: the loaded set, and so every
  frame drawn, is the schedule's.

The schedule is not part of follow mode: each viewer applies it by its own frame, so a leader and
its followers hold the same loaded set at the same frame, and a viewer playing alone does too. A
viewer that ignores the schedule loads every payload, as USD does by default.

## Working set (on for a scene with a camera and extentsHint; `?workingSet=0` turns it off)

A scene with no load schedule, opened with `?camera=` (as a tour is), whose
payload prims author `extentsHint` (UsdGeomModelAPI), plays with a **working
set**: the viewer keeps loaded only the payloads near that camera's path
(`src/working-set.ts`, PLATFORM-DIVERGENCE(usdview-working-set); usdview loads
every payload). Nothing is authored for it beyond `extentsHint`, which a payload
prim carries beside its payload so its bounds are known while it is unloaded.

When the scene opens (payloads unloaded), the viewer samples the camera every
2 frames over the scene's frame range. A payload is **wanted** at a frame when
its extentsHint box (the union of its purposes, in world space) is within 8 m of
the camera, or intersects the camera's frustum out to 60 m, widened to cover any
viewport from square to 2.4:1. From that, each payload gets frame windows:

- it loads 48 frames before it is first wanted, and unloads 72 frames after it
  was last wanted, or later while the camera stays within 40 m of it;
- windows of one payload less than 480 frames apart merge, so a payload that
  comes in and out of view is not loaded again and again;
- a payload prim without extentsHint is wanted at every frame;
- a payload never wanted is never loaded.

The windows are applied as a load schedule's are (carriers are the payload
prims): one `UsdStage::LoadAndUnload` per change, the layers and images read
ahead. One difference: at most 2 payloads load (and 2 unload) per frame while
they are in their 48-frame lead-in, needed soonest first, so many windows
opening together spread their loads (each load syncs its prims in that frame's
draw). A payload already needed on screen (the first frame, a seek) loads at
once.

Measured on the USD Museum's tour (Node, CPU only, the first two wings): with
the working set the first frame comes in 2.2 s instead of 4.3 s and the median
frame takes 6.8 ms instead of 25.1 ms. At 60 m, five frames of the 11,839 show
something 70-100 m down a row of doorways appear a moment late (a render of the
frame before every load and after every unload, with the working set and with
everything loaded); at 120 m there are none, with a median frame of 16 ms.
