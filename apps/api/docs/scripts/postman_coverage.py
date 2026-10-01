#!/usr/bin/env python3
"""Verify that the Postman collection covers every API route.

Compares `php artisan route:list --json` against
`apps/api/uxio-topup-api-v3.postman_collection.json` and exits non-zero when a
route is missing or an item points at a route that does not exist.

Usage:  python3 apps/api/docs/scripts/postman_coverage.py
"""
import json
import re
import subprocess
import sys
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[2]
COLLECTION = API_ROOT / "uxio-topup-api-v3.postman_collection.json"
IGNORE_METHODS = {"HEAD", "OPTIONS"}


def norm(path):
    """`{x:col}` and Postman `:x` both become `{x}`."""
    path = re.sub(r"\{(\w+):\w+\}", r"{\1}", path)
    return re.sub(r"(^|/):(\w+)", r"\1{\2}", path)


def route_endpoints():
    out = subprocess.run(["php", "artisan", "route:list", "--json"],
                         cwd=API_ROOT, capture_output=True, text=True, check=True).stdout
    rows = json.loads(out)
    endpoints = {}
    for r in rows:
        uri = r["uri"]
        if not uri.startswith("api/v1/"):
            continue
        path = norm(uri[len("api/v1/"):])
        methods = [m for m in r["method"].split("|") if m not in IGNORE_METHODS]
        endpoints.setdefault(path, set()).update(methods)
    return endpoints


def collection_items():
    col = json.load(open(COLLECTION, encoding="utf-8"))
    found = {}

    def walk(items):
        for it in items:
            if "item" in it:
                walk(it["item"])
                continue
            req = it.get("request")
            if not req:
                continue
            method = req["method"].upper()
            raw = req["url"]["raw"]
            path = norm(raw.split("{{base_url}}/", 1)[-1].split("?", 1)[0])
            found.setdefault(path, set()).add(method)

    walk(col["item"])
    return found


def main():
    routes = route_endpoints()
    items = collection_items()
    problems = []

    for path, methods in sorted(routes.items()):
        have = items.get(path, set())
        # apiResource registers PUT|PATCH on one row; the collection documents PUT.
        for m in sorted(methods):
            ok = m in have or (m == "PATCH" and "PUT" in have)
            if not ok:
                problems.append(f"missing   {m:6} /{path}")

    for path, methods in sorted(items.items()):
        if path not in routes:
            problems.append(f"no-route  {sorted(methods)} /{path}")
            continue
        for m in sorted(methods):
            if m not in routes[path]:
                problems.append(f"bad-method {m:6} /{path} (route: {sorted(routes[path])})")

    empty = 0
    col = json.load(open(COLLECTION, encoding="utf-8"))
    stack = list(col["item"])
    while stack:
        it = stack.pop()
        if "item" in it:
            stack.extend(it["item"])
        elif it.get("request") and not it.get("response"):
            empty += 1
            problems.append(f"no-example {it['name']}")

    print(f"routes: {len(routes)}   collection paths: {len(items)}   "
          f"items: {sum(len(v) for v in items.values())}")
    if empty:
        print(f"items without a saved example response: {empty}")
    if problems:
        print("\n".join(problems[:80]))
        print(f"\nFAIL — {len(problems)} problem(s)")
        return 1
    print("OK — every route has a request and an example response.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
