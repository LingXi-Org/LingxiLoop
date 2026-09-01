import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const user = sqliteTable('user', {
  id: text('id').primaryKey(), name: text('name').notNull(), email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false), image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(), updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
  role: text('role').notNull().default('user'), banned: integer('banned', { mode: 'boolean' }).notNull().default(false),
  banReason: text('banReason'), banExpires: integer('banExpires', { mode: 'timestamp' }),
})

export const session = sqliteTable('session', {
  id: text('id').primaryKey(), expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(), token: text('token').notNull().unique(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(), updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ipAddress'), userAgent: text('userAgent'), userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  impersonatedBy: text('impersonatedBy'),
})

export const account = sqliteTable('account', {
  id: text('id').primaryKey(), accountId: text('accountId').notNull(), providerId: text('providerId').notNull(), issuer: text('issuer').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }), accessToken: text('accessToken'),
  refreshToken: text('refreshToken'), idToken: text('idToken'), accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }), scope: text('scope'), password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(), updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
}, (table) => [uniqueIndex('account_issuer_accountId_uidx').on(table.issuer, table.accountId)])

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(), identifier: text('identifier').notNull(), value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(), createdAt: integer('createdAt', { mode: 'timestamp' }),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }),
})

export const rateLimit = sqliteTable('rateLimit', {
  id: text('id').primaryKey(), key: text('key').notNull().unique(), count: integer('count').notNull(), lastRequest: integer('lastRequest').notNull(),
})

export const authSchema = { user, session, account, verification, rateLimit }
