import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ScoresPGRW } from './rw.js';

import type { ScoresPG } from './index.js';

/**
 * Mock implementations for ScoresPG
 */
function createMockScoresPG(): ScoresPG {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    dangerouslyClearAll: vi.fn().mockResolvedValue(undefined),
    // Read methods
    getScoreById: vi.fn().mockResolvedValue(null),
    listScoresByScorerId: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    listScoresByRunId: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    listScoresByEntityId: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    listScoresBySpan: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    // Write methods
    saveScore: vi.fn().mockResolvedValue({ score: { id: 'score-1' } }),
  } as unknown as ScoresPG;
}

describe('ScoresPGRW', () => {
  let mockWriter: ScoresPG;
  let mockReader: ScoresPG;
  let facade: ScoresPGRW;

  beforeEach(() => {
    mockWriter = createMockScoresPG();
    mockReader = createMockScoresPG();

    facade = new ScoresPGRW({
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
    it('should route getScoreById() to reader', async () => {
      const params = { id: 'score-123' };
      await facade.getScoreById(params);

      expect(vi.mocked(mockReader.getScoreById)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.getScoreById)).not.toHaveBeenCalled();
    });

    it('should route listScoresByScorerId() to reader', async () => {
      const params = { scorerId: 'scorer-1', pagination: { page: 1, perPage: 10 } };
      await facade.listScoresByScorerId(params);

      expect(vi.mocked(mockReader.listScoresByScorerId)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listScoresByScorerId)).not.toHaveBeenCalled();
    });

    it('should route listScoresByRunId() to reader', async () => {
      const params = { runId: 'run-123', pagination: { page: 1, perPage: 10 } };
      await facade.listScoresByRunId(params);

      expect(vi.mocked(mockReader.listScoresByRunId)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listScoresByRunId)).not.toHaveBeenCalled();
    });

    it('should route listScoresByEntityId() to reader', async () => {
      const params = { entityId: 'entity-123', entityType: 'workflow', pagination: { page: 1, perPage: 10 } };
      await facade.listScoresByEntityId(params);

      expect(vi.mocked(mockReader.listScoresByEntityId)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listScoresByEntityId)).not.toHaveBeenCalled();
    });

    it('should route listScoresBySpan() to reader', async () => {
      const params = { traceId: 'trace-123', spanId: 'span-123', pagination: { page: 1, perPage: 10 } };
      await facade.listScoresBySpan(params);

      expect(vi.mocked(mockReader.listScoresBySpan)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listScoresBySpan)).not.toHaveBeenCalled();
    });
  });

  describe('Write Methods → Writer Pool', () => {
    it('should route saveScore() to writer', async () => {
      const params = {
        scorerId: 'scorer-1',
        runId: 'run-1',
        entity: { id: 'entity-1', type: 'workflow' },
        score: 0.95,
        scorer: { name: 'accuracy' },
        source: 'LIVE' as const,
      };
      await facade.saveScore(params as Parameters<typeof facade.saveScore>[0]);

      expect(vi.mocked(mockWriter.saveScore)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.saveScore)).not.toHaveBeenCalled();
    });
  });

  describe('FR-020: No Reader → Writer Fallback', () => {
    it('should propagate reader errors without falling back to writer', async () => {
      const error = new Error('Reader connection failed');
      vi.mocked(mockReader.getScoreById).mockRejectedValue(error);

      await expect(facade.getScoreById({ id: 'score-123' })).rejects.toThrow('Reader connection failed');

      expect(vi.mocked(mockReader.getScoreById)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.getScoreById)).not.toHaveBeenCalled();
    });

    it('should propagate reader errors for listScoresByScorerId without fallback', async () => {
      const error = new Error('Reader unavailable');
      vi.mocked(mockReader.listScoresByScorerId).mockRejectedValue(error);

      await expect(
        facade.listScoresByScorerId({ scorerId: 'scorer-1', pagination: { page: 1, perPage: 10 } }),
      ).rejects.toThrow('Reader unavailable');

      expect(vi.mocked(mockReader.listScoresByScorerId)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.listScoresByScorerId)).not.toHaveBeenCalled();
    });
  });

  describe('Single-pool mode (no reader)', () => {
    it('should use writer as reader when reader is not provided', async () => {
      const writerOnlyFacade = new ScoresPGRW({ writer: mockWriter });

      await writerOnlyFacade.getScoreById({ id: 'score-123' });

      // When no reader, writer is used for reads
      expect(vi.mocked(mockWriter.getScoreById)).toHaveBeenCalledWith({ id: 'score-123' });
    });
  });
});
