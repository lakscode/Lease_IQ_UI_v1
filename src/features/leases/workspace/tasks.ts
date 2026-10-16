// Follow-up tasks of a lease (see API routes/leases.ts, "Tasks"). Open tasks that are overdue or due within
// 30 days also appear as lease alerts.
import { del, get, patch, post } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';

export interface LeaseTask {
  id: string;
  lease_id: string;
  title: string;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  attachment_id: string | null;
  attachment_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export interface TaskInput { title: string; due_date?: string | null; attachment_id?: string | null }

const order = (l: LeaseTask[]) =>
  [...l].sort((a, b) => Number(a.done) - Number(b.done) || (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.created_at.localeCompare(b.created_at));

/** `onChanged` runs after every change (the lease page uses it to refresh the alerts). */
export function useLeaseTasks(leaseId: string, onChanged?: () => void) {
  const list = useAsync((signal) => get<LeaseTask[]>(`/leases/${leaseId}/tasks`, undefined, signal), [leaseId]);
  const { setData } = list;
  const done = () => onChanged?.();
  return {
    ...list,
    async create(input: TaskInput) {
      const row = await post<LeaseTask>(`/leases/${leaseId}/tasks`, input);
      setData((l) => order([...(l ?? []), row]));
      done();
      return row;
    },
    async update(id: string, body: Partial<Pick<LeaseTask, 'title' | 'due_date' | 'done'>>) {
      const row = await patch<LeaseTask>(`/leases/${leaseId}/tasks/${id}`, body);
      setData((l) => order((l ?? []).map((x) => (x.id === id ? row : x))));
      done();
    },
    async remove(id: string) {
      await del(`/leases/${leaseId}/tasks/${id}`);
      setData((l) => (l ?? []).filter((x) => x.id !== id));
      done();
    },
  };
}

export type LeaseTasksApi = ReturnType<typeof useLeaseTasks>;
