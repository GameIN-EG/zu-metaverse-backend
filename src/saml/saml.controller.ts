import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TokenService } from '../auth/token.service';
import { ExchangeSamlCodeDto } from './dto/exchange-saml-code.dto';
import { SamlClaimsService } from './saml-claims.service';
import { SamlConfigService } from './saml-config.service';
import { SamlExchangeService } from './saml-exchange.service';
import { SamlProvisioningService } from './saml-provisioning.service';
import { SamlService } from './saml.service';

@ApiTags('SAML SSO')
@Controller({ path: 'auth/saml', version: '1' })
export class SamlController {
  constructor(
    private readonly samlService: SamlService,
    private readonly samlConfig: SamlConfigService,
    private readonly samlClaims: SamlClaimsService,
    private readonly samlExchange: SamlExchangeService,
    private readonly samlProvisioning: SamlProvisioningService,
    private readonly tokenService: TokenService,
  ) {}

  private assertEnabled(): void {
    if (!this.samlConfig.isEnabled()) {
      throw new ServiceUnavailableException('SAML is not enabled');
    }
  }

  /** Start SP-initiated SAML login (redirects to the IdP). */
  @Get('login')
  @ApiOperation({ summary: 'Start SP-initiated SAML login (redirects to the IdP)' })
  async login(@Query('RelayState') relayState: string | undefined, @Res() res: Response) {
    this.assertEnabled();

    const validatedRelayState = this.samlClaims.validateRelayState(relayState);
    const redirectUrl = await this.samlService.getLoginRedirectUrl(
      validatedRelayState ?? undefined,
    );
    return res.redirect(302, redirectUrl);
  }

  /** SAML assertion consumer service (IdP posts the assertion here). */
  @Post('acs')
  @ApiOperation({ summary: 'Assertion Consumer Service — IdP posts the SAML assertion here' })
  async assertionConsumer(@Body() body: Record<string, string>, @Res() res: Response) {
    this.assertEnabled();

    const profile = await this.samlService.validatePostResponse(body);
    const claims = this.samlClaims.extractClaims(profile);
    const relayState = this.samlClaims.validateRelayState(body.RelayState);
    const user = await this.samlProvisioning.provisionUser(claims);

    const code = await this.samlExchange.createExchangeCode({
      userId: user.id,
      relayState,
    });

    const redirectUrl = new URL(this.samlConfig.getSuccessRedirectUrl());
    redirectUrl.searchParams.set('code', code);
    if (relayState) {
      redirectUrl.searchParams.set('relayState', relayState);
    }

    return res.redirect(302, redirectUrl.toString());
  }

  /** Exchange the one-time SAML login code for an access token. */
  @Post('exchange')
  @ApiOperation({ summary: 'Exchange the one-time SAML code for a JWT access token' })
  async exchangeCode(@Body() dto: ExchangeSamlCodeDto) {
    this.assertEnabled();

    const consumed = await this.samlExchange.consumeExchangeCode(dto.code);
    const user = await this.samlProvisioning.getUserById(consumed.userId);
    if (!user) {
      throw new BadRequestException('User no longer exists');
    }

    const token = this.tokenService.issueAccessToken(user);

    return {
      ...token,
      user,
      relayState: consumed.relayState,
    };
  }

  /** Service Provider SAML metadata for relying-party registration with the IdP. */
  @Get('metadata')
  @ApiOperation({ summary: 'Service Provider SAML metadata XML for IdP registration' })
  metadata(@Res() res: Response) {
    if (!this.samlConfig.isEnabled()) {
      throw new BadRequestException('SAML is not enabled');
    }

    res.setHeader('Content-Type', 'application/samlmetadata+xml');
    return res.send(this.samlService.getMetadataXml());
  }
}
