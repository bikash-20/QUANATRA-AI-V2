import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeStorageRecord } from '../lib/storage-record.ts';

test('storage records preserve arrays and objects without spreading their values', () => {
  const cards = [{ front: 'A', back: 'B' }];
  assert.deepEqual(decodeStorageRecord({ id: 'default', value: cards }, []), cards);
  assert.deepEqual(
    decodeStorageRecord({ id: 'default', value: { streak: 2 } }, {}),
    { streak: 2 },
  );
});

test('storage decoder reads legacy records created before the value envelope', () => {
  assert.deepEqual(decodeStorageRecord({ id: 'default', 0: 'first', 1: 'second' }, []), [
    'first',
    'second',
  ]);
  assert.deepEqual(
    decodeStorageRecord({ id: 'default', streak: 2 }, {}),
    { streak: 2 },
  );
});
