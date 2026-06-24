#!/usr/bin/env bash
# 사용법:
#   ./gpt.sh start                    - 서버를 백그라운드로 시작
#   ./gpt.sh stop                     - 서버 중지
#   ./gpt.sh status                   - 서버가 켜져있는지 확인
#   ./gpt.sh new                      - 새 채팅 세션 열기
#   ./gpt.sh "안녕하세요\n반가워요"    - 질문 전송 (\n 같은 이스케이프 시퀀스를 실제 줄바꿈으로 변환)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_URL="http://127.0.0.1:3010"
PID_FILE="$SCRIPT_DIR/.gpt-server.pid"
LOG_FILE="$SCRIPT_DIR/.gpt-server.log"

is_server_up() {
  curl -s -o /dev/null --connect-timeout 1 "$SERVER_URL"
}

print_message() {
  jq -nc --arg message "$1" '{message: $message}'
}

# PID 파일의 숫자가 살아있다는 것만으로는 부족하다 — 서버가 죽은 뒤 그 PID가
# 전혀 다른 프로세스에 재할당됐을 수도 있어서, 커맨드라인이 실제로 우리가 띈
# dist/src/main.js인지까지 확인해야 안전하게 kill할 수 있다.
is_our_server_pid() {
  local pid="$1"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  ps -p "$pid" -o args= 2>/dev/null | grep -q "dist/src/main.js"
}

# 빌드 파일이 없거나, src의 .ts 파일 중 빌드 결과물보다 더 최근에 수정된 게 있으면 재빌드.
needs_rebuild() {
  local target="$SCRIPT_DIR/dist/src/main.js"
  [ -f "$target" ] || return 0
  find "$SCRIPT_DIR/src" -name '*.ts' -newer "$target" | grep -q .
}

cmd_start() {
  if is_server_up; then
    print_message "이미 서버가 켜져 있습니다."
    return
  fi
  if needs_rebuild; then
    print_message "서버 빌드 중..."
    (cd "$SCRIPT_DIR" && pnpm i && pnpm run build) > /dev/null
  fi
  cd "$SCRIPT_DIR" || return
  nohup node dist/src/main.js > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  cd - > /dev/null || return
  print_message "서버를 시작했습니다."
}

cmd_stop() {
  if ! is_server_up; then
    print_message "서버가 켜져있지 않습니다."
    rm -f "$PID_FILE"
    return
  fi

  local pid
  pid="$(cat "$PID_FILE" 2>/dev/null)"
  if ! is_our_server_pid "$pid"; then
    # 서버는 실제로 켜져있지만(is_server_up=true) PID 파일이 없거나 다른 프로세스를
    # 가리켜서, 어떤 프로세스를 죽여야 할지 알 수 없는 상태. 함부로 다른 프로세스를
    # 죽이면 안 되니 추적이 끊겼다는 것만 알려준다.
    print_message "서버가 켜져있지만 추적 중인 프로세스를 찾을 수 없어 중지할 수 없습니다."
    return
  fi

  kill "$pid"
  rm -f "$PID_FILE"
  print_message "서버를 중지했습니다."
}

cmd_status() {
  if is_server_up; then
    print_message "서버가 켜져 있습니다."
  else
    print_message "서버가 꺼져 있습니다."
  fi
}

case "$1" in
  start)
    cmd_start
    exit 0
    ;;
  stop)
    cmd_stop
    exit 0
    ;;
  status)
    cmd_status
    exit 0
    ;;
esac

if ! is_server_up; then
  print_message "서버가 켜져있지 않습니다."
  exit 1
fi

if [ "$1" = "new" ]; then
  curl -s -X POST "$SERVER_URL/gpt/new" | jq .
  exit 0
fi

text=$(printf '%b' "$1")
body=$(jq -n --arg text "$text" '{text: $text}')

curl -s -X POST "$SERVER_URL/gpt" \
  -H 'Content-Type: application/json' \
  -d "$body" | jq .
