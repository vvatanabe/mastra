import { describe, it, expect, vi, beforeEach } from 'vitest';

import { WorkflowsPGRW } from './rw.js';

import type { WorkflowsPG } from './index.js';

/**
 * Mock implementations for WorkflowsPG
 */
function createMockWorkflowsPG(): WorkflowsPG {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    dangerouslyClearAll: vi.fn().mockResolvedValue(undefined),
    // Read methods
    loadWorkflowSnapshot: vi.fn().mockResolvedValue(null),
    listWorkflowRuns: vi.fn().mockResolvedValue({ runs: [], total: 0 }),
    getWorkflowRunById: vi.fn().mockResolvedValue(null),
    // Write methods
    persistWorkflowSnapshot: vi.fn().mockResolvedValue(undefined),
    deleteWorkflowRunById: vi.fn().mockResolvedValue(undefined),
    updateWorkflowResults: vi.fn().mockResolvedValue({}),
    updateWorkflowState: vi.fn().mockResolvedValue(undefined),
  } as unknown as WorkflowsPG;
}

describe('WorkflowsPGRW', () => {
  let mockWriter: WorkflowsPG;
  let mockReader: WorkflowsPG;
  let facade: WorkflowsPGRW;

  beforeEach(() => {
    mockWriter = createMockWorkflowsPG();
    mockReader = createMockWorkflowsPG();

    facade = new WorkflowsPGRW({
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
    it('should route loadWorkflowSnapshot() to reader', async () => {
      const params = { runId: 'run-123', workflowName: 'test-workflow' };
      await facade.loadWorkflowSnapshot(params);

      expect(vi.mocked(mockReader.loadWorkflowSnapshot)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.loadWorkflowSnapshot)).not.toHaveBeenCalled();
    });

    it('should route listWorkflowRuns() to reader', async () => {
      await facade.listWorkflowRuns({});

      expect(vi.mocked(mockReader.listWorkflowRuns)).toHaveBeenCalledWith({});
      expect(vi.mocked(mockWriter.listWorkflowRuns)).not.toHaveBeenCalled();
    });

    it('should route listWorkflowRuns() with filters to reader', async () => {
      const params = { workflowName: 'test-workflow', page: 1, perPage: 10 };
      await facade.listWorkflowRuns(params);

      expect(vi.mocked(mockReader.listWorkflowRuns)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.listWorkflowRuns)).not.toHaveBeenCalled();
    });

    it('should route getWorkflowRunById() to reader', async () => {
      const params = { runId: 'run-123' };
      await facade.getWorkflowRunById(params);

      expect(vi.mocked(mockReader.getWorkflowRunById)).toHaveBeenCalledWith(params);
      expect(vi.mocked(mockWriter.getWorkflowRunById)).not.toHaveBeenCalled();
    });
  });

  describe('Write Methods → Writer Pool', () => {
    it('should route persistWorkflowSnapshot() to writer', async () => {
      const params = { runId: 'run-1', workflowName: 'test', snapshot: {} };
      await facade.persistWorkflowSnapshot(params as Parameters<typeof facade.persistWorkflowSnapshot>[0]);

      expect(vi.mocked(mockWriter.persistWorkflowSnapshot)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.persistWorkflowSnapshot)).not.toHaveBeenCalled();
    });

    it('should route deleteWorkflowRunById() to writer', async () => {
      await facade.deleteWorkflowRunById({ runId: 'run-1', workflowName: 'test' });

      expect(vi.mocked(mockWriter.deleteWorkflowRunById)).toHaveBeenCalledWith({
        runId: 'run-1',
        workflowName: 'test',
      });
      expect(vi.mocked(mockReader.deleteWorkflowRunById)).not.toHaveBeenCalled();
    });

    it('should route updateWorkflowResults() to writer', async () => {
      const params = {
        workflowName: 'test',
        runId: 'run-1',
        stepId: 'step-1',
        result: { status: 'success' },
        requestContext: {},
      };
      await facade.updateWorkflowResults(params as Parameters<typeof facade.updateWorkflowResults>[0]);

      expect(vi.mocked(mockWriter.updateWorkflowResults)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.updateWorkflowResults)).not.toHaveBeenCalled();
    });

    it('should route updateWorkflowState() to writer', async () => {
      const params = { workflowName: 'test', runId: 'run-1', opts: {} };
      await facade.updateWorkflowState(params as Parameters<typeof facade.updateWorkflowState>[0]);

      expect(vi.mocked(mockWriter.updateWorkflowState)).toHaveBeenCalled();
      expect(vi.mocked(mockReader.updateWorkflowState)).not.toHaveBeenCalled();
    });
  });

  describe('FR-020: No Reader → Writer Fallback', () => {
    it('should propagate reader errors without falling back to writer', async () => {
      const error = new Error('Reader connection failed');
      vi.mocked(mockReader.loadWorkflowSnapshot).mockRejectedValue(error);

      await expect(facade.loadWorkflowSnapshot({ runId: 'run-123', workflowName: 'test' })).rejects.toThrow(
        'Reader connection failed',
      );

      expect(vi.mocked(mockReader.loadWorkflowSnapshot)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.loadWorkflowSnapshot)).not.toHaveBeenCalled();
    });

    it('should propagate reader errors for listWorkflowRuns without fallback', async () => {
      const error = new Error('Reader unavailable');
      vi.mocked(mockReader.listWorkflowRuns).mockRejectedValue(error);

      await expect(facade.listWorkflowRuns({})).rejects.toThrow('Reader unavailable');

      expect(vi.mocked(mockReader.listWorkflowRuns)).toHaveBeenCalled();
      expect(vi.mocked(mockWriter.listWorkflowRuns)).not.toHaveBeenCalled();
    });
  });

  describe('Single-pool mode (no reader)', () => {
    it('should use writer as reader when reader is not provided', async () => {
      const writerOnlyFacade = new WorkflowsPGRW({ writer: mockWriter });

      await writerOnlyFacade.loadWorkflowSnapshot({ runId: 'run-123', workflowName: 'test' });

      // When no reader, writer is used for reads
      expect(vi.mocked(mockWriter.loadWorkflowSnapshot)).toHaveBeenCalledWith({
        runId: 'run-123',
        workflowName: 'test',
      });
    });
  });
});
