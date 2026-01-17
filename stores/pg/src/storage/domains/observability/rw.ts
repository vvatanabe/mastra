import { ObservabilityStorage } from '@mastra/core/storage';
import type {
  BatchCreateSpansArgs,
  BatchDeleteTracesArgs,
  BatchUpdateSpansArgs,
  CreateSpanArgs,
  GetRootSpanArgs,
  GetRootSpanResponse,
  GetSpanArgs,
  GetSpanResponse,
  GetTraceArgs,
  GetTraceResponse,
  ListTracesArgs,
  ListTracesResponse,
  TracingStorageStrategy,
  UpdateSpanArgs,
} from '@mastra/core/storage';

import type { PgDomainClientConfig } from '../../db';
import { isPgDomainClientConfig } from '../../rw-types';
import type { RWDomainConfig } from '../../rw-types';

import { ObservabilityPG } from './index';

/**
 * Read/Write pool separation facade for Observability domain.
 *
 * Routes read operations to the reader pool and write operations to the writer pool
 * based on the routing table in the feature specification.
 *
 * **Routing Table:**
 * - **Reader**: `getSpan`, `getRootSpan`, `getTrace`, `listTraces`
 * - **Writer**: `createSpan`, `updateSpan`, `batchCreateSpans`, `batchUpdateSpans`, `batchDeleteTraces`, `init`, `dangerouslyClearAll`
 *
 * @example
 * ```typescript
 * const observabilityFacade = new ObservabilityPGRW({
 *   writer: { client: writerDbClient, schemaName: 'public' },
 *   reader: { client: readerDbClient, schemaName: 'public' },
 * });
 *
 * // Read → replica
 * const span = await observabilityFacade.getSpan({ traceId: 't_1', spanId: 's_1' });
 *
 * // Write → primary
 * await observabilityFacade.createSpan({ span: {...} });
 * ```
 */
export class ObservabilityPGRW extends ObservabilityStorage {
  readonly #writer: ObservabilityPG;
  readonly #reader: ObservabilityPG;

  /**
   * Creates a new ObservabilityPGRW facade with read/write separation.
   *
   * @param config - Configuration with writer and optional reader (can be configs or pre-created instances)
   */
  constructor(config: RWDomainConfig<PgDomainClientConfig | ObservabilityPG>) {
    super();
    // Support both config objects and pre-created instances (for testing)
    this.#writer = isPgDomainClientConfig(config.writer) ? new ObservabilityPG(config.writer) : config.writer;
    if (config.reader) {
      this.#reader = isPgDomainClientConfig(config.reader) ? new ObservabilityPG(config.reader) : config.reader;
    } else {
      // If no reader provided, use writer for reads (single-pool mode)
      this.#reader = this.#writer;
    }
  }

  // ========== Tracing Strategy ==========

  /**
   * Provides hints for tracing strategy selection.
   * Delegates to the writer's strategy.
   */
  public override get tracingStrategy(): {
    preferred: TracingStorageStrategy;
    supported: TracingStorageStrategy[];
  } {
    return this.#writer.tracingStrategy;
  }

  // ========== Writer Operations ==========

  /**
   * Initialize the observability domain tables (writer only).
   * DDL operations are always routed to the writer pool.
   */
  async init(): Promise<void> {
    return this.#writer.init();
  }

  /**
   * Clear all observability domain data (writer only).
   */
  async dangerouslyClearAll(): Promise<void> {
    return this.#writer.dangerouslyClearAll();
  }

  /**
   * Create a single span (writer).
   */
  async createSpan(args: CreateSpanArgs): Promise<void> {
    return this.#writer.createSpan(args);
  }

  /**
   * Update a span (writer).
   */
  async updateSpan(args: UpdateSpanArgs): Promise<void> {
    return this.#writer.updateSpan(args);
  }

  /**
   * Batch create spans (writer).
   */
  async batchCreateSpans(args: BatchCreateSpansArgs): Promise<void> {
    return this.#writer.batchCreateSpans(args);
  }

  /**
   * Batch update spans (writer).
   */
  async batchUpdateSpans(args: BatchUpdateSpansArgs): Promise<void> {
    return this.#writer.batchUpdateSpans(args);
  }

  /**
   * Batch delete traces (writer).
   */
  async batchDeleteTraces(args: BatchDeleteTracesArgs): Promise<void> {
    return this.#writer.batchDeleteTraces(args);
  }

  // ========== Reader Operations ==========

  /**
   * Get a span by trace and span ID (reader).
   */
  async getSpan(args: GetSpanArgs): Promise<GetSpanResponse | null> {
    return this.#reader.getSpan(args);
  }

  /**
   * Get the root span of a trace (reader).
   */
  async getRootSpan(args: GetRootSpanArgs): Promise<GetRootSpanResponse | null> {
    return this.#reader.getRootSpan(args);
  }

  /**
   * Get a trace with all its spans (reader).
   */
  async getTrace(args: GetTraceArgs): Promise<GetTraceResponse | null> {
    return this.#reader.getTrace(args);
  }

  /**
   * List traces with filtering and pagination (reader).
   */
  async listTraces(args: ListTracesArgs): Promise<ListTracesResponse> {
    return this.#reader.listTraces(args);
  }
}
