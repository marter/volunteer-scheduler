export type OrgRole = "org_admin" | "coordinator" | "volunteer";

export type SignUpStatus = "confirmed" | "waitlisted" | "cancelled" | "no_show";

export interface Organization {
  id: string;
  name: string;
  slug: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
}

export interface Me {
  user: User;
  organization: Organization;
  role: OrgRole;
}

export interface Event {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string | null;
  recurrence_rule: string | null;
}

export interface EventCreateInput {
  name: string;
  description?: string;
  location?: string;
  start_date: string;
  end_date?: string;
  recurrence_rule?: string;
}

export interface Shift {
  id: string;
  event_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  open_slots: number;
}

export interface ShiftCreateInput {
  event_id: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  repeat_weeks: number;
}

export interface SignUp {
  id: string;
  shift_id: string;
  user_id: string;
  status: SignUpStatus;
}

export interface SignUpDetail {
  id: string;
  shift_id: string;
  status: SignUpStatus;
  user: User;
  starts_at: string;
  ends_at: string;
}

export interface Membership {
  user: User;
  role: OrgRole;
}
