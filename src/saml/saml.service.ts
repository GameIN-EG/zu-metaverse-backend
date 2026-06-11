import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SAML } from '@node-saml/node-saml';
import type { Profile } from '@node-saml/node-saml';
import { SamlConfigService } from './saml-config.service';

@Injectable()
export class SamlService {
  constructor(private readonly samlConfig: SamlConfigService) {}

  createSamlClient(): SAML {
    return new SAML(this.samlConfig.buildSamlOptions());
  }

  async getLoginRedirectUrl(relayState?: string): Promise<string> {
    const saml = this.createSamlClient();
    return saml.getAuthorizeUrlAsync(relayState ?? '', undefined, {});
  }

  async validatePostResponse(body: Record<string, string>): Promise<Profile> {
    const saml = this.createSamlClient();
    const result = await saml.validatePostResponseAsync(body);
    if (!result.profile) {
      throw new UnauthorizedException('SAML profile missing from assertion');
    }

    return result.profile;
  }

  getMetadataXml(): string {
    const saml = this.createSamlClient();
    const publicCert = this.samlConfig.buildSamlOptions().publicCert ?? null;
    return saml.generateServiceProviderMetadata(publicCert, publicCert);
  }
}
