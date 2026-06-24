#!/usr/bin/env bash
# 사용법:
#   ./gpt.sh "안녕하세요\n반가워요"   - 질문 전송 (\n 같은 이스케이프 시퀀스를 실제 줄바꿈으로 변환)
#   ./gpt.sh new                     - 새 채팅 세션 열기

if [ "$1" = "new" ]; then
  curl -X POST http://127.0.0.1:3010/gpt/new
  echo
  exit 0
fi

text=$(printf '%b' "$1")
body=$(jq -n --arg text "$text" '{text: $text}')

curl -X POST http://127.0.0.1:3010/gpt \
  -H 'Content-Type: application/json' \
  -d "$body"
echo
