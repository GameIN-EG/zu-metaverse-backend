import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/drizzle.module';
import { samlExchangeCodes } from '../db/schema';
import { SAML_EXCHANGE_CODE_TTL_SECONDS } from './saml.constants';

@Injectable()
export class SamlExchangeService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async createExchangeCode(input: { userId: string; relayState?: string | null }): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    const codeHash = this.hashCode(code);
    const expiresAt = new Date(Date.now() + SAML_EXCHANGE_CODE_TTL_SECONDS * 1000);

    await this.db.insert(samlExchangeCodes).values({
      codeHash,
      userId: input.userId,
      relayState: input.relayState ?? null,
      expiresAt,
    });

    return code;
  }

  async consumeExchangeCode(code: string): Promise<{ userId: string; relayState: string | null }> {
    if (!code?.trim()) {
      throw new BadRequestException('Exchange code is required');
    }

    const codeHash = this.hashCode(code.trim());
    const now = new Date();

    const [record] = await this.db
      .select()
      .from(samlExchangeCodes)
      .where(eq(samlExchangeCodes.codeHash, codeHash))
      .limit(1);

    if (!record || record.consumedAt || record.expiresAt <= now) {
      throw new UnauthorizedException('Invalid or expired exchange code');
    }

    await this.db
      .update(samlExchangeCodes)
      .set({ consumedAt: now })
      .where(eq(samlExchangeCodes.id, record.id));

    return {
      userId: record.userId,
      relayState: record.relayState,
    };
  }

  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }
}
