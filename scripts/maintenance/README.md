# Maintenance Scripts

This directory contains consolidated maintenance scripts for the VNInvestCharts project. These scripts were previously scattered in the root directory and `scratch/` folder.

## Script Index

| Script | Purpose | Related Issues | Usage | Status |
|--------|---------|----------------|-------|--------|
| `fix-coordinate-bridge.js` | Fix coordinate bridge interface/types/calls | #123, #145, #167 | `node scripts/maintenance/fix-coordinate-bridge.js [--dry-run]` | Active |
| `fix-drawing-imports.js` | Fix drawing serialization/deserialization/imports | #89, #90, #91 | `node scripts/maintenance/fix-drawing-imports.js [--dry-run]` | Active |
| `fix-workspace-state.js` | Fix workspace serialization/state hydration | #101, #102 | `node scripts/maintenance/fix-workspace-state.js [--dry-run]` | Active |
| `fix-settings-modal.js` | Fix settings modal props/component/persistence | #110, #111, #112 | `node scripts/maintenance/fix-settings-modal.js [--dry-run]` | Active |
| `fix-clock-adapter.js` | Fix clock adapter interface/implementation/hooks | #120, #121, #122 | `node scripts/maintenance/fix-clock-adapter.js [--dry-run]` | Active |
| `fix-adapters-index.js` | Fix adapter exports/types/index structure | #130, #131, #132 | `node scripts/maintenance/fix-adapters-index.js [--dry-run]` | Active |
| `fix-useWidget-hooks.js` | Fix useWidgetOverlays/useWidgetSettings hooks | #140, #141, #142 | `node scripts/maintenance/fix-useWidget-hooks.js [--dry-run]` | Active |
| `fix-test-mocks.js` | Fix test mock setup/consolidation | #150, #151 | `node scripts/maintenance/fix-test-mocks.js [--dry-run]` | Active |
| `fix-test-engine-mocks.js` | Fix engine test mocks/kernel engine mocks | #152, #153 | `node scripts/maintenance/fix-test-engine-mocks.js [--dry-run]` | Active |
| `fix-portal.py` | Fix portal adapter implementation | - | `python scripts/maintenance/fix-portal.py` | Active |
| `fix-points.py` | Fix drawing points handling | - | `python scripts/maintenance/fix-points.py` | Active |
| `fix-move-point.py` | Fix drawing point movement | - | `python scripts/maintenance/fix-move-point.py` | Active |
| `fix-crosshair.py` | Fix crosshair rendering | - | `python scripts/maintenance/fix-crosshair.py` | Active |
| `fix-sync.py` | Fix synchronization logic | - | `python scripts/maintenance/fix-sync.py` | Active |
| `fix-snapshot-preview-modal.js` | Fix snapshot preview modal | - | `node scripts/maintenance/fix-snapshot-preview-modal.js [--dry-run]` | Active |
| `fix-storage-adapter.js` | Fix storage adapter implementation | - | `node scripts/maintenance/fix-storage-adapter.js [--dry-run]` | Active |
| `fix-window-event-adapter.js` | Fix window event adapter | - | `node scripts/maintenance/fix-window-event-adapter.js [--dry-run]` | Active |
| `fix-pixel-ratio.js` | Fix pixel ratio handling | - | `node scripts/maintenance/fix-pixel-ratio.js [--dry-run]` | Active |
| `fix-import-drawings.py` | Fix drawing import (legacy) | - | `python scripts/maintenance/fix-import-drawings.py` | Archived |
| `fix-import-drawings2.py` | Fix drawing import v2 (legacy) | - | `python scripts/maintenance/fix-import-drawings2.py` | Archived |
| `fix-import-drawings3.py` | Fix drawing import v3 (legacy) | - | `python scripts/maintenance/fix-import-drawings3.py` | Archived |
| `fix-workspace-state.py` | Fix workspace state (legacy) | - | `python scripts/maintenance/fix-workspace-state.py` | Archived |
| `fix-workspace-state2.py` | Fix workspace state v2 (legacy) | - | `python scripts/maintenance/fix-workspace-state2.py` | Archived |
| `fix-adapters-index-final.js` | Fix adapter index final (legacy) | - | `node scripts/maintenance/fix-adapters-index-final.js [--dry-run]` | Archived |
| `fix-adapters-index-final2.js` | Fix adapter index final v2 (legacy) | - | `node scripts/maintenance/fix-adapters-index-final2.js [--dry-run]` | Archived |
| `fix-adapters-index-types.js` | Fix adapter index types (legacy) | - | `node scripts/maintenance/fix-adapters-index-types.js [--dry-run]` | Archived |
| `fix-clock-adapter-impl.js` | Fix clock adapter impl (legacy) | - | `node scripts/maintenance/fix-clock-adapter-impl.js [--dry-run]` | Archived |
| `fix-clock-adapter-interface.js` | Fix clock adapter interface (legacy) | - | `node scripts/maintenance/fix-clock-adapter-interface.js [--dry-run]` | Archived |
| `fix-useClockAdapter.js` | Fix useClockAdapter hook (legacy) | - | `node scripts/maintenance/fix-useClockAdapter.js [--dry-run]` | Archived |
| `fix-useClockAdapter2.js` | Fix useClockAdapter hook v2 (legacy) | - | `node scripts/maintenance/fix-useClockAdapter2.js [--dry-run]` | Archived |
| `fix-coordinate-bridge-call.js` | Fix coordinate bridge call (legacy) | - | `node scripts/maintenance/fix-coordinate-bridge-call.js [--dry-run]` | Archived |
| `fix-coordinate-bridge-interface.js` | Fix coordinate bridge interface (legacy) | - | `node scripts/maintenance/fix-coordinate-bridge-interface.js [--dry-run]` | Archived |
| `fix-coordinate-bridge-interface2.js` | Fix coordinate bridge interface v2 (legacy) | - | `node scripts/maintenance/fix-coordinate-bridge-interface2.js [--dry-run]` | Archived |
| `fix-coordinate-bridge-interface3.js` | Fix coordinate bridge interface v3 (legacy) | - | `node scripts/maintenance/fix-coordinate-bridge-interface3.js [--dry-run]` | Archived |
| `fix-coordinate-bridge-syntax.js` | Fix coordinate bridge syntax (legacy) | - | `node scripts/maintenance/fix-coordinate-bridge-syntax.js [--dry-run]` | Archived |
| `fix-coordinate-bridge-syntax2.js` | Fix coordinate bridge syntax v2 (legacy) | - | `node scripts/maintenance/fix-coordinate-bridge-syntax2.js [--dry-run]` | Archived |
| `fix-useWidgetCoordinateBridge.js` | Fix useWidgetCoordinateBridge hook (legacy) | - | `node scripts/maintenance/fix-useWidgetCoordinateBridge.js [--dry-run]` | Archived |
| `fix-settings-modal-props.js` | Fix settings modal props (legacy) | - | `node scripts/maintenance/fix-settings-modal-props.js [--dry-run]` | Archived |
| `fix-settings-modal.js` | Fix settings modal (legacy) | - | `node scripts/maintenance/fix-settings-modal.js [--dry-run]` | Archived |
| `fix-useWidgetSettings.js` | Fix useWidgetSettings hook (legacy) | - | `node scripts/maintenance/fix-useWidgetSettings.js [--dry-run]` | Archived |
| `fix-useWidgetSettings2.js` | Fix useWidgetSettings hook v2 (legacy) | - | `node scripts/maintenance/fix-useWidgetSettings2.js [--dry-run]` | Archived |
| `fix-useWidgetOverlays-settings.js` | Fix useWidgetOverlays settings (legacy) | - | `node scripts/maintenance/fix-useWidgetOverlays-settings.js [--dry-run]` | Archived |
| `fix-useWidgetOverlays-settings2.js` | Fix useWidgetOverlays settings v2 (legacy) | - | `node scripts/maintenance/fix-useWidgetOverlays-settings2.js [--dry-run]` | Archived |

## Usage

All scripts support a `--dry-run` flag to preview changes without modifying files:

```bash
# Dry run (preview only)
node scripts/maintenance/fix-coordinate-bridge.js --dry-run

# Apply fixes
node scripts/maintenance/fix-coordinate-bridge.js
```

## Consolidation History

These scripts were consolidated from 34 individual fix scripts in the root directory and 3 scripts in `scratch/` on 2026-06-25 as part of ADR-0006.

### Consolidation Mapping

| Domain | Source Scripts | Target Script |
|--------|----------------|---------------|
| Coordinate Bridge | fix_coordinate_bridge_interface.js, fix_coordinate_bridge_interface2.js, fix_coordinate_bridge_interface3.js, fix_coordinate_bridge_call.js, fix_coordinate_bridge_syntax.js, fix_coordinate_bridge_syntax2.js, fix_useWidgetCoordinateBridge.js | fix-coordinate-bridge.js |
| Drawing Imports | fix_import_drawings.py, fix_import_drawings2.py, fix_import_drawings3.py | fix-drawing-imports.js |
| Workspace State | fix_workspace_state.py, fix_workspace_state2.py | fix-workspace-state.js |
| Settings Modal | fix_settings_modal_props.js, fix_settings_modal.js, fix_useWidgetSettings.js, fix_useWidgetSettings2.js | fix-settings-modal.js |
| Clock Adapter | fix_clock_adapter_impl.js, fix_clock_adapter_interface.js, fix_useClockAdapter.js, fix_useClockAdapter2.js | fix-clock-adapter.js |
| Adapter Index | fix_adapters_index_types.js, fix_adapters_index_final.js, fix_adapters_index_final2.js | fix-adapters-index.js |
| useWidget Hooks | fix_useWidgetOverlays_settings.js, fix_useWidgetOverlays_settings2.js, fix_useWidgetSettings.js, fix_useWidgetSettings2.js | fix-useWidget-hooks.js |
| Test Mocks | scratch/fix_test_mocks.js, scratch/fix_test_mocks.py | fix-test-mocks.js |
| Test Engine Mocks | scratch/fix_test_engine_mocks.js | fix-test-engine-mocks.js |
| Standalone | fix_portal.py, fix_points.py, fix_move_point.py, fix_crosshair.py, fix_sync.py, fix_snapshot_preview_modal.js, fix_storage_adapter.js, fix_window_event_adapter.js, fix_pixel_ratio.js | Kept as-is (moved to maintenance/) |

## Status Definitions

- **Active**: Currently maintained and used for ongoing fixes
- **Archived**: Legacy scripts kept for reference, superseded by consolidated versions

## Notes

- Git history is preserved through file moves (not deletes + new files)
- Some scripts may be obsolete - marked as Archived in the table above
- Run with `--dry-run` first to verify changes before applying
- These scripts don't affect the build process - they're for codebase maintenance only