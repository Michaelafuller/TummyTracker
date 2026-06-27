import type { Config } from 'drizzle-kit';

// drizzle-kit generates SQL migrations from src/db/schema.ts into src/db/migrations.
// Migrations are applied on-device at runtime via drizzle-orm/expo-sqlite/migrator.
export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
