import { AgentsStorage } from '@mastra/core/storage';
import type {
  StorageAgentType,
  StorageCreateAgentInput,
  StorageUpdateAgentInput,
  StorageListAgentsInput,
  StorageListAgentsOutput,
} from '@mastra/core/storage';

import type { PgDomainClientConfig } from '../../db';
import { isPgDomainClientConfig } from '../../rw-types';
import type { RWDomainConfig } from '../../rw-types';

import { AgentsPG } from './index';

/**
 * Read/Write pool separation facade for Agents domain.
 *
 * Routes read operations to the reader pool and write operations to the writer pool
 * based on the routing table in the feature specification.
 *
 * **Routing Table:**
 * - **Reader**: `getAgentById`, `listAgents`
 * - **Writer**: `createAgent`, `updateAgent`, `deleteAgent`, `init`, `dangerouslyClearAll`
 *
 * @example
 * ```typescript
 * const agentsFacade = new AgentsPGRW({
 *   writer: { client: writerDbClient, schemaName: 'public' },
 *   reader: { client: readerDbClient, schemaName: 'public' },
 * });
 *
 * // Read → replica
 * const agent = await agentsFacade.getAgentById({ id: 'agent_123' });
 *
 * // Write → primary
 * await agentsFacade.createAgent({ agent: { ... } });
 * ```
 */
export class AgentsPGRW extends AgentsStorage {
  readonly #writer: AgentsPG;
  readonly #reader: AgentsPG;

  /**
   * Creates a new AgentsPGRW facade with read/write separation.
   *
   * @param config - Configuration with writer and optional reader (can be configs or pre-created instances)
   */
  constructor(config: RWDomainConfig<PgDomainClientConfig | AgentsPG>) {
    super();
    // Support both config objects and pre-created instances (for testing)
    this.#writer = isPgDomainClientConfig(config.writer) ? new AgentsPG(config.writer) : config.writer;
    if (config.reader) {
      this.#reader = isPgDomainClientConfig(config.reader) ? new AgentsPG(config.reader) : config.reader;
    } else {
      // If no reader provided, use writer for reads (single-pool mode)
      this.#reader = this.#writer;
    }
  }

  // ========== Writer Operations ==========

  /**
   * Initialize the agents domain tables (writer only).
   * DDL operations are always routed to the writer pool.
   */
  async init(): Promise<void> {
    return this.#writer.init();
  }

  /**
   * Clear all agents domain data (writer only).
   */
  async dangerouslyClearAll(): Promise<void> {
    return this.#writer.dangerouslyClearAll();
  }

  /**
   * Create a new agent (writer).
   */
  async createAgent({ agent }: { agent: StorageCreateAgentInput }): Promise<StorageAgentType> {
    return this.#writer.createAgent({ agent });
  }

  /**
   * Update an existing agent (writer).
   * Note: This method reads then writes, but routes to writer per FR-019.
   */
  async updateAgent({ id, ...updates }: StorageUpdateAgentInput): Promise<StorageAgentType> {
    return this.#writer.updateAgent({ id, ...updates });
  }

  /**
   * Delete an agent (writer).
   */
  async deleteAgent({ id }: { id: string }): Promise<void> {
    return this.#writer.deleteAgent({ id });
  }

  // ========== Reader Operations ==========

  /**
   * Get an agent by ID (reader).
   */
  async getAgentById({ id }: { id: string }): Promise<StorageAgentType | null> {
    return this.#reader.getAgentById({ id });
  }

  /**
   * List agents with optional pagination (reader).
   */
  async listAgents(args?: StorageListAgentsInput): Promise<StorageListAgentsOutput> {
    return this.#reader.listAgents(args);
  }
}
