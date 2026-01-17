import type { PgDomainClientConfig } from './db';

/**
 * Configuration for creating a domain facade with separate reader/writer instances.
 *
 * This config is used by domain facades (e.g., MemoryPGRW, AgentsPGRW) to create
 * two underlying domain instances: one for read operations and one for write operations.
 *
 * @example
 * ```typescript
 * const rwConfig: RWDomainConfig = {
 *   writer: { client: writerDbClient, schemaName: 'public' },
 *   reader: { client: readerDbClient, schemaName: 'public' },
 * };
 * const memoryFacade = new MemoryPGRW(rwConfig);
 * ```
 */
export interface RWDomainConfig<T = PgDomainClientConfig> {
  /**
   * Configuration for the writer domain instance.
   * All write operations, DDL, and transactional flows will use this.
   * Can be either a config object or a pre-created domain instance (for testing).
   */
  writer: T;

  /**
   * Configuration for the reader domain instance.
   * If omitted, the writer config is used for reads (single-pool mode).
   * Can be either a config object or a pre-created domain instance (for testing).
   */
  reader?: T;
}

/**
 * Type guard to check if a value is a PgDomainClientConfig (has a client property).
 */
export function isPgDomainClientConfig(value: unknown): value is PgDomainClientConfig {
  return typeof value === 'object' && value !== null && 'client' in value;
}
