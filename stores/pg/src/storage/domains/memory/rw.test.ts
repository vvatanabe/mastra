import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MemoryPGRW } from './rw.js';

import type { MemoryPG } from './index.js';

/**
 * Mock implementations for MemoryPG
 */
function createMockMemoryPG(): MemoryPG {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    dangerouslyClearAll: vi.fn().mockResolvedValue(undefined),
    // Read methods
    getThreadById: vi.fn().mockResolvedValue(null),
    listThreadsByResourceId: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    listMessages: vi.fn().mockResolvedValue({ messages: [] }),
    listMessagesById: vi.fn().mockResolvedValue({ messages: [] }),
    getResourceById: vi.fn().mockResolvedValue(null),
    // Write methods
    saveThread: vi.fn().mockResolvedValue({ id: 'thread-1' }),
    updateThread: vi.fn().mockResolvedValue({ id: 'thread-1' }),
    deleteThread: vi.fn().mockResolvedValue(undefined),
    saveMessages: vi.fn().mockResolvedValue({ messages: [] }),
    updateMessages: vi.fn().mockResolvedValue([]),
    deleteMessages: vi.fn().mockResolvedValue(undefined),
    saveResource: vi.fn().mockResolvedValue({ id: 'resource-1' }),
    updateResource: vi.fn().mockResolvedValue({ id: 'resource-1' }),
    cloneThread: vi.fn().mockResolvedValue({ thread: { id: 'thread-2' }, messages: [] }),
  } as unknown as MemoryPG;
}

describe('MemoryPGRW', () => {
  let mockWriter: MemoryPG;
  let mockReader: MemoryPG;
  let facade: MemoryPGRW;

  beforeEach(() => {
    mockWriter = createMockMemoryPG();
    mockReader = createMockMemoryPG();

    facade = new MemoryPGRW({
      writer: mockWriter,
      reader: mockReader,
    });
  });

  describe('init()', () => {
    it('should delegate init() to writer only', async () => {
      await facade.init();

      expect(vi.mocked(mockWriter.init)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(mockReader.init)).not.toHaveBeenCalled();
    });
  });

  describe('dangerouslyClearAll()', () => {
    it('should delegate dangerouslyClearAll() to writer only', async () => {
      await facade.dangerouslyClearAll();

      expect(vi.mocked(mockWriter.dangerouslyClearAll)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(mockReader.dangerouslyClearAll)).not.toHaveBeenCalled();
    });
  });

  describe('Read Methods → Reader Pool', () => {
    it('should route getThreadById() to reader', async () => {
      const threadId = 'thread-123';
      await facade.getThreadById({ threadId });

      expect(vi.mocked(mockReader.getThreadById)).toHaveBeenCalledWith({ threadId });
      expect(vi.mocked(mockWriter.getThreadById)).not.toHaveBeenCalled();
    });

    it('should route listThreadsByResourceId() to reader', async () => {
      const params = { resourceId: 'resource-123' };
      await facade.listThreadsByResourceId(params);

      expect(vi.mocked(mockReader.listThreadsByResourceId)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listThreadsByResourceId)).not.toHaveBeenCalled();
    });

    it('should route listMessages() to reader', async () => {
      const params = { threadId: 'thread-123' };
      await facade.listMessages(params);

      expect(vi.mocked(mockReader.listMessages)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listMessages)).not.toHaveBeenCalled();
    });

    it('should route listMessagesById() to reader', async () => {
      const params = { messageIds: ['msg-1', 'msg-2'] };
      await facade.listMessagesById(params);

      expect(vi.mocked(mockReader.listMessagesById)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listMessagesById)).not.toHaveBeenCalled();
    });

    it('should route getResourceById() to reader', async () => {
      const params = { resourceId: 'resource-123' };
      await facade.getResourceById(params);

      expect(vi.mocked(mockReader.getResourceById)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.getResourceById)).not.toHaveBeenCalled();
    });
  });

  describe('Write Methods → Writer Pool', () => {
    it('should route saveThread() to writer', async () => {
      const thread = { id: 'thread-1', resourceId: 'resource-1' };
      await facade.saveThread({ thread } as Parameters<typeof facade.saveThread>[0]);

      expect(vi.mocked(mockWriter.saveThread)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.saveThread)).not.toHaveBeenCalled();
    });

    it('should route updateThread() to writer (FR-019: even if internally reads)', async () => {
      const params = { id: 'thread-1', title: 'New Title', metadata: {} };
      await facade.updateThread(params);

      expect(vi.mocked(mockWriter.updateThread)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.updateThread)).not.toHaveBeenCalled();
    });

    it('should route deleteThread() to writer', async () => {
      await facade.deleteThread({ threadId: 'thread-1' });

      expect(vi.mocked(mockWriter.deleteThread)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.deleteThread)).not.toHaveBeenCalled();
    });

    it('should route saveMessages() to writer', async () => {
      const params = { messages: [{ id: 'msg-1', content: [] }] };
      await facade.saveMessages(params as Parameters<typeof facade.saveMessages>[0]);

      expect(vi.mocked(mockWriter.saveMessages)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.saveMessages)).not.toHaveBeenCalled();
    });

    it('should route updateMessages() to writer', async () => {
      const params = { messages: [{ id: 'msg-1' }] };
      await facade.updateMessages(params as Parameters<typeof facade.updateMessages>[0]);

      expect(vi.mocked(mockWriter.updateMessages)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.updateMessages)).not.toHaveBeenCalled();
    });

    it('should route deleteMessages() to writer', async () => {
      await facade.deleteMessages(['msg-1', 'msg-2']);

      expect(vi.mocked(mockWriter.deleteMessages)).toHaveBeenCalledWith(['msg-1', 'msg-2']);
      expect(vi.mocked(mockReader.deleteMessages)).not.toHaveBeenCalled();
    });

    it('should route saveResource() to writer', async () => {
      const params = { resource: { id: 'resource-1' } };
      await facade.saveResource(params as Parameters<typeof facade.saveResource>[0]);

      expect(vi.mocked(mockWriter.saveResource)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.saveResource)).not.toHaveBeenCalled();
    });

    it('should route updateResource() to writer (FR-019: reads then writes)', async () => {
      const params = { resourceId: 'resource-1', workingMemory: 'memory' };
      await facade.updateResource(params);

      expect(vi.mocked(mockWriter.updateResource)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.updateResource)).not.toHaveBeenCalled();
    });

    it('should route cloneThread() to writer', async () => {
      const params = { threadId: 'thread-1' };
      await facade.cloneThread(params);

      expect(vi.mocked(mockWriter.cloneThread)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.cloneThread)).not.toHaveBeenCalled();
    });
  });

  describe('FR-020: No Reader → Writer Fallback', () => {
    it('should propagate reader errors without falling back to writer', async () => {
      const error = new Error('Reader connection failed');
      vi.mocked(mockReader.getThreadById).mockRejectedValue(error);

      await expect(facade.getThreadById({ threadId: 'thread-123' })).rejects.toThrow('Reader connection failed');

      expect(vi.mocked(mockReader.getThreadById)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.getThreadById)).not.toHaveBeenCalled();
    });

    it('should propagate reader errors for listMessages without fallback', async () => {
      const error = new Error('Reader unavailable');
      vi.mocked(mockReader.listMessages).mockRejectedValue(error);

      await expect(facade.listMessages({ threadId: 'thread-123' })).rejects.toThrow('Reader unavailable');

      expect(vi.mocked(mockReader.listMessages)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.listMessages)).not.toHaveBeenCalled();
    });
  });

  describe('Single-pool mode (no reader)', () => {
    it('should use writer as reader when reader is not provided', async () => {
      const writerOnlyFacade = new MemoryPGRW({ writer: mockWriter });

      await writerOnlyFacade.getThreadById({ threadId: 'thread-123' });

      // When no reader, writer is used for reads
      expect(vi.mocked(mockWriter.getThreadById)).toHaveBeenCalledWith({ threadId: 'thread-123' });
    });
  });
});
