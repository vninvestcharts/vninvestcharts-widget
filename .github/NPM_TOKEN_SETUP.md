# NPM Token Setup for CI/CD

## GitHub Secrets

Thêm vào **cả 2 repos** (`vninvestcharts-engine` + `vninvestcharts-widget`):

1. **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `NPM_TOKEN`
3. Secret: *dán giá trị token của bạn vào đây — **đừng** ghi giá trị vào file markdown này*

> ⚠️ **2026-10-01 — sự cố đã xử lý.** Bản cũ của file này chứa **giá trị token thật**
> (`npm_...`, Automation token full access) và **đã được commit vào git**. Token đó phải bị
> **revoke** vì nó nằm trong lịch sử repo và trong transcript.
>
> Bài học áp dụng: **secret chỉ nên tồn tại trong `gh secret set` / `npm login`**, không bao
> giờ nằm trong file theo dõi bởi git — kể cả file `.md`. Tài liệu chỉ mô tả *cách đặt*, không
> chứa *giá trị*.

## Local Development

Token đã lưu trong `~/.npmrc` (global). Tham chiếu bởi:

- `engine/.github/workflows/publish.yml` → `${{ secrets.NPM_TOKEN }}`
- `widget/.github/workflows/release.yml` → `${{ secrets.NPM_TOKEN }}`

## Token Info

- Type: Automation token (full access)
- Owner: `viet_dung`
- Scope: All packages (gồm `@vninvestcharts/*` ở **cả hai** repos — `vninvestcharts-engine`
  và `vninvestcharts-widget`)

> **2026-10-07:** widget chuyển tên từ `vninvestcharts-widget` sang
> `@vninvestcharts/widget` (tên cũ đã bị khoá ở `1.4.0` dưới MPL-2.0). Xem
> `docs/MIGRATION_0_2_0.md`.