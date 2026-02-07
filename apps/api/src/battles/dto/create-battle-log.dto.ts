import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID } from 'class-validator';

export class CreateBattleLogDto {
  @ApiProperty({
    description: 'Raw battle log text from PTCG Live',
    example: 'Setup\nMiarte chose heads for the opening coin flip...',
  })
  @IsString()
  rawLog: string;

  @ApiProperty({
    description: 'Optional tournament result ID to link this battle to',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  tournamentResultId?: string;
}
