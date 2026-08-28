import type { QueryResult, QueryResultRow } from 'pg'

/** Minimal persistence port shared by repositories and transaction clients. */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<T>>
}
