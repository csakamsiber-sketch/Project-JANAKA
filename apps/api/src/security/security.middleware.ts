import { BadRequestException, Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { rejectDuplicateJsonKeys, rejectDuplicateQueryParameters, rejectPrototypePollutionObject } from './duplicate-parameter.guard';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const rawUrl = req.originalUrl ?? req.url ?? '';

    try {
      rejectDuplicateQueryParameters(rawUrl);
    } catch (error) {
      throw new BadRequestException('Duplicate query parameters are not allowed.');
    }

    if (req.body !== undefined) {
      try {
        rejectPrototypePollutionObject(req.body);
        if (typeof req.body === 'string') {
          rejectDuplicateJsonKeys(req.body);
        }
      } catch (error) {
        throw new BadRequestException('Unsafe request content detected.');
      }
    }

    next();
  }
}
