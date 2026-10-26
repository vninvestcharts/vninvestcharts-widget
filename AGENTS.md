## Current session progress

> Ongoing work is tracked per-slice in the private handbook. Public contributors:
> open an issue before large changes; keep each PR focused and green on CI.

## Read first (public tree — no private handbook shipped)

> References to `docs/upgrade-standard/*`, `docs/architecture/*` and `docs/LESSONS/*`
> elsewhere point at the private contributor handbook and are not shipped.
> The rules below are self-contained.

1. `quality/QUALITY.md` — quality gates and definitions of done (shipped)
2. `config/fat-file-budget.json` — file-size budgets (Rule 9)
3. `WIDGET_EMBED_GUIDE.md` — embedding guide (repo root, public copy)
4. `MIGRATION_0_2_0.md` — 0.2.0 migration notes (repo root, public copy)

# AGENTS

## Project summary

`vninvestcharts-widget` là repo charting demo-first với core chart library và nhiều demo surfaces. Mục tiêu ngắn hạn là hoàn thiện demo shell và correctness runtime. Mục tiêu dài hạn là tách thành widget nhúng được.

## Canonical commands

```bash
npm run watch
npm run type-check
npm run test
npm run audit:fat-files
npm run build:docs
npm run build
npm run generate:module-tree
npm run check:agent-config      # cấu hình agent (skills layout, opencode.jsonc, ngân sách dòng)
npm run gate:slice -- --slice <ID>   # exit 2 = CHẶN (plan của slice chưa xong)

# Engine rebuild (BẮT BUỘC sau mọi thay đổi source engine — see Rule 13)
cd ../vninvestcharts-engine && npm run build:core && npm run build:react
```

## Agent harness — TỰ ĐỘNG, nhưng cần bạn mở slice

Plugin `.opencode/plugins/agent-harness.js` (OpenCode v1) **tự nạp** khi opencode khởi động. Nó làm 4 việc:
re-inject plan của slice mỗi lượt · **chặn `git commit`** khi plan còn phase `in_progress` ·
attestation (plan bị sửa sau khi attest ⇒ báo, không bơm) · offload output tool lớn.

> **BẮT BUỘC khi bắt đầu 1 việc nhiều bước (plan/slice > ~30 phút):**
> `npm run slice:new -- <SLICE_ID> "<goal>"` ⇒ tạo `.planning/<ID>/` (plan + ledger + attestation) và
> trỏ `.planning/current` vào đó. Ghi tiến bộ: `npm run ledger:append -- --slice <ID> --note "..."`.
> **Không có slice ⇒ plugin im lặng** (fail-open, không làm hỏng gì) ⇒ không có re-inject, không có chặn commit.
> Chi tiết: the agent playbook (private handbook — not shipped) · plan: the agent-harness plan (private — not shipped).

## Architecture map

- Demo entry: `src/demo/index.tsx`
- Main runtime shell: `src/demo/index.tsx` → 1 trong 3 surface (`MultiChartsShowcaseDemo` / `StandaloneEmbedDemo` / `TierProviderHarnessDemo`)
- Demo i18n: `src/demo/i18n.tsx`
- Pane state: `src/lib/core/hooks/useDynamicPanes.ts`
- Core chart runtime: `src/widget/VNInvestCharts.tsx` + pane state `src/lib/core/hooks/useDynamicPanes.ts` (DynamicChart lane đã xoá 2026-10-03)
- Series registry: `src/lib/core/registry/SeriesRegistry.ts`
- Demo data source: `src/demo/demoData.ts`
- **Drawing (KHÔNG còn trong repo này)**: toàn bộ nằm ở repo engine — logic thuần `vninvestcharts-engine/packages/vn-kline-engine-drawing/`, React `.../vn-kline-engine-react/src/drawing-ui/`. Widget chỉ import qua `@vninvestcharts/engine-drawing` / `@vninvestcharts/engine-react` và giữ public subpath bằng `src/drawing-shim.ts`. Xem ledger `DRAWING_SSOT_MIGRATION_2026-09-27`.

## Hard rules for any agent

0. Đọc the audit ledger (private handbook — not shipped) để hiểu lịch sử thay đổi trước khi audit.
1. Không thêm hardcoded UI text mới; dùng i18n key.
2. Không để `src/lib/**` import ngược từ `src/demo/**`.
3. Với thay đổi lớn, bám slice trong plan đang hiệu lực ở the plans directory (private handbook — not shipped) (hiện tại: (example slice plan — private) cho CS-2…CS-7). (does not exist — do not create) đã ghi trong rule này trước đây KHÔNG TỒN TẠI — đừng tạo mới chỉ để khớp tên cũ.
4. Sau thay đổi mã nguồn phải update the audit ledger (private handbook — not shipped).
5. Không coi build pass là đủ nếu spec/runtime behavior chưa đúng.
6. Toàn bộ ứng dụng phải dùng chung một bộ template giao diện với web root; không tạo template hoặc layout riêng cho từng surface nếu cùng chức năng.
7. Khi chốt hoàn thành một slice, phải commit riêng và push ngay lên branch `dev` để theo dõi và lưu trữ code.
8. Mọi tính năng product mới phải được phát triển trong `src/widget/VNInvestCharts.tsx` hoặc các package/runtime mà widget tiêu thụ; `src/demo/**` chỉ được quyền bật, cấu hình, và trình diễn các capability đã tồn tại trong widget, không được trở thành nơi sinh feature độc lập.
9. Mọi source change phải chạy `npm run audit:fat-files`. File mới không được vượt budget mặc định; file đã nằm trong baseline fat-file không được tăng thêm line count nếu chưa cập nhật plan/budget tương ứng.
10. Runtime dev tiêu chuẩn của repo là `npm run watch`. Không dùng rebuild/restart Docker stack như bước mặc định cho verify hằng ngày của workflow này.
11. **File Write Protocol**: Khi ghi file mới hoặc ghi đè file lớn (>50 lines), **BẮT BUỘC** chia nhỏ nội dung và ghi bằng nhiều lần `edit` (diff) thay vì `write_file` một lần. Quy trình:
    - Tạo file rỗng hoặc skeleton trước (`write_file` với nội dung tối thiểu)
    - Dùng `edit` nhiều lần để thêm từng section/logic block
    - Tránh lỗi "params must have required property 'content'" do payload quá lớn
    - Áp dụng cho: docs, specs, handlers, test files, config files
12. **[Ràng buộc cặp song hành — TUYỆT ĐỐI, KHÔNG NGOẠI LỆ]** Hai repos `vninvestcharts-engine` và `vninvestcharts-widget` là một cặp song hành **không thể tách rời**. Mọi agent khi thực hiện bất kỳ công vụ nào (code, fix bug, refactor, audit, review, planning, debug, viết spec, thay đổi cấu trúc, thêm tính năng) trên một trong hai repo, PHẢI: (a) biết sự tồn tại của cả 2 repos; (b) tham chiếu cả 2 khi suy luận, tracing code, hoặc sửa đổi; (c) đọc cấu trúc file và code liên quan từ CẢ HAI repos trước khi kết luận, actionable, implement. Phân tích hay sửa đổi cô lập trên một repo duy nhất mà không tham chiếu repo kia là vi phạm quy trình. **NẾU CẦN SỬA ENGINE ĐỂ WIDGET HOẠT ĐỘNG CHÍNH XÁC THÌ SỬA ENGINE — KHÔNG CÓ NGOẠI LỆ**: không được vá bằng workaround ở widget, không được ghi "cần đổi engine" rồi dừng, không được coi engine là vendor không-sửa được. Mọi sửa engine phải theo **đúng Rule 13** (5 bước: test engine → build cả 3 package → verify timestamp + `sync-engine-dist --check` → mới chạy widget) và phải **bump version + publish engine** (gate `check-engine-published-version.js`) trước khi claim "đã sửa cho người dùng" — vì widget đọc engine qua npm REGISTRY. Bằng chứng: ledger `DRAWING_SSOT_MIGRATION_2026-09-27` (drawing dựng lại ở engine), `F02_REGISTRY_ENGINE_RESOLUTION_2026-10-03`. Từ khóa tra: `song-hanh`, `twin repos`, `engine-widget pair`, `sua-engine-khong-ngoai-le`.
13. **[REBUILD ENGINE — BẮT BUỘC SAU MỌI THAY ĐỔI SOURCE ENGINE]** (xem Rule 12: sửa engine khi widget cần — **không ngoại lệ**) Widget **đọc engine qua npm REGISTRY**, không phải `file:` link (quyết định 2026-10-03, ledger `F02_REGISTRY_ENGINE_RESOLUTION_2026-10-03`). `package.json` (minified, không còn số dòng để trích) khai `@vninvestcharts/engine-core@^1.5.0`, `-drawing@^2.2.0`, `-react@^2.2.1`; `package-lock.json` resolve `registry.npmjs.org`. **Bản "file:../…" trong các bản cũ của rule này là sai.**
    Tuy vậy trong `node_modules` chỉ có **engine đã publish**, **không có source**. Do đó: **Mọi thay đổi source trong `vninvestcharts-engine` BẮT BUỘC phải rebuild trước khi widget nhận được**, vì các công cụ build/test của widget trỏ tới repo sibling qua alias (`tsup.config.ts:20-31`, `vitest.config.ts`) và `tsconfig.engine-paths.json` (sinh lại ở `pretype-check`/`pretest`/`prebuild`). Nếu không rebuild → widget chạy bản engine cũ → fixes không có hiệu lực → root cause ẩn và rất mất thời gian debug. Quy trình bắt buộc:
    1. Sửa source engine
    2. Chạy test engine: `npm test` (trong `vninvestcharts-engine/`)
    3. **Build engine**: `npm run build` (trong `vninvestcharts-engine/packages/vn-kline-engine-core/`, `vn-kline-engine-drawing/` và `vn-kline-engine-react/`)
    4. Verify: `node scripts/check-engine-timestamp.js` (chỉ WARN, không enforce — xem `check:engine-dist` mới là gate cứng) và `node scripts/sync-engine-dist.js --check`
    5. Sau đó mới chạy widget: `npm run watch` (trong `vninvestcharts-widget/`)
    - `tsconfig.engine-paths.json` **không được commit** (đã thêm vào `.gitignore`). File này được sinh lại và **tự bỏ toàn bộ engine khỏi `paths`** khi không có checkout dùng được ⇒ khi đó `tsc` resolve bản publish từ `node_modules`. Đây chính là lý do CI type-check vẫn đúng dù không có repo sibling.
15. **[Phân định ranh giới Free / Pro — BẮT BUỘC]** Mô hình chính thức hiện tại là **public code + signed license** (pivot thay S3c xóa-code/engine-pro — xem LEDGER `TIER_LIC_ACTIVATION_2026-09-23`). Mọi kỹ sư và AI agent PHẢI tuân thủ:
    - **Hạ tầng engine HIỆN HỮU GIỮ PUBLIC** (`engine-core/react/drawing` — dev tiêu thụ qua junction local tới `../vninvestcharts-engine`, bản publish ăn npm registry `^1.1.x`; lật license local không thay đổi artifact đã publish). Kernel/render + `patTier` enforcement là hạ tầng enforcement, không phải IP cần giấu tuyệt đối.
    - **Code tính năng FREE (Community)**: BẮT BUỘC nằm trong repo `vninvestcharts-widget` (Public MIT). Bao gồm: Khung React UI, công cụ cơ bản/đo lường, chỉ báo phổ thông, bố cục theo tier, Paper Trading cơ bản (Market/Limit), và Presentation layer.
    - **Tính năng PRO/Enterprise trong code public**: ĐƯỢC PHÉP tồn tại nhưng BẮT BUỘC gate cả UI lẫn engine bằng tier/license ký số fail-closed. Không được mở tính năng Pro bằng prefix tự xưng, không được hiển thị dữ liệu giả như dữ liệu thật trong production.
    - **`@vninvestcharts/engine-pro` là extension tương lai, hiện CHƯA tồn tại trong source**: widget chỉ cung cấp Plugin Registry (`registerProExtension`) để nhận nạp module Pro từ bên ngoài. Cấm `import('@vninvestcharts/engine-pro')` tĩnh trong mã nguồn public vì gây fatal build crash cho consumer Free.
    - **Không cam kết chống copy tuyệt đối trên frontend**: mục tiêu là chi phí bypass >> giá mua. IP nhạy cảm thật sự phải xử lý server-side, client chỉ render kết quả đã kiểm quyền.
    - **Tuyệt đối CẤM**: (1) Mở tính năng Pro khi chưa verify tier/license; (2) Import tĩnh engine-pro; (3) Fake dữ liệu production; (4) Để local override thắng tenant trong SaaS multi-tenant mà không có quyết định product bằng văn bản.

## Hard bugfix workflow (quy định cứng)

Áp dụng cho mọi bugfix có ảnh hưởng runtime/UI/backfill/camera/projection hoặc bug tái diễn:

1. **Reproduce-first**: Chốt 1 kịch bản tái hiện tối thiểu, ổn định (symbol, timeframe, thao tác, expected vs actual).
2. **Evidence-first tracing**: Gắn trace tại ranh giới state (input -> intermediate -> output), không vá trước khi có bằng chứng lệch đầu tiên.
3. **Invariant-first diagnosis**: Xác định invariant bắt buộc (range in-bounds, domain finite, state transition hợp lệ, không stale flags).
4. **Fix-at-first-divergence**: Sửa tại điểm lệch đầu tiên trong pipeline, không vá ở lớp hiển thị cuối nếu chưa chứng minh root cause.
5. **Regression lock**: Thêm test đúng ngữ cảnh gây lỗi (bao gồm edge-case production) để khóa bug.
6. **Runtime proof before close**: Bắt buộc có bằng chứng runtime sau fix (trace/screenshot/repro script) ngoài test pass.

### Cấm (anti-pattern)

- Cấm “guard chồng guard” theo cảm tính khi chưa có bằng chứng divergence.
- Cấm coi build/test pass là đủ nếu runtime behavior còn sai.
- Cấm đổi scope fix khi chưa cập nhật plan/audit tương ứng.

16. **[DRAWING SSOT — BẮT BUỘC]** Từ 2026-09-27 (`DRAWING_SSOT_MIGRATION_2026-09-27`) thư mục `src/lib/drawing/` **đã bị xoá khỏi repo này**. Mọi thay đổi về drawing phải làm ở **repo engine** (`../vninvestcharts-engine`):
    - Logic thuần (registry, state machine, hit-test, snap, measuring, serialization, storage, context menu) → `packages/vn-kline-engine-drawing/src/`.
    - Tầng React (`DrawingLayer`, `FloatingSelectionToolbar`, …) → `packages/vn-kline-engine-react/src/drawing-ui/`.
    - Widget **chỉ** import qua `@vninvestcharts/engine-drawing` / `@vninvestcharts/engine-react`. **Cấm** tạo lại `src/lib/drawing/`, shim nội bộ, hay deep-path vào `dist/` của engine.
    - Public contract `vninvestcharts-widget/drawing` được giữ bằng `src/drawing-shim.ts` (chỉ re-export). Đổi nó là thay đổi breaking → cần changelog + bump version.
    - Sau mỗi thay đổi engine: build engine (Rule 13), rồi chạy gate widget với `VN_ENGINE_REPO=<đường dẫn engine>` (`type-check`, `audit:fat-files`, `npm test`, `consumer-smoke`, `verify-p3.cjs`).
    - Cổng chặn tái phát: `scripts/check-drawing-import-boundary.js` (`npm run audit:drawing-boundary`) + assertion tên type trong `scripts/consumer-smoke.mjs` (bắt lỗi d.ts inline type không export).

17. **[MÔI TRƯỜNG KIỂM THỬ]** Mọi kiểm thử runtime (E2E, probe, verify, repro, smoke)
chạy ngoài dev-server hằng ngày: trỏ `WATCH_URL` (hoặc `--url`) vào một deployment
đang chạy của đúng commit cần kiểm, rồi xác minh từ NGOÀI bằng `health.json`
(so `commit`). `docker ps Up (healthy)` **không** chứng minh đúng code. Không hardcode
`localhost`. Chi tiết triển khai nội bộ nằm ở handbook riêng.

## Known active gap

- **SSOT indicator runtime**: Đã hoàn tất đồng bộ tại điểm materialization `enrichData`. Kiến trúc dual-layer là chủ ý thiết kế (Engine Kernel làm tính toán/vẽ lõi, Library/Widget quản lý Presentation & Registry) để đảm bảo phân lớp độc lập và hiệu năng. Không còn là gap.
- **Paper trading (widget-side)**: Đã hoàn tất (Phases 1–5, AUDIT_LEDGER PAPER-P1..P5). Data binding vào shared workspace order book, click→order/close (H1 Option A), fee+slippage+symbol-scoped realism, multi-chart singleton, demo compliance (Rule 8 render-prop). Production-ready.

## Rule 14: AI Audit/Research Framework (BẮT BUỘC)

Mọi prompt audit, nghiên cứu, phân tích chi tiết dự án (bao gồm nhưng không giới hạn: audit code, research architecture, phân tích subsystem, review plan-vs-code, impact analysis, debugging investigation, spec verification) PHẢI tuân theo khung dưới đây.

### 14.1. Năm nguyên tắc chống lỗi audit (kế thừa từ bài học DRAWING_DOCK review)

| Bài học | Nguyên tắc chống tái diễn |
|---------|--------------------------|
| Plan bảo CSS "chết" nhưng code vẫn dùng | **Nguyên tắc 1**: grep/scrape PHẢI quét TOÀN repo bao gồm `.css`, `.module.css`, `injected.css`, config, demo mounts, sidebar. Không dừng ở file `.ts`/`.tsx`. |
| Plan bảo field X có trong state nhưng code không có | **Nguyên tắc 2**: Đối chiếu plan→code phải có mục CONTRADICTIONS riêng, mỗi dòng kèm `plan:file:line | code:file:line | impact`. |
| Plan trỏ file không tồn tại | **Nguyên tắc 3**: MỌI reference file phải được `read` hoặc `grep` xác nhận tồn tại. File KHÔNG TỒN TẠI → báo `KHÔNG TỒN TẠI`, không suy diễn "có thể ở đâu đó". |
| Quên twin-repo coupling | **Nguyên tắc 4**: Luôn grep/read CẢ HAI repo (`vninvestcharts-engine` + `vninvestcharts-widget`) khi tracing code qua ranh giới `as` cast, type union, overlay primitive, camera state. |
| Quên i18n / fat-file quality gates | **Nguyên tắc 5**: Phần "Quality Gates" audit PHẢI gồm: (a) fat-file budget check, (b) i18n hardcoded string scan, (c) type-check status, (d) test coverage gap. |

### 14.2. Cấu trúc khung prompt chuẩn (điền scope cụ thể vào `[...]`)

```markdown
Bạn là kiểm toán viên mã nguồn cấp cao. Nhiệm vụ: NGHIÊN CỨU và PHÂN TÍCH CHI TIẾT
[phạm vi: subsystem / feature / module] tại:

  C:\Mujoco Projects\vninvestcharts-widget

(twin-repo: C:\Mujoco Projects\vninvestcharts-engine — mọi phân tích qua ranh giới
engine/widget phải tham chiếu CẢ HAI).

=== 0. NGUY TẮC BẮT BUỘC ===
1. MỌI khẳng định kèm `file_path:line_number`. Không có line = không hợp lệ.
2. KHÔNG đoán. Chưa đọc file thật → ghi "CHƯA XÁC MINH".
3. Bắt buộc dùng grep/glob/read, không dùng kinh nghiệm chung.
4. Plan/doc MÂU THUẪN với code → finding quan trọng nhất, báo mục CONTRADICTIONS.
5. grep/scrape TOÀN repo bao gồm .css, .module.css, config, demo, widget styles.
6. KHÔNG viết code. Chỉ nghiên cứu + phân tích + đề xuất.
7. KHÔNG bịa file. File không tồn tại → báo "KHÔNG TỒN TẠI".
8. Ngôn ngữ báo cáo: [Tiếng Việt / English].

=== 1. ĐỌC TRƯỚC (bắt buộc) ===
- AGENTS.md, CLAUDE.md
- docs/ [các file context cần đọc]
- [tên plan / spec / review cần đối chiếu]

=== 2. PHẠM VI NGHIÊN CỨU ===
A. [SUB] — [mô tả subsystem A]
   - [file patterns / dirs cần glob]
   - [symbols cần grep]
   - [plan cần đối chiếu]

B. [SUB] — [mô tả subsystem B]
   - ...

C. TWIN-REPO COUPLING (nếu có)
   - as cast locations, type union divergence, dist vs src staleness

D. QUALITY GATES
   - Fat-file: config/fat-file-budget.json
   - i18n: [demo/i18n.tsx hoặc widget/i18n/*]
   - Type-check: npm run type-check

=== 3. PHƯƠNG PHÁP ===
B1: Đọc context docs + plans (mục 1)
B2: glob [dir patterns]
B3: grep [key symbols]
B4: read từng file cốt lõi, trace 1 use-case cụ thể
B5: Đối chiếu plan ↔ code, gạch chỗ lệch
B6: Check ranh giới: fat-file, i18n, type-check, twin-repo staleness

=== 4. ĐẦU RA ===
A. Bản đồ kiến trúc (bảng: file | line_count | trách nhiệm | note)
B. Luồng dữ liệu đã trace (use-case cụ thể, kèm file:line từng bước)
C. CONTRADICTIONS (plan/doc vs code): [mỗi dòng] Plan X (file:line) | Thực tế Y (file:line) | Tác động
D. Findings: [ID] <ERROR|GAP|RISK> | Mức | file:line | Thực tế | Tác động | Đề xuất fix
E. Fat-file & i18n audit
F. Câu hỏi cần làm rõ
G. Đánh giá tổng thể: implementable? blocker? ưu tiên sửa?

=== 5. ĐẦU RA NGẮN ===
Tóm tắt 5 findings nghiêm trọng nhất vào 1 đoạn đầu file.
```

### 14.3. Cách dùng

Khi cần AI phân tích/research/audit bất kỳ phần nào của dự án:
1. Copy template từ 14.2
2. Điền `[phạm vi]`, file paths, symbols cần tra
3. Paste vào session AI mới
4. AI sẽ tự chạy grep/glob/read theo đúng quy trình

Không deviation khỏi cấu trúc đầu ra (mục 4). Thiếu section = kết quả không hợp lệ.

## Quality docs

Quality gates live in CI (`.github/workflows/ci.yml`) and are self-describing:
`type-check`, `audit:fat-files`, `audit:drawing-boundary`, `lint:ratchet`,
`npm test`, `build`, `check:agent-config`, plus the three A4 public-tree gates.
