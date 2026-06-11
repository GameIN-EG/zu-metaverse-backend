import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export type AccessTokenUser = {
  id: string;
  email: string | null;
  name: string | null;
};

export type IssuedAccessToken = {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
};

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  issueAccessToken(user: AccessTokenUser): IssuedAccessToken {
    const expiresIn = Number(this.config.get<string>('JWT_EXPIRES_IN') ?? '86400');

    const accessToken = this.jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
      },
      { expiresIn },
    );

    return { accessToken, tokenType: 'Bearer', expiresIn };
  }
}
