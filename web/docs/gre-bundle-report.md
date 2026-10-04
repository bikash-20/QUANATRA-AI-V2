# GRE Module Bundle Report

Captured by `node scripts/bundle-report.mjs` after a fresh `npm run build` on
this commit. The script reads each route's `page_client-reference-manifest.js`
and sums the on-disk bytes of every chunk in `entryJSFiles`, which is the
app-router equivalent of "First Load JS".

Note: Turbopack was used (Next 16 default); chunks are minified but not
gzipped, so the numbers overstate what users download over a real
connection by roughly 3-4x.

## Per-route First Load JS

```
Route                                          First Load JS (KB)
-----------------------------------------------------------------
gre                                                  68.7
gre/progress                                         73.8
gre/quant                                            67.9
gre/quant/[topic]                                   225.4
gre/quant/mock                                       81.0
gre/quant/problem/[id]                              614.4
gre/roadmap                                          69.3
gre/vocab                                            64.2
gre/vocab/[set]                                      71.2
gre/vocab/[set]/quiz                                 77.2
gre/vocab/word/[id]                                  68.6
```

## Top three GRE routes and why

1. **`/gre/quant/problem/[id]` — 614 KB**
   Mounts the full `GreProblemSolver` island: keyboard shortcuts, AI
   explain with markdown rendering, bookmark/reporting, and four input
   shapes (mcq / multi / qc / numeric). The island depends on the
   explanation fetch + the markdown content renderer.

2. **`/gre/quant/[topic]` — 225 KB**
   Server-renders the question list and ships the `GreProblemList`
   island (filter URL state, status icons, bookmark toggles, pagination
   footer).

3. **`/gre/quant/mock` — 81 KB**
   Mounts `GreMockEntry`, which on first load builds a fresh 12-question
   mock and hydrates the timer + flag UI.

## Lightest GRE routes

`/gre`, `/gre/vocab`, and `/gre/vocab/word/[id]` all come in around 64–69
KB — these are server-rendered with thin or no client islands.

## Whole-app total

```
All routes: 24 routes, sum 4840.2 KB
GRE routes: 11 routes, sum 1481.7 KB (≈31% of total)
```

The GRE module ships ~30% of the app's first-load JS budget despite
covering 11 of the 24 routes, which means the median GRE route is
actually lighter than the median non-GRE route (1481/11 ≈ 135 KB
average per GRE route vs (4840 − 1481) / 13 ≈ 258 KB for the rest).

## How to regenerate

```sh
cd web
npm run build          # writes .next/
node scripts/bundle-report.mjs
```