import { apiClient } from "./client";
import type { Shift, ShiftCreateInput } from "../types";

export async function listShifts(eventId: string): Promise<Shift[]> {
  const { data } = await apiClient.get<Shift[]>("/api/shifts", { params: { event_id: eventId } });
  return data;
}

export async function createShift(input: ShiftCreateInput): Promise<Shift> {
  const { data } = await apiClient.post<Shift>("/api/shifts", input);
  return data;
}
