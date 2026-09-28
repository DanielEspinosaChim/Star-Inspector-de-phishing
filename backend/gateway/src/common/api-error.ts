export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PAYLOAD_TOO_LARGE'
  | 'ML_SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'HTTP_ERROR';

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

export function apiError(code: ErrorCode, message: string): ApiErrorBody {
  return { error: { code, message } };
}
