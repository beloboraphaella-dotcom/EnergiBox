from main import app
import json

spec = app.openapi()
defs = spec.get("components", {}).get("schemas", {})

def resolve(ref):
    return defs.get(ref.split("/")[-1], {})

targets = ["/auth/register", "/auth/login", "/rooms", "/homes",
           "/monitored_points", "/control/{mac}", "/schedules"]

for path in targets:
    item = spec["paths"].get(path)
    if not item:
        print(f"\n### {path}  -- NOT FOUND")
        continue
    for verb, op in item.items():
        rb = op.get("requestBody")
        print(f"\n### {verb.upper()} {path}")
        if not rb:
            print("   (no body)")
            continue
        content = rb["content"]["application/json"]["schema"]
        if "$ref" in content:
            content = resolve(content["$ref"])
        props = content.get("properties", {})
        req = content.get("required", [])
        for name, p in props.items():
            if "$ref" in p:
                p = resolve(p["$ref"])
            t = p.get("type") or p.get("anyOf", [{}])[0].get("type", "?")
            star = " *" if name in req else ""
            print(f"   {name}: {t}{star}")