import { Module } from '@nestjs/common';
import { MlClientModule } from '../ml-client/ml-client.module.js';
import { PredictController } from './predict.controller.js';
import { PredictService } from './predict.service.js';

@Module({
  imports: [MlClientModule],
  controllers: [PredictController],
  providers: [PredictService],
})
export class PredictModule {}
