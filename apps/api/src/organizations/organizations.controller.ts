import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import {
  CreateOrganizationSchema,
  InviteMemberSchema,
  type CreateOrganizationInput,
  type InviteMemberInput,
} from '@quilt/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { AuthService } from '../auth/auth.service';
import { CurrentSession } from '../auth/decorators/current-session.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  getProfile(
    @CurrentUser() user: Record<string, unknown>,
    @CurrentSession() session: Record<string, unknown>,
  ) {
    return {
      user,
      session,
    };
  }

  @Get()
  async listOrganizations(@Req() req: FastifyRequest) {
    return this.authService.auth.api.listOrganizations({
      headers: fromNodeHeaders(req.headers),
    });
  }

  @Post()
  async createOrganization(
    @Body(new ZodValidationPipe(CreateOrganizationSchema))
    body: CreateOrganizationInput,
    @Req() req: FastifyRequest,
  ) {
    return this.authService.auth.api.createOrganization({
      headers: fromNodeHeaders(req.headers),
      body: {
        name: body.name,
        slug: body.slug ?? body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        logo: body.logo ?? undefined,
      },
    });
  }

  @Post(':id/invite')
  async inviteMember(
    @Param('id') organizationId: string,
    @Body(new ZodValidationPipe(InviteMemberSchema)) body: InviteMemberInput,
    @Req() req: FastifyRequest,
  ) {
    return this.authService.auth.api.createInvitation({
      headers: fromNodeHeaders(req.headers),
      body: {
        organizationId,
        email: body.email,
        role: body.role,
      },
    });
  }
}
