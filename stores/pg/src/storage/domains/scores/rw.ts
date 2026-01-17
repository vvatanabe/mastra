import type { ListScoresResponse, SaveScorePayload, ScoreRowData, ScoringSource } from '@mastra/core/evals';
import { ScoresStorage } from '@mastra/core/storage';
import type { StoragePagination } from '@mastra/core/storage';

import type { PgDomainClientConfig } from '../../db';
import { isPgDomainClientConfig } from '../../rw-types';
import type { RWDomainConfig } from '../../rw-types';

import { ScoresPG } from './index';

/**
 * Read/Write pool separation facade for Scores domain.
 *
 * Routes read operations to the reader pool and write operations to the writer pool
 * based on the routing table in the feature specification.
 *
 * **Routing Table:**
 * - **Reader**: `getScoreById`, `listScoresByScorerId`, `listScoresByRunId`, `listScoresByEntityId`, `listScoresBySpan`
 * - **Writer**: `saveScore`, `init`, `dangerouslyClearAll`
 *
 * @example
 * ```typescript
 * const scoresFacade = new ScoresPGRW({
 *   writer: { client: writerDbClient, schemaName: 'public' },
 *   reader: { client: readerDbClient, schemaName: 'public' },
 * });
 *
 * // Read → replica
 * const score = await scoresFacade.getScoreById({ id: 'score_123' });
 *
 * // Write → primary
 * await scoresFacade.saveScore({ ... });
 * ```
 */
export class ScoresPGRW extends ScoresStorage {
  readonly #writer: ScoresPG;
  readonly #reader: ScoresPG;

  /**
   * Creates a new ScoresPGRW facade with read/write separation.
   *
   * @param config - Configuration with writer and optional reader (can be configs or pre-created instances)
   */
  constructor(config: RWDomainConfig<PgDomainClientConfig | ScoresPG>) {
    super();
    // Support both config objects and pre-created instances (for testing)
    this.#writer = isPgDomainClientConfig(config.writer) ? new ScoresPG(config.writer) : config.writer;
    if (config.reader) {
      this.#reader = isPgDomainClientConfig(config.reader) ? new ScoresPG(config.reader) : config.reader;
    } else {
      // If no reader provided, use writer for reads (single-pool mode)
      this.#reader = this.#writer;
    }
  }

  // ========== Writer Operations ==========

  /**
   * Initialize the scores domain tables (writer only).
   * DDL operations are always routed to the writer pool.
   */
  async init(): Promise<void> {
    return this.#writer.init();
  }

  /**
   * Clear all scores domain data (writer only).
   */
  async dangerouslyClearAll(): Promise<void> {
    return this.#writer.dangerouslyClearAll();
  }

  /**
   * Save a score (writer).
   */
  async saveScore(score: SaveScorePayload): Promise<{ score: ScoreRowData }> {
    return this.#writer.saveScore(score);
  }

  // ========== Reader Operations ==========

  /**
   * Get a score by ID (reader).
   */
  async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
    return this.#reader.getScoreById({ id });
  }

  /**
   * List scores by scorer ID (reader).
   */
  async listScoresByScorerId(args: {
    scorerId: string;
    pagination: StoragePagination;
    entityId?: string;
    entityType?: string;
    source?: ScoringSource;
  }): Promise<ListScoresResponse> {
    return this.#reader.listScoresByScorerId(args);
  }

  /**
   * List scores by run ID (reader).
   */
  async listScoresByRunId(args: { runId: string; pagination: StoragePagination }): Promise<ListScoresResponse> {
    return this.#reader.listScoresByRunId(args);
  }

  /**
   * List scores by entity ID (reader).
   */
  async listScoresByEntityId(args: {
    entityId: string;
    entityType: string;
    pagination: StoragePagination;
  }): Promise<ListScoresResponse> {
    return this.#reader.listScoresByEntityId(args);
  }

  /**
   * List scores by span (reader).
   */
  async listScoresBySpan(args: {
    traceId: string;
    spanId: string;
    pagination: StoragePagination;
  }): Promise<ListScoresResponse> {
    return this.#reader.listScoresBySpan(args);
  }
}
