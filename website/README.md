# The Iteration Café

A math blog by S. Viswanathan.

A standalone mathematical blog with 84 posts in eight series and an interactive complex-dynamics Laboratory. The personal academic webpage remains separate at https://sites.google.com/view/viswanathan1729/navigate.

The full manuscripts and private notes are not part of this public edition.

## Local preview

Requires Node.js 22.13 or newer and pnpm 10.

```sh
pnpm install --frozen-lockfile
pnpm dev:pages
```

## Build and checks

```sh
node scripts/check-content.mjs --public
node --experimental-strip-types --test scripts/dynamics.test.mjs
pnpm build:pages
```

The static site is generated in `dist-pages/`. Every post, series, and archive page has a clean, directly loadable URL. Retired hash links redirect to their current location, including pagination and exact theorem references. The build also produces full-text search data, RSS, a sitemap, canonical metadata, and readable HTML before JavaScript loads.

## GitHub Pages

In the repository's Settings → Pages, choose GitHub Actions as the publishing source. The included workflow checks and publishes updates pushed to `main` or `master`; it can also be run manually from the Actions tab.

## Content

The complete generated article records are split into one lazy module per post; the archive index contains only the opening previews and navigation metadata. Illustrations are in `public/figures/`, and interactive mathematics is in `components/` and `lib/`. The numerical plots are finite approximations, not proofs of membership or pointwise holomorphic-motion computations. Dependencies retain their respective licences; no blanket licence is granted for the manuscripts or supplied figures.

The Laboratory includes The Quadratic Explorer, Moving the External Maps, thirteen classical Julia presets, a linked Mandelbrot field guide and a real critical-orbit bifurcation diagram. Drag to pan; pinch or Ctrl+scroll to zoom; the Scroll selector switches ordinary wheel/trackpad scrolling between panning and zooming. Unmodified +/− zoom the focused plot, Alt+arrows pan, and Home resets. Sources, exact parameter definitions and approximation notes are in `docs/laboratory.md`.

The correspondence workbench keeps the verified round model for `−3/5≤c≤3/5` intact. Its two additional modes compute the full algebraic five-image fibre, winding cells, finite orbit trees, and finite-depth existential/universal survival beyond the pinching range. They deliberately do not call those exploratory pictures tiling, non-escaping, or limit sets. Mathematical scope and numerical safeguards are recorded in `docs/correspondence.md`.
