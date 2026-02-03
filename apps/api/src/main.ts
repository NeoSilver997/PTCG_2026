import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false, // Allow extra properties for import compatibility
      transform: true,
    })
  );

  // CORS configuration
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://localhost:3332',
      'http://127.0.0.1:3332',
      'http://localhost:3333',
      'http://127.0.0.1:3333',
      'http://localhost:3334',
      'http://127.0.0.1:3334',
      'https://ptcg002.tcghk.trade',
      'http://ptcg002.tcghk.trade',
    ],
    credentials: true,
  });

  // API prefix
  app.setGlobalPrefix('api/v1');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('PTCG CardDB API')
    .setDescription('REST API for Pokémon Trading Card Game Database')
    .setVersion('2.0')
    .addBearerAuth()
    .addTag('auth', 'Authentication endpoints')
    .addTag('cards', 'Card management')
    .addTag('collections', 'User collections')
    .addTag('expansions', 'Expansion management')
    .addTag('scrapers', 'Scraper jobs')
    .addTag('users', 'User management')
    .addTag('tournaments', 'Tournament results')
    .addTag('decks', 'Deck management')
    .addTag('prices', 'Market pricing')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);

  console.log(`🚀 API server running on http://localhost:${port}`);
  console.log(`📚 API documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
