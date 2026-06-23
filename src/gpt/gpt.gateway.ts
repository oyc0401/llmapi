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
  }

  handleDisconnect(client: WebSocket): void {
    this.gptService.clearClient(client);
  }
}
