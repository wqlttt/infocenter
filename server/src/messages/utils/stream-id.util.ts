import { Types } from 'mongoose';

const OBJECT_ID_HEX = /^[a-f0-9]{24}$/i;

export function isValidStreamId(id?: string | null): id is string {
  return !!id && OBJECT_ID_HEX.test(id);
}

/** ObjectId 十六进制字符串字典序比较（与 MongoDB _id 顺序一致） */
export function isStreamIdAfter(nextId: string, prevId: string): boolean {
  if (!isValidStreamId(nextId)) return false;
  if (!isValidStreamId(prevId)) return true;
  return nextId > prevId;
}

export function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}
