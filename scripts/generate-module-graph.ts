#!/usr/bin/env tsx
/**
 * Generate module_tree_full.md from project source code using ts-morph AST.
 *
 * Replaces the legacy Python regex-based generator with full TypeScript AST analysis:
 * - Imports/exports with resolved paths
 * - Classes with methods, properties, inheritance
 * - Interfaces, type aliases, enums
 * - Dependency graph + circular dependency detection
 * - Layer-based grouping + Mermaid architecture diagram
 *
 * Usage: npx tsx scripts/generate-module-graph.ts
 */

import { Project, type SourceFile, type ClassDeclaration, type InterfaceDeclaration,
  type TypeAliasDeclaration, type EnumDeclaration, type FunctionDeclaration,
  type VariableDeclaration, type ImportDeclaration, type ExportDeclaration } from 'ts-morph';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ImportInfo {
  moduleSpecifier: string;
  resolvedPath: string;
  names: string[];
  isTypeOnly: boolean;
}

interface ExportInfo {
  name: string;
  isDefault: boolean;
  isType: boolean;
}

interface ClassInfo {
  name: string;
  extends?: string;
  implements: string[];
  methods: string[];
  properties: string[];
}

interface FunctionInfo {
  name: string;
  isAsync: boolean;
}

interface VariableInfo {
  name: string;
  isExported: boolean;
}

interface InterfaceInfo {
  name: string;
  properties: string[];
}

interface TypeAliasInfo {
  name: string;
}

interface EnumInfo {
  name: string;
  values: string[];
}

interface ModuleInfo {
  path: string;
  relativePath: string;
  language: 'typescript' | 'javascript' | 'python';
  layer: string;
  lineCount: number;
  classes: ClassInfo[];
  functions: FunctionInfo[];
  interfaces: InterfaceInfo[];
  typeAliases: TypeAliasInfo[];
  enums: EnumInfo[];
  variables: VariableInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'module_tree_full.md');

const IGNORE_DIRS = new Set([
  '.git', '.venv', 'venv', 'node_modules', 'build', 'dist',
  '__pycache__', '.pytest_cache', '.mypy_cache', 'coverage',
  'staticfiles', 'mediafiles', '.storybook',
]);

const TS_EXTENSIONS = new Set(['.ts', '.tsx']);
const JS_EXTENSIONS = new Set(['.js', '.jsx']);
const PY_EXTENSIONS = new Set(['.py']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectLayer(relativePath: string): string {
  if (relativePath.startsWith('src/widget/')) return 'widget';
  if (relativePath.startsWith('src/lib/')) return 'lib';
  if (relativePath.startsWith('src/demo/')) return 'demo';
  if (relativePath.includes('vn-kline-engine-core')) return 'engine-core';
  if (relativePath.includes('vn-kline-engine-react')) return 'engine-react';
  if (relativePath.includes('vn-kline-engine-drawing')) return 'engine-drawing';
  if (relativePath.startsWith('config/')) return 'config';
  if (relativePath.startsWith('scripts/')) return 'scripts';
  if (relativePath.startsWith('server/')) return 'server';
  if (relativePath.startsWith('tests/')) return 'tests';
  if (relativePath.startsWith('stories/')) return 'stories';
  return 'other';
}

function countLines(filePath: string): number {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

function relativeToRoot(filePath: string): string {
  return path.relative(ROOT, filePath).replace(/\\/g, '/');
}

function isIgnoredDir(filePath: string): boolean {
  const parts = filePath.split(/[\\/]/);
  return parts.some(p => IGNORE_DIRS.has(p));
}

function uniqueSorted(items: string[]): string[] {
  return [...new Set(items)].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// TS-Morph extraction
// ---------------------------------------------------------------------------

function extractModule(sourceFile: SourceFile): ModuleInfo {
  const filePath = sourceFile.getFilePath();
  const relativePath = relativeToRoot(filePath);
  const ext = path.extname(filePath);

  let language: 'typescript' | 'javascript' = TS_EXTENSIONS.has(ext) ? 'typescript' : 'javascript';

  const module: ModuleInfo = {
    path: filePath,
    relativePath,
    language,
    layer: detectLayer(relativePath),
    lineCount: countLines(filePath),
    classes: [],
    functions: [],
    interfaces: [],
    typeAliases: [],
    enums: [],
    variables: [],
    imports: [],
    exports: [],
  };

  // --- Imports ---
  for (const imp of sourceFile.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    let resolvedPath = '';
    try {
      // Resolve module path: try ts-morph's symbol resolution
      const symbol = imp.getSymbol();
      if (symbol) {
        const decls = symbol.getDeclarations();
        if (decls.length > 0) {
          resolvedPath = decls[0].getSourceFile().getFilePath();
        }
      }
    } catch { /* unresolved */ }

    // Fallback: manual path alias resolution
    if (!resolvedPath) {
      const spec = imp.getModuleSpecifierValue();
      if (spec.startsWith('@lib/')) {
        resolvedPath = path.join(ROOT, 'src/lib/', spec.slice(5)) + '.ts';
      } else if (spec === '@vninvestcharts/engine-core' || spec === '@vninvestcharts/vn-kline-engine-core') {
        resolvedPath = path.join(ROOT, '../vninvestcharts-engine/packages/vn-kline-engine-core/src/index.ts');
      } else if (spec === '@vninvestcharts/engine-react' || spec === '@vninvestcharts/vn-kline-engine-react') {
        resolvedPath = path.join(ROOT, '../vninvestcharts-engine/packages/vn-kline-engine-react/src/index.ts');
      } else if (spec.startsWith('.')) {
        // Relative import - resolve from source file directory
        const dir = path.dirname(sourceFile.getFilePath());
        const candidate = path.resolve(dir, spec);
        const exts = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
        for (const ext of exts) {
          if (fs.existsSync(candidate + ext)) {
            resolvedPath = candidate + ext;
            break;
          }
        }
      }
    }

    module.imports.push({
      moduleSpecifier: spec,
      resolvedPath,
      names: imp.getNamedImports().map(n => n.getName()),
      isTypeOnly: imp.isTypeOnly(),
    });
  }

  // --- Exports ---
  for (const exp of sourceFile.getExportDeclarations()) {
    const spec = exp.getModuleSpecifierValue();
    if (exp.getNamedExports().length > 0) {
      for (const ne of exp.getNamedExports()) {
        module.exports.push({
          name: ne.getName(),
          isDefault: false,
          isType: exp.isTypeOnly(),
        });
      }
    }
  }

  // --- Classes ---
  for (const cls of sourceFile.getClasses()) {
    const classInfo: ClassInfo = {
      name: cls.getName() || '<anonymous>',
      extends: cls.getExtends()?.getText(),
      implements: cls.getImplements().map(i => i.getText()),
      methods: cls.getMethods().map(m => m.getName()),
      properties: cls.getProperties().map(p => p.getName()),
    };
    module.classes.push(classInfo);

    // Detect default export of class
    if (cls.isDefaultExport()) {
      module.exports.push({ name: classInfo.name, isDefault: true, isType: false });
    }
    if (cls.isExported()) {
      module.exports.push({ name: classInfo.name, isDefault: false, isType: false });
    }
  }

  // --- Interfaces ---
  for (const iface of sourceFile.getInterfaces()) {
    if (iface.getName().startsWith('_')) continue;
    module.interfaces.push({
      name: iface.getName(),
      properties: iface.getProperties().map(p => p.getName()),
    });
    if (iface.isExported()) {
      module.exports.push({ name: iface.getName(), isDefault: false, isType: true });
    }
  }

  // --- Type Aliases ---
  for (const ta of sourceFile.getTypeAliases()) {
    if (ta.getName().startsWith('_')) continue;
    module.typeAliases.push({ name: ta.getName() });
    if (ta.isExported()) {
      module.exports.push({ name: ta.getName(), isDefault: false, isType: true });
    }
  }

  // --- Enums ---
  for (const en of sourceFile.getEnums()) {
    if (en.getName().startsWith('_')) continue;
    module.enums.push({
      name: en.getName(),
      values: en.getMembers().map(m => m.getName()),
    });
    if (en.isExported()) {
      module.exports.push({ name: en.getName(), isDefault: false, isType: false });
    }
  }

  // --- Functions ---
  for (const fn of sourceFile.getFunctions()) {
    if (fn.getName()?.startsWith('_')) continue;
    const name = fn.getName();
    if (!name) continue;
    module.functions.push({
      name,
      isAsync: fn.isAsync(),
    });
    if (fn.isDefaultExport()) {
      module.exports.push({ name, isDefault: true, isType: false });
    }
    if (fn.isExported()) {
      module.exports.push({ name, isDefault: false, isType: false });
    }
  }

  // --- Variables ---
  for (const v of sourceFile.getVariableStatements()) {
    for (const decl of v.getDeclarations()) {
      const name = decl.getName();
      if (!name || name.length > 80) continue;
      module.variables.push({
        name,
        isExported: v.isExported(),
      });
      if (v.isExported()) {
        module.exports.push({ name, isDefault: false, isType: false });
      }
    }
  }

  // Deduplicate exports
  const seen = new Set<string>();
  module.exports = module.exports.filter(e => {
    const key = `${e.name}:${e.isDefault}:${e.isType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return module;
}

// ---------------------------------------------------------------------------
// Python extraction (simple AST)
// ---------------------------------------------------------------------------

function extractPythonModule(filePath: string): ModuleInfo {
  const relativePath = relativeToRoot(filePath);
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  const module: ModuleInfo = {
    path: filePath,
    relativePath,
    language: 'python',
    layer: detectLayer(relativePath),
    lineCount: content.split('\n').length,
    classes: [],
    functions: [],
    interfaces: [],
    typeAliases: [],
    enums: [],
    variables: [],
    imports: [],
    exports: [],
  };

  // Simple regex extraction for Python
  const classRe = /^class\s+(\w+)/gm;
  const funcRe = /^(?:async\s+)?def\s+(\w+)/gm;
  const varRe = /^(\w+)\s*=/gm;

  let m: RegExpExecArray | null;
  while ((m = classRe.exec(content)) !== null) {
    module.classes.push({ name: m[1], implements: [], methods: [], properties: [] });
  }
  while ((m = funcRe.exec(content)) !== null) {
    if (m[1] !== '__init__') {
      module.functions.push({ name: m[1], isAsync: m[0].startsWith('async') });
    }
  }
  while ((m = varRe.exec(content)) !== null) {
    if (/^[A-Z_]+$/.test(m[1]) || /^[a-z_]+$/.test(m[1])) {
      module.variables.push({ name: m[1], isExported: false });
    }
  }

  return module;
}

// ---------------------------------------------------------------------------
// Graph construction + circular detection
// ---------------------------------------------------------------------------

function buildGraph(modules: ModuleInfo[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const pathIndex = new Map<string, string>();
  for (const mod of modules) {
    pathIndex.set(mod.relativePath, mod.relativePath);
    pathIndex.set(mod.path, mod.relativePath); // Also index absolute path
    graph.set(mod.relativePath, new Set());
  }

  for (const mod of modules) {
    const deps = graph.get(mod.relativePath)!;
    for (const imp of mod.imports) {
      if (imp.resolvedPath) {
        const relDep = relativeToRoot(imp.resolvedPath);
        // Check if resolved path is in our graph (either as relative or absolute)
        if (pathIndex.has(relDep)) {
          deps.add(pathIndex.get(relDep)!);
        } else if (pathIndex.has(imp.resolvedPath)) {
          deps.add(pathIndex.get(imp.resolvedPath)!);
        } else {
          // Engine repo files - add as virtual node
          const engineLayer = detectLayer(relDep);
          if (engineLayer.startsWith('engine-')) {
            deps.add(`[engine] ${engineLayer}`);
          }
        }
      }
    }
  }

  return graph;
}

function detectCircular(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]) {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push([...path.slice(cycleStart), node]);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    const deps = graph.get(node);
    if (deps) {
      for (const dep of deps) {
        dfs(dep, path);
      }
    }

    path.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}

function computeImportDepth(graph: Map<string, Set<string>>): number {
  let maxDepth = 0;
  const visited = new Map<string, number>();

  function getDepth(node: string, path: Set<string>): number {
    if (visited.has(node)) return visited.get(node)!;
    if (path.has(node)) return 0; // cycle guard

    path.add(node);
    let depth = 0;
    const deps = graph.get(node);
    if (deps) {
      for (const dep of deps) {
        depth = Math.max(depth, 1 + getDepth(dep, path));
      }
    }
    path.delete(node);
    visited.set(node, depth);
    return depth;
  }

  for (const node of graph.keys()) {
    maxDepth = Math.max(maxDepth, getDepth(node, new Set()));
  }
  return maxDepth;
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderMermaidDiagram(modules: ModuleInfo[]): string {
  const layerCounts = new Map<string, number>();
  for (const mod of modules) {
    layerCounts.set(mod.layer, (layerCounts.get(mod.layer) || 0) + 1);
  }

  // Also count engine virtual nodes
  const engineLayers = new Set<string>();
  for (const mod of modules) {
    for (const imp of mod.imports) {
      if (imp.resolvedPath) {
        const depLayer = detectLayer(relativeToRoot(imp.resolvedPath));
        if (depLayer.startsWith('engine-')) {
          engineLayers.add(depLayer);
        }
      } else if (imp.moduleSpecifier.includes('engine-core') || imp.moduleSpecifier.includes('vn-kline-engine-core')) {
        engineLayers.add('engine-core');
      } else if (imp.moduleSpecifier.includes('engine-react') || imp.moduleSpecifier.includes('vn-kline-engine-react')) {
        engineLayers.add('engine-react');
      }
    }
  }
  for (const el of engineLayers) {
    if (!layerCounts.has(el)) layerCounts.set(el, 0);
  }

  // Build layer dependency edges
  const layerDeps = new Map<string, Set<string>>();
  for (const mod of modules) {
    if (!layerDeps.has(mod.layer)) layerDeps.set(mod.layer, new Set());
    for (const imp of mod.imports) {
      if (imp.resolvedPath) {
        const depLayer = detectLayer(relativeToRoot(imp.resolvedPath));
        if (depLayer !== mod.layer) {
          layerDeps.get(mod.layer)!.add(depLayer);
        }
      }
    }
  }

  const lines: string[] = ['```mermaid', 'flowchart TD'];

  // Node definitions
  const layerLabels: Record<string, string> = {
    'widget': 'src/widget/<br/>Widget',
    'lib': 'src/lib/<br/>Shared Library',
    'demo': 'src/demo/<br/>Demo Surfaces',
    'engine-core': 'engine-core/<br/>Kernel + Coordinates',
    'engine-react': 'engine-react/<br/>React Components',
    'engine-drawing': 'engine-drawing/<br/>Drawing Primitives',
    'config': 'config/<br/>Build Config',
    'scripts': 'scripts/<br/>Scripts',
    'server': 'server/<br/>Server',
    'tests': 'tests/<br/>Tests',
    'stories': 'stories/<br/>Stories',
    'other': 'other',
  };

  for (const [layer, count] of layerCounts) {
    const label = layerLabels[layer] || layer;
    const id = layer.replace(/-/g, '_');
    lines.push(`  ${id}["${label}<br/>${count} files"]`);
  }

  // Edges
  const seenEdges = new Set<string>();
  for (const [from, tos] of layerDeps) {
    for (const to of tos) {
      const edgeKey = `${from}->${to}`;
      if (!seenEdges.has(edgeKey)) {
        seenEdges.add(edgeKey);
        lines.push(`  ${from.replace(/-/g, '_')} --> ${to.replace(/-/g, '_')}`);
      }
    }
  }

  lines.push('```');
  return lines.join('\n');
}

function renderMarkdown(modules: ModuleInfo[], cycles: string[][], importDepth: number): string {
  const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  const totalLines = modules.reduce((s, m) => s + m.lineCount, 0);
  const totalClasses = modules.reduce((s, m) => s + m.classes.length, 0);
  const totalFunctions = modules.reduce((s, m) => s + m.functions.length, 0);
  const totalInterfaces = modules.reduce((s, m) => s + m.interfaces.length, 0);
  const totalTypeAliases = modules.reduce((s, m) => s + m.typeAliases.length, 0);
  const totalEnums = modules.reduce((s, m) => s + m.enums.length, 0);

  const lines: string[] = [];

  lines.push('# Module Tree — Architecture Overview (Auto-generated)');
  lines.push('');
  lines.push('> Generated by `npx tsx scripts/generate-module-graph.ts` at ' + now);
  lines.push('> Do not edit manually. Run `npm run generate:module-tree` to regenerate.');
  lines.push('');

  // --- Summary ---
  lines.push('## Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total modules | ${modules.length} |`);
  lines.push(`| Total lines | ${totalLines.toLocaleString()} |`);
  lines.push(`| Classes | ${totalClasses} |`);
  lines.push(`| Functions | ${totalFunctions} |`);
  lines.push(`| Interfaces | ${totalInterfaces} |`);
  lines.push(`| Type aliases | ${totalTypeAliases} |`);
  lines.push(`| Enums | ${totalEnums} |`);
  lines.push(`| Circular deps | ${cycles.length === 0 ? '0 ✅' : `${cycles.length} ⚠️`} |`);
  lines.push(`| Max import depth | ${importDepth} |`);
  lines.push('');

  // --- Architecture diagram ---
  lines.push('## Architecture Layers');
  lines.push('');
  lines.push(renderMermaidDiagram(modules));
  lines.push('');

  // --- Dependency rules ---
  const libToDemo = modules.some(m =>
    m.layer === 'lib' && m.imports.some(i => detectLayer(relativeToRoot(i.resolvedPath)) === 'demo')
  );
  const widgetToDemo = modules.some(m =>
    m.layer === 'widget' && m.imports.some(i => detectLayer(relativeToRoot(i.resolvedPath)) === 'demo')
  );

  lines.push('## Dependency Rules');
  lines.push('');
  lines.push('| Rule | Status |');
  lines.push('|------|--------|');
  lines.push(`| \`src/lib/**\` → \`src/demo/**\` | ${libToDemo ? '❌ VIOLATION' : '✅ No violations'} |`);
  lines.push(`| \`src/widget/**\` → \`src/demo/**\` | ${widgetToDemo ? '❌ VIOLATION' : '✅ No violations'} |`);
  lines.push(`| Circular dependencies | ${cycles.length === 0 ? '✅ None' : `⚠️ ${cycles.length} found`} |`);
  lines.push('');

  // --- Per-layer modules ---
  const byLayer = new Map<string, ModuleInfo[]>();
  for (const mod of modules) {
    if (!byLayer.has(mod.layer)) byLayer.set(mod.layer, []);
    byLayer.get(mod.layer)!.push(mod);
  }

  const layerOrder = ['widget', 'lib', 'demo', 'engine-core', 'engine-react', 'engine-drawing', 'config', 'scripts', 'server', 'tests', 'stories', 'other'];

  lines.push('## Per-Layer Modules');
  lines.push('');

  for (const layer of layerOrder) {
    const mods = byLayer.get(layer);
    if (!mods || mods.length === 0) continue;

    const layerLines = mods.reduce((s, m) => s + m.lineCount, 0);
    lines.push(`### Layer: \`${layer}\` (${mods.length} files, ${layerLines.toLocaleString()} lines)`);
    lines.push('');
    lines.push('| Module | Lines | Exports | Imports from | Key Symbols |');
    lines.push('|--------|-------|---------|--------------|-------------|');

    for (const mod of mods.sort((a, b) => b.lineCount - a.lineCount)) {
      const exportNames = mod.exports
        .slice(0, 5)
        .map(e => e.isDefault ? `${e.name} (default)` : e.name)
        .join(', ');
      const exportStr = mod.exports.length > 5 ? `${exportNames} +${mod.exports.length - 5}` : exportNames;

      const importLayers = new Set<string>();
      for (const imp of mod.imports) {
        if (imp.resolvedPath) {
          importLayers.add(detectLayer(relativeToRoot(imp.resolvedPath)));
        } else {
          // Infer from module specifier
          if (imp.moduleSpecifier.startsWith('@lib/')) importLayers.add('lib');
          else if (imp.moduleSpecifier.includes('engine-core') || imp.moduleSpecifier.includes('vn-kline-engine-core')) importLayers.add('engine-core');
          else if (imp.moduleSpecifier.includes('engine-react') || imp.moduleSpecifier.includes('vn-kline-engine-react')) importLayers.add('engine-react');
          else if (imp.moduleSpecifier.includes('engine-drawing') || imp.moduleSpecifier.includes('vn-kline-engine-drawing')) importLayers.add('engine-drawing');
        }
      }
      const importStr = [...importLayers].filter(l => l !== mod.layer).join(', ');

      const keySymbols: string[] = [];
      for (const cls of mod.classes.slice(0, 3)) keySymbols.push(cls.name);
      for (const fn of mod.functions.slice(0, 3)) keySymbols.push(fn.name);
      for (const iface of mod.interfaces.slice(0, 2)) keySymbols.push(`interface ${iface.name}`);
      for (const en of mod.enums.slice(0, 2)) keySymbols.push(`enum ${en.name}`);
      const symbolsStr = keySymbols.join(', ');

      lines.push(`| \`${mod.relativePath}\` | ${mod.lineCount} | ${exportStr} | ${importStr} | ${symbolsStr} |`);
    }
    lines.push('');
  }

  // --- Circular dependencies ---
  lines.push('## Circular Dependencies');
  lines.push('');
  if (cycles.length === 0) {
    lines.push('> ✅ No circular dependencies detected.');
  } else {
    lines.push(`> ⚠️ **${cycles.length} circular dependencies detected:**`);
    for (const cycle of cycles) {
      lines.push(`> - ${cycle.map(p => `\`${p}\``).join(' → ')}`);
    }
  }
  lines.push('');

  // --- High-complexity modules ---
  const top10 = [...modules].sort((a, b) => b.lineCount - a.lineCount).slice(0, 10);
  lines.push('## High-Complexity Modules (top 10 by line count)');
  lines.push('');
  lines.push('| Module | Lines | Functions | Classes | Imports |');
  lines.push('|--------|-------|-----------|---------|---------|');
  for (const mod of top10) {
    lines.push(`| \`${mod.relativePath}\` | ${mod.lineCount.toLocaleString()} | ${mod.functions.length} | ${mod.classes.length} | ${mod.imports.length} |`);
  }
  lines.push('');

  // --- Update workflow ---
  lines.push('## Update Workflow');
  lines.push('');
  lines.push('1. After structural changes, run:');
  lines.push('   ```bash');
  lines.push('   npm run generate:module-tree');
  lines.push('   ```');
  lines.push('2. Review diff of `module_tree_full.md`');
  lines.push('3. Commit source + updated tree together');
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('Initializing ts-morph project...');

  const project = new Project({
    tsConfigFilePath: path.join(ROOT, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  // Add all source files
  const sourceExtensions = new Set([...TS_EXTENSIONS, ...JS_EXTENSIONS]);

  function walkDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        walkDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (sourceExtensions.has(ext)) {
          try {
            project.addSourceFileAtPath(fullPath);
          } catch { /* skip unparseable */ }
        }
      }
    }
  }

  // Walk widget repo source directories
  const scanDirs = ['src', 'packages', 'scripts', 'config', 'server', 'tests', 'stories'];
  for (const dir of scanDirs) {
    const fullPath = path.join(ROOT, dir);
    if (fs.existsSync(fullPath)) {
      walkDir(fullPath);
    }
  }

  // Also add root-level JS/TS files
  const rootFiles = fs.readdirSync(ROOT, { withFileTypes: true });
  for (const f of rootFiles) {
    if (f.isFile() && sourceExtensions.has(path.extname(f.name))) {
      try {
        project.addSourceFileAtPath(path.join(ROOT, f.name));
      } catch { /* skip */ }
    }
  }

  const sourceFiles = project.getSourceFiles();
  console.log(`Processing ${sourceFiles.length} source files...`);

  // Extract modules from TS/JS files
  const modules: ModuleInfo[] = [];
  for (const sf of sourceFiles) {
    try {
      modules.push(extractModule(sf));
    } catch (e) {
      console.warn(`Warning: failed to extract ${sf.getFilePath()}: ${e}`);
    }
  }

  // Add Python files
  function walkForPython(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        walkForPython(fullPath);
      } else if (entry.isFile() && PY_EXTENSIONS.has(path.extname(entry.name))) {
        try {
          modules.push(extractPythonModule(fullPath));
        } catch { /* skip */ }
      }
    }
  }

  if (fs.existsSync(path.join(ROOT, 'scripts'))) {
    walkForPython(path.join(ROOT, 'scripts'));
  }

  // Sort by path
  modules.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  console.log(`Extracted ${modules.length} modules.`);

  // Build graph + detect circular
  console.log('Building dependency graph...');
  const graph = buildGraph(modules);
  const cycles = detectCircular(graph);
  const importDepth = computeImportDepth(graph);

  console.log(`Circular dependencies: ${cycles.length}`);
  console.log(`Max import depth: ${importDepth}`);

  // Render markdown
  console.log('Rendering markdown...');
  const markdown = renderMarkdown(modules, cycles, importDepth);

  // Write output
  fs.writeFileSync(OUTPUT, markdown, 'utf-8');
  console.log(`Generated: ${OUTPUT}`);
  console.log(`Modules: ${modules.length}, Lines: ${modules.reduce((s, m) => s + m.lineCount, 0).toLocaleString()}`);
}

main();
