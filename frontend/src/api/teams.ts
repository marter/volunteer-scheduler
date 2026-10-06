import { apiClient } from "./client";
import type { Position, Team } from "../types";

export async function listTeams(eventId: string): Promise<Team[]> {
  const { data } = await apiClient.get<Team[]>(`/api/events/${eventId}/teams`);
  return data;
}

export async function createTeam(eventId: string, name: string): Promise<Team> {
  const { data } = await apiClient.post<Team>(`/api/events/${eventId}/teams`, { name });
  return data;
}

export async function createPosition(teamId: string, name: string): Promise<Position> {
  const { data } = await apiClient.post<Position>(`/api/teams/${teamId}/positions`, { name });
  return data;
}
