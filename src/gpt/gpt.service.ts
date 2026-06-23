import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { WebSocket } from 'ws';

interface PendingRequest {
  text: string;
  resolve: (text: string) => void;
  reject: (reason: unknown) => void;
}

@Injectable()
export class GptService {
  private static readonly NEXT_TURN_DELAY_MS = 3000;

  private client: WebSocket | null = null;
  private readonly queue: PendingRequest[] = [];
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

  ask(text: string): Promise<string> {
    if (!this.client) {
      throw new ServiceUnavailableException('연결된 웹소켓 클라이언트가 없습니다.');
    }
    return new Promise<string>((resolve, reject) => {
      this.queue.push({ text, resolve, reject });
      this.processNext();
    });
  }

  handleResponse(text: string): void {
    const current = this.queue.shift();
    if (!current) {
      throw new ConflictException('대기 중인 요청이 없습니다.');
    }
    current.resolve(text);
    // inFlight를 바로 풀지 않고 3초 후에 풀어서, 그 사이 들어오는 다음 요청은
    // 큐에 쌓이기만 하고 processNext()가 막혀 즉시 전송되지 않게 한다.
    setTimeout(() => {
      this.inFlight = false;
      this.processNext();
    }, GptService.NEXT_TURN_DELAY_MS);
  }

  private processNext(): void {
    if (this.inFlight) return;
    const next = this.queue[0];
    if (!next || !this.client) return;
    this.inFlight = true;
    this.client.send(JSON.stringify({ text: next.text }));
  }
}
