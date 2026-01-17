import { WorkflowsStorage } from '@mastra/core/storage';
import type { WorkflowRun, WorkflowRuns, StorageListWorkflowRunsInput, UpdateWorkflowStateOptions } from '@mastra/core/storage';
import type { StepResult, WorkflowRunState } from '@mastra/core/workflows';

import type { PgDomainClientConfig } from '../../db';
import { isPgDomainClientConfig } from '../../rw-types';
import type { RWDomainConfig } from '../../rw-types';

import { WorkflowsPG } from './index';

/**
 * Read/Write pool separation facade for Workflows domain.
 *
 * Routes read operations to the reader pool and write operations to the writer pool
 * based on the routing table in the feature specification.
 *
 * **Routing Table:**
 * - **Reader**: `loadWorkflowSnapshot`, `listWorkflowRuns`, `getWorkflowRunById`
 * - **Writer**: `persistWorkflowSnapshot` (saveWorkflowSnapshot), `deleteWorkflowRunById` (deleteWorkflowRun), `updateWorkflowResults`, `updateWorkflowState`, `init`, `dangerouslyClearAll`
 *
 * @example
 * ```typescript
 * const workflowsFacade = new WorkflowsPGRW({
 *   writer: { client: writerDbClient, schemaName: 'public' },
 *   reader: { client: readerDbClient, schemaName: 'public' },
 * });
 *
 * // Read → replica
 * const snapshot = await workflowsFacade.loadWorkflowSnapshot({ workflowName: 'wf', runId: 'run_1' });
 *
 * // Write → primary
 * await workflowsFacade.persistWorkflowSnapshot({ workflowName: 'wf', runId: 'run_1', snapshot: {...} });
 * ```
 */
export class WorkflowsPGRW extends WorkflowsStorage {
  readonly #writer: WorkflowsPG;
  readonly #reader: WorkflowsPG;

  /**
   * Creates a new WorkflowsPGRW facade with read/write separation.
   *
   * @param config - Configuration with writer and optional reader (can be configs or pre-created instances)
   */
  constructor(config: RWDomainConfig<PgDomainClientConfig | WorkflowsPG>) {
    super();
    // Support both config objects and pre-created instances (for testing)
    this.#writer = isPgDomainClientConfig(config.writer) ? new WorkflowsPG(config.writer) : config.writer;
    if (config.reader) {
      this.#reader = isPgDomainClientConfig(config.reader) ? new WorkflowsPG(config.reader) : config.reader;
    } else {
      // If no reader provided, use writer for reads (single-pool mode)
      this.#reader = this.#writer;
    }
  }

  // ========== Writer Operations ==========

  /**
   * Initialize the workflows domain tables (writer only).
   * DDL operations are always routed to the writer pool.
   */
  async init(): Promise<void> {
    return this.#writer.init();
  }

  /**
   * Clear all workflows domain data (writer only).
   */
  async dangerouslyClearAll(): Promise<void> {
    return this.#writer.dangerouslyClearAll();
  }

  /**
   * Persist a workflow snapshot (writer).
   */
  async persistWorkflowSnapshot(args: {
    workflowName: string;
    runId: string;
    resourceId?: string;
    snapshot: WorkflowRunState;
    createdAt?: Date;
    updatedAt?: Date;
  }): Promise<void> {
    return this.#writer.persistWorkflowSnapshot(args);
  }

  /**
   * Delete a workflow run by ID (writer).
   */
  async deleteWorkflowRunById(args: { runId: string; workflowName: string }): Promise<void> {
    return this.#writer.deleteWorkflowRunById(args);
  }

  /**
   * Update workflow results (writer).
   */
  updateWorkflowResults(args: {
    workflowName: string;
    runId: string;
    stepId: string;
    result: StepResult<any, any, any, any>;
    requestContext: Record<string, any>;
  }): Promise<Record<string, StepResult<any, any, any, any>>> {
    return this.#writer.updateWorkflowResults(args);
  }

  /**
   * Update workflow state (writer).
   */
  updateWorkflowState(args: {
    workflowName: string;
    runId: string;
    opts: UpdateWorkflowStateOptions;
  }): Promise<WorkflowRunState | undefined> {
    return this.#writer.updateWorkflowState(args);
  }

  // ========== Reader Operations ==========

  /**
   * Load a workflow snapshot (reader).
   */
  async loadWorkflowSnapshot(args: { workflowName: string; runId: string }): Promise<WorkflowRunState | null> {
    return this.#reader.loadWorkflowSnapshot(args);
  }

  /**
   * List workflow runs with optional filtering (reader).
   */
  async listWorkflowRuns(args?: StorageListWorkflowRunsInput): Promise<WorkflowRuns> {
    return this.#reader.listWorkflowRuns(args);
  }

  /**
   * Get a workflow run by ID (reader).
   */
  async getWorkflowRunById(args: { runId: string; workflowName?: string }): Promise<WorkflowRun | null> {
    return this.#reader.getWorkflowRunById(args);
  }
}
