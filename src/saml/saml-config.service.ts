import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ValidateInResponseTo, type SamlConfig } from '@node-saml/node-saml';
import { IdpMetadataService } from './idp-metadata.service';
import {
  DEFAULT_CLAIM_EMAIL,
  DEFAULT_CLAIM_NAME,
  DEFAULT_CLAIM_UPN,
  SAML_ACS_PATH,
  SAML_METADATA_PATH,
} from './saml.constants';

@Injectable()
export class SamlConfigService {
  private readonly logger = new Logger(SamlConfigService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly idpMetadata: IdpMetadataService,
  ) {}

  isEnabled(): boolean {
    return this.config.get<string>('SAML_ENABLED') === 'true';
  }

  /**
   * Public base URL of this backend (no trailing slash), e.g. the Railway domain.
   * Used to derive the SP entity ID and ACS URL when they are not explicitly set.
   */
  getBaseUrl(): string {
    const raw = this.config.get<string>('PUBLIC_BASE_URL')?.trim() || 'http://localhost:3000';
    return raw.replace(/\/+$/, '');
  }

  getSpEntityId(): string {
    return (
      this.config.get<string>('SAML_SP_ENTITY_ID')?.trim() ||
      `${this.getBaseUrl()}${SAML_METADATA_PATH}`
    );
  }

  getAcsUrl(): string {
    return (
      this.config.get<string>('SAML_SP_ACS_URL')?.trim() || `${this.getBaseUrl()}${SAML_ACS_PATH}`
    );
  }

  getClaimUris() {
    return {
      studentId: this.config.get<string>('SAML_CLAIM_STUDENT_ID')?.trim() || null,
      email: this.config.get<string>('SAML_CLAIM_EMAIL')?.trim() || DEFAULT_CLAIM_EMAIL,
      name: this.config.get<string>('SAML_CLAIM_NAME')?.trim() || DEFAULT_CLAIM_NAME,
      upn: this.config.get<string>('SAML_CLAIM_UPN')?.trim() || DEFAULT_CLAIM_UPN,
    };
  }

  /**
   * Frontend URL the user is redirected to after a successful assertion. The
   * one-time exchange code is appended as a `code` query parameter.
   * Falls back to a base-URL-derived placeholder so the service can boot before
   * the final frontend URL is known — set SAML_SUCCESS_REDIRECT_URL in production.
   */
  getSuccessRedirectUrl(): string {
    const configured = this.config.get<string>('SAML_SUCCESS_REDIRECT_URL')?.trim();
    if (configured) {
      return configured;
    }

    this.logger.warn(
      'SAML_SUCCESS_REDIRECT_URL is not set; falling back to a placeholder. ' +
        'Set it to the frontend /sso/callback URL.',
    );
    return `${this.getBaseUrl()}/sso/callback`;
  }

  getAllowedRelayHosts(): string[] {
    const raw = this.config.get<string>('SAML_ALLOWED_RELAY_HOSTS')?.trim();
    if (!raw) {
      return ['localhost'];
    }
    return raw
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }

  shouldDebugClaims(): boolean {
    return this.config.get<string>('SAML_DEBUG_CLAIMS') === 'true';
  }

  buildSamlOptions(): SamlConfig {
    const certs = this.idpMetadata.getSigningCertificates();
    if (certs.length === 0) {
      throw new Error('No IdP signing certificates configured');
    }

    const clockSkewMs = Number(this.config.get<string>('SAML_CLOCK_SKEW_MS') ?? '30000');
    const privateKey = this.normalizePem(this.config.get<string>('SAML_SP_PRIVATE_KEY'));
    const publicCert = this.normalizePem(this.config.get<string>('SAML_SP_CERT'));
    const entryPoint = this.config.getOrThrow<string>('SAML_IDP_SSO_URL');
    const idpIssuer = this.config.get<string>('SAML_IDP_ENTITY_ID');

    return {
      callbackUrl: this.getAcsUrl(),
      entryPoint,
      issuer: this.getSpEntityId(),
      ...(idpIssuer ? { idpIssuer } : {}),
      idpCert: certs.length === 1 ? certs[0] : certs,
      wantAssertionsSigned: true,
      signatureAlgorithm: 'sha256',
      acceptedClockSkewMs: clockSkewMs,
      validateInResponseTo: ValidateInResponseTo.always,
      disableRequestedAuthnContext: true,
      identifierFormat: undefined,
      ...(privateKey ? { privateKey } : {}),
      ...(publicCert ? { publicCert } : {}),
    };
  }

  private normalizePem(raw: string | undefined): string | undefined {
    if (!raw?.trim()) {
      return undefined;
    }

    return raw.replace(/\\n/g, '\n').trim();
  }
}
