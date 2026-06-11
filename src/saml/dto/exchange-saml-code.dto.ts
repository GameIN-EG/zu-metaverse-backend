import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangeSamlCodeDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}
