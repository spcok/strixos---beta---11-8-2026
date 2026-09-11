import React, { useState, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Umbrella, Plus, Loader2, CheckCircle, XCircle, Trash2, Calendar } from 'lucide-react';
import { format, parseISO, formatISO, differenceInDays } from 'date-fns';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { leaveService } from '../services/leaveService';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const getLeaveRequestsOptions = (activeTab: 'MY_REQUESTS' | 'APPROVALS', userId: string | undefined, isManager: boolean) => queryOptions({
  queryKey: ['leave_requests', activeTab, userId],
  queryFn: () => activeTab === 'APPROVALS' && isManager 
    ? leaveService.getAllRequests() 
    : leaveService.getMyRequests(userId!),
  enabled: !!userId,
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/staff/leave')({
  component: LeaveDashboardPage,
});

export function LeaveDashboardPage() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const isManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.role === 'HR';

  const [activeTab, setActiveTab] = useState<'MY_REQUESTS' | 'APPROVALS'>('MY_REQUESTS');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const channel = supabase.channel('leave-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
        queryClient.invalidateQueries({ queryKey: ['leave_requests'] });
        queryClient.invalidateQueries({ queryKey: ['rota_matrix'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: requests = [], isLoading } = useQuery(getLeaveRequestsOptions(activeTab, user?.id, isManager));

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string, status: 'APPROVED' | 'REJECTED' }) => leaveService.updateStatus(id, status, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave_requests'] });
      queryClient.invalidateQueries({ queryKey: ['rota_matrix'] }); 
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => leaveService.deleteRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leave_requests'] })
  });

  const pendingCount = isManager && activeTab === 'APPROVALS' ? requests.filter((r: any) => r.status === 'PENDING').length : 0;

  const rowVirtualizer = useWindowVirtualizer({
    count: requests.length,
    estimateSize: () => 80, 
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      
      {/* Header & Navigation */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
            <Umbrella className="text-indigo-600" /> Holiday & Absence
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Self-Service Portal</p>
        </div>
        
        <div className="flex items-center gap-4">
          {isManager && (
            <div className="bg-slate-100 p-1 rounded-xl flex mr-4">
              <button onClick={() => setActiveTab('MY_REQUESTS')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'MY_REQUESTS' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>My Requests</button>
              <button onClick={() => setActiveTab('APPROVALS')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all relative ${activeTab === 'APPROVALS' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>
                Team Inbox
                {pendingCount > 0 && <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 text-white text-[8px] flex items-center justify-center rounded-full shadow-sm">{pendingCount}</span>}
              </button>
            </div>
          )}

          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-sm">
            <Plus size={14} /> Request Leave
          </button>
        </div>
      </div>

      {/* Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] relative">
         {isLoading && <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex justify-center items-center"><Loader2 className="animate-spin text-indigo-600 w-8 h-8" /></div>}
        
        <div className="overflow-x-auto w-full custom-scrollbar">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Type & Dates</th>
                {activeTab === 'APPROVALS' && <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Member</th>}
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Duration</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.length === 0 && !isLoading ? (
                <tr><td colSpan={5} className="p-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No requests found.</td></tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={5} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const req = requests[virtualRow.index];
                    const sDate = parseISO(req.start_date);
                    const eDate = parseISO(req.end_date);
                    const days = differenceInDays(eDate, sDate) + 1; 
                    
                    return (
                      <tr key={req.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <p className="text-xs font-black text-slate-900">{req.leave_type.replace(/_/g, ' ')}</p>
                          <p className="text-[10px] font-bold text-slate-500 mt-0.5">{format(sDate, 'dd MMM yyyy')} - {format(eDate, 'dd MMM yyyy')}</p>
                          {req.reason && <p className="text-[9px] text-slate-400 mt-1 italic truncate max-w-xs">"{req.reason}"</p>}
                        </td>
                        
                        {activeTab === 'APPROVALS' && (
                          <td className="px-6 py-4 text-xs font-bold text-slate-700">{req.users?.name || 'Unknown'}</td>
                        )}
                        
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            <Calendar size={12} /> {days} Day{days > 1 ? 's' : ''}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span className={`inline-flex px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest border shadow-sm ${
                            req.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            req.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {req.status}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-right">
                          {activeTab === 'APPROVALS' && req.status === 'PENDING' ? (
                            <div className="flex justify-end gap-2">
                              <button onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'APPROVED' })} className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-lg border border-emerald-200 transition-colors" title="Approve">
                                <CheckCircle size={16} />
                              </button>
                              <button onClick={() => updateStatusMutation.mutate({ id: req.id, status: 'REJECTED' })} className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white rounded-lg border border-rose-200 transition-colors" title="Reject">
                                <XCircle size={16} />
                              </button>
                            </div>
                          ) : (
                            (req.status === 'PENDING' || isManager) && (
                              <button onClick={() => deleteMutation.mutate(req.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors" title="Delete/Cancel Request">
                                <Trash2 size={16} />
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && <tr><td colSpan={5} style={{ height: `${paddingBottom}px` }} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <LeaveRequestModal onClose={() => setIsModalOpen(false)} userId={user!.id} />}
    </div>
  );
}

// ============================================================================
// MODAL: SUBMIT NEW REQUEST (TANSTACK FORM)
// ============================================================================
function LeaveRequestModal({ onClose, userId }: { onClose: () => void, userId: string }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => leaveService.submitRequest(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave_requests'] });
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to submit request.')
  });

  const form = useForm({
    defaultValues: {
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: format(new Date(), 'yyyy-MM-dd'),
      leave_type: 'ANNUAL_LEAVE',
      reason: ''
    },
    onSubmit: ({ value }) => {
      setErrorMsg(null);

      if (parseISO(value.end_date) < parseISO(value.start_date)) {
        setErrorMsg('End date cannot be before start date.');
        return;
      }

      // ENTERPRISE FIX: Strict ISO Temporal Formatting for offline queues
      const payload = {
         id: crypto.randomUUID(),
         user_id: userId,
         start_date: formatISO(parseISO(value.start_date), { representation: 'date' }),
         end_date: formatISO(parseISO(value.end_date), { representation: 'date' }),
         leave_type: value.leave_type,
         reason: value.reason,
         status: 'PENDING',
         is_deleted: false
      };

      // MODAL HANG FIX: Fire and forget mutate + instant close
      saveMutation.mutate(payload);
      onClose();
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2"><Umbrella size={16} className="text-indigo-600"/> Submit Leave Request</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg"><Trash2 size={16}/></button>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-5">
          {errorMsg && <div className="p-3 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-200">{errorMsg}</div>}

          <div className="grid grid-cols-2 gap-4">
            <form.Field name="start_date">
              {(field) => (
                <div>
                  <label className={labelClass}>Start Date</label>
                  <input type="date" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>
            
            <form.Field name="end_date">
              {(field) => (
                <div>
                  <label className={labelClass}>End Date</label>
                  <input type="date" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="leave_type">
            {(field) => (
              <div>
                <label className={labelClass}>Absence Type</label>
                <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="ANNUAL_LEAVE">Annual Leave (Holiday)</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                  <option value="TRAINING">External Training</option>
                </select>
              </div>
            )}
          </form.Field>

          <form.Field name="reason">
            {(field) => (
              <div>
                <label className={labelClass}>Reason / Notes (Optional)</label>
                <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Provide any necessary context..." />
              </div>
            )}
          </form.Field>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-100 rounded-xl">Cancel</button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <button type="submit" disabled={!canSubmit || isSubmitting as boolean} className="px-6 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-500 disabled:opacity-50 shadow-sm flex items-center gap-2">
                  {isSubmitting && <Loader2 size={14} className="animate-spin"/>} Submit Request
                </button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </div>
  );
}