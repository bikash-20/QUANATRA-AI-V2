export function decodeStorageRecord<T>(record: unknown, fallback: T): T {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return fallback;
  }

  const fields = record as Record<string, unknown>;
  if (
    Object.keys(fields).length === 2 &&
    typeof fields.id === 'string' &&
    Object.prototype.hasOwnProperty.call(fields, 'value')
  ) {
    return fields.value as T;
  }

  if (Array.isArray(fallback)) {
    const values = Object.entries(fields)
      .filter(([key]) => /^\d+$/.test(key))
      .sort(([left], [right]) => Number(left) - Number(right));
    return values.map(([, value]) => value) as T;
  }

  const legacyValue = { ...fields };
  delete legacyValue.id;
  return legacyValue as T;
}
