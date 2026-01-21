import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CardsModule } from './cards/cards.module';
import { CollectionsModule } from './collections/collections.module';
import { ExpansionsModule } from './expansions/expansions.module';
import { ScrapersModule } from './scrapers/scrapers.module';
import { UsersModule } from './users/users.module';
import { TournamentsModule } from './tournaments/tournaments.module';
import { DecksModule } from './decks/decks.module';
import { PricesModule } from './prices/prices.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 20,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 100,
      },
    ]),
    AuthModule,
    CardsModule,
    CollectionsModule,
    ExpansionsModule,
    ScrapersModule,
    UsersModule,
    TournamentsModule,
    DecksModule,
    PricesModule,
    StorageModule,
  ],
})
export class AppModule {}
