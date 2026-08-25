export class OpenAIRequestError extends Error {
  constructor(
    message: string,
    readonly operation: string,
    readonly retryable: boolean,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "OpenAIRequestError";
  }
}

export function getErrorType(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  return "UnknownError";
}

export function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as Record<string, unknown>).status;
  return typeof status === "number" ? status : undefined;
}

export function isRetryableOpenAIError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return false;
  const status = getHttpStatus(error);
  if (status === undefined) return true;
  return status === 408 || status === 409 || status === 429 || status >= 500;
}
