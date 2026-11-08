import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import type { ValidationErrorIssue } from '@quilt/contracts';
import { ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors: ValidationErrorIssue[] = result.error.issues.map(
        (issue) => ({
          path: issue.path as (string | number)[],
          message: issue.message,
        }),
      );
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        errors,
      });
    }
    return result.data;
  }
}
