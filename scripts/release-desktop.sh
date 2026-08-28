#!/usr/bin/env bash
# 어린이 쉬운 사전 데스크탑 배포 스크립트
# 요구사항: npm, cargo, tauri-cli, minisign, wrangler
set -euo pipefail

cd "$(dirname "$0")/../desktop"

export TAURI_SIGNING_PRIVATE_KEY=$(cat src-tauri/updater.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

echo "==> 1. 데스크탑 앱 빌드 (NSIS)..."
npm run build
npm run tauri:build

VERSION=$(node -p "require('./package.json').version")
EXE_PATH="src-tauri/target/release/bundle/nsis/어린이 쉬운 사전 데스크탑_${VERSION}_x64-setup.exe"

if [ ! -f "$EXE_PATH" ]; then
  # 영문 기본 파일명 대체 탐색
  EXE_PATH=$(find src-tauri/target/release/bundle/nsis -name "*.exe" | head -n 1)
fi

echo "==> 빌드 완료: $EXE_PATH"

echo "==> 2. Cloudflare R2 업로드 (edu-dic-downloads)..."
# 최신 설치 파일 업로드
npx wrangler r2 object put edu-dic-downloads/edu-dic-desktop-setup.exe \
  --file="$EXE_PATH" \
  --content-type=application/x-msdownload \
  --remote

# updater 서명 파일 및 매니페스트 생성
if [ -f "$EXE_PATH.sig" ]; then
  SIG=$(cat "$EXE_PATH.sig")
  PUB_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  cat > /tmp/desktop-latest.json <<EOF
{
  "version": "$VERSION",
  "notes": "어린이 쉬운 사전 데스크탑 v$VERSION 업데이트",
  "pub_date": "$PUB_DATE",
  "platforms": {
    "windows-x86_64": {
      "signature": "$SIG",
      "url": "https://dic.dgedu.link/download/desktop"
    }
  }
}
EOF

  npx wrangler r2 object put edu-dic-downloads/desktop-latest.json \
    --file=/tmp/desktop-latest.json \
    --content-type=application/json \
    --remote

  echo "==> 매니페스트 및 서명 업로드 완료!"
fi

echo "==> 데스크탑 앱 배포 완료: https://dic.dgedu.link/download/desktop"
