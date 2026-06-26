/** poll 默认/上限（唯一来源，MessagesPollManager 也从这里 import） */
export const POLL_LIMIT_DEFAULT = 200;
export const POLL_LIMIT_MAX = 200;

/** get-all 分页默认/上限 */
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

/**
 * 钳制裸 @Query 数值参数（ValidationPipe 对 primitive @Query 不生效）。
 * 非法值（NaN、非有限数）回退 fallback。
 */
export function clampInt(
  value: unknown,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(min, Math.floor(n)), max);
}

export function clampPage(value: unknown, fallback = 1): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}
