import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../db/drizzle.module';
import { idpMetadataCache } from '../db/schema';
import {
  formatPemCertificate,
  parseIdpEntityId,
  parseIdpSigningCertificates,
} from './idp-metadata.parser';
import { IDP_METADATA_CACHE_ID } from './saml.constants';

@Injectable()
export class IdpMetadataService implements OnModuleInit {
  private readonly logger = new Logger(IdpMetadataService.name);
  private cachedCerts: string[] = [];

  constructor(
    private readonly config: ConfigService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.config.get<string>('SAML_ENABLED') !== 'true') {
      return;
    }

    // Never let a startup metadata/DB hiccup crash the whole app — certs will
    // be (re)loaded on the next scheduled refresh or on first SAML request.
    try {
      await this.refreshMetadata('startup');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`IdP metadata startup refresh failed: ${message}`);
    }
  }

  getSigningCertificates(): string[] {
    return [...this.cachedCerts];
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { name: 'refreshIdpMetadata' })
  async refreshMetadataScheduled(): Promise<void> {
    if (this.config.get<string>('SAML_ENABLED') !== 'true') {
      return;
    }
    await this.refreshMetadata('scheduled');
  }

  async refreshMetadata(reason: string): Promise<void> {
    const metadataUrl = this.config.get<string>('SAML_IDP_METADATA_URL');
    const envCert = this.normalizeEnvCert(this.config.get<string>('SAML_IDP_CERT'));

    if (metadataUrl) {
      try {
        const response = await fetch(metadataUrl, {
          headers: { Accept: 'application/samlmetadata+xml, application/xml, text/xml' },
        });

        if (!response.ok) {
          throw new Error(`Metadata fetch failed with HTTP ${response.status}`);
        }

        const xml = await response.text();
        const entityId = parseIdpEntityId(xml);
        const signingCerts = parseIdpSigningCertificates(xml);

        if (signingCerts.length === 0) {
          throw new Error('No signing certificates found in IDPSSODescriptor');
        }

        // Use the freshly fetched certs immediately; persisting is best-effort
        // so a transient DB issue can't discard a successful metadata refresh.
        this.cachedCerts = signingCerts;
        this.logger.log(
          `Refreshed IdP metadata (${reason}): ${signingCerts.length} signing certificate(s)`,
        );

        try {
          await this.persistCache(
            entityId ?? this.config.get<string>('SAML_IDP_ENTITY_ID') ?? '',
            signingCerts,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Could not persist IdP metadata cache (${reason}): ${message}`);
        }
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to refresh IdP metadata (${reason}): ${message}`);
      }
    }

    try {
      const [persisted] = await this.db
        .select()
        .from(idpMetadataCache)
        .where(eq(idpMetadataCache.id, IDP_METADATA_CACHE_ID))
        .limit(1);

      if (persisted) {
        const certs = this.parseStoredCerts(persisted.signingCerts);
        if (certs.length > 0) {
          this.cachedCerts = certs;
          this.logger.warn(`Using persisted IdP signing certificates (${reason})`);
          return;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not read persisted IdP certificates (${reason}): ${message}`);
    }

    if (envCert) {
      this.cachedCerts = [envCert];
      this.logger.warn(`Using SAML_IDP_CERT env fallback (${reason})`);
      return;
    }

    if (this.cachedCerts.length > 0) {
      this.logger.warn(`Keeping in-memory IdP certificates (${reason})`);
      return;
    }

    this.logger.error('No IdP signing certificates available');
  }

  private async persistCache(entityId: string, signingCerts: string[]): Promise<void> {
    const now = new Date();
    await this.db
      .insert(idpMetadataCache)
      .values({
        id: IDP_METADATA_CACHE_ID,
        entityId,
        signingCerts,
        fetchedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: idpMetadataCache.id,
        set: { entityId, signingCerts, fetchedAt: now, updatedAt: now },
      });
  }

  private parseStoredCerts(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }

  private normalizeEnvCert(raw: string | undefined): string | null {
    if (!raw?.trim()) {
      return null;
    }

    const trimmed = raw.trim();
    if (trimmed.includes('BEGIN CERTIFICATE')) {
      return trimmed.replace(/\\n/g, '\n');
    }

    return formatPemCertificate(trimmed);
  }
}
