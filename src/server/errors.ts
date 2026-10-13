// Errors with messages that are safe to show to the person who caused them.
export class AppError extends Error {
  constructor(message: string, public readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID" | "CONFLICT" | "RATE_LIMITED" | "UNAVAILABLE") {
    super(message);
  }
}
export const notFound = (what = "That item") => new AppError(`${what} was not found.`, "NOT_FOUND");
export const forbidden = (msg = "You don't have permission to do that.") => new AppError(msg, "FORBIDDEN");
export const invalid = (msg: string) => new AppError(msg, "INVALID");
export const conflict = (msg: string) => new AppError(msg, "CONFLICT");
export const unavailable = (msg: string) => new AppError(msg, "UNAVAILABLE");
