import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { runMigrations } from './db/migrate';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Apply pending migrations BEFORE creating the app, so module init hooks
  // (e.g. IdP metadata cache) can safely query their tables on first boot.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && process.env.RUN_MIGRATIONS_ON_BOOT !== 'false') {
    try {
      await runMigrations(databaseUrl);
      logger.log('Database migrations applied');
    } catch (error) {
      logger.error(`Failed to apply migrations: ${(error as Error).message}`);
    }
  }

  const app = await NestFactory.create(AppModule);

  const config = app.get(ConfigService);

  // Routes are served under /api/V<version>/... (e.g. /api/V1/auth/saml/metadata).
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: 'V',
    defaultVersion: '1',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Swagger / OpenAPI docs at /api/docs (token persists across page reloads).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ZU Metaverse Backend')
    .setDescription('SAML SSO API for the ZU metaverse platform')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'access-token')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    customSiteTitle: 'ZU Metaverse API Docs',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = config.get<string>('PORT') ?? process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
}
bootstrap();
