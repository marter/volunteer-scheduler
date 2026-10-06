import { apiClient } from "./client";
import type { Me } from "../types";

export interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
  organization_name: string;
  organization_slug: string;
}

export interface LoginInput {
  email: string;
  password: string;
  organization_slug: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export async function register(input: RegisterInput): Promise<string> {
  const { data } = await apiClient.post<TokenResponse>("/api/auth/register", input);
  return data.access_token;
}

export async function login(input: LoginInput): Promise<string> {
  const { data } = await apiClient.post<TokenResponse>("/api/auth/login", input);
  return data.access_token;
}

export async function fetchMe(): Promise<Me> {
  const { data } = await apiClient.get<Me>("/api/auth/me");
  return data;
}
