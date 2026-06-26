import { api } from '@/utils/api';
import type { Team } from '@/types';

export interface TeamMembersResponse {
  teamId: string;
  name: string;
  leader: { id: string; username: string } | null;
  members: { id: string; username: string }[];
}

export function listTeams() {
  return api.get<Team[]>('/teams').then((r) => r.data);
}

export function getTeamMembers(teamId: string) {
  return api.get<TeamMembersResponse>(`/teams/${teamId}/members`).then((r) => r.data);
}

export function requestJoinTeam(teamId: string) {
  return api.post<{ requested: boolean; teamId: string }>('/teams/join-request', { teamId }).then((r) => r.data);
}

export function approveTeamMember(teamId: string, userId: string) {
  return api
    .post<{ approved: boolean; teamName: string; username: string }>(`/teams/${teamId}/members/approve`, { userId })
    .then((r) => r.data);
}
