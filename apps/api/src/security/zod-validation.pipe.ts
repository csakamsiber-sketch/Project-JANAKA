import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { z, ZodError } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, _metadata: any) {
    if (value === undefined || value === null) {
      return value;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    const schema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      password: z.string().min(12).max(128).optional(),
      fingerprint: z.string().min(8).max(256).optional(),
      role: z.string().optional(),
      id: z.string().optional(),
      amount: z.number().optional(),
      data: z.unknown().optional(),
      firstName: z.string().min(2).max(80).optional(),
      lastName: z.string().min(2).max(80).optional(),
      otp: z.string().min(6).max(8).optional(),
      challengeId: z.string().uuid().optional(),
      temporaryAccessToken: z.string().length(64).optional(),
      botToken: z.string().min(1).optional(),
      token: z.string().min(16).max(256).optional(),
    }).passthrough();

    try {
      const parsed = schema.parse(value);
      return parsed;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({ message: 'Request validation failed.', issues: error.issues });
      }
      throw new BadRequestException('Request validation failed.');
    }
  }
}
