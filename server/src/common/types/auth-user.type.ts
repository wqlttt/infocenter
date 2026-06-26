export type UserRole = 'admin' | 'leader' | 'member';

export interface AuthUser {
  userId: string;
  username: string;
  role: UserRole;
  teamId: string | null;
}
