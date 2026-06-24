export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: { field: string; message: string }[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function validationError(
  message: string,
  details?: { field: string; message: string }[],
): AppError {
  return new AppError(message, 400, "VALIDATION_ERROR", details);
}

export function notFoundError(message: string): AppError {
  return new AppError(message, 404, "NOT_FOUND");
}

export function forbiddenError(message: string): AppError {
  return new AppError(message, 403, "FORBIDDEN");
}

export function unauthorizedError(message: string): AppError {
  return new AppError(message, 401, "UNAUTHORIZED");
}
