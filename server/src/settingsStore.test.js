import assert from 'assert';
import { test } from 'node:test';
import { createSettingsStore, SettingConflictError } from './settingsStore.js';

function createMockPool() {
  const handlers = [];
  const calls = [];

  return {
    on(matcher, handler) {
      handlers.push({ matcher, handler });
    },
    getCalls() {
      return calls;
    },
    async execute(sql, params = []) {
      calls.push({ sql, params });
      const handler = handlers.find(({ matcher }) => {
        if (typeof matcher === 'function') return matcher(sql, params);
        if (matcher instanceof RegExp) return matcher.test(sql);
        return matcher === sql;
      });
      if (!handler) {
        throw new Error(`No handler for SQL: ${sql}`);
      }
      return handler.handler(params, sql);
    },
  };
}

function buildStoreWithPool(pool) {
  return createSettingsStore(async () => pool);
}

test('listSettings trims string values and returns booleans', async () => {
  const pool = createMockPool();
  pool.on(/SELECT .*FROM settings ORDER BY/, () => [
    [
      {
        id: '1',
        key: ' public.key ',
        value: ' value ',
        description: 'desc ',
        secret: 0,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  ]);

  const store = buildStoreWithPool(pool);
  const settings = await store.listSettings();
  assert.strictEqual(settings.length, 1);
  assert.deepStrictEqual(settings[0], {
    id: '1',
    key: 'public.key',
    value: 'value',
    description: 'desc',
    secret: false,
    updatedAt: '2024-01-01T00:00:00.000Z',
  });
});

test('createSetting inserts through pool and sanitizes returned data', async () => {
  const pool = createMockPool();
  pool.on(/INSERT INTO settings/, (params) => {
    assert.strictEqual(params[1], 'MyKey');
    return [{ affectedRows: 1 }];
  });
  const store = buildStoreWithPool(pool);

  const created = await store.createSetting({ key: 'MyKey', value: '  some value  ', secret: true });
  assert.strictEqual(created.key, 'MyKey');
  assert.strictEqual(created.value, 'some value');
  assert.strictEqual(created.secret, true);
  assert.ok(created.updatedAt);
});

test('createSetting surfaces duplicate key errors as SettingConflictError', async () => {
  const pool = createMockPool();
  pool.on(/INSERT INTO settings/, () => {
    const error = new Error('duplicate');
    error.code = 'ER_DUP_ENTRY';
    throw error;
  });

  const store = buildStoreWithPool(pool);
  await assert.rejects(() => store.createSetting({ key: 'dup', value: 'x' }), SettingConflictError);
});

test('updateSetting returns null when item is missing', async () => {
  const pool = createMockPool();
  pool.on(/SELECT .*FROM settings WHERE id = \?/, () => [[]]);
  const store = buildStoreWithPool(pool);

  const updated = await store.updateSetting('missing', { value: 'nope' });
  assert.strictEqual(updated, null);
});

test('updateSetting updates values and handles conflicts', async () => {
  const pool = createMockPool();
  pool.on(/SELECT .*FROM settings WHERE id = \?/, () => [
    [
      {
        id: '1',
        key: 'existing',
        value: 'old',
        description: '',
        secret: 0,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  ]);
  pool.on(/UPDATE settings SET/, (params) => {
    assert.deepStrictEqual(params.slice(0, 4), ['updated', 'new', 'changed', 1]);
    return [{ affectedRows: 1 }];
  });

  const store = buildStoreWithPool(pool);
  const updated = await store.updateSetting('1', {
    key: 'updated',
    value: ' new ',
    description: 'changed',
    secret: true,
  });
  assert.strictEqual(updated.key, 'updated');
  assert.strictEqual(updated.value, 'new');
  assert.strictEqual(updated.secret, true);
});

test('updateSetting surfaces duplicate key errors', async () => {
  const pool = createMockPool();
  pool.on(/SELECT .*FROM settings WHERE id = \?/, () => [
    [
      { id: '1', key: 'existing', value: 'old', description: '', secret: 0, updatedAt: '' },
    ],
  ]);
  pool.on(/UPDATE settings SET/, () => {
    const error = new Error('duplicate');
    error.code = 'ER_DUP_ENTRY';
    throw error;
  });

  const store = buildStoreWithPool(pool);
  await assert.rejects(() => store.updateSetting('1', { key: 'conflict' }), SettingConflictError);
});

test('deleteSetting removes record after fetching it', async () => {
  const pool = createMockPool();
  let deletedId;
  pool.on(/SELECT .*FROM settings WHERE id = \?/, (params) => [
    [
      {
        id: params[0],
        key: 'example',
        value: 'v',
        description: '',
        secret: 0,
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ],
  ]);
  pool.on(/DELETE FROM settings WHERE id = \?/, (params) => {
    deletedId = params[0];
    return [{ affectedRows: 1 }];
  });

  const store = buildStoreWithPool(pool);
  const deleted = await store.deleteSetting('abc');
  assert.strictEqual(deleted.id, 'abc');
  assert.strictEqual(deletedId, 'abc');
});
