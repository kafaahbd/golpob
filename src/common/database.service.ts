import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;
  public db: NodePgDatabase<typeof schema>
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.config.get<string>('DATABASE_URL');

    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      ssl: databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
    });

    this.db = drizzle(this.pool, { schema });
    await this.testConnection();
    this.logger.log('✅ Database connected (Neon PostgreSQL)');
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('Database pool closed');
    this.db = drizzle(this.pool, { schema });
  }

  private async testConnection() {
    const client = await this.pool.connect();
    await client.query('SELECT 1');
    client.release();
  }

  getDb() {
    return this.db;
  }
}
