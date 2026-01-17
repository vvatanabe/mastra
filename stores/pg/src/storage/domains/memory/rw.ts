import type { MastraMessageContentV2 } from '@mastra/core/agent';
import type { MastraDBMessage, StorageThreadType } from '@mastra/core/memory';
import { MemoryStorage } from '@mastra/core/storage';
import type {
  StorageResourceType,
  StorageListMessagesInput,
  StorageListMessagesOutput,
  StorageListThreadsByResourceIdInput,
  StorageListThreadsByResourceIdOutput,
  StorageCloneThreadInput,
  StorageCloneThreadOutput,
} from '@mastra/core/storage';

import type { PgDomainClientConfig } from '../../db';
import { isPgDomainClientConfig } from '../../rw-types';
import type { RWDomainConfig } from '../../rw-types';

import { MemoryPG } from './index';

/**
 * Read/Write pool separation facade for Memory domain.
 *
 * Routes read operations to the reader pool and write operations to the writer pool
 * based on the routing table in the feature specification.
 *
 * **Routing Table:**
 * - **Reader**: `getThreadById`, `listThreadsByResourceId`, `listMessages`, `listMessagesById`, `getResourceById`
 * - **Writer**: `saveThread`, `updateThread`, `deleteThread`, `saveMessages`, `updateMessages`, `deleteMessages`, `saveResource`, `updateResource`, `cloneThread`, `init`, `dangerouslyClearAll`
 *
 * @example
 * ```typescript
 * const memoryFacade = new MemoryPGRW({
 *   writer: { client: writerDbClient, schemaName: 'public' },
 *   reader: { client: readerDbClient, schemaName: 'public' },
 * });
 *
 * // Read → replica
 * const thread = await memoryFacade.getThreadById({ threadId: 't_123' });
 *
 * // Write → primary
 * await memoryFacade.saveThread({ thread: { ... } });
 * ```
 */
export class MemoryPGRW extends MemoryStorage {
  readonly #writer: MemoryPG;
  readonly #reader: MemoryPG;

  /**
   * Creates a new MemoryPGRW facade with read/write separation.
   *
   * @param config - Configuration with writer and optional reader (can be configs or pre-created instances)
   */
  constructor(config: RWDomainConfig<PgDomainClientConfig | MemoryPG>) {
    super();
    // Support both config objects and pre-created instances (for testing)
    this.#writer = isPgDomainClientConfig(config.writer) ? new MemoryPG(config.writer) : config.writer;
    if (config.reader) {
      this.#reader = isPgDomainClientConfig(config.reader) ? new MemoryPG(config.reader) : config.reader;
    } else {
      // If no reader provided, use writer for reads (single-pool mode)
      this.#reader = this.#writer;
    }
  }

  // ========== Writer Operations ==========

  /**
   * Initialize the memory domain tables (writer only).
   * DDL operations are always routed to the writer pool.
   */
  async init(): Promise<void> {
    return this.#writer.init();
  }

  /**
   * Clear all memory domain data (writer only).
   */
  async dangerouslyClearAll(): Promise<void> {
    return this.#writer.dangerouslyClearAll();
  }

  /**
   * Save a thread (writer).
   */
  async saveThread({ thread }: { thread: StorageThreadType }): Promise<StorageThreadType> {
    return this.#writer.saveThread({ thread });
  }

  /**
   * Update a thread (writer).
   * Note: This method reads then writes, but routes to writer per FR-019.
   */
  async updateThread({
    id,
    title,
    metadata,
  }: {
    id: string;
    title: string;
    metadata: Record<string, unknown>;
  }): Promise<StorageThreadType> {
    return this.#writer.updateThread({ id, title, metadata });
  }

  /**
   * Delete a thread and its messages (writer).
   */
  async deleteThread({ threadId }: { threadId: string }): Promise<void> {
    return this.#writer.deleteThread({ threadId });
  }

  /**
   * Save messages (writer - uses transaction).
   */
  async saveMessages(args: { messages: MastraDBMessage[] }): Promise<{ messages: MastraDBMessage[] }> {
    return this.#writer.saveMessages(args);
  }

  /**
   * Update messages (writer - uses transaction).
   */
  async updateMessages(args: {
    messages: (Partial<Omit<MastraDBMessage, 'createdAt'>> & {
      id: string;
      content?: { metadata?: MastraMessageContentV2['metadata']; content?: MastraMessageContentV2['content'] };
    })[];
  }): Promise<MastraDBMessage[]> {
    return this.#writer.updateMessages(args);
  }

  /**
   * Delete messages (writer).
   */
  async deleteMessages(messageIds: string[]): Promise<void> {
    return this.#writer.deleteMessages(messageIds);
  }

  /**
   * Save a resource (writer).
   */
  async saveResource({ resource }: { resource: StorageResourceType }): Promise<StorageResourceType> {
    return this.#writer.saveResource({ resource });
  }

  /**
   * Update a resource (writer).
   * Note: This method reads then writes, but routes to writer per FR-019.
   */
  async updateResource({
    resourceId,
    workingMemory,
    metadata,
  }: {
    resourceId: string;
    workingMemory?: string;
    metadata?: Record<string, unknown>;
  }): Promise<StorageResourceType> {
    return this.#writer.updateResource({ resourceId, workingMemory, metadata });
  }

  /**
   * Clone a thread (writer - uses transaction).
   */
  async cloneThread(args: StorageCloneThreadInput): Promise<StorageCloneThreadOutput> {
    return this.#writer.cloneThread(args);
  }

  // ========== Reader Operations ==========

  /**
   * Get a thread by ID (reader).
   */
  async getThreadById({ threadId }: { threadId: string }): Promise<StorageThreadType | null> {
    return this.#reader.getThreadById({ threadId });
  }

  /**
   * List threads by resource ID (reader).
   */
  async listThreadsByResourceId(
    args: StorageListThreadsByResourceIdInput,
  ): Promise<StorageListThreadsByResourceIdOutput> {
    return this.#reader.listThreadsByResourceId(args);
  }

  /**
   * List messages (reader).
   */
  async listMessages(args: StorageListMessagesInput): Promise<StorageListMessagesOutput> {
    return this.#reader.listMessages(args);
  }

  /**
   * List messages by ID (reader).
   */
  async listMessagesById({ messageIds }: { messageIds: string[] }): Promise<{ messages: MastraDBMessage[] }> {
    return this.#reader.listMessagesById({ messageIds });
  }

  /**
   * Get a resource by ID (reader).
   */
  async getResourceById({ resourceId }: { resourceId: string }): Promise<StorageResourceType | null> {
    return this.#reader.getResourceById({ resourceId });
  }
}
