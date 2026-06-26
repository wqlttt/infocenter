import type { UserRole } from '@/types';

/** 系统 role 字段与中文展示名（leader = 队长，非独立角色） */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理员',
  leader: '队长',
  member: '成员',
};

export function roleLabel(role?: UserRole | string | null): string {
  if (!role) return '';
  return ROLE_LABELS[role as UserRole] ?? role;
}
