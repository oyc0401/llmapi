import { Module } from '@nestjs/common';
import { GptController } from './gpt.controller';
import { GptGateway } from './gpt.gateway';
import { GptService } from './gpt.service';

@Module({
  controllers: [GptController],
  providers: [GptService, GptGateway],
})
export class GptModule {}
