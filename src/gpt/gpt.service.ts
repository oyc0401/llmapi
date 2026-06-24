import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { WebSocket } from 'ws';

type AskItem = {
  kind: 'ask';
  text: string;
  resolve: (result: { text: string; session: string }) => void;
  reject: (reason: unknown) => void;
};

type NewChatItem = {
  kind: 'newChat';
  resolve: () => void;
  reject: (reason: unknown) => void;
};

type QueueItem = AskItem | NewChatItem;

@Injectable()
export class GptService {
  private static readonly NEXT_TURN_DELAY_MS = 3000;
  private static readonly NEW_CHAT_DELAY_MS = 6000;

  private client: WebSocket | null = null;
  private readonly queue: QueueItem[] = [];
  private inFlight = false;

  hasClient(): boolean {
    return this.client !== null;
  }

  setClient(client: WebSocket): void {
    this.client = client;
  }

  clearClient(client: WebSocket): void {
    if (this.client !== client) return;
    this.client = null;
    this.inFlight = false;
    while (this.queue.length > 0) {
      const pending = this.queue.shift();
      pending?.reject(new ServiceUnavailableException('웹소켓 연결이 끊어졌습니다.'));
    }
  }

  ask(text: string): Promise<{ text: string; session: string }> {
    if (!this.client) {
      throw new ServiceUnavailableException('연결된 웹소켓 클라이언트가 없습니다.');
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ kind: 'ask', text, resolve, reject });
      this.processNext();
    });
  }

  // 새 채팅 열기도 같은 큐에 들어간다. 연달아 중복으로 요청되면 실제로는 한 번만 열고,
  // 그 사이 쌓인 중복 요청들은 같은 완료 시점에 한꺼번에 해소된다.
  requestNewChat(): Promise<void> {
    if (!this.client) {
      throw new ServiceUnavailableException('연결된 웹소켓 클라이언트가 없습니다.');
    }
    return new Promise((resolve, reject) => {
      this.queue.push({ kind: 'newChat', resolve, reject });
      this.processNext();
    });
  }

  handleResponse(text: string, session: string): void {
    const current = this.queue[0];
    if (!current || current.kind !== 'ask') {
      throw new ConflictException('대기 중인 요청이 없습니다.');
    }
    this.queue.shift();
    current.resolve({ text, session });
    // inFlight를 바로 풀지 않고 지연 후에 풀어서, 그 사이 들어오는 다음 요청은
    // 큐에 쌓이기만 하고 processNext()가 막혀 즉시 전송되지 않게 한다.
    setTimeout(() => {
      this.inFlight = false;
      this.processNext();
    }, GptService.NEXT_TURN_DELAY_MS);
  }

  // 새 채팅 완료 알림. 큐 맨 앞부터 연속된 newChat 중복 요청을 한꺼번에 해소한다.
  handleNewChatDone(): void {
    if (this.queue[0]?.kind !== 'newChat') {
      throw new ConflictException('대기 중인 새 채팅 요청이 없습니다.');
    }
    while (this.queue[0]?.kind === 'newChat') {
      const pending = this.queue.shift();
      if (pending && pending.kind === 'newChat') {
        pending.resolve();
      }
    }
    setTimeout(() => {
      this.inFlight = false;
      this.processNext();
    }, GptService.NEW_CHAT_DELAY_MS);
  }

  private processNext(): void {
    if (this.inFlight) return;
    const next = this.queue[0];
    if (!next || !this.client) return;

    this.inFlight = true;
    if (next.kind === 'ask') {
      this.client.send(JSON.stringify({ text: next.text }));
    } else {
      this.client.send(JSON.stringify({ type: 'newChat' }));
    }
  }
}
