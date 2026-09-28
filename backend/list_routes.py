from main import app

print(f"{'METHOD':<22} PATH")
print("-" * 70)

for route in app.routes:
    path = getattr(route, "path", None)
    if not path:
        continue
    methods = getattr(route, "methods", None)
    if methods:
        verbs = ",".join(sorted(m for m in methods if m not in ("HEAD", "OPTIONS")))
    else:
        verbs = "WS/MOUNT"
    if not verbs:
        continue
    print(f"{verbs:<22} {path}")

print("-" * 70)
print(f"{len(app.routes)} routes in total")