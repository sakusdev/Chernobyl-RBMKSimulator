# Chernobyl RBMK Simulator

A modern browser-based RBMK-1000 plant dynamics simulator built with TypeScript and Cloudflare Workers.

> This project is an educational simulation. It is not an engineering, safety-analysis, or operator-training tool.

## Current scope

- Responsive operator console
- Deterministic fixed-step reactor model
- Simplified point-kinetics and thermal feedback
- Control-rod and AZ-5 controls
- Live trends, alarms, and event log
- Cloudflare Workers deployment
- Future Rust/WebAssembly simulation core

## Development

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run deploy
```

## Architecture

- `src/worker.ts`: Cloudflare Worker and static asset routing
- `src/client/`: browser UI and render loop
- `src/sim/`: deterministic simulation core
- `public/`: static shell and assets

## License

MIT
