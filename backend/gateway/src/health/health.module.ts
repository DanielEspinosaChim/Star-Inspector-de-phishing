import { Module } from '@nestjs/common';
import { MlClientModule } from '../ml-client/ml-client.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [MlClientModule],
  controllers: [HealthController],
})
export class HealthModule {}
