import { apiClient } from "./client";
import type { SignUp } from "../types";

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
