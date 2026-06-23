import { Body, Controller, Post } from '@nestjs/common';
import { AskDto } from './dto/ask.dto';
import { GptService } from './gpt.service';

@Controller('gpt')
export class GptController {
  constructor(private readonly gptService: GptService) {}

  @Post()
  async ask(@Body() dto: AskDto): Promise<{ response: string }> {
    const response = await this.gptService.ask(dto.text);
    return { response };
  }

  @Post('response')
  handleResponse(@Body() dto: AskDto): { ok: true } {
    this.gptService.handleResponse(dto.text);
    return { ok: true };
  }

  @Post('new')
  requestNewChat(): { ok: true } {
    this.gptService.requestNewChat();
    return { ok: true };
  }
}
