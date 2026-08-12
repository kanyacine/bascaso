# Screenshot editor

Composes App Store screenshots inside the app and pushes them to App Store Connect.
Ported from [appscreen](https://github.com/YUZU-Hub/appscreen) by YuzuHub (MIT –
`docs/licenses/appscreen-MIT.txt`). Files carrying ported code say so in a header comment.

Entry point: the **Edit screenshots** button on an app's Screenshots page, at
`/dashboard/apps/{appId}/screenshots/editor`.

## The document

One app has one working document (`kind='current'`) plus any number of named snapshots
(`kind='version'`), all in the `screenshot_docs` table as a JSON blob. `ScreenshotDoc`
(`src/lib/screenshot-editor/types.ts`) holds an array of screenshots, the working languages,
the working formats and the defaults a new screenshot starts from.

The doc holds **no bitmaps** – only refs. Imported images are written to
`<data dir>/screenshot-assets/<appId>/<ulid>.<ext>` by `src/lib/screenshot-editor-assets.ts`,
which sniffs magic bytes rather than trusting the upload's declared type, and the doc keeps
the file name. A doc is rejected past 4 MB (`MAX_DOC_BYTES`): anything that big means bitmaps
leaked into it.

Two axes multiply every screenshot's source image: **device category** and **language**.
An unset combination inherits – see the fallback order in `images.ts` and `crop.ts` – so one
imported image covers every language and format until you override it.

Edits go through `editorReducer` (pure, `reducer.ts`), autosave is debounced 800 ms and
flushed with `keepalive` on unmount, and undo is a snapshot stack coalesced per control
(`history.ts`). Documents move in and out as JSON from the versions dialog.

## Rendering

`render/compose.ts` draws one screenshot onto a canvas, in this order: background and noise,
`behind-screenshot` elements, the capture (2D, or the pre-rendered 3D mockup), then
`above-screenshot` elements, popouts, text and `above-text` elements. It takes a `RenderEnv`
with a `createCanvas` factory instead of touching the DOM, so the same code runs under
`@napi-rs/canvas` in tests – that is what `tests/unit/screenshot-editor/render-*.test.ts`
exercise.

The 3D device mockup is rendered separately by three.js (`three-renderer.ts`, `three-scene.ts`)
into a transparent bitmap at canvas size, then handed to the composer as one more image. Models
live in `public/screenshot-editor/models/`.

Canvas dimensions come from `EDITOR_FORMATS` (`devices.ts`), derived from
`src/lib/asc/display-types.ts` so the editor cannot drift from the ASC catalog. A new document
seeds its working formats from the display types the app already ships, falling back to the
formats its declared platforms allow.

## Export

`buildExportPlan` (`export.ts`) turns the dialog's choices into one job per language × format.
Rendering and shipping live in `useEditorExport` (`src/lib/hooks/use-editor-export.ts`):

1. A named snapshot is written first. An ASC export purges the target sets, so a snapshot that
   fails aborts the run – it is the only way back.
2. Each job renders from a **derived** doc (translations applied, format switched), never the
   live one.
3. **zip** – PNGs are posted to `/api/apps/{appId}/screenshot-doc/export-zip` as
   `<lang>/<format>/<n>.png`, split into archives of `MAX_ZIP_FILES` (600) because the route
   buffers the whole body.
   **ASC** – for each job, find or create the screenshot set for that display type, delete what
   is in it, then upload in strip order, capped at Apple's `ASC_MAX_SCREENSHOTS_PER_SET` (10).
   The section mirrors ASC, so there is no local merge.

Listing locales that are not working languages can be translated on the way out
(`use-editor-translation.ts`): items are batched per language through `/api/ai`, so it obeys
the normal tier routing and counts as one managed action per gesture.

## Fonts

The picker offers the fonts installed on the machine, via the Local Font Access API. Google
Fonts is **off by default** (`screenshot_editor_google_fonts` in `app_preferences`, toggled in
Settings → Screenshot editor): turning it on adds an Online tab, and loading a family from it
sends the machine's IP to `fonts.googleapis.com`. That is the only outbound host the editor
adds, and `next.config.ts`'s CSP allows exactly it plus `fonts.gstatic.com`. Every family a doc
uses is awaited before an export rasterises, so a fallback face never gets baked into a PNG.

## Key files

| Path | What |
|---|---|
| `src/app/dashboard/apps/[appId]/screenshots/editor/page.tsx` | The workspace: strip, canvas, tabbed panels |
| `src/components/screenshot-editor/*` | Panels, dialogs, pickers |
| `src/lib/screenshot-editor/types.ts` | `ScreenshotDoc` and the render-side types |
| `src/lib/screenshot-editor/reducer.ts` | Every edit |
| `src/lib/screenshot-editor/render/*` | The canvas engine |
| `src/lib/screenshot-docs.ts` | Document and snapshot persistence |
| `src/lib/screenshot-editor-assets.ts` | Image store on disk |
| `src/app/api/apps/[appId]/screenshot-doc/*` | Load/save, assets, versions, zip |
