#!/usr/bin/env bash
# One-time setup (safe to run again). Prints READY when everything works.
# Installs: the effects engine (vendor/effects, MIT) + its Python env + Hebrew patch and fonts,
# the Hebrew transcription model, HyperFrames (pinned) and its sound effects, and a voice-denoise model.
# Nothing here needs an account or an API key.
set -e
cd "$(dirname "$0")"
R="$(pwd)"; E="$R/vendor/effects"

command -v ffmpeg >/dev/null || { echo "NEED_FFMPEG: Mac: brew install ffmpeg  ·  Windows: winget install ffmpeg"; exit 1; }
command -v node >/dev/null || { echo "NEED_NODE: install Node.js 18+ from nodejs.org"; exit 1; }

# private pack (voice files, photos, example projects): a zip or a folder named mplifyai-private*,
# next to this file or in Downloads (a Drive folder download arrives as a zip). Never overwrites your files.
PACK="$(ls -d "$R"/*private*.zip "$R"/mplifyai-private* "$HOME"/Downloads/*private*.zip "$HOME"/Downloads/mplifyai-private* 2>/dev/null | head -1 || true)"
if [ -n "$PACK" ]; then
  SRC="$PACK"; TMP=""
  case "$PACK" in *.zip) TMP="$(mktemp -d)"; unzip -oq "$PACK" -d "$TMP" -x "__MACOSX/*"; SRC="$TMP";; esac
  TOP="$(dirname "$(find "$SRC" -maxdepth 3 -type d -name brands | head -1)")"
  if [ -d "$TOP/brands" ]; then rsync -a --ignore-existing --exclude .DS_Store "$TOP/" "$R/" && echo "0/6 private pack ready ($(basename "$PACK"))"; fi
  if [ -n "$TMP" ]; then rm -rf "$TMP"; fi
fi
[ -d "$R/brands/mplifyai/voice" ] || echo "0/6 NOTE: private pack not found. Put the mplifyai-private folder (or its zip) in Downloads and run again."

echo "1/6 effects engine"
git submodule update --init --recursive -q
( cd "$E" && bash scripts/setup.sh | tail -1 )
if ! grep -q "HebFallbackFont" "$E/scripts/fx.py"; then
  ( cd "$E" && git apply "$R/pipeline/patches/effects-hebrew.patch" ) || { echo "PATCH_FAILED: vendor/effects changed; keep the pinned commit (git submodule update)"; exit 1; }
fi
mkdir -p "$E/fonts/he"; cp -n "$R/pipeline/fonts-he/"* "$E/fonts/he/" 2>/dev/null || true

echo "2/6 Hebrew transcription"
"$E/.venv/bin/python" -m pip install -q faster-whisper
"$E/.venv/bin/python" -c "from faster_whisper import WhisperModel; WhisperModel('ivrit-ai/whisper-large-v3-turbo-ct2', device='cpu', compute_type='int8')" >/dev/null 2>&1 \
  && echo "   model ready" || echo "   model will download on first use (needs internet once)"

echo "3/6 HyperFrames"
npm install --silent --no-audit --no-fund

echo "4/6 sound effects (from HyperFrames, Apache-2.0)"
SFX="$R/node_modules/hyperframes/dist/skills/media-use/audio/assets/sfx"
mkdir -p "$R/pipeline/sfx"; cp -n "$SFX"/*.mp3 "$R/pipeline/sfx/" 2>/dev/null || true
[ -f "$R/pipeline/sfx/ping-short.mp3" ] || ffmpeg -v error -y -i "$R/pipeline/sfx/ping.mp3" -t 0.7 -af "afade=t=out:st=0.45:d=0.25" "$R/pipeline/sfx/ping-short.mp3"
[ -f "$R/pipeline/sfx/chime-short.mp3" ] || ffmpeg -v error -y -i "$R/pipeline/sfx/chime.mp3" -t 2.0 -af "afade=t=out:st=1.4:d=0.6" "$R/pipeline/sfx/chime-short.mp3"

echo "5/6 voice denoise model (RNNoise)"
mkdir -p "$R/models"
[ -f "$R/models/rnnoise.rnnn" ] || curl -fsSL -o "$R/models/rnnoise.rnnn" \
  https://raw.githubusercontent.com/GregorR/rnnoise-models/master/somnolent-hogwash-2018-09-01/sh.rnnn \
  || echo "   no RNNoise model: mix.py falls back to ffmpeg's denoiser"

echo "6/6 check"
"$E/.venv/bin/python" -c "import mediapipe, cv2, faster_whisper; print('   python ok')"
npx --no-install hyperframes --version >/dev/null && echo "   hyperframes ok"
echo READY
