import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IdpMetadataService } from './idp-metadata.service';
import { SamlClaimsService } from './saml-claims.service';
import { SamlConfigService } from './saml-config.service';
import { SamlController } from './saml.controller';
import { SamlExchangeService } from './saml-exchange.service';
import { SamlProvisioningService } from './saml-provisioning.service';
import { SamlService } from './saml.service';

@Module({
  imports: [AuthModule],
  controllers: [SamlController],
  providers: [
    IdpMetadataService,
    SamlConfigService,
    SamlClaimsService,
    SamlExchangeService,
    SamlProvisioningService,
    SamlService,
  ],
  exports: [SamlConfigService, SamlClaimsService],
})
export class SamlModule {}
