import { IsNotEmpty, IsString } from 'class-validator';

export class GptResponseDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsNotEmpty()
  session: string;
}
