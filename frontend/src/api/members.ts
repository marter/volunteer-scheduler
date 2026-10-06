import { apiClient } from "./client";
import type { Membership } from "../types";

export async function listMembers(): Promise<Membership[]> {
  const { data } = await apiClient.get<Membership[]>("/api/members");
  return data;
}
