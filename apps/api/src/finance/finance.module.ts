import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { FinanceController } from './finance.controller';
import { FinanceRepository } from './finance.repository';
import { FinanceService } from './finance.service';
import { FinanceBoundaryGuard } from './finance-boundary.guard';
@Module({
  imports: [DatabaseModule],
  controllers: [FinanceController],
  providers: [FinanceRepository, FinanceService, FinanceBoundaryGuard],
})
export class FinanceModule {}
