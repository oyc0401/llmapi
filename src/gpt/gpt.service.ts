import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { WebSocket } from 'ws';

interface PendingRequest {
  text: string;
  resolve: (text: string) => void;
  reject: (reason: unknown) => void;
}

@Injectable()
export class GptService {
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
    this.inFlight = false;
    current.resolve(text);
    this.processNext();
  }

  private processNext(): void {
    if (this.inFlight) return;
    const next = this.queue[0];
    if (!next || !this.client) return;
    this.inFlight = true;
    this.client.send(JSON.stringify({ text: next.text }));
  }
}
