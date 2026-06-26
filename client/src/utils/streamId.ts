const OBJECT_ID_HEX = /^[a-f0-9]{24}$/i;

export function isValidStreamId(id?: string | null): id is string {
  return !!id && OBJECT_ID_HEX.test(id);
}

export function isStreamIdAfter(nextId: string, prevId: string): boolean {
  if (!isValidStreamId(nextId)) return false;
  if (!isValidStreamId(prevId)) return true;
  return nextId > prevId;
}
