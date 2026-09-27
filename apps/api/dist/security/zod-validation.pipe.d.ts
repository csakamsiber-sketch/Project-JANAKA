import { PipeTransform } from '@nestjs/common';
export declare class ZodValidationPipe implements PipeTransform {
    transform(value: unknown, _metadata: any): unknown;
}
