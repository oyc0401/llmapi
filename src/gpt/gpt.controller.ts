import { Body, Controller, Post } from '@nestjs/common';
import { AskDto } from './dto/ask.dto';
import { GptResponseDto } from './dto/gpt-response.dto';
import { GptService } from './gpt.service';

@Controller('gpt')
export class GptController {
  constructor(private readonly gptService: GptService) {}

  @Post()
  async ask(@Body() dto: AskDto): Promise<{ session: string; response: string }> {
    const result = await this.gptService.ask(dto.text);
    return { session: result.session, response: result.text };
  }

  @Post('response')
  handleResponse(@Body() dto: GptResponseDto): { ok: true } {
    this.gptService.handleResponse(dto.text, dto.session);
    return { ok: true };
  }

  @Post('new')
  async requestNewChat(): Promise<{ message: string }> {
    await this.gptService.requestNewChat();
    return { message: '열렸습니다' };
  }

  @Post('new/done')
  handleNewChatDone(): { ok: true } {
    this.gptService.handleNewChatDone();
    return { ok: true };
  }
}
