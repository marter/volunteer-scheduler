import { apiClient } from "./client";
import type { SignUp, SignUpInvite } from "../types";

export async function createSignUp(shiftId: string, userId?: string): Promise<SignUp> {
  const { data } = await apiClient.post<SignUp>("/api/signups", {
    shift_id: shiftId,
    user_id: userId,
  });
  return data;
}

export async function cancelSignUp(signUpId: string): Promise<void> {
  await apiClient.delete(`/api/signups/${signUpId}`);
}

export async function acceptSignUp(signUpId: string): Promise<SignUp> {
  const { data } = await apiClient.post<SignUp>(`/api/signups/${signUpId}/accept`);
  return data;
}

export async function declineSignUp(signUpId: string): Promise<SignUp> {
  const { data } = await apiClient.post<SignUp>(`/api/signups/${signUpId}/decline`);
  return data;
}

export async function getInviteByToken(token: string): Promise<SignUpInvite> {
  const { data } = await apiClient.get<SignUpInvite>("/api/signups/respond", {
    params: { token },
  });
  return data;
}

export async function respondToInvite(
  token: string,
  action: "accept" | "decline",
): Promise<SignUpInvite> {
  const { data } = await apiClient.post<SignUpInvite>("/api/signups/respond", { token, action });
  return data;
}
