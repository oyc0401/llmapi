import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { GptService } from './gpt.service';

@WebSocketGateway()
export class GptGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly gptService: GptService) {}

  handleConnection(client: WebSocket): void {
    if (this.gptService.hasClient()) {
      client.close(1008, 'Only one connection is allowed');
      return;
    }
    this.gptService.setClient(client);

    // 하트비트: 클라이언트가 보낸 ping에 pong으로 응답해서 죽은 연결을 클라이언트 쪽에서
    // 감지할 수 있게 한다. (WsAdapter의 @SubscribeMessage 라우팅 형식과 무관하게 직접 처리)
    client.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.type === 'ping') {
          client.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // JSON이 아닌 메시지는 무시
      }
    });
  }

  handleDisconnect(client: WebSocket): void {
    this.gptService.clearClient(client);
  }
}
