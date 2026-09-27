import { Request, Response, NextFunction } from 'express';

export function RequestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const rawValue = req.headers['x-request-id'];
  const requestId = Array.isArray(rawValue) ? rawValue[0] ?? crypto.randomUUID() : (rawValue ?? crypto.randomUUID());
  const safeRequestId = String(requestId);

  res.setHeader('x-request-id', safeRequestId);
  req.headers['x-request-id'] = safeRequestId;
  next();
}
