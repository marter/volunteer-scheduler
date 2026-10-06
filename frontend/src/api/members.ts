import { apiClient } from "./client";
import type { MemberCreateInput, Membership } from "../types";

export async function listMembers(): Promise<Membership[]> {
  const { data } = await apiClient.get<Membership[]>("/api/members");
  return data;
}

export async function addMember(input: MemberCreateInput): Promise<Membership> {
  const { data } = await apiClient.post<Membership>("/api/members", input);
  return data;
}
