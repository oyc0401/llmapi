# 자동으로 복사 버튼을 누르면 왜 실패할까 — User Activation 딥다이브

## 들어가며

브라우저 UI밖에 없는 LLM을 API처럼 쓰고 싶어서 작은 브릿지를 만들고 있었다. 구조는 간단하다.

```
서버(/gpt) → WebSocket → 크롬 익스텐션 → chatgpt.com 탭 자동 조작 → 응답을 다시 서버로
```

입력창에 텍스트를 채우고 엔터를 치는 건 어렵지 않았다. `paste` 이벤트를 합성해서 쏘고, `KeyboardEvent('keydown'/'keypress'/'keyup')`를 디스패치하면 chatgpt.com의 입력창이 멀쩡하게 텍스트를 받아들였다.

진짜 문제는 "응답이 끝났을 때 그 응답의 진짜 텍스트를 얻는 것"이었다.

## 첫 번째 함정 - DOM에 보이는 텍스트는 가짜다

가장 먼저 떠올린 방법은 응답 말풍선의 `.innerText`를 읽는 것이었다. 그런데 이건 시작부터 막혔다.

ChatGPT는 응답을 마크다운 원문으로 받아서 렌더링한다. `**굵게**`, `` `코드` ``, 코드블록의 언어 태그, 링크의 실제 URL, 수식의 LaTeX 소스 같은 정보는 렌더링되는 순간 사라진다. `.innerText`로 읽으면 이미 마크다운 문법이 다 날아간, 눈에 보이는 결과물만 남는다.

즉 화면에 보이는 텍스트(이하 A)와 ChatGPT의 복사 버튼이 클립보드에 넣어주는 진짜 원문(이하 B)은 다른 데이터다. 나는 B가 필요했다.

그래서 복사 버튼을 직접 누르고, 그 버튼이 클립보드에 넣는 데이터를 가로채기로 했다.

## 두 번째 시도 - 클립보드 가로채기

ChatGPT의 복사 버튼은 `navigator.clipboard.writeText`가 아니라 `navigator.clipboard.write([ClipboardItem])`을 쓴다. `ClipboardItem`은 `getType(mimeType)`으로 `Blob`을 꺼낼 수 있고, `blob.text()`로 디코딩하면 원본 텍스트가 나온다.

그래서 `navigator.clipboard.write`를 우리 함수로 통째로 갈아치우는 스크립트를 짰다.

```js
const originalWrite = navigator.clipboard.write.bind(navigator.clipboard);

navigator.clipboard.write = async (items) => {
  for (const item of items) {
    for (const type of item.types) {
      const blob = await item.getType(type);
      const text = await blob.text();
      console.log(`[복사 데이터 캡처] type=${type}`, text);
    }
  }
  return Promise.resolve();
};

lastButton.click();

navigator.clipboard.write = originalWrite;
```

콘솔에 붙여넣고 바로 실행해보니 거짓말처럼 잘 됐다.

```
[복사 데이터 캡처] type=text/plain 안녕하세요 ㅋㅋㅋㅋㅋㅋㅋㅋㅋㅋ
이제 로드밸런서가 저를 healthy로 판정했습니다.
```

문제는 여기서부터였다. 이걸 "응답이 끝나면 자동으로" 동작하게 만들려고, 2초마다 복사 버튼 개수를 폴링해서 늘어나면 같은 클릭 로직을 실행하는 스크립트로 바꿨다.

```js
window.__watchCopyButtonsInterval = setInterval(() => {
  const currentCount = document.querySelectorAll(SELECTOR).length;
  if (currentCount > previousCount) {
    const freshLastButton = document.querySelectorAll(SELECTOR).at(-1);

    navigator.clipboard.write = async (items) => {
      // 위와 동일한 캡처 로직
    };
    freshLastButton.click();
    navigator.clipboard.write = originalWrite;
  }
  previousCount = currentCount;
}, 2000);
```

"답변완료" 로그는 정확히 찍혔다. 그런데 캡처 로그는 단 한 번도 찍히지 않았다. 대신 매번 이런 에러 토스트가 떴다.

```
Failed to copy to clipboard.
[@formatjs/intl] Missing message: "toast.error...
```

신기한 건, 똑같은 버튼을 **마우스로 직접 클릭하면** 토스트도 안 뜨고 클립보드에도 멀쩡하게 들어갔다. 코드로 누르면(`.click()`) 실패하고, 손으로 누르면 성공했다.

## 세 번째 시도 - 그럼 트러스트 이벤트 문제인가?

가장 먼저 의심한 건 `Event.isTrusted`였다. `.click()`으로 만든 이벤트는 `isTrusted: false`다. 사람이 진짜로 클릭한 이벤트만 `isTrusted: true`다.

그런데 이 가설은 바로 모순에 부딫혔다. 콘솔에 붙여넣고 즉시 실행한 `click_copy_button.js`도 똑같이 `.click()`을 쓴다. `isTrusted`는 거기서도 `false`다. 그런데 그건 성공했다.

```
잘된다.
```

`isTrusted`가 둘 다 `false`인데 하나는 되고 하나는 안 된다. 즉 진짜 원인은 "신뢰된 이벤트인가"가 아니었다.

## 진짜 원인 - Transient Activation

여기서 브라우저의 **User Activation** 모델을 다시 들여다봐야 했다.

브라우저는 클립보드 쓰기, 전체화면 진입, 자동재생 같은 민감한 API를 아무 때나 호출하지 못하게 막는다. 이걸 막는 기준은 이벤트의 `isTrusted` 여부가 아니라, 그 프레임이 지금 **transient activation** 상태인가다.

> Transient activation은 사용자가 진짜로 클릭/키입력 등의 제스처를 한 뒤, 짧은 시간(보통 수 초) 동안 켜지는 전역 플래그다. `navigator.userActivation.isActive`로 확인할 수 있다.

여기서 중요한 디테일이 있다. **devtools 콘솔에서 코드를 실행하는 것 자체가, Chrome 기준으로 그 탭에 transient activation을 부여한다.** 개발자가 제스처 기반 API를 콘솔에서 테스트할 수 있게 해주려는 의도적인 배려다.

이걸로 두 스크립트의 차이가 설명된다.

| | 실행 시점 | activation 상태 |
|---|---|---|
| `click_copy_button.js` | 콘솔에 붙여넣고 Enter 친 직후, 동기적으로 즉시 실행 | 살아있음 |
| `watch_copy_buttons.js`의 클릭 | `setInterval` 콜백 안에서, 몇 초~몇 분 뒤에 실행 | 만료됨 |

`setInterval`이나 `setTimeout` 콜백은 타이머에 의해 트리거된 것이라, 애초에 사용자 제스처와 아무 연관이 없다. 콘솔에 처음 코드를 붙여넣을 때 받은 activation은 그 동기 실행 구간이 끝나면 곧 사라지고, 타이머 콜백이 도는 시점엔 이미 죽어 있다.

## 그런데 이상한 점이 하나 남는다

이 설명을 듣고 나서 스스로도 이상하다고 느낀 부분이 있었다.

`navigator.clipboard.write`는 브라우저가 만든 진짜 API가 아니라, **우리가 직접 덮어쓴 우리 함수**다.

```js
navigator.clipboard.write = async (items) => {
  // 여기엔 activation 체크 같은 거 없음. 그냥 items를 순회해서 로그 찍을 뿐
};
```

브라우저의 원래 `clipboard.write` 구현이 activation을 검사하는 거라면 말이 된다. 하지만 우리가 패치한 함수는 그 검사 로직 자체가 없다. ChatGPT의 코드가 `navigator.clipboard.write(...)`를 호출하면, 그 호출은 곧바로 **우리 함수**로 들어와야 한다. 거기엔 activation을 따질 코드가 단 한 줄도 없는데, 왜 캡처가 안 됐을까?

답은 "activation 체크가 clipboard.write 안에 있다"는 전제 자체가 틀렸다는 데 있었다.

ChatGPT의 복사 버튼 클릭 핸들러는, `clipboard.write`를 호출하기 **전에** 자기 코드 안에서 먼저 `navigator.userActivation.isActive` 같은 걸 직접 검사하고 있을 가능성이 높다. 클립보드 쓰기가 activation 없이 실행되면 브라우저가 `NotAllowedError`를 던지거나 조용히 실패한다는 걸 알고 있는 프론트엔드 개발자라면, 사용자에게 더 친절한 에러 토스트를 보여주기 위해 미리 막아두는 게 자연스럽다.

```js
// ChatGPT 코드의 추정 구조
function handleCopyClick() {
  if (!navigator.userActivation.isActive) {
    showToast('Failed to copy to clipboard.');
    return; // clipboard.write는 호출조차 안 됨
  }
  navigator.clipboard.write(/* ... */); // 여기까지 와야 우리 패치가 작동
}
```

이러면 모든 증상이 들어맞는다.

- `isTrusted`가 false든 true든 상관없음 (그쪤 검사하는 게 아니므로)
- activation이 살아있을 때(`click_copy_button.js`)는 if문을 그냥 통과해서 우리 패치 함수까지 도달 → 캡처 성공
- activation이 죽었을 때(`watch_copy_buttons.js`)는 if문에서 바로 리턴 → 우리 패치 함수는 호출조차 안 됨 → 캡처 로그 없음, 토스트만 뜸

우리가 함수를 통째로 바꿔놨다는 사실이 무색해질 만큼, 그 함수에 도달하기 전 단계에서 이미 막힌 거였다.

## 그래서 어떻게 우회했나

타이머로 클릭을 흉내 내는 한, 진짜 사용자 제스처를 만들어낼 방법은 없다. 클립보드/버튼 경로 자체를 포기하는 게 맞다는 결론에 이르렀다.

대신 B(원본 마크다운)가 어디서 오는지 한 단계 더 위로 올라가서 생각해봤다. 복사 버튼이 클립보드에 넣어주는 텍스트는, 사실 그보다 먼저 **네트워크 응답으로 이미 브라우저에 도착해 있던 데이터**다. ChatGPT는 `/backend-api/f/conversation`에 스트리밍 응답(SSE)으로 토큰을 흘려보내고, 그걸 받아서 렌더링한다.

```
event: delta
data: {"p": "/message/content/parts/0", "o": "append", "v": "안"}

event: delta
data: {"v": "녕하세요"}
```

`window.fetch`를 패치해서 이 응답 스트림만 `tee()`로 복제하면, 페이지의 실제 렌더링은 그대로 두면서 우리만 따로 원본 텍스트를 읽을 수 있다. 클릭도, 클립보드 권한도, activation도 전혀 필요 없다. 데이터가 도착하는 순간 이미 우리 손에 있기 때문이다.

```js
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (!url.includes('/backend-api/f/conversation')) return response;

  const [forPage, forCapture] = response.body.tee();
  captureStream(forCapture); // 우리만 읽는 쪽
  return new Response(forPage, { status: response.status, headers: response.headers });
};
```

## 마무리

처음엔 "버튼을 자동으로 누르면 되지 않을까"라는 단순한 생각으로 시작했다. 하지만 그 버튼 뒤에는 브라우저의 user activation 모델과, 그걸 의식한 애플리케이션 코드의 방어 로직이 겹겹이 있었다.

우리가 클립보드 API를 통째로 가로챘다는 사실은 아무 의미가 없었다. 그 함수에 도달하기 전에 이미 막혔으니까. 이 경험으로 다시 한번 느낀 건, **권한이 필요한 브라우저 API를 다룰 때는 "그 API 자체의 제약"과 "그 API를 감싸고 있는 애플리케이션 코드의 제약"을 구분해서 봐야 한다**는 것이다. 우리는 후자를 놓치고 있었다.

결국 답은 더 우회하는 게 아니라, 더 아래로 — 클릭이나 클립보드보다 먼저 도착하는 네트워크 레이어로 — 내려가는 거였다.
