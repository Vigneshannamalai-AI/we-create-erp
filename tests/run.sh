#!/bin/bash
# Builds the bundle and runs tests/tests.js in headless Chrome. Prints PASS / FAIL per check.
cd "$(dirname "$0")/.." || exit 1
python3 build.py --test >/dev/null || exit 1
OUT="${TMPDIR:-/tmp}/wcerp-test"
rm -rf "${OUT:?}"; mkdir -p "$OUT"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run \
  --user-data-dir="$OUT/profile" --host-resolver-rules="MAP * ~NOTFOUND" --virtual-time-budget=30000 \
  --dump-dom "file://$PWD/dist/test.html" > "$OUT/out.html" 2>/dev/null &
PID=$!
for _ in $(seq 1 90); do
  if grep -q '<pre id="results">' "$OUT/out.html" 2>/dev/null; then break; fi
  sleep 1
done
kill $PID 2>/dev/null
python3 - "$OUT/out.html" <<'EOF'
import sys, re, html
d = open(sys.argv[1]).read()
t = re.search(r'<title>(.*?)</title>', d)
print(t.group(1) if t else 'NO RESULT (page did not finish)')
r = re.search(r'<pre id="results">(.*?)</pre>', d, re.S)
print(html.unescape(r.group(1)) if r else d[-2000:])
EOF
