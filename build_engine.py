#!/usr/bin/env python3
"""Build terra_engine.js = terra_engine_logic_only.js + planetary_db.json (single source of truth).
Usage: python build_engine.py [logic.js] [planetary_db.json] [out.js]"""
import json, re, sys
logic = sys.argv[1] if len(sys.argv) > 1 else "terra_engine_logic_only.js"
dbp   = sys.argv[2] if len(sys.argv) > 2 else "planetary_db.json"
out   = sys.argv[3] if len(sys.argv) > 3 else "terra_engine.js"
src = open(logic, encoding="utf8").read()
db  = json.dumps(json.load(open(dbp, encoding="utf8")), ensure_ascii=False, separators=(",", ":"))
stub = re.compile(r"const EMBEDDED_PLANETARY_DB = \{ earth_ref: \[\].*?\};")
assert stub.search(src), "DB stub line not found"
open(out, "w", encoding="utf8").write(stub.sub(lambda m: "const EMBEDDED_PLANETARY_DB = " + db + ";", src, count=1))
print(f"built {out} ({len(src)} logic chars + {len(db)} DB chars)")
