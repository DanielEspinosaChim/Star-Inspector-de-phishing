import { Injectable } from '@nestjs/common';
import { MlClientService } from '../ml-client/ml-client.service.js';
import type {
  PredictBatchRequestDto,
  PredictRequestDto,
} from './dto/predict-request.dto.js';
import type {
  PredictBatchResponseDto,
  PredictResponseDto,
} from './dto/predict-response.dto.js';

const elapsed = (start: number) =>
  Math.round((performance.now() - start) * 10) / 10;

@Injectable()
export class PredictService {
  constructor(private readonly ml: MlClientService) {}

  async predict(
    dto: PredictRequestDto,
    requestId?: string,
  ): Promise<PredictResponseDto> {
    const start = performance.now();
    const p = await this.ml.predict(
      { subject: dto.subject ?? '', body: dto.body },
      requestId,
    );
    return {
      label: p.label,
      confidence: p.confidence,
      probabilities: p.probabilities,
      model: p.model,
      truncated: p.truncated,
      latencyMs: elapsed(start),
    };
  }

  async predictBatch(
    dto: PredictBatchRequestDto,
    requestId?: string,
  ): Promise<PredictBatchResponseDto> {
    const start = performance.now();
    const emails = dto.emails.map((e) => ({
      subject: e.subject ?? '',
      body: e.body,
    }));
    const results = await this.ml.predictBatch(emails, requestId);
    return { results, latencyMs: elapsed(start) };
  }
}
