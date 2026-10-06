import { apiClient } from "./client";
import type { Event, EventCreateInput } from "../types";

export async function listEvents(): Promise<Event[]> {
  const { data } = await apiClient.get<Event[]>("/api/events");
  return data;
}

export async function getEvent(eventId: string): Promise<Event> {
  const { data } = await apiClient.get<Event>(`/api/events/${eventId}`);
  return data;
}

export async function createEvent(input: EventCreateInput): Promise<Event> {
  const { data } = await apiClient.post<Event>("/api/events", input);
  return data;
}
