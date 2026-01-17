import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ObservabilityPGRW } from './rw.js';

import type { ObservabilityPG } from './index.js';

/**
 * Mock implementations for ObservabilityPG
 */
function createMockObservabilityPG(): ObservabilityPG {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    dangerouslyClearAll: vi.fn().mockResolvedValue(undefined),
    // Read methods
    getSpan: vi.fn().mockResolvedValue(null),
    getRootSpan: vi.fn().mockResolvedValue(null),
    getTrace: vi.fn().mockResolvedValue(null),
    listTraces: vi.fn().mockResolvedValue({ traces: [], total: 0 }),
    // Write methods
    createSpan: vi.fn().mockResolvedValue(undefined),
    updateSpan: vi.fn().mockResolvedValue(undefined),
    batchCreateSpans: vi.fn().mockResolvedValue(undefined),
    batchUpdateSpans: vi.fn().mockResolvedValue(undefined),
    batchDeleteTraces: vi.fn().mockResolvedValue(undefined),
  } as unknown as ObservabilityPG;
}

describe('ObservabilityPGRW', () => {
  let mockWriter: ObservabilityPG;
  let mockReader: ObservabilityPG;
  let facade: ObservabilityPGRW;

  beforeEach(() => {
    mockWriter = createMockObservabilityPG();
    mockReader = createMockObservabilityPG();

    facade = new ObservabilityPGRW({
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
    it('should route getSpan() to reader', async () => {
      const params = { traceId: 'trace-123', spanId: 'span-123' };
      await facade.getSpan(params);

      expect(vi.mocked(mockReader.getSpan)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.getSpan)).not.toHaveBeenCalled();
    });

    it('should route getRootSpan() to reader', async () => {
      const params = { traceId: 'trace-123' };
      await facade.getRootSpan(params);

      expect(vi.mocked(mockReader.getRootSpan)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.getRootSpan)).not.toHaveBeenCalled();
    });

    it('should route getTrace() to reader', async () => {
      const params = { traceId: 'trace-123' };
      await facade.getTrace(params);

      expect(vi.mocked(mockReader.getTrace)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.getTrace)).not.toHaveBeenCalled();
    });

    it('should route listTraces() to reader', async () => {
      await facade.listTraces({});

      expect(vi.mocked(mockReader.listTraces)).toHaveBeenCalledWith({});
      expect(vi.mocked(mockWriter.listTraces)).not.toHaveBeenCalled();
    });

    it('should route listTraces() with filters to reader', async () => {
      const params = { spanType: 'agent' as const, page: 1, perPage: 10 };
      await facade.listTraces(params);

      expect(vi.mocked(mockReader.listTraces)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listTraces)).not.toHaveBeenCalled();
    });
  });

  describe('Write Methods → Writer Pool', () => {
    it('should route createSpan() to writer', async () => {
      const params = { span: { traceId: 'trace-1', spanId: 'span-1', name: 'test' } };
      await facade.createSpan(params as Parameters<typeof facade.createSpan>[0]);

      expect(vi.mocked(mockWriter.createSpan)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.createSpan)).not.toHaveBeenCalled();
    });

    it('should route updateSpan() to writer', async () => {
      const params = { span: { traceId: 'trace-1', spanId: 'span-1', name: 'updated' } };
      await facade.updateSpan(params as Parameters<typeof facade.updateSpan>[0]);

      expect(vi.mocked(mockWriter.updateSpan)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.updateSpan)).not.toHaveBeenCalled();
    });

    it('should route batchCreateSpans() to writer', async () => {
      const params = { spans: [{ traceId: 'trace-1', spanId: 'span-1', name: 'test' }] };
      await facade.batchCreateSpans(params as Parameters<typeof facade.batchCreateSpans>[0]);

      expect(vi.mocked(mockWriter.batchCreateSpans)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.batchCreateSpans)).not.toHaveBeenCalled();
    });

    it('should route batchUpdateSpans() to writer', async () => {
      const params = { spans: [{ traceId: 'trace-1', spanId: 'span-1', name: 'updated' }] };
      await facade.batchUpdateSpans(params as Parameters<typeof facade.batchUpdateSpans>[0]);

      expect(vi.mocked(mockWriter.batchUpdateSpans)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.batchUpdateSpans)).not.toHaveBeenCalled();
    });

    it('should route batchDeleteTraces() to writer', async () => {
      const params = { traceIds: ['trace-1', 'trace-2'] };
      await facade.batchDeleteTraces(params);

      expect(vi.mocked(mockWriter.batchDeleteTraces)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.batchDeleteTraces)).not.toHaveBeenCalled();
    });
  });

  describe('FR-020: No Reader → Writer Fallback', () => {
    it('should propagate reader errors without falling back to writer', async () => {
      const error = new Error('Reader connection failed');
      vi.mocked(mockReader.getSpan).mockRejectedValue(error);

      await expect(
        facade.getSpan({ traceId: 'trace-123', spanId: 'span-123' }),
      ).rejects.toThrow('Reader connection failed');

      expect(vi.mocked(mockReader.getSpan)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.getSpan)).not.toHaveBeenCalled();
    });

    it('should propagate reader errors for listTraces without fallback', async () => {
      const error = new Error('Reader unavailable');
      vi.mocked(mockReader.listTraces).mockRejectedValue(error);

      await expect(facade.listTraces({})).rejects.toThrow('Reader unavailable');

      expect(vi.mocked(mockReader.listTraces)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.listTraces)).not.toHaveBeenCalled();
    });
  });

  describe('Single-pool mode (no reader)', () => {
    it('should use writer as reader when reader is not provided', async () => {
      const writerOnlyFacade = new ObservabilityPGRW({ writer: mockWriter });

      await writerOnlyFacade.getTrace({ traceId: 'trace-123' });

      // When no reader, writer is used for reads
      expect(vi.mocked(mockWriter.getTrace)).toHaveBeenCalledWith({ traceId: 'trace-123' });
    });
  });
});
