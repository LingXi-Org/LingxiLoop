import type { Pool, PoolClient } from 'pg'

export async function withClientTransaction<T>(client: PoolClient, work: (client: PoolClient) => Promise<T>): Promise<T> {
  await client.query('BEGIN')
  try {
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    return await withClientTransaction(client, work)
  } finally {
    client.release()
  }
}
