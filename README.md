# Comic Studio

A local image editor powered directly by the [Comical JS](https://github.com/BloomBooks/comical-js) Git submodule. Choose an image, add and edit comic balloons, and export the finished image at its original resolution. Images and projects stay in the browser; the Node server only serves static application files.

## Run locally

Install Node.js 22 or newer, then:

```sh
git submodule update --init --recursive
npm install
npm start
```

Open **http://127.0.0.1:3000**. The server builds the browser bundle on startup and listens only on localhost. To use a different port:

```sh
PORT=3001 npm start
```

For a fresh checkout, clone with `git clone --recurse-submodules <repository-url>`. The included `pnpm-lock.yaml` also supports `pnpm install` and `pnpm start`. Development changes take effect after restarting the server. `npm run build` builds the client without starting the server.

## Editing

- Choose or drop a PNG, JPEG, WebP, GIF, AVIF, or BMP image. The sample canvas provides a quick way to try the editor.
- Click a style in the toolbox to add a balloon. Drag the text or the green grip to move it; drag the corner handle to resize.
- Edit dialogue in the right panel, or double-click it on the canvas. Escape or clicking outside finishes inline editing. Text that exceeds the content box is clipped: enlarge the box or reduce the font size to fit it.
- Select a balloon, then drag its orange tail handles. The panel also provides precise tip and curve coordinates, automatic/manual curvature, and up to eight tails.
- Use Fit and the zoom buttons to navigate. Arrow keys move the selected balloon; Shift moves it by ten pixels. Delete/Backspace removes it. Ctrl/⌘ Z and Ctrl/⌘ Shift Z undo/redo, with up to 50 history steps.
- **Save project** downloads a `.comic.json` file containing the original image, text, position, formatting, and Comical specifications. **Open project** restores it. Replacing an image starts a new canvas; Undo restores the previous one. Work is held in memory until saved, so save a project before refreshing or closing the tab.
- **Export image** downloads PNG, JPEG, or WebP at the original image dimensions. Editing handles are excluded; the live canvas stays editable. PNG and WebP preserve transparency. JPEG uses a white background. Animated inputs export their rendered frame as a still image.

## Styles and effects

The palette exposes all implemented Comical styles: speech, thought, shout, ellipse, pointed arcs (Burst), circle, caption, caption with a tail, rectangle, and text only.

Available settings include solid/transparent fill, vertical gradients with up to eight colors, a colored double outline, shadow offset, corner X/Y radii for rectangular styles, and tail coordinates and automatic curvature. Typography controls include four local font families, size, color, bold, italic, and alignment.

**Position & connections** exposes family/layer and order. Connect a balloon to its predecessor to create a linked family, or make it independent. Family members share the first balloon's appearance; overlapping shapes merge. Comical renders shape layers beneath the HTML text. `borderStyle` and independent tail `style` fields are documented upstream as unimplemented, so the editor does not expose them as working effects. Comical fixes the main outline to black and sets its thickness by shape.

Limits: 100 balloons per canvas, 30 MB input image, 8192 pixels per side, 32 megapixels, and 50 MB project files. Local font availability determines the Comic typeface (Comic Sans/Chalkboard with a cursive fallback).

## Implementation and checks

`server.mjs` is a small Node HTTP server with no upload or write endpoints. `scripts/build.mjs` bundles `src/app.ts` and `vendor/comical-js/src/index.ts` with esbuild; the submodule source is used directly, without installing its Storybook or older webpack development stack. Paper.js matches the version requested by the submodule. Export uses Comical's non-destructive SVG export and html-to-image to capture both balloon shapes and HTML text.

```sh
npx playwright install chromium
npm test
```

Tests cover project validation and history, static server boundaries, all balloon styles, movement/resizing, tail dragging, inline text, undo/redo, family deletion, project round trips, and original-resolution PNG/JPEG/WebP exports including transparency and image/balloon pixel checks. Chromium is the tested browser.

The application is covered by the repository's GPL license. Comical JS retains its own MIT license in the submodule.
