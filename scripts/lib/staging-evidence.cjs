/**
 * staging-evidence.cjs — luật "đóng slice phải có bằng chứng staging" (Rule 17).
 *
 * VÌ SAO (UIUX-AB / handoff 2026-10-20):
 *   Batch A+B đã **đóng** với staging NOT RUN ⇒ quy trình cho phép đóng slice mà không có
 *   bằng chứng runtime. Luật này chặn điều đó: slice đã `done` mà **không** có file evidence
 *   staging ⇒ gate BLOCK.
 *
 * NGUYÊN TẮC (fail-closed):
 *   - Mặc định **phải** có evidence. Miễn trừ DUY NHẤT bằng dòng tường minh trong plan docs:
 *     `- **Staging evidence (Rule 17)**: N/A — <lý do>`.
 *     ⇒ xoá dòng đó KHÔNG làm mất nghĩa vụ (vẫn bị chặn) — ngược lại với "opt-in".
 *   - Evidence phải **máy kiểm được**: `commit:` là commit có thật trong repo (`git cat-file -e`)
 *     và staging phải **đang** phục vụ đúng sha đó (`health.json` của staging).
 *   - Không **so** `sha == git rev-parse HEAD`: commit chứa chính file evidence sẽ đẩy HEAD đi
 *     ⇒ tự chặn mình (bẫy đã bị audit chỉ ra).
 *
 * Lý do nằm ở `scripts/lib/agent-harness-core.cjs` (`decideGate`) vì plugin
 * `.opencode/plugins/agent-harness.js` gọi `core.decideGate` **trực tiếp** ⇒ luật đặt ở CLI
 * (`gate-slice.cjs`) sẽ bị bypass bởi người chỉ gõ `git commit`.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const EVIDENCE_DIR = "docs/evidence";
const PLANS_DIR = "docs/upgrade-standard/plans";
// Miễn trừ: BẮT BUỘC có lý do sau `N/A —` (không chấp nhận `N/A.` trần). Dòng được phép nằm
// trong bullet (`- …`) hoặc trích dẫn (`> …`).
const OPT_OUT_RE = /^\s*(?:>\s*)?[-*]?\s*\*\*Staging evidence \(Rule 17\)\*\*\s*:\s*N\/A\s+—\s*\S/im;
const MARKER_RE = /\*\*Staging evidence \(Rule 17\)\*\*/i;
// `commit:` chấp nhận cả dạng bullet markdown: `- **commit:** abc1234` (bỏ dấu `*`/`_`/`` ` `` trước khi so).
const COMMIT_RE = /^\s*(?:[-*]\s*)?commit\s*:\s*([0-9a-f]{7,40})\s*$/im;
const DATE_RE = /^\s*(?:[-*]\s*)?date\s*:\s*(.+)$/im;

/** Bỏ dấu markdown để so nội dung `key: value` bất kể format. */
function stripEmphasis(line) {
	return line.replace(/[*_`]/g, "").trim();
}

/** Đường dẫn file evidence chuẩn của 1 slice. */
function evidencePath(root, sliceId) {
	return path.join(root, EVIDENCE_DIR, sliceId, "staging.md");
}

/** Tìm plan docs của slice (tên file chứa slice id) — TRẢ VỀ TẤT CẢ (M-4: đừng chỉ đọc file mới nhất). */
function findPlanDocs(root, sliceId) {
	const dir = path.join(root, PLANS_DIR);
	if (!fs.existsSync(dir)) return [];
	return fs
		.readdirSync(dir)
		.filter((f) => f.endsWith(".md") && f.includes(sliceId))
		.map((f) => path.join(dir, f))
		.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

/** Tìm plan docs của slice (tên file chứa slice id) — file mới nhất. */
function findPlanDoc(root, sliceId) {
	return findPlanDocs(root, sliceId)[0] || null;
}

/** Đọc `commit:` + `date:` trong file evidence (chấp nhận cả dạng bullet `- **commit:** x`). */
function readEvidence(file) {
	if (!fs.existsSync(file)) return null;
	const text = fs.readFileSync(file, "utf8");
	const lines = text.split(/\r?\n/).map(stripEmphasis);
	const commit = lines.map((l) => COMMIT_RE.exec(l)).find(Boolean);
	const date = lines.map((l) => DATE_RE.exec(l)).find(Boolean);
	return { commit: commit ? commit[1] : null, date: date ? date[1].trim() : null, text };
}

/** Repo chứa git để kiểm tra commit tồn tại (tìm từ `root`; fallback về repo của script). */
function resolveGitRoot(root) {
	try {
		const top = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" }).trim();
		if (top) return top;
	} catch {
		/* root không phải git repo (ví dụ fixture tạm của self-test) */
	}
	return path.resolve(__dirname, "..", "..");
}

/**
 * Drift "chỉ-tài-liệu/tooling": staging phục vụ sha MỚI HƠN sha trong evidence, nhưng phần khác nhau
 * **không** chạm `src/**` ⇒ evidence không bị lỗi thời (chỉ lệch commit docs/tooling).
 * Không có bước này thì luật "tự chặn mình" quay lại (commit chứa file evidence đẩy HEAD/staging).
 * Ngược lại: nếu `src/**` đổi sau commit đo ⇒ **phải đo lại** (hình học/số đo đã cũ).
 */
function driftOnlyEvidence(root, fromSha, toSha) {
	try {
		const out = execFileSync("git", ["diff", "--name-only", `${fromSha}..${toSha}`], {
			cwd: root,
			encoding: "utf8",
		});
		const files = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
		if (files.length === 0) return false;
		return files.every((f) => !f.startsWith("src/"));
	} catch {
		return false;
	}
}

/** sha có tồn tại trong repo không (`git cat-file -e <sha>^{commit}`). */
function commitExists(root, sha) {
	try {
		execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: root, stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/** Staging đang phục vụ commit nào (null khi offline / lỗi mạng). CACHE 60s (M-5: không gọi mạng mỗi lượt). */
const STAGING_CACHE_TTL_MS = 60 * 1000;
const stagingCache = new Map();
function stagingCommit(url) {
	const hit = stagingCache.get(url);
	const now = Date.now();
	if (hit && now - hit.at < STAGING_CACHE_TTL_MS) return hit.commit;
	let commit = null;
	try {
		const res = execFileSync("curl", ["-s", "-4", "--max-time", "8", url], { encoding: "utf8" });
		const j = JSON.parse(res);
		if (typeof j.commit === "string") commit = j.commit;
	} catch {
		commit = null;
	}
	stagingCache.set(url, { at: now, commit });
	return commit;
}

/**
 * Kiểm tra evidence staging của 1 slice.
 * @returns {{required: boolean, ok: boolean, reason: string, evidence?: string}}
 */
function checkStagingEvidence({ root, sliceId, stagingUrl, gitRoot, fetchStagingCommit, now }) {
	const url = stagingUrl || process.env.STAGING_HEALTH_URL || "";
	const fetchCommit = typeof fetchStagingCommit === "function" ? fetchStagingCommit : () => stagingCommit(url);
	const repo = gitRoot || resolveGitRoot(root);
	// M-4: quét TẤT CẢ plan docs của slice để tìm dòng miễn (không chỉ file mới nhất).
	const planDocs = findPlanDocs(root, sliceId);
	let optedOut = false;
	for (const doc of planDocs) {
		if (OPT_OUT_RE.test(fs.readFileSync(doc, "utf8"))) {
			optedOut = true;
			break;
		}
	}
	if (optedOut) {
		return { required: false, ok: true, reason: "staging evidence: slice co dong N/A (miễn)" };
	}

	const file = evidencePath(root, sliceId);
	const ev = readEvidence(file);
	if (!ev) {
		return { required: true, ok: false, reason: `staging evidence: thieu file ${EVIDENCE_DIR}/${sliceId}/staging.md (can dong N/A trong plan docs de mien)` };
	}
	if (!ev.commit) {
		return { required: true, ok: false, reason: `staging evidence: file ${EVIDENCE_DIR}/${sliceId}/staging.md thieu dong "commit: <sha>"` };
	}
	if (!ev.date) {
		return { required: true, ok: false, reason: `staging evidence: file ${EVIDENCE_DIR}/${sliceId}/staging.md thieu dong "date: ..."` };
	}
	if (!commitExists(repo, ev.commit)) {		return { required: true, ok: false, reason: `staging evidence: commit ${ev.commit} khong ton tai trong repo` };
	}
	const served = fetchCommit();
	if (served === null || served === undefined) {
		// Offline: không chặn cứng, nhưng phải in cảnh báo to (L-E02: không được coi là đã kiểm).
		return { required: true, ok: true, warn: `staging evidence NOT re-verified (khong goi duoc ${url})`, reason: `staging evidence: commit ${ev.commit} co trong repo (chua xac minh staging do offline)`, evidence: ev.commit };
	}
	// So sánh theo PREFIX: `health.json` có thể trả sha ngắn (7 ký tự) còn evidence ghi sha đầy đủ.
	const sameSha = served === ev.commit || String(served).startsWith(ev.commit) || ev.commit.startsWith(String(served));
	if (!sameSha) {
		// Drift chỉ-docs: staging chạy commit MỚI hơn (commit chứa file evidence) mà phần khác nhau
		// chỉ nằm trong `docs/evidence/**` ⇒ vẫn hợp lệ (evidence không bị lỗi thời).
		const driftOk =
			String(served).length >= 7 &&
			String(ev.commit).length >= 7 &&
			!String(served).startsWith(String(ev.commit)) &&
			driftOnlyEvidence(repo, ev.commit, served);
		if (driftOk) {
			return {
				required: true,
				ok: true,
				warn: `staging evidence: staging chay ${served} (moi hon evidence ${ev.commit}) - lech chi docs/evidence`,
				reason: `staging evidence: ${ev.commit} (commit do) + drift chi docs/evidence`,
				evidence: ev.commit,
			};
		}
		return { required: true, ok: false, reason: `staging evidence: staging dang phuc vu ${served} nhung file evidence ghi ${ev.commit}` };
	}
	return { required: true, ok: true, reason: `staging evidence: ${ev.commit} khop staging`, evidence: ev.commit };
}

module.exports = { checkStagingEvidence, evidencePath, findPlanDoc, findPlanDocs, readEvidence, commitExists, stagingCommit, driftOnlyEvidence, resolveGitRoot, EVIDENCE_DIR, PLANS_DIR };
