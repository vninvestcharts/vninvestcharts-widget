// Phase 0.4 (2026-09-27): the alias below pointed at
// ../packages/vn-kline-engine-core/dist/index.d.ts — a path that does not exist
// in the widget repo, and a .d.ts cannot be aliased as a runtime module.
// @vninvestcharts/engine-core is a real dependency, so Vite resolves it from
// node_modules (symlinked to the twin repo) without any alias.
import { defineConfig } from 'vite';

export default defineConfig({});
