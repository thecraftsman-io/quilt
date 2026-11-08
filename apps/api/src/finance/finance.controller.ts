import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  FinanceIdSchema,
  FinanceAsOfQuerySchema,
  FinanceListQuerySchema,
  FinanceReportQuerySchema,
  FinanceResourceSchema,
  type FinanceResource,
} from '@quilt/contracts';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { FinanceService } from './finance.service';
import { FinanceBoundaryGuard } from './finance-boundary.guard';
import type { z } from 'zod';

const idPipe = new ZodValidationPipe(FinanceIdSchema);
const resourcePipe = new ZodValidationPipe(FinanceResourceSchema);
@Controller('workspaces/:workspaceId')
@UseGuards(FinanceBoundaryGuard)
export class FinanceController {
  constructor(private readonly finances: FinanceService) {}

  @Get('access')
  access(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.finances.access(workspaceId, user.id);
  }

  @Get('summary')
  summary(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
    @Query(new ZodValidationPipe(FinanceReportQuerySchema))
    query: z.output<typeof FinanceReportQuerySchema>,
  ) {
    return this.finances.summary(
      workspaceId,
      user.id,
      query.month,
      query.currency,
      query.asOf,
    );
  }
  @Get(':resource')
  list(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
    @Param('resource', resourcePipe) resource: FinanceResource,
    @Query(new ZodValidationPipe(FinanceListQuerySchema))
    query: z.output<typeof FinanceListQuerySchema>,
  ) {
    return this.finances.list(
      workspaceId,
      user.id,
      resource,
      query.limit,
      query.offset,
      query,
    );
  }
  @Get(':resource/:id')
  get(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
    @Param('resource', resourcePipe) resource: FinanceResource,
    @Param('id', idPipe) id: string,
  ) {
    return this.finances.get(workspaceId, user.id, resource, id);
  }
  @Post(':resource')
  create(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
    @Param('resource', resourcePipe) resource: FinanceResource,
    @Body() body: unknown,
  ) {
    return this.finances.create(workspaceId, user.id, resource, body);
  }
  @Put(':resource/:id')
  update(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
    @Param('resource', resourcePipe) resource: FinanceResource,
    @Param('id', idPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.finances.update(workspaceId, user.id, resource, id, body);
  }
  @Post('transactions/:id/void')
  @HttpCode(200)
  void(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
    @Param('id', idPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.finances.voidTransaction(workspaceId, user.id, id, body);
  }

  @Post('transactions/:id/restore')
  @HttpCode(200)
  restore(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
    @Param('id', idPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.finances.restoreTransaction(workspaceId, user.id, id, body);
  }

  @Get('goals/:id/progress')
  goalProgress(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
    @Param('id', idPipe) id: string,
    @Query(new ZodValidationPipe(FinanceAsOfQuerySchema))
    query: z.output<typeof FinanceAsOfQuerySchema>,
  ) {
    return this.finances.goalProgress(workspaceId, user.id, id, query.asOf);
  }
  @Get('budgets/:id/progress')
  budgetProgress(
    @Param('workspaceId', idPipe) workspaceId: string,
    @CurrentUser() user: { id: string },
    @Param('id', idPipe) id: string,
    @Query(new ZodValidationPipe(FinanceAsOfQuerySchema))
    query: z.output<typeof FinanceAsOfQuerySchema>,
  ) {
    return this.finances.budgetProgress(workspaceId, user.id, id, query.asOf);
  }
}
