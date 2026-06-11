import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Profile } from '@node-saml/node-saml';
import { SamlConfigService } from './saml-config.service';

export type ExtractedSamlClaims = {
  externalId: string;
  email: string | null;
  name: string | null;
  upn: string | null;
  nameId: string | null;
  rawClaims: Record<string, unknown>;
};

@Injectable()
export class SamlClaimsService {
  private readonly logger = new Logger(SamlClaimsService.name);

  constructor(private readonly samlConfig: SamlConfigService) {}

  extractClaims(profile: Profile): ExtractedSamlClaims {
    const claimUris = this.samlConfig.getClaimUris();
    const rawClaims = this.flattenProfile(profile);

    const studentId = claimUris.studentId ? this.readClaim(rawClaims, claimUris.studentId) : null;
    const upn = this.readClaim(rawClaims, claimUris.upn);
    const email = this.readClaim(rawClaims, claimUris.email);
    const name = this.readClaim(rawClaims, claimUris.name);
    const nameId = profile.nameID ?? null;

    const externalId = studentId ?? upn ?? nameId;
    if (!externalId) {
      throw new BadRequestException(
        'SAML assertion did not include a usable identifier claim or NameID',
      );
    }

    if (this.samlConfig.shouldDebugClaims()) {
      this.logger.debug(`SAML claims received: ${JSON.stringify(rawClaims)}`);
    }

    return {
      externalId,
      email,
      name,
      upn,
      nameId,
      rawClaims,
    };
  }

  validateRelayState(relayState: string | undefined): string | null {
    if (!relayState?.trim()) {
      return null;
    }

    const trimmed = relayState.trim();
    const allowedHosts = this.samlConfig.getAllowedRelayHosts();

    if (trimmed.startsWith('/')) {
      return trimmed;
    }

    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
        throw new BadRequestException('RelayState must use HTTPS');
      }

      const host = url.hostname.toLowerCase();
      if (!allowedHosts.includes(host)) {
        throw new BadRequestException('RelayState host is not allowlisted');
      }

      return `${url.pathname}${url.search}${url.hash}`;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Invalid RelayState');
    }
  }

  private flattenProfile(profile: Profile): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(profile)) {
      if (key === 'getAssertion' || key === 'getAssertionXml' || key === 'getSamlResponseXml') {
        continue;
      }
      result[key] = value;
    }

    const attributes = (profile as Profile & { attributes?: Record<string, unknown> }).attributes;
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        result[key] = value;
      }
    }

    return result;
  }

  private readClaim(rawClaims: Record<string, unknown>, uri: string): string | null {
    const value = rawClaims[uri];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === 'string' && item.trim());
      return typeof first === 'string' ? first.trim() : null;
    }

    return null;
  }
}
