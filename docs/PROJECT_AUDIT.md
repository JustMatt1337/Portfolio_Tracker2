# Project Audit: Portfolio_Tracker2

Date: 2026-02-16

## High-level assessment

This is a focused single-page React app with a clear purpose, and it already includes meaningful UX details (metric toggles, scrub interactions, month overlays, privacy masking, and benchmark comparison).

The app builds successfully and is deployable via a GitHub Pages workflow.

## What is working well

- **Clear MVP scope:** one main feature (portfolio progression analysis) with practical controls.
- **Reasonable deployment setup:** static build + Pages deployment through GitHub Actions.
- **Data UX maturity:** supports multiple views (`overall`, `100x`, `overlay`, monthly), multiple metrics, and chart comparisons.
- **Performance-aware touches:** benchmark caching in localStorage and in-flight request de-duplication.

## Main risks / technical debt

1. **Very large component file (`src/PortfolioTracker.jsx`)**
   - The file is over 2,000 lines and mixes data fetching, parsing, transformation, state orchestration, chart rendering, and styling.
   - This raises maintenance cost and regression risk for future changes.

2. **Hardcoded third-party API key in client code**
   - `marketstack` access key is embedded in frontend source.
   - Public client keys are difficult to protect and can be abused/rotated unexpectedly.

3. **No automated tests**
   - The test script exits with "No tests found".
   - Lack of tests is risky given the amount of transformation logic (date parsing, baseline normalization, metric conversion, benchmark alignment).

4. **Tooling drift / config mismatch**
   - Project is JavaScript-first, but `package.json` points `main` to `src/index.tsx` while code uses `src/index.js`.
   - ESLint parser is set to `@typescript-eslint/parser` without related dependency alignment in this repo.

5. **Inline style-heavy implementation**
   - Large amount of inline style objects in component reduces readability and visual consistency controls.

## Prioritized recommendations

### P0 (do next)

1. **Extract logic into modules**
   - Move CSV parsing and benchmark normalization into `src/lib/` pure functions.
   - Move reusable computations into hooks like `usePortfolioStats`, `useBenchmarks`, `useChartSeries`.

2. **Protect API usage**
   - Move benchmark fetch behind a serverless proxy (Netlify/Vercel function or small backend).
   - Store API keys as secrets, not in shipped JS.

3. **Add test baseline**
   - Start with unit tests for `parseCSV`, benchmark alignment, and metric transformations.
   - Add 1-2 component interaction tests (e.g., view/metric toggle + expected chart values).

### P1 (near-term)

4. **Fix package/config consistency**
   - Align `main` with actual entrypoint.
   - Reconcile TypeScript tooling (either commit to TS and migrate, or simplify to JS linting stack).

5. **Decompose UI**
   - Split into components: `HeaderStats`, `ControlsPanel`, `PerformanceChart`, `MonthlySummaryTable`, `LegendPanel`.

### P2 (quality improvements)

6. **Move visual tokens to CSS/theme constants**
   - Reduce inline style duplication.

7. **Observability and resilience**
   - Add user-visible error states and retry controls for both portfolio and benchmark fetches.

## Suggested target architecture

- `src/lib/parseCsv.js`
- `src/lib/benchmarkSeries.js`
- `src/hooks/usePortfolioData.js`
- `src/hooks/useBenchmarks.js`
- `src/hooks/usePortfolioStats.js`
- `src/components/Portfolio/*.jsx`

This retains current UX while making the codebase testable and easier to evolve.
