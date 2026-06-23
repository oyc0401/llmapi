#!/usr/bin/env bash
# 사용법: ./scripts/ask.sh 안녕하세요
text="$1"
body=$(jq -n --arg text "$text" '{text: $text}')

curl -X POST http://127.0.0.1:3010/gpt \
  -H 'Content-Type: application/json' \
  -d "$body"
