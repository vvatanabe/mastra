import { ErrorCategory, ErrorDomain, MastraError } from '@mastra/core/error';
import { createStorageErrorId, MastraStorage } from '@mastra/core/storage';
import type { StorageDomains } from '@mastra/core/storage';
import type { Pool } from 'pg';
import type { PostgresRWStoreConfig } from '../shared/config';
import { PoolAdapter } from './client';
import type { DbClient, PgDomainClientConfig } from './db';
import { AgentsPGRW } from './domains/agents';
import { MemoryPGRW } from './domains/memory';
import { ObservabilityPGRW } from './domains/observability';
import { ScoresPGRW } from './domains/scores';
import { WorkflowsPGRW } from './domains/workflows';
import type { RWDomainConfig } from './rw-types';

/**
 * PostgreSQL storage adapter with read/write pool separation.
 *
 * Use this class when you have a PostgreSQL read replica setup and want to:
 * - Route read queries to the replica to reduce load on the primary
 * - Ensure all writes go to the primary database
 * - Maintain transaction consistency on the primary
 *
 * @example
 * ```typescript
 * import { Pool } from 'pg';
 * import { PostgresRWStore } from '@mastra/pg';
 *
 * // Create pools for primary and replica
 * const writerPool = new Pool({ connectionString: 'postgresql://primary:5432/db' });
 * const readerPool = new Pool({ connectionString: 'postgresql://replica:5432/db' });
 *
 * // Create store with R/W separation
 * const store = new PostgresRWStore({
 *   id: 'my-rw-store',
 *   writerPool,
 *   readerPool,
 *   ownsWriterPool: true,
 *   ownsReaderPool: true,
 * });
 *
 * // Initialize schema (uses writer pool only)
 * await store.init();
 *
 * // Access domain stores (reads route to replica, writes to primary)
 * const memory = await store.getStore('memory');
 * await memory?.saveThread({ thread }); // → writer pool
 * const threads = await memory?.getThreadsByResourceId({ resourceId }); // → reader pool
 *
 * // Direct query access
 * const users = await store.db.any('SELECT * FROM users'); // → reader pool
 * await store.db.none('INSERT INTO users ...'); // → writer pool
 *
 * // Cleanup
 * await store.close();
 * ```
 */
export class PostgresRWStore extends MastraStorage {
  readonly #writerPool: Pool;
  readonly #readerPool: Pool;
  readonly #writerDb: DbClient;
  readonly #ownsWriterPool: boolean;
  readonly #ownsReaderPool: boolean;
  private readonly schema: string;
  private isInitialized: boolean = false;

  /**
   * Domain storage interfaces.
   */
  stores: StorageDomains;

  /**
   * Creates a new PostgresRWStore with read/write pool separation.
   *
   * @param config - Configuration including writer and reader pools
   * @throws Error if configuration validation fails
   */
  constructor(config: PostgresRWStoreConfig) {
    try {
      if (!config.id || typeof config.id !== 'string' || config.id.trim() === '') {
        throw new Error('PostgresRWStore: id must be provided and cannot be empty.');
      }
      if (!config.writerPool) {
        throw new Error('PostgresRWStore: writerPool must be provided.');
      }
      if (!config.readerPool) {
        throw new Error('PostgresRWStore: readerPool must be provided.');
      }

      super({ id: config.id, name: 'PostgresRWStore', disableInit: config.disableInit });
      this.schema = config.schemaName || 'public';

      this.#writerPool = config.writerPool;
      this.#readerPool = config.readerPool;
      this.#ownsWriterPool = config.ownsWriterPool ?? false;
      this.#ownsReaderPool = config.ownsReaderPool ?? false;

      // Create separate DbClient instances for writer and reader
      this.#writerDb = new PoolAdapter(this.#writerPool);
      const readerDb: DbClient = new PoolAdapter(this.#readerPool);

      // Create domain configs for writer and reader
      const writerDomainConfig: PgDomainClientConfig = {
        client: this.#writerDb,
        schemaName: this.schema,
        skipDefaultIndexes: config.skipDefaultIndexes,
        indexes: config.indexes,
      };

      const readerDomainConfig: PgDomainClientConfig = {
        client: readerDb,
        schemaName: this.schema,
        skipDefaultIndexes: config.skipDefaultIndexes,
        indexes: config.indexes,
      };

      // Create RW domain config for facades
      const rwDomainConfig: RWDomainConfig = {
        writer: writerDomainConfig,
        reader: readerDomainConfig,
      };

      // Use domain facades that route reads/writes appropriately
      this.stores = {
        scores: new ScoresPGRW(rwDomainConfig),
        workflows: new WorkflowsPGRW(rwDomainConfig),
        memory: new MemoryPGRW(rwDomainConfig),
        observability: new ObservabilityPGRW(rwDomainConfig),
        agents: new AgentsPGRW(rwDomainConfig),
      };
    } catch (e) {
      throw new MastraError(
        {
          id: createStorageErrorId('PG', 'INITIALIZATION', 'FAILED'),
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.USER,
        },
        e,
      );
    }
  }

  /**
   * Database client for direct query execution.
   *
   * Returns the **writer** DbClient (FR-018). For custom SQL operations,
   * this ensures writes always go to the primary database. If you need
   * to explicitly query the replica, use `readerPool` directly.
   *
   * @example
   * ```typescript
   * // All queries go to writer pool
   * const rows = await store.db.any('SELECT * FROM users WHERE active = $1', [true]);
   * await store.db.none('UPDATE users SET last_login = NOW() WHERE id = $1', [userId]);
   *
   * // Transaction on writer pool
   * await store.db.tx(async (t) => {
   *   const user = await t.one('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id]);
   *   await t.none('UPDATE users SET balance = $1 WHERE id = $2', [newBalance, id]);
   * });
   * ```
   */
  get db(): DbClient {
    return this.#writerDb;
  }

  /**
   * The underlying writer pool for direct database access.
   * Use for ORM integration or manual pool management.
   */
  get writerPool(): Pool {
    return this.#writerPool;
  }

  /**
   * The underlying reader pool for direct database access.
   * Use for ORM integration or manual pool management.
   */
  get readerPool(): Pool {
    return this.#readerPool;
  }

  /**
   * Initialize all domain stores.
   * Uses writer pool only to create tables and indexes.
   *
   * Since the reader pool is not used for DDL operations,
   * this works correctly even if the reader pool has read-only permissions.
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.isInitialized = true;
      await super.init();
    } catch (error) {
      this.isInitialized = false;
      throw new MastraError(
        {
          id: createStorageErrorId('PG', 'INIT', 'FAILED'),
          domain: ErrorDomain.STORAGE,
          category: ErrorCategory.THIRD_PARTY,
        },
        error,
      );
    }
  }

  /**
   * Close connection pools owned by this store.
   *
   * - If ownsWriterPool is true, calls writerPool.end()
   * - If ownsReaderPool is true, calls readerPool.end()
   *
   * Pools passed via config with ownership=false are not closed.
   */
  async close(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    if (this.#ownsWriterPool) {
      closePromises.push(this.#writerPool.end());
    }

    if (this.#ownsReaderPool) {
      closePromises.push(this.#readerPool.end());
    }

    await Promise.all(closePromises);
  }
}
