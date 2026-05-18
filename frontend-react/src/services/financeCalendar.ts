import client from '../api/client';

export interface FinanceCalendarMonth {
  id: number;
  period_ym: string;
  notes?: string;
}

export interface FinanceCalendarMark {
  id: number;
  calendar_id: number;
  mark_date: string;
  kind: string;
  label: string;
}

export interface FinanceCalendarActivity {
  id: number;
  calendar_id: number;
  name: string;
  description?: string;
  due_day: number;
  activity_kind: string;
  priority: string;
  due_date?: string;
  traffic_light?: string;
}

export interface FinanceCalendarDetail {
  id: number;
  period_ym: string;
  notes?: string;
  marks?: FinanceCalendarMark[];
  activities?: FinanceCalendarActivity[];
}

export interface CalendarComplianceCompany {
  company_id: number;
  company_name: string;
  company_ruc: string;
  control_id?: number;
  status: string;
  traffic_light: string;
  detail?: string;
}

export interface CalendarComplianceSummary {
  activity_id: number;
  activity_name: string;
  due_date: string;
  traffic_light: string;
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  companies: CalendarComplianceCompany[];
}

function unwrap<T>(res: { data: { data: T } }): T {
  return res.data.data;
}

export const financeCalendarService = {
  async list(): Promise<FinanceCalendarMonth[]> {
    const res = await client.get<{ data: FinanceCalendarMonth[] }>('/finance/calendar/');
    return res.data.data ?? [];
  },

  async get(periodYm: string): Promise<FinanceCalendarDetail> {
    const res = await client.get<{ data: FinanceCalendarDetail }>(`/finance/calendar/${periodYm}`);
    return unwrap(res);
  },

  async create(periodYm: string, notes = ''): Promise<FinanceCalendarMonth> {
    const res = await client.post<{ data: FinanceCalendarMonth }>('/finance/calendar/', { period_ym: periodYm, notes });
    return unwrap(res);
  },

  async updateNotes(id: number, notes: string): Promise<FinanceCalendarMonth> {
    const res = await client.put<{ data: FinanceCalendarMonth }>(`/finance/calendar/months/${id}`, { notes });
    return unwrap(res);
  },

  async remove(id: number): Promise<void> {
    await client.delete(`/finance/calendar/months/${id}`);
  },

  async duplicate(fromPeriodYm: string, toPeriodYm: string): Promise<FinanceCalendarMonth> {
    const res = await client.post<{ data: FinanceCalendarMonth }>('/finance/calendar/duplicate', {
      from_period_ym: fromPeriodYm,
      to_period_ym: toPeriodYm,
    });
    return unwrap(res);
  },

  async addMark(calendarId: number, mark_date: string, kind: string, label: string) {
    const res = await client.post<{ data: FinanceCalendarMark }>(`/finance/calendar/months/${calendarId}/marks`, {
      mark_date,
      kind,
      label,
    });
    return unwrap(res);
  },

  async removeMark(id: number): Promise<void> {
    await client.delete(`/finance/calendar/marks/${id}`);
  },

  async addActivity(
    calendarId: number,
    body: { name: string; description?: string; due_day: number; activity_kind: string; priority: string },
  ) {
    const res = await client.post<{ data: FinanceCalendarActivity }>(
      `/finance/calendar/months/${calendarId}/activities`,
      body,
    );
    return unwrap(res);
  },

  async updateActivity(
    id: number,
    body: Partial<{ name: string; description: string; due_day: number; activity_kind: string; priority: string }>,
  ) {
    const res = await client.put<{ data: FinanceCalendarActivity }>(`/finance/calendar/activities/${id}`, body);
    return unwrap(res);
  },

  async removeActivity(id: number): Promise<void> {
    await client.delete(`/finance/calendar/activities/${id}`);
  },

  async compliance(activityId: number, periodYm?: string): Promise<CalendarComplianceSummary> {
    const res = await client.get<{ data: CalendarComplianceSummary }>(
      `/finance/calendar/activities/${activityId}/compliance`,
      { params: periodYm ? { period_ym: periodYm } : undefined },
    );
    return unwrap(res);
  },
};
