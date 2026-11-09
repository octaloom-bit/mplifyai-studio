#!/usr/bin/env bash
# render.sh <project-dir> <final.mp4>
# HyperFrames check + render, then a LinkedIn-friendly encode (faststart, ~40MB per 45 s) and a loudness report.
set -e
P="$1"; OUT="$2"
cd "$P"
npx hyperframes check 2>&1 | grep -E "errors|issues|Check passed|failed" || true
npx hyperframes render --output "$P/render_master.mp4" 2>&1 | grep -E "Render complete|error|Error" || true
ffmpeg -loglevel error -y -i "$P/render_master.mp4" -c:v libx264 -crf 20 -preset slow -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 160k "$OUT"
ffmpeg -hide_banner -i "$OUT" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I:|Peak:)" | tail -2
ls -lh "$OUT"
