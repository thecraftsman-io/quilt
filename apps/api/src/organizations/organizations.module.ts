import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { DefaultHouseholdService } from './default-household.service';
import { OrganizationsController } from './organizations.controller';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [OrganizationsController],
  providers: [DefaultHouseholdService],
})
export class OrganizationsModule {}
