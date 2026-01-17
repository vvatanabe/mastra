import { describe, it, expect, vi, beforeEach } from 'vitest';

import { AgentsPGRW } from './rw.js';

import type { AgentsPG } from './index.js';

/**
 * Mock implementations for AgentsPG
 */
function createMockAgentsPG(): AgentsPG {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    dangerouslyClearAll: vi.fn().mockResolvedValue(undefined),
    // Read methods
    getAgentById: vi.fn().mockResolvedValue(null),
    listAgents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    // Write methods
    createAgent: vi.fn().mockResolvedValue({ id: 'agent-1' }),
    updateAgent: vi.fn().mockResolvedValue({ id: 'agent-1' }),
    deleteAgent: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentsPG;
}

describe('AgentsPGRW', () => {
  let mockWriter: AgentsPG;
  let mockReader: AgentsPG;
  let facade: AgentsPGRW;

  beforeEach(() => {
    mockWriter = createMockAgentsPG();
    mockReader = createMockAgentsPG();

    facade = new AgentsPGRW({
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
    it('should route getAgentById() to reader', async () => {
      const params = { id: 'agent-123' };
      await facade.getAgentById(params);

      expect(vi.mocked(mockReader.getAgentById)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.getAgentById)).not.toHaveBeenCalled();
    });

    it('should route listAgents() to reader', async () => {
      await facade.listAgents({});

      expect(vi.mocked(mockReader.listAgents)).toHaveBeenCalledWith({});
      expect(vi.mocked(mockWriter.listAgents)).not.toHaveBeenCalled();
    });

    it('should route listAgents() with pagination to reader', async () => {
      const params = { page: 1, perPage: 10 };
      await facade.listAgents(params);

      expect(vi.mocked(mockReader.listAgents)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listAgents)).not.toHaveBeenCalled();
    });
  });

  describe('Write Methods → Writer Pool', () => {
    it('should route createAgent() to writer', async () => {
      const agent = { name: 'Test Agent' };
      await facade.createAgent({ agent } as Parameters<typeof facade.createAgent>[0]);

      expect(vi.mocked(mockWriter.createAgent)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.createAgent)).not.toHaveBeenCalled();
    });

    it('should route updateAgent() to writer (FR-019: even if internally reads)', async () => {
      const params = { id: 'agent-1', name: 'Updated Agent' };
      await facade.updateAgent(params as Parameters<typeof facade.updateAgent>[0]);

      expect(vi.mocked(mockWriter.updateAgent)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.updateAgent)).not.toHaveBeenCalled();
    });

    it('should route deleteAgent() to writer', async () => {
      await facade.deleteAgent({ id: 'agent-1' });

      expect(vi.mocked(mockWriter.deleteAgent)).toHaveBeenCalledWith({ id: 'agent-1' });
      expect(vi.mocked(mockReader.deleteAgent)).not.toHaveBeenCalled();
    });
  });

  describe('FR-020: No Reader → Writer Fallback', () => {
    it('should propagate reader errors without falling back to writer', async () => {
      const error = new Error('Reader connection failed');
      vi.mocked(mockReader.getAgentById).mockRejectedValue(error);

      await expect(facade.getAgentById({ id: 'agent-123' })).rejects.toThrow('Reader connection failed');

      expect(vi.mocked(mockReader.getAgentById)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.getAgentById)).not.toHaveBeenCalled();
    });

    it('should propagate reader errors for listAgents without fallback', async () => {
      const error = new Error('Reader unavailable');
      vi.mocked(mockReader.listAgents).mockRejectedValue(error);

      await expect(facade.listAgents({})).rejects.toThrow('Reader unavailable');

      expect(vi.mocked(mockReader.listAgents)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.listAgents)).not.toHaveBeenCalled();
    });
  });

  describe('Single-pool mode (no reader)', () => {
    it('should use writer as reader when reader is not provided', async () => {
      const writerOnlyFacade = new AgentsPGRW({ writer: mockWriter });

      await writerOnlyFacade.getAgentById({ id: 'agent-123' });

      // When no reader, writer is used for reads
      expect(vi.mocked(mockWriter.getAgentById)).toHaveBeenCalledWith({ id: 'agent-123' });
    });
  });
});
