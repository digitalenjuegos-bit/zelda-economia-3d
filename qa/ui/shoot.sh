#!/bin/bash
# Captura modos de la UI a 1280x720, 800x650 y 390x844 (móvil vía iframe: Chrome headless no baja de 500 px).
# Uso: qa/ui/shoot.sh <sufijo> [extra_query] [modos...]   p.ej. qa/ui/shoot.sh r1 "" title select
#      extra_query se añade a cada URL (p.ej. "&mockEngine=1").
OUT="$(cd "$(dirname "$0")" && pwd)/shots"; mkdir -p "$OUT"; SUF="${1:-r}"; EXTRA="$2"; shift 2
MODES="${@:-title select question gate race results final teacher}"
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
F="--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --hide-scrollbars --virtual-time-budget=7000"
BASE="http://localhost:8765"
for m in $MODES; do
  Q="shot=$m"; [ "$m" = race ] && Q="shot=race&w=0&t=0.3"; [ "$m" = gate ] && Q="shot=gate&w=0"
  Q="$Q$EXTRA"
  "$CH" $F --screenshot="$OUT/${m}_1280x720_$SUF.png" --window-size=1280,720 "$BASE/?$Q" >/dev/null 2>&1
  "$CH" $F --screenshot="$OUT/${m}_800x650_$SUF.png" --window-size=800,650 "$BASE/?$Q" >/dev/null 2>&1
  ENC=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$Q")
  "$CH" $F --screenshot="$OUT/${m}_390x844_$SUF.png" --window-size=500,844 "$BASE/qa/ui/frame.html?w=390&h=844&q=$ENC" >/dev/null 2>&1
  python3 -c "import sys;from PIL import Image;p=sys.argv[1];Image.open(p).crop((0,0,390,844)).save(p)" "$OUT/${m}_390x844_$SUF.png"
done
ls "$OUT" | grep "_$SUF.png" | wc -l
