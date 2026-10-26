# Migration: `vninvestcharts-widget` 1.4.0 → `@vninvestcharts/widget` 0.2.0

Guide cho **người đang chạy bản 1.x**. Bản 1.4.0 vẫn chạy bình thường và **không bị
gỡ khỏi npm** — nhưng bản đó là **MPL-2.0**, còn dòng 0.2.x là **Apache-2.0**. Đây là
hai hợp đồng pháp lý khác nhau dưới hai tên khác nhau.

> **Trạng thái:** mỗi mục dưới đây ghi rõ **đã có trong 0.2.0** hay **dự kiến ở 0.2.x**.
> Không mục nào ở trạng thái "dự kiến" đã được ship — nếu bạn đọc thấy hành vi khác mô
> tả ở mục chưa ship, hãy báo lại, đó là bug.

---

## 0. Thay đổi lớn nhất: tên package

| | Cũ | Mới |
|---|---|---|
| package | `vninvestcharts-widget` | `@vninvestcharts/widget` |
| licence | MPL-2.0 | **Apache-2.0** |
| bản cao nhất | `1.4.0` | `0.2.0` |

**Vì sao đổi tên.** `vninvestcharts-widget@1.4.0` đã tồn tại trên npm dưới
MPL-2.0. npm **không cho sửa hay thay** một bản đã publish, nên phát hành Apache-2.0
dưới cùng tên sẽ để lại hai licence khác nhau sau cùng một định danh package — và
người mới cài tên cũ sẽ âm thầm nhận code MPL-2.0. Scope `@vninvestcharts/` đã có
sẵn và đang chứa chính ba package engine của bạn, tất cả Apache-2.0.

### Cách đổi

```diff
- npm install vninvestcharts-widget
+ npm install @vninvestcharts/widget
```

```diff
- import { VNInvestCharts } from 'vninvestcharts-widget';
+ import { VNInvestCharts } from '@vninvestcharts/widget';
```

Mọi subpath đổi theo cùng quy tắc:

| Cũ | Mới |
|---|---|
| `vninvestcharts-widget/adapters` | `@vninvestcharts/widget/adapters` |
| `vninvestcharts-widget/drawing` | `@vninvestcharts/widget/drawing` |
| `vninvestcharts-widget/types` | `@vninvestcharts/widget/types` |
| `vninvestcharts-widget/iframe-host` | `@vninvestcharts/widget/iframe-host` |
| `vninvestcharts-widget/iframe` | `@vninvestcharts/widget/iframe` |

CSS qua CDN:

```diff
- <link href="https://cdn.jsdelivr.net/npm/vninvestcharts-widget/dist/index.css" />
+ <link href="https://cdn.jsdelivr.net/npm/@vninvestcharts/widget/dist/index.css" />
```

### Kiểm tra đã ảnh hưởng

```bash
grep -rn "vninvestcharts-widget/" src/ --include=*.ts --include=*.tsx
```

Chạy trên repo của bạn, **không** phải repo này. Những chỗ còn sót sẽ là import
cũ. Xem `npm run audit:license` và `npm run audit:readme-claims` — hai gate này quét
README của chính package này và sẽ đỏ nếu còn trỏ tới tên cũ.

---

## 1. `debugFeatures` không còn là public API — **ĐÃ CÓ trong 0.2.0**

**Trước:** `debugFeatures` mở mock entitlement ở mọi môi trường, kể cả production.

**Sau:** chỉ chạy khi `NODE_ENV === "development"`.

| Ai bị ảnh hưởng | Dev dùng `debugFeatures` để bật cờ (whale, replay, advisory) |
|---|---|
| Hành vi | Trong build/test, prop bị **bỏ qua**. |
| Cách kiểm tra | `console.log(process.env.NODE_ENV)` — nếu không phải `development`, cờ không có tác dụng. |
| Thay bằng gì | Chạy dev server ở `NODE_ENV=development`, hoặc dùng license/`tenantPat` thật. Trong test, `vi.stubEnv("NODE_ENV", "development")`. |

```ts
// test của chính repo này, làm mẫu
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
});
afterEach(() => {
  vi.unstubAllEnvs();
});
```

**Đây là cố ý.** Guard cũ hỏi "không phải production" — trong trình duyệt không có
`process`, nên câu trả lời luôn là *có* và mock entitlement lọt vào bundle đã ship.

---

## 2. Licence MIT → Apache-2.0 — **ĐÃ CÓ trong 0.2.0**

| | 1.4.0 | 0.2.0 |
|---|---|---|
| Licence | MPL-2.0 (không phải MIT — bản npm thật là MPL-2.0) | **Apache-2.0** |

**Ai bị ảnh hưởng:** đội có quy trình vendor-review.

**Apache-2.0 loãi hơn MIT ở đúng những điều quan trọng với embedder:**
- Cho phép **nhúng vào sản phẩm đóng** mà không bắt buộc mở toàn bộ nguồn.
- **Không** có ràng buộc file-level như MPL-2.0 (MPL yêu cầu công bố source của
  *file đã sửa*, kể cả file bạn không muốn mở).
- Có **patent grant** kèm điều khoản chấm dứt patent nếu khởi kiện vi phạm.

**Cần làm gì:** thêm `NOTICE.md` vào bản phân phối nội bộ của bạn nếu quy trình của
tổ chức yêu cầu giữ file NOTICE đi kèm.

---

## 3. `DrawingDock` / `DrawingInspector` / `DrawingListPanel` được export thêm — **ĐÃ CÓ trong 0.2.0**

**Đây là thay đổi bổ sung, không phá gì.** Trước đây 4 component này được export từ
`src/index.ts` — nhưng entry build ra `dist/index.js` lại là `src/public-api.ts`, nên
**không ESM consumer nào import được chúng**. Nay đã có trong entry chính, kèm
`generateDrawingLabel`, `filterDrawings`, `reorderDrawings` và 10 kiểu prop.

**Ai bị ảnh hưởng:** ai đang tự viết lại dock thì nay dùng được bản chính thức.

---

## 4. `netPnl` chuyển từ gross → net — **DỰ KIẾN ở 0.2.x (chưa ship)**

**Trước:** `netPnl` báo lãi **trước** phí.
**Sau:** báo **sau** phí và thuế.

| Ai bị ảnh hưởng | Mọi người đọc P&L. Số hiển thị **giảm**. |
|---|---|
| Vì sao | `netPnl` tên mà trả gross là sai; số gross và net lệch nhau sau phí, dễ ra quyết định sai. |
| Cách kiểm tra đã ảnh hưởng | So `netPnl` trước/sau trên cùng một giao dịch có phí. |
| Thay bằng gì | `pnlDisplayMode` để chọn gross/net. |

⚠️ **Cảnh báo:** khi bản này ship, báo trước **một release**. Đừng nâng cấp vô tình.

---

## 5. Lệnh limit được fill trước, gap-aware — **DỰ KIẾN ở 0.2.x (chưa ship)**

**Trước:** lệnh limit chỉ khớp khi giá chạm đúng giá limit.
**Sau:** lệnh limit được fill một phần khi giá chạm qua (tính cả khoảng trống giá).

**Ai bị ảnh hưởng:** backtest và chiến lược chạy lệnh limit — **kết quả backtest đổi**.

---

## 6. Sharpe annualize đúng khung — **DỰ KIẾN ở 0.2.x (chưa ship)**

**Trước:** annualize sai khung thời gian.
**Sau:** đúng khung.

**Ai bị ảnh hưởng:** so sánh Sharpe giữa hai lần build. **Số cũ không còn so sánh
được với số mới** — phải tính lại toàn bộ chuỗi lịch sử.

---

## 7. Replay — **KHÔNG có gì thay đổi**

Replay giữ nguyên toàn bộ hành vi, **kể cả tua ngược**.

> **Sửa 2026-10-07.** Bản đầu của guide này ghi *"Replay forward-only — dự kiến ở
> 0.2.x, cần cảnh báo trước"*. **Điều đó sai và đã bị gỡ.** Kiểm chứng:
>
> | Tầng | Vị trí | Trạng thái |
> |---|---|---|
> | Controller | `BarReplayController.rewind()` | có, `BarReplayController.test.ts:57` |
> | UI | `FloatingReplayToolbar.tsx:133` (nút ⏮) | có, i18n key `replay.rewind` |
> | Test | `BarReplayController.test.ts` + `useReplayState.test.ts` | **13 PASS** |
>
> Nguồn của tin sai là slice `S10` trong plan, mở đầu bằng giả định "replay
> không tua ngược" mà không kiểm tra code. Coordinator đã quyết định giữ nguyên hiện
> trạng; `S10` chuyển thành hạng mục **cải tiến tuỳ chọn**, không phải breaking change.

**Ai bị ảnh hưởng:** không ai.

Nếu bạn đã đọc bản cũ của guide và bỏ dở việc nâng cấp vì lo mất tính năng — **yên tâm
nâng cấp**, replay không đổi gì.

---

## Checklist nâng cấp

- [ ] Đọc mục 0 — đổi tên package ở mọi import.
- [ ] `grep -rn "vninvestcharts-widget/"` trên repo của bạn — không còn sót.
- [ ] Nếu dùng `debugFeatures` ở môi trường non-dev: sửa hoặc bỏ (mục 1).
- [ ] Nếu quy trình vendor-review có bước kiểm licence: Apache-2.0 thay MPL-2.0 (mục 2).
- [ ] Cập nhật lockfile: `npm install` rồi commit lockfile mới.
- [ ] **Chạy test của bạn.** Không có breaking change runtime nào đã ship ở 0.2.0, nhưng
      tên package đổi nên import sai sẽ fail lúc build.

## Cố ý **không** phá gì

Để bạn không phải dò tìm: những thứ sau **giữ nguyên** trong 0.2.0.

| | Ghi chú |
|---|---|
| CSS class `vninvestcharts-widget-*` | Public styling API. **Không** đổi theo tên package. Nếu bạn override `.vninvestcharts-widget-crosshair-cursor` thì vẫn chạy. |
| localStorage key `vninvestcharts-widget_alerts` | **Không** đổi — đổi là xoá sạch alert đã lưu của user. |
| URL repo GitHub | `github.com/vietdungiitb/vninvestcharts-widget` vẫn đúng. |
| Runtime API (`VNInvestCharts`, props, adapters) | Không đổi ở 0.2.0. |

## Hỗ trợ

Báo lỗi: `github.com/vietdungiitb/vninvestcharts-widget/issues`.
Ghi kèm bản đang chạy (`0.2.0` hay `1.4.0`) và có dùng `debugFeatures` không.