#!/usr/bin/env python3
"""Cycle Calendar - build and packaging tests.

Run: python3 tests/build_test.py
Rebuilds the page from source and checks that the output is deterministic,
self contained and free of the characters the project forbids.
"""

from __future__ import annotations

import hashlib
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

spec = importlib.util.spec_from_file_location("build", ROOT / "build.py")
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)

passed = 0
failures: list[str] = []


def check(name, fn):
    global passed
    try:
        fn()
        passed += 1
    except AssertionError as error:
        failures.append(f"{name}: {error}")


def eq(actual, expected, label=""):
    assert actual == expected, f"{label} expected {expected!r} got {actual!r}"


def truthy(value, label=""):
    assert value, label or "expected a truthy value"


# ------------------------------------------------------------- transliteration

check("digraphs Lj and lj", lambda: eq(build.transliterate("Ljubav ljubav"), "Љубав љубав"))
check("digraphs Nj and nj", lambda: eq(build.transliterate("Njiva njiva"), "Њива њива"))
check("digraphs Dz and dz", lambda: eq(build.transliterate("Džep džep"), "Џеп џеп"))
check("digraph beats single letters", lambda: eq(build.transliterate("injekcija"), "ињекција"))
check("all Serbian letters", lambda: eq(
    build.transliterate("čćžšđ"),
    "чћжшђ"))
check("placeholders survive", lambda: eq(
    build.transliterate("Na osnovu {n} ciklusa"), "На основу {n} циклуса"))
check("placeholders are protected, connectors are not", lambda: eq(
    build.transliterate("{from} do {to}"), "{from} до {to}"))
check("brand names stay Latin", lambda: eq(
    build.transliterate("Cycle Calendar"), "Cycle Calendar"))
check("technical names stay Latin inside prose", lambda: eq(
    build.transliterate("radi u localStorage"), "ради у localStorage"))
check("ASCII stays ASCII", lambda: eq(build.transliterate("Apache 2.0"), "Apache 2.0"))
check("empty string", lambda: eq(build.transliterate(""), ""))
check("uppercase keeps case", lambda: eq(build.transliterate("Šuma"), "Шума"))

# -------------------------------------------------------------------- locales

locales = build.load_locales()
check("four locales", lambda: eq(sorted(locales), ["en", "ro", "sr-cyrl", "sr-latn"]))
check("identical key counts", lambda: eq(
    {len(locales[lang]) for lang in locales}, {len(locales["en"])}))
check("serbian cyrillic derives from latin", lambda: eq(
    set(locales["sr-cyrl"]), set(locales["sr-latn"])))
check("serbian cyrillic is generated, not authored", lambda: all(
    locales["sr-cyrl"][key] == build.transliterate(locales["sr-latn"][key]) for key in locales["sr-latn"]))
check("no slug of Latin survives in Cyrillic prose", lambda: truthy(
    build.transliterate("Moj ciklus je tih") == "Мој циклус је тих"))

# --------------------------------------------------------------------- build

# Fisierul comis se citeste INAINTE de orice build. Daca s-ar citi dupa, comparatia
# de mai jos s-ar face cu rezultatul aceleiasi functii si nu ar putea pica niciodata.
COMMITTED = (ROOT / "index.html").read_text(encoding="utf-8")

first = build.render()
digest = hashlib.sha256(first.encode("utf-8")).hexdigest()
second = build.render()
check("build is deterministic", lambda: eq(
    hashlib.sha256(second.encode("utf-8")).hexdigest(), digest))
def committed_matches_sources() -> None:
    if COMMITTED == first:
        return
    a, b = COMMITTED.splitlines(), first.splitlines()
    for i, (x, y) in enumerate(zip(a, b), 1):
        if x != y:
            raise AssertionError(
                f"first difference at line {i}:\n  in index.html: {x[:120]!r}\n  in build:      {y[:120]!r}")
    longer = "index.html" if len(a) > len(b) else "build"
    raise AssertionError(f"{longer} has {abs(len(a) - len(b))} extra lines")


check("index.html matches the sources", committed_matches_sources)
# blocul de accesibilitate traieste in src/styles.css, nu lipit in pagina generata
check("a11y block comes from the stylesheet", lambda: truthy(
    "min-height: 44px !important" in build.read(build.STYLES)))

version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
check("version is stamped in the page", lambda: truthy(f'data-version="{version}"' in first))
check("single file has no local script references", lambda: truthy(
    not re.search(r'<script[^>]+src="(?!https)', first)))
check("single file has no stylesheet link", lambda: truthy('<link rel="stylesheet"' not in first))
check("css is inlined once", lambda: eq(first.count("<style>"), 1))
check("three scripts inlined", lambda: eq(len(re.findall(r"^<script>$", first, re.M)), 3))
check("doctype first", lambda: truthy(first.startswith("<!DOCTYPE html>")))
check("no em dash", lambda: truthy("\u2014" not in first))
check("no en dash", lambda: truthy("\u2013" not in first))
check("no byte order mark", lambda: truthy(
    not (ROOT / "index.html").read_bytes().startswith(b"\xef\xbb\xbf")))
check("no unresolved template markers", lambda: truthy(
    "<!--INLINE" not in first and "undefined" not in first.split("<body>")[0]))
check("no literal script close inside the payload", lambda: eq(
    len(re.findall(r"</script>", first)), 4))
check("size stays reasonable", lambda: truthy(len(first.encode("utf-8")) < 400_000))

# ---------------------------------------------------------------- packaging

check("index.html is committed at the root", lambda: truthy((ROOT / "index.html").exists()))
check("manifest is valid JSON", lambda: truthy(
    json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["name"] == "Cycle Calendar"))
check("manifest icons exist", lambda: all(
    (ROOT / icon["src"]).exists()
    for icon in json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))["icons"]))
check("service worker version matches VERSION", lambda: eq(
    re.search(r"var VERSION = '([^']+)';", (ROOT / "sw.js").read_text(encoding="utf-8")).group(1), version))
check("service worker caches the shell", lambda: all(
    asset in (ROOT / "sw.js").read_text(encoding="utf-8")
    for asset in ("./index.html", "./manifest.json", "./favicon.ico")))
check("nojekyll marker", lambda: truthy((ROOT / ".nojekyll").exists()))
check("favicon exists", lambda: truthy((ROOT / "favicon.ico").stat().st_size > 200))
check("apple touch icon exists", lambda: truthy((ROOT / "apple-touch-icon.png").stat().st_size > 1000))
check("icon 512 exists", lambda: truthy((ROOT / "icons" / "icon-512.png").exists()))
check("funding file", lambda: eq(
    (ROOT / ".github" / "FUNDING.yml").read_text(encoding="utf-8").strip(),
    "custom: ['https://paypal.me/TekiDeki']"))
check("license present", lambda: truthy("Apache License" in (ROOT / "LICENSE").read_text(encoding="utf-8")))
check("notice present", lambda: truthy("Cycle Calendar" in (ROOT / "NOTICE").read_text(encoding="utf-8")))

# ------------------------------------------------------- source text hygiene

sources = [ROOT / "src" / name for name in ("template.html", "styles.css", "cycle.js", "app.js")]
sources += [ROOT / "build.py", ROOT / "sw.js", ROOT / "manifest.json"]
sources += [ROOT / "tests" / "logic_test.cjs", ROOT / "tests" / "build_test.py"]
for path in sources:
    check(f"no em or en dash in {path.name}", lambda path=path: truthy(
        "\u2013" not in path.read_text(encoding="utf-8") and "\u2014" not in path.read_text(encoding="utf-8")))
    check(f"no BOM in {path.name}", lambda path=path: truthy(
        not path.read_bytes().startswith(b"\xef\xbb\xbf")))

print(f"build_test.py · {passed}/{passed + len(failures)} checks passed")
for item in failures:
    print("  FAIL " + item)
sys.exit(1 if failures else 0)
