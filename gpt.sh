#!/usr/bin/env bash
# 사용법: ./gpt.sh "안녕하세요\n반가워요"
# 인자의 \n 같은 이스케이프 시퀀스를 실제 줄바꿈으로 변환해서 보낸다.
text=$(printf '%b' "$1")
body=$(jq -n --arg text "$text" '{text: $text}')

curl -X POST http://127.0.0.1:3010/gpt \
  -H 'Content-Type: application/json' \
  -d "$body"
echo
