import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { HouseholdSchema } from '@quilt/contracts';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DefaultHouseholdService {
  constructor(private readonly database: DatabaseService) {}

  async ensure(userId: string) {
    const client = await this.database.db.$client.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      // Serialize first-use setup across tabs/devices before checking membership.
      const user = await client.query(
        'SELECT id FROM "user" WHERE id = $1 FOR UPDATE',
        [userId],
      );
      if (!user.rowCount) throw new NotFoundException('Account not found.');
      const existing = await client.query(
        'SELECT o.id, o.name, o.slug, o.logo, o.created_at AS "createdAt" FROM organization o JOIN member m ON m.organization_id=o.id WHERE m.user_id=$1 ORDER BY o.created_at, o.id LIMIT 1',
        [userId],
      );
      if (existing.rows.length) {
        const household = HouseholdSchema.parse(existing.rows[0]);
        await client.query('COMMIT');
        return household;
      }
      const id = randomUUID();
      const created = await client.query(
        'INSERT INTO organization (id, name, slug) VALUES ($1, $2, $3) RETURNING id, name, slug, logo, created_at AS "createdAt"',
        [id, 'My household', `home-${id}`],
      );
      await client.query(
        'INSERT INTO member (id, organization_id, user_id, role) VALUES ($1, $2, $3, $4)',
        [randomUUID(), id, userId, 'owner'],
      );
      const household = HouseholdSchema.parse(created.rows[0]);
      await client.query('COMMIT');
      return household;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
