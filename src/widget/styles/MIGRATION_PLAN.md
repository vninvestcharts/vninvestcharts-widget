# Migration Plan: `.rsc-` → `.vnsc-` CSS Namespace

## Status: Planned (not yet executed)

## Current State

| File | Prefix | Lines | Action |
|---|---|---|---|
| `src/lib/styles/pane-overlays.css` | `.rsc-` | 216 | Migrate → `.vnsc-` |
| `src/lib/styles/chart-splitter.css` | `.rsc-` | 72 | Migrate → `.vnsc-` |
| `src/demo/demo.css` | `.gc-` + `.rsc-` | ~600 | Keep for demo (Phase 5) |

## Migration Strategy

### Phase A: Duplicate + Rename (non-breaking)
1. Copy `pane-overlays.css` → `src/widget/styles/pane-overlays.css`
2. Find/replace `.rsc-` → `.vnsc-` in the copy
3. Components in `src/widget/components/` import the `.vnsc-` version
4. Components in `src/lib/` continue using `.rsc-` version (backward compatible)

### Phase B: Switch consumers (flag-gated)
1. Add `useVnscStyles` flag to widget provider
2. When true, components import `.vnsc-` styles
3. When false (default), fall back to `.rsc-` styles
4. Test both modes

### Phase C: Cleanup (after Phase 5 demo consolidation)
1. Once demo uses `.vnsc-` exclusively, remove `.rsc-` files
2. Update all remaining references
3. Remove `useVnscStyles` flag — always use `.vnsc-`

## Risk Mitigation
- `.rsc-` and `.vnsc-` can coexist — different class names, no collision
- Demo shell keeps `.gc-`/`.rsc-` until Phase 5 complete
- No big-bang rename — gradual migration per component

## Timeline
- Phase A: After Phase 4 complete
- Phase B: During Phase 5
- Phase C: Post Phase 5 closeout
