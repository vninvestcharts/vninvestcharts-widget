/**
 * P4/Rule 8: demo re-exports the widget SSOT — no independent feature/config
 * duplication. (Previously a full copy with a stale "9 groups" comment and
 * the same pitchfork duplication.)
 */

export type { ToolGroup } from "../../widget/config/toolGroups";
export { TOOL_GROUPS_V2 } from "../../widget/config/toolGroups";
