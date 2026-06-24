# 브라우저 챗지피티 터미널에서 다루기

## 설치 방법

1. nestjs 실행환경 설치하기 (인터넷 보고 설치하세요)
2. 크롬에 익스텐션 로드: `chrome://extensions` → 개발자 모드 ON → "압축해제된 확장 프로그램을 로드" → `extension/` 폴더 선택
3. chatgpt.com 탭을 하나 열어둔다.


## 사용법

1. `./gpt.sh start` 으로 서버 실행
2. 익스텐션 아이콘 클릭 → 팝업에서 "시작" 클릭

```bash
./gpt.sh start              # 서버 시작
./gpt.sh stop                # 서버 중지
./gpt.sh status               # 서버 상태 확인
./gpt.sh new                  # 새 채팅 시작
./gpt.sh "질문 내용"           # 질문 보내고 답변 받기
```

## 예시

질문 보내기:

```bash
$ ./gpt.sh "안녕"
{"session":"6a3b91bf","response":"안녕하세요! 무엇을 도와드릴까요?"}
```


새 채팅 시작:

```bash
$ ./gpt.sh new
{"message":"열렸습니다"}
```

서버 시작:

```bash
$ ./gpt.sh start
{"message":"서버를 시작했습니다."}
```

서버 종료:

```bash
$ ./gpt.sh stop
{"message":"서버를 중지했습니다."}
```

서버 상태 확인:

```bash
$ ./gpt.sh status
{"message":"서버가 켜져 있습니다."}
```
