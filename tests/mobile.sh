#!/bin/bash
# Loads every screen inside a real 390 px and 360 px phone frame and reports anything wider than the screen.
cd "$(dirname "$0")/.." || exit 1
python3 build.py --test >/dev/null || exit 1
cp tests/phone.html dist/phone.html
OUT="${TMPDIR:-/tmp}/wcerp-mobile"; rm -rf "${OUT:?}"; mkdir -p "$OUT"
for W in 390 360; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --allow-file-access-from-files \
    --user-data-dir="$OUT/p$W" --host-resolver-rules="MAP * ~NOTFOUND" --enable-logging=stderr --v=0 --window-size=500,900 \
    --remote-debugging-port=0 "file://$PWD/dist/phone.html?w=$W" >/dev/null 2>"$OUT/log$W.txt" &
  PID=$!
  for _ in $(seq 1 60); do grep -q 'MCHECK' "$OUT/log$W.txt" 2>/dev/null && break; sleep 1; done
  kill $PID 2>/dev/null
  grep -o 'MCHECK [0-9]* \[[^]]*' "$OUT/log$W.txt" | sed 's/MCHECK /width /'
done
