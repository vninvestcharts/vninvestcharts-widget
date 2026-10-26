const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const workspaceRoot = path.resolve(__dirname, "..");
const testsDir = path.join(workspaceRoot, "src", "widget", "__tests__");
const vitestCli = require.resolve("vitest/vitest.mjs");
const junitOutputFile = path.join(workspaceRoot, ".vitest-widget-contract.junit.xml");
const junitChunkPrefix = path.join(workspaceRoot, ".vitest-widget-contract.chunk-");

const argv = process.argv.slice(2);
const ciMode = argv.includes("--ci");
const extraArgs = argv.filter((arg) => arg !== "--ci");

// Find all test files dynamically
const testFiles = fs.readdirSync(testsDir)
  .filter((file) => file.endsWith(".test.ts") || file.endsWith(".test.tsx"))
  .map((file) => path.join("src", "widget", "__tests__", file));

function extractTestSuites(xml) {
  return xml.match(/<testsuite[\s\S]*?<\/testsuite>/g) ?? [];
}

function mergeJunitReports(chunkFiles) {
  const suites = [];
  for (const filePath of chunkFiles) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const xml = fs.readFileSync(filePath, "utf8");
    suites.push(...extractTestSuites(xml));
  }

  const merged = [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    "<testsuites>",
    ...suites,
    "</testsuites>",
    "",
  ].join("\n");

  fs.writeFileSync(junitOutputFile, merged, "utf8");
}

function runTestFile(file, index) {
  const args = [
    vitestCli,
    "run",
    file,
    ...extraArgs,
  ];

  let chunkFile = null;
  if (ciMode) {
    chunkFile = `${junitChunkPrefix}${index + 1}.xml`;
    args.push("--reporter=junit", `--outputFile=${chunkFile}`);
  }

  console.log(`\n[widget-contract] [${index + 1}/${testFiles.length}] ${path.basename(file)}`);
  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      VITEST_DEBUG_HANDLES: "",
    },
    stdio: "inherit",
  });

  return {
    status: result.status ?? 1,
    chunkFile,
  };
}

const chunkFiles = [];
for (const [index, file] of testFiles.entries()) {
  const result = runTestFile(file, index);
  if (result.chunkFile) {
    chunkFiles.push(result.chunkFile);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

if (ciMode) {
  mergeJunitReports(chunkFiles);
  for (const filePath of chunkFiles) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
