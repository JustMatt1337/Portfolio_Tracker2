# Portfolio_Tracker

A React-based portfolio tracker with multiple views, metrics, and benchmark overlays.

## Development

```bash
npm install
npm start
```

## Build

```bash
npm run build
```

## Tests

```bash
npm test -- --watchAll=false
```

## Environment variables

To enable benchmark overlays, define a Marketstack API key:

```bash
REACT_APP_MARKETSTACK_KEY=your_key_here
```

Without this key, benchmark overlays will gracefully stay empty.
