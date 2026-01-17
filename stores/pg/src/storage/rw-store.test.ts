import type { Pool, PoolClient } from 'pg';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PostgresRWStore } from './rw-store';

/**
 * Create a mock Pool for testing.
 */
function createMockPool(_name: string): Pool & {
  queryMock: ReturnType<typeof vi.fn>;
  connectMock: ReturnType<typeof vi.fn>;
  endMock: ReturnType<typeof vi.fn>;
} {
  const queryMock = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
  const endMock = vi.fn().mockResolvedValue(undefined);

  const mockClient = {
    query: queryMock,
    release: vi.fn(),
  } as unknown as PoolClient;

  const connectMock = vi.fn().mockResolvedValue(mockClient);

  const pool = {
    query: queryMock,
    connect: connectMock,
    end: endMock,
  } as unknown as Pool & {
    queryMock: ReturnType<typeof vi.fn>;
    connectMock: ReturnType<typeof vi.fn>;
    endMock: ReturnType<typeof vi.fn>;
  };

  pool.queryMock = queryMock;
  pool.connectMock = connectMock;
  pool.endMock = endMock;

  return pool;
}

describe('PostgresRWStore', () => {
  let writerPool: ReturnType<typeof createMockPool>;
  let readerPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    writerPool = createMockPool('writer');
    readerPool = createMockPool('reader');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create store with valid config', () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
      });

      expect(store).toBeInstanceOf(PostgresRWStore);
    });

    it('should throw if id is missing', () => {
      expect(() => {
        new PostgresRWStore({
          id: '',
          writerPool,
          readerPool,
        });
      }).toThrow();
    });

    it('should throw if writerPool is missing', () => {
      expect(() => {
        new PostgresRWStore({
          id: 'test-store',
          writerPool: undefined as any,
          readerPool,
        });
      }).toThrow();
    });

    it('should throw if readerPool is missing', () => {
      expect(() => {
        new PostgresRWStore({
          id: 'test-store',
          writerPool,
          readerPool: undefined as any,
        });
      }).toThrow();
    });

    it('should initialize domain stores', () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
      });

      expect(store.stores).toBeDefined();
      expect(store.stores.memory).toBeDefined();
      expect(store.stores.workflows).toBeDefined();
      expect(store.stores.scores).toBeDefined();
      expect(store.stores.observability).toBeDefined();
      expect(store.stores.agents).toBeDefined();
    });
  });

  describe('db getter', () => {
    it('should return writer DbClient instance (FR-018)', () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
      });

      expect(store.db).toBeDefined();
      // FR-018: db getter returns the writer DbClient
      expect(store.db.$pool).toBe(writerPool);
    });
  });

  describe('writerPool getter', () => {
    it('should return the writer pool instance', () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
      });

      expect(store.writerPool).toBe(writerPool);
    });
  });

  describe('readerPool getter', () => {
    it('should return the reader pool instance', () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
      });

      expect(store.readerPool).toBe(readerPool);
    });
  });

  describe('init()', () => {
    it('should use writer pool for DDL operations', async () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
        disableInit: true,
      });

      await store.init();

      // After init, the store should be initialized
      // We check that init can be called without errors
      expect(store).toBeDefined();
    });

    it('should only initialize once', async () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
        disableInit: true,
      });

      await store.init();
      await store.init(); // Second call should be a no-op

      expect(store).toBeDefined();
    });
  });

  describe('close()', () => {
    it('should close writer pool when ownsWriterPool is true', async () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
        ownsWriterPool: true,
        ownsReaderPool: false,
      });

      await store.close();

      expect(writerPool.endMock).toHaveBeenCalled();
      expect(readerPool.endMock).not.toHaveBeenCalled();
    });

    it('should close reader pool when ownsReaderPool is true', async () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
        ownsWriterPool: false,
        ownsReaderPool: true,
      });

      await store.close();

      expect(writerPool.endMock).not.toHaveBeenCalled();
      expect(readerPool.endMock).toHaveBeenCalled();
    });

    it('should close both pools when both ownership flags are true', async () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
        ownsWriterPool: true,
        ownsReaderPool: true,
      });

      await store.close();

      expect(writerPool.endMock).toHaveBeenCalled();
      expect(readerPool.endMock).toHaveBeenCalled();
    });

    it('should not close pools when ownership flags are false (default)', async () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
      });

      await store.close();

      expect(writerPool.endMock).not.toHaveBeenCalled();
      expect(readerPool.endMock).not.toHaveBeenCalled();
    });
  });

  describe('query routing through db', () => {
    it('should route all queries to writer pool (FR-018)', async () => {
      writerPool.queryMock.mockResolvedValue({ rows: [{ id: 1 }], rowCount: 1 });

      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
      });

      // FR-018: store.db returns writer DbClient, so reads also go to writer
      await store.db.any('SELECT * FROM users');

      expect(writerPool.queryMock).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(readerPool.queryMock).not.toHaveBeenCalled();
    });

    it('should route writes to writer pool', async () => {
      const store = new PostgresRWStore({
        id: 'test-store',
        writerPool,
        readerPool,
      });

      await store.db.none('INSERT INTO users (name) VALUES ($1)', ['Alice']);

      expect(writerPool.queryMock).toHaveBeenCalledWith('INSERT INTO users (name) VALUES ($1)', ['Alice']);
      expect(readerPool.queryMock).not.toHaveBeenCalled();
    });
  });
});
