import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/drizzle.module';
import { externalIdentities, users } from '../db/schema';
import type { ExtractedSamlClaims } from './saml-claims.service';
import { SAML_PROVIDER_ZU_ADFS } from './saml.constants';

export type ProvisionedUser = {
  id: string;
  email: string | null;
  name: string | null;
};

type DrizzleTx = Parameters<Parameters<DrizzleDB['transaction']>[0]>[0];

@Injectable()
export class SamlProvisioningService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Resolves the local user for a set of SAML claims, creating one on first login.
   * Resolution order: existing federated identity -> verified user with matching
   * email -> brand new user. The federated identity is always (re)linked.
   */
  async provisionUser(claims: ExtractedSamlClaims): Promise<ProvisionedUser> {
    return this.db.transaction(async (tx) => {
      const [identity] = await tx
        .select()
        .from(externalIdentities)
        .where(
          and(
            eq(externalIdentities.provider, SAML_PROVIDER_ZU_ADFS),
            eq(externalIdentities.externalId, claims.externalId),
          ),
        )
        .limit(1);

      let userId: string;

      if (identity) {
        userId = identity.userId;

        await tx
          .update(externalIdentities)
          .set({ nameId: claims.nameId, upn: claims.upn, updatedAt: new Date() })
          .where(eq(externalIdentities.id, identity.id));

        const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        if (user && claims.name && !user.name) {
          await tx
            .update(users)
            .set({ name: claims.name, updatedAt: new Date() })
            .where(eq(users.id, userId));
        }
      } else {
        userId = await this.resolveOrCreateUser(tx, claims);

        await tx.insert(externalIdentities).values({
          provider: SAML_PROVIDER_ZU_ADFS,
          externalId: claims.externalId,
          nameId: claims.nameId,
          upn: claims.upn,
          userId,
        });
      }

      const [user] = await tx
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new BadRequestException('Failed to resolve provisioned user');
      }

      return user;
    });
  }

  async getUserById(userId: string): Promise<ProvisionedUser | null> {
    const [user] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return user ?? null;
  }

  private async resolveOrCreateUser(tx: DrizzleTx, claims: ExtractedSamlClaims): Promise<string> {
    if (claims.email) {
      const [existing] = await tx
        .select()
        .from(users)
        .where(eq(users.email, claims.email))
        .limit(1);

      if (existing) {
        if (claims.name && !existing.name) {
          await tx
            .update(users)
            .set({ name: claims.name, updatedAt: new Date() })
            .where(eq(users.id, existing.id));
        }
        return existing.id;
      }
    }

    const [created] = await tx
      .insert(users)
      .values({
        email: claims.email,
        name: claims.name,
        isEmailVerified: false,
      })
      .returning({ id: users.id });

    return created.id;
  }
}
