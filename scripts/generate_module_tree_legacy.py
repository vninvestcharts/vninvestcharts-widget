#!/usr/bin/env python3
"""Generate module_tree_full.md from project source code.

Covers:
- Python modules: classes, class methods, top-level functions, top-level variables.
- JS/TS modules: classes, top-level function declarations, arrow/function-expression assignments,
  and top-level variable declarations.

Usage:
    python scripts/generate_module_tree.py
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "module_tree_full.md"

PY_EXTS = {".py"}
JS_EXTS = {".js", ".jsx", ".ts", ".tsx"}

IGNORE_DIR_NAMES = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "build",
    "dist",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "coverage",
    "staticfiles",
    "mediafiles",
}

IGNORE_PATH_PARTS = {
    "backend/portfolio/migrations",
}

VAR_NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@dataclass
class ClassInfo:
    name: str
    methods: list[str] = field(default_factory=list)


@dataclass
class ModuleInfo:
    path: str
    language: str
    classes: list[ClassInfo] = field(default_factory=list)
    functions: list[str] = field(default_factory=list)
    variables: list[str] = field(default_factory=list)


JS_CLASS_RE = re.compile(r"^\s*export\s+default\s+class\s+([A-Za-z_][A-Za-z0-9_]*)|^\s*export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)|^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)")
JS_FUNC_RE = re.compile(r"^\s*export\s+async\s+function\s+([A-Za-z_][A-Za-z0-9_]*)|^\s*export\s+function\s+([A-Za-z_][A-Za-z0-9_]*)|^\s*async\s+function\s+([A-Za-z_][A-Za-z0-9_]*)|^\s*function\s+([A-Za-z_][A-Za-z0-9_]*)")
JS_ARROW_RE = re.compile(
    r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?(?:\([^;]*\)|[A-Za-z_][A-Za-z0-9_]*)\s*=>"
)
JS_FUNC_EXPR_RE = re.compile(
    r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?function\b"
)
JS_VAR_RE = re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b")


def is_ignored(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if any(part in IGNORE_DIR_NAMES for part in path.parts):
        return True
    for ignored in IGNORE_PATH_PARTS:
        if rel.startswith(ignored):
            return True
    return False


def iter_source_files() -> Iterable[Path]:
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        if is_ignored(path):
            continue
        if path.suffix in PY_EXTS or path.suffix in JS_EXTS:
            yield path


def unique_sorted(items: Iterable[str]) -> list[str]:
    return sorted({x for x in items if x})


def parse_python_module(path: Path) -> ModuleInfo | None:
    rel = path.relative_to(ROOT).as_posix()
    try:
        src = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        src = path.read_text(encoding="utf-8", errors="ignore")

    try:
        tree = ast.parse(src)
    except SyntaxError:
        return ModuleInfo(path=rel, language="python")

    module = ModuleInfo(path=rel, language="python")

    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            module.functions.append(node.name)
        elif isinstance(node, ast.ClassDef):
            methods: list[str] = []
            for body_node in node.body:
                if isinstance(body_node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methods.append(body_node.name)
            module.classes.append(ClassInfo(name=node.name, methods=unique_sorted(methods)))
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and VAR_NAME_RE.match(target.id):
                    module.variables.append(target.id)
        elif isinstance(node, ast.AnnAssign):
            target = node.target
            if isinstance(target, ast.Name) and VAR_NAME_RE.match(target.id):
                module.variables.append(target.id)

    module.functions = unique_sorted(module.functions)
    module.variables = unique_sorted(module.variables)
    module.classes = sorted(module.classes, key=lambda c: c.name.lower())
    return module


def pick_first_group(match: re.Match[str]) -> str:
    for idx in range(1, 10):
        try:
            value = match.group(idx)
        except IndexError:
            return ""
        if value:
            return value
    return ""


def parse_js_ts_module(path: Path) -> ModuleInfo:
    rel = path.relative_to(ROOT).as_posix()
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except UnicodeDecodeError:
        lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()

    classes: list[str] = []
    functions: list[str] = []
    variables: list[str] = []

    for line in lines:
        class_match = JS_CLASS_RE.match(line)
        if class_match:
            classes.append(pick_first_group(class_match))
            continue

        func_match = JS_FUNC_RE.match(line)
        if func_match:
            functions.append(pick_first_group(func_match))
            continue

        arrow_match = JS_ARROW_RE.match(line)
        if arrow_match:
            functions.append(arrow_match.group(1))
            continue

        func_expr_match = JS_FUNC_EXPR_RE.match(line)
        if func_expr_match:
            functions.append(func_expr_match.group(1))
            continue

        var_match = JS_VAR_RE.match(line)
        if var_match:
            variables.append(var_match.group(1))

    module = ModuleInfo(path=rel, language="javascript/typescript")
    module.classes = [ClassInfo(name=n, methods=[]) for n in unique_sorted(classes)]
    module.functions = unique_sorted(functions)
    module.variables = unique_sorted(variables)
    return module


def parse_module(path: Path) -> ModuleInfo | None:
    if path.suffix in PY_EXTS:
        return parse_python_module(path)
    if path.suffix in JS_EXTS:
        return parse_js_ts_module(path)
    return None


def module_has_symbols(module: ModuleInfo) -> bool:
    return bool(module.classes or module.functions or module.variables)


def render_markdown(modules: list[ModuleInfo]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    py_modules = [m for m in modules if m.language == "python"]
    js_modules = [m for m in modules if m.language == "javascript/typescript"]

    total_classes = sum(len(m.classes) for m in modules)
    total_functions = sum(len(m.functions) for m in modules)
    total_variables = sum(len(m.variables) for m in modules)

    lines: list[str] = []
    lines.append("# VNStockCharts Module Tree (Auto-generated)")
    lines.append("")
    lines.append("> Do not edit manually. Regenerate with `python scripts/generate_module_tree.py`.")
    lines.append("")
    lines.append(f"Generated at: `{now}`")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append(f"- Total modules: {len(modules)}")
    lines.append(f"- Python modules: {len(py_modules)}")
    lines.append(f"- JS/TS modules: {len(js_modules)}")
    lines.append(f"- Total classes: {total_classes}")
    lines.append(f"- Total functions: {total_functions}")
    lines.append(f"- Total top-level variables: {total_variables}")
    lines.append("")

    lines.append("## Python Modules")
    lines.append("")
    if not py_modules:
        lines.append("- None")
        lines.append("")
    else:
        for module in py_modules:
            lines.append(f"### `{module.path}`")
            lines.append("")
            if module.classes:
                lines.append("- Classes:")
                for cls in module.classes:
                    if cls.methods:
                        lines.append(f"  - `{cls.name}` -> methods: {', '.join(f'`{m}`' for m in cls.methods)}")
                    else:
                        lines.append(f"  - `{cls.name}`")
            if module.functions:
                lines.append("- Functions:")
                lines.append("  - " + ", ".join(f"`{fn}`" for fn in module.functions))
            if module.variables:
                lines.append("- Top-level variables:")
                lines.append("  - " + ", ".join(f"`{v}`" for v in module.variables))
            if not module_has_symbols(module):
                lines.append("- No parseable top-level symbols found")
            lines.append("")

    lines.append("## JS/TS Modules")
    lines.append("")
    if not js_modules:
        lines.append("- None")
        lines.append("")
    else:
        for module in js_modules:
            lines.append(f"### `{module.path}`")
            lines.append("")
            if module.classes:
                lines.append("- Classes:")
                lines.append("  - " + ", ".join(f"`{cls.name}`" for cls in module.classes))
            if module.functions:
                lines.append("- Functions:")
                lines.append("  - " + ", ".join(f"`{fn}`" for fn in module.functions))
            if module.variables:
                lines.append("- Top-level variables:")
                lines.append("  - " + ", ".join(f"`{v}`" for v in module.variables))
            if not module_has_symbols(module):
                lines.append("- No parseable top-level symbols found")
            lines.append("")

    lines.append("## Update Workflow")
    lines.append("")
    lines.append("1. After adding/changing functions/classes/variables, run:")
    lines.append("   - `python scripts/generate_module_tree.py`")
    lines.append("2. Review `module_tree_full.md` diff.")
    lines.append("3. Commit source changes and updated tree together.")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    modules: list[ModuleInfo] = []
    for source_file in sorted(iter_source_files()):
        module = parse_module(source_file)
        if module is not None:
            modules.append(module)

    modules = sorted(modules, key=lambda m: m.path.lower())
    content = render_markdown(modules)
    OUTPUT.write_text(content, encoding="utf-8")
    print(f"Generated: {OUTPUT}")
    print(f"Modules: {len(modules)}")


if __name__ == "__main__":
    main()
