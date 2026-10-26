---
name: project-lessons
description: >-
  Context-aware lessons autoload for vninvestcharts-widget. Reads ONLY the relevant
  lesson files by tags extracted from the task description and file paths, then
  returns a short "LESSONS APPLICABLE" checklist that MUST be reflected in the plan
  as "Lessons áp dụng: [...]". Use BEFORE planning, claiming files, or writing the
  first line of code — especially for anything touching the engine twin repo, budget
  or ratchet baselines, gate scope, test/citation evidence, dist/ or build order,
  worktrees and junctions, or the shared-file deny list. Prevents repeating the
  process mistakes already recorded in docs/LESSONS/.
---

# project-lessons

## Purpose

Biến "kinh nghiệm nhớ lại" thành **"kinh nghiệm buộc phải kiểm tra"** tại thời điểm lập
kế hoạch. Đọc **chỉ** phần lesson liên quan (chọn theo tag), trả checklist ngắn.

**KHÔNG** đọc toàn bộ `docs/LESSONS/` — mục tiêu là tránh context bloat.

## When to use

Bắt buộc trước khi:
- Tạo todo list / kế hoạch chi tiết
- Khai claim trong `docs/CLAIMS.md`
- Bắt đầu sửa dòng code đầu tiên

Đây là **Planning Gate** — xem `docs/upgrade-standard/AGENT_PROTOCOL.md` §"Planning Gate".

## Input

| Tham số | Bắt buộc | Mô tả |
|:--|:-:|:--|
| `taskDescription` | Có | Mô tả task/slice đầy đủ |
| `filePaths` | Không | Danh sách file dự kiến sửa (giúp suy tag) |
| `actions` | Không | Hành động dự kiến: `edit`, `claim`, `gate`, `build`, `test`, `measure`, `rebuild` |

## Step 1 — Trích tag

Suy tag (case-insensitive) từ `taskDescription` + `filePaths` + `actions`:

| Từ khóa / Path | File cần đọc |
|:--|:--|
| `claim`, `claims`, `shared`, `deny`, `dev`, `branch`, `merge`, `commit`, `budget`, `fat-file`, `MAX_ANY`, `MAX_PROPS`, `ratchet`, `baseline`, `PASS`, `CHƯA CHẠY`, `FAIL`, `NOT MEASURED`, `test`, `regression`, `proof`, `fail-before`, `plan`, `audit:any`, `audit:props`, `docs/CLAIMS.md`, `config/*.json` | `docs/LESSONS/process.md` |
| `vacuous`, `absence`, `measure`, `verification`, `verify`, `probe`, `e2e`, `stale`, `server`, `watch`, `dist`, `build`, `runtime`, `PowerShell`, `Select-String`, `glob`, `grep`, `rg`, `encoding`, `cp1252`, `mojibake`, `utf8`, `citation`, `sha`, `mutation`, `self-test`, `negative-control`, `NOT MEASURED` | `docs/LESSONS/evidence.md` |
| `engine`, `twin`, `rebuild`, `Rule 13`, `VN_ENGINE_REPO`, `tsc`, `type-check`, `vitest`, `paths`, `TS2307`, `resolve`, `worktree`, `junction`, `rmdir`, `node_modules`, `cleanup`, `drawing`, `SSOT`, `boundary`, `engine-drawing`, `engine-react`, `drawing-shim` | `docs/LESSONS/engine-twin.md` |
| `gate`, `gates`, `scope`, `SCAN_ROOT`, `exclude`, `extension`, `.ts`, `.tsx`, `lint`, `eslint`, `red`, `baseline`, `acceptance`, `unreachable`, `script`, `npm script`, `exit code`, `exit`, `DEFAULT_FLAGS`, `flag`, `context`, `drift`, `run-gates.cjs` | `docs/LESSONS/gate-integrity.md` |

**Quy tắc an toàn (fallback) — ưu tiên bỏ sót hơn là bỏ sót:**
Nếu task có **bất kỳ** từ khóa nào sau: `claim` `shared` `dev` `merge` `budget` `baseline`
⇒ **luôn** đọc `docs/LESSONS/process.md`, bất kể tag suy ra được.
Nếu có `PASS` `CHƯA CHẠY` `NOT MEASURED` `measure` `verify` `proof` `mutation` `dist` `build`
`encoding` `citation`
⇒ **luôn** đọc `docs/LESSONS/evidence.md`.
Nếu có `engine` `twin` `rebuild` `VN_ENGINE_REPO` `tsc` `paths` `junction` `drawing`
⇒ **luôn** đọc `docs/LESSONS/engine-twin.md`.
Nếu có `gate` `scope` `lint` `ratchet` `script` `exit` `baseline`
⇒ **luôn** đọc `docs/LESSONS/gate-integrity.md`.

## Step 2 — Đọc file lesson

Đọc **trọn vẹn** 1–2 file tương ứng (mỗi file < 120 dòng theo quy tắc C1).
KHÔNG đọc `docs/LESSONS/` toàn bộ.
Nếu file không tồn tại → ghi `LESSONS: file KHÔNG TỒN TẠI` (không đoán nội dung).

## Step 3 — Trích checklist

Từ mỗi lesson khớp tag, lấy dòng `QUY TẮC` + các mục `- [ ]` trong `CHECKLIST`.
Bỏ qua lesson không khớp tag.

## Step 4 — Trả về

Format output **bắt buộc**:

```text
LESSONS APPLICABLE (<n>):
- [L-E01 | pass rỗng] — QUY TẮC: assertion chỉ có ý nghĩa nếu trạng thái đo khác trạng thái mặc định

MANDATORY CHECKLIST:
- [ ] <item 1>
- [ ] <item 2>

FILES READ: <danh sách đầy đủ file đã đọc>
```

**Giới hạn: tối đa ~20 dòng.** Vượt thì giữ các mục rủi ro cao nhất và mục `KHÔNG`/`PHẢI`.

**Quy tắc C3:** task đa miền được đọc nhiều nhóm, nhưng `FILES READ` phải liệt kê **đủ
tên file** — để thấy được nhóm nào đã bị bỏ sót. Không âm thầm bỏ nhóm.

**Không khớp lesson nào:**
```text
LESSONS APPLICABLE: NONE
Lý do: <ngắn gọn>
FILES READ: (none)
```

## Step 5 — Áp dụng vào plan (bắt buộc)

Plan PHẢI chứa **một trong hai dạng**:

- `Lessons áp dụng: [L-P01, L-T01]`
- `Lessons áp dụng: NONE – <lý do ngắn>`

Và phải **tick từng mục trong `MANDATORY CHECKLIST`** trước khi coi slice là xong.

Ngoài ra, **header của plan** phải khai báo `SCOPE` (file dự kiến sửa) và `LIMIT`
(giới hạn chạy), và **mọi acceptance check phải có command tái tạo và được viết
trước dòng code đầu tiên**. SSOT của hai luật này ở `multi-agent-workflow` §Mode B —
ghi tại đây chỉ để nhắc ở Planning Gate, không định nghĩa lại.

## Anti-pattern (KHÔNG làm)

| Sai lầm | Vì sao sai |
|:--|:--|
| Đọc toàn bộ `docs/LESSONS/` | Context bloat, agent skim mất tập trọng |
| Gọi skill nhưng không ghi `Lessons áp dụng` vào plan | Không ai kiểm chứng được ⇒ quy tắc không thi hành được |
| Tự thêm lesson mới vào `docs/LESSONS/` | Cần coordinator duyệt (`INDEX.md` §1.3) |
| Suy nội dung lesson khi chưa đọc file | Vi phạm nguyên định — xem chính L-E01 |
| Bỏ qua fallback vì "task không liên quan" | Đây là nhóm lỗi tần suất cao nhất |
| **Gộp mọi lesson vào một file cho "gọn"** | Một file > 120 dòng ⇒ đọc lướt/cắt. Vi phạm C1 |
| **Tăng ngưỡng C1/C2 khi bị vượt** | Đó là nâng ngưỡng để giấu lỗi — xem L-P01 |
| Báo `PASS` cho gate chưa chạy | Chính sổ tay này có 6 lesson về việc đó |

## Cross-reference

- Quy tắc nguồn + ma trận gate: `docs/upgrade-standard/AGENT_PROTOCOL.md`
- Danh sách lesson + 3 quy tắc cứng: `docs/LESSONS/INDEX.md`
- Bằng chứng gốc: `docs/upgrade-standard/AUDIT_LEDGER.md`
- Machine gate cho 3 quy tắc cứng: `npm run check:lessons`
- Vòng lặp solo có kiểm soát (SCOPE/LIMIT, checks-before-work, bounded retry, resume cursor): skill `multi-agent-workflow` §Mode B