# ⚡ vite-plugin-tiny-spa

🚀 Ship a Vite SPA as **one tiny `index.html`** while loading selected npm packages from an ESM CDN like [esm.sh](https://esm.sh/).

Perfect for **ESP32 dashboards**, small device admin panels, captive portals, and any static target where a full Vite asset folder is too bloated for limited disk.

## ✨ What you get

- 📦 **One deployable file** — JS, CSS, images, fonts, and public assets are folded into `index.html`.
- 🌐 **CDN-powered dependencies** — keep big third-party packages off your device and import them from esm.sh.
- 🔒 **Pinned CDN URLs** — package versions are pinned from installed dependencies by default.
- 🛠️ **Zero dev friction** — Vite dev/HMR still uses local `node_modules`.
- 🧪 **Strict by default** — builds fail if local emitted asset references remain.

## 🧠 Why

ESP32 and similar devices are great at serving one static file, but not great at storing and serving a full Vite asset graph. `vite-plugin-tiny-spa` lets the device host the app shell while the browser fetches optional third-party ESM dependencies from a CDN.

## 📥 Install

```bash
npm install -D vite-plugin-tiny-spa
```

## ⚙️ Usage

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { tinySpa } from "vite-plugin-tiny-spa";

export default defineConfig({
  plugins: [
    tinySpa({
      cdn: {
        origin: "https://esm.sh",
        query: { target: "es2022" },
      },
    }),
  ],
});
```

Build output defaults to a single `index.html`. The inlined module can still import CDN dependencies:

```js
import { highlight } from "https://esm.sh/sugar-high@1.2.1?target=es2022";
```

Upload that `index.html` to your ESP32 filesystem and serve it with `text/html`.

## 🧩 Options

```ts
tinySpa({
  cdn: {
    origin: "https://esm.sh",
    packages: ["sugar-high"], // default: package.json dependencies
    include: ["lodash-es"], // add to defaults
    exclude: ["@private/package"], // keep bundled
    pinVersions: true, // default: true
    query: { target: "es2022" },
  },
  singleFile: {
    inlineScripts: true,
    inlineStyles: true,
    inlineAssets: true,
    removeInlinedAssets: true,
    strict: true,
    disableCodeSplitting: true,
  },
});
```

Disable either half when needed:

```ts
tinySpa({ cdn: false }); // 📄 one HTML file, no CDN rewriting
tinySpa({ singleFile: false }); // 🌐 CDN rewriting only
```

## 🚢 Production notes

- 🌐 CDN dependencies require network access from the browser. For fully offline firmware, set `cdn: false` and let Vite bundle dependencies into the single file.
- 📌 The default CDN package set is `dependencies` from the consuming app's `package.json`; use `exclude` for packages that are not browser-safe.
- 🚨 `singleFile.strict` fails the build if emitted local asset references remain in `index.html`.
- 🧭 The plugin targets SPA builds. Multi-page builds should configure one HTML entry per deployment target.

## ✅ Validate this repository

```bash
npm run lint
npm run typecheck
npm run test
```

`npm run test` builds the plugin, builds the minimal fixture app, verifies `playground-dist` contains only `index.html`, verifies the fixture dependency import points to esm.sh, and verifies the distributable plugin JS and type declarations exist under `dist/`.
