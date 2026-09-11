import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { AlertOctagon, Search, Loader2, Clock, CheckCircle2, XCircle, UserCircle, Calendar } from 'lucide-react';
import { format, parseISO, parse, formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const missingRecordsOptions = queryOptions({
  queryKey: ['missing_timesheets'],
  queryFn: async () => {
    // Note: No 14-day limit applied here because HR must see all unresolved anomalies regardless of age.
    const { data, error } = await supabase
      .from('timesheets')
      .select('*, users:user_id(name, email, role)')
      .eq('status', 'MISSING_RECORD')
      .order('shift_date', { ascending: false });
      
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/staff/missing-records')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) await queryClient.ensureQueryData(missingRecordsOptions);
  },
  component: MissingRecordsPage,
});

export function MissingRecordsPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.role === 'HR';
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [resolveModalState, setResolveModalState] = useState<{ isOpen: boolean; record: any | null; }>({ isOpen: false, record: null });

  useEffect(() => {
    const channel = supabase.channel('missing-records-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'timesheets' }, () => {
        queryClient.invalidateQueries({ queryKey: ['missing_timesheets'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: records = [], isLoading } = useQuery(missingRecordsOptions);

  const filteredRecords = useMemo(() => {
    if (!searchQuery) return records;
    const lower = searchQuery.toLowerCase();
    return records.filter((r: any) => 
      (r.users?.name || '').toLowerCase().includes(lower) ||
      (r.anomaly_reason || '').toLowerCase().includes(lower)
    );
  }, [records, searchQuery]);

  const rowVirtualizer = useWindowVirtualizer({
    count: filteredRecords.length, estimateSize: () => 80, overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3">
            <AlertOctagon className="text-rose-600" /> Anomalies & Missing Records
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Timesheet Discrepancy Auditing</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search staff or anomaly type..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="overflow-x-auto w-full flex-1">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Shift Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Member</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/3">Anomaly Details</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">HR Resolution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={4} className="p-10 text-center"><Loader2 className="animate-spin text-rose-600 mx-auto" /></td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-16 text-center text-xs font-black text-slate-400 uppercase tracking-widest flex flex-col items-center gap-3">
                    <CheckCircle2 size={32} className="text-emerald-500/50" />
                    All timesheets are reconciled. No anomalies found.
                  </td>
                </tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={4} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const record = filteredRecords[virtualRow.index];
                    const sDate = record.shift_date ? parseISO(record.shift_date) : null;
                    
                    return (
                      <tr key={record.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-6 py-4">
                          {sDate ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-[10px] font-black text-slate-700 uppercase tracking-widest">
                              <Calendar size={12} className="text-rose-600" /> {format(sDate, 'dd MMM yyyy')}
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Unknown Date</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5"><UserCircle size={14} className="text-slate-400" /> {record.users?.name || 'Unknown'}</p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5 pl-5">{record.users?.role}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-black text-rose-700">{record.anomaly_reason || 'Missing Clock-Out / Unmatched Punch'}</span>
                            <div className="flex items-center gap-3 text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                              <span>In: {record.clock_in_time ? format(parseISO(record.clock_in_time), 'HH:mm') : '--:--'}</span>
                              <span>Out: {record.clock_out_time ? format(parseISO(record.clock_out_time), 'HH:mm') : '--:--'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {isManager ? (
                            <button onClick={() => setResolveModalState({ isOpen: true, record })} className="inline-flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm">
                              Resolve
                            </button>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">HR Action Required</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && <tr><td colSpan={4} style={{ height: `${paddingBottom}px` }} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {resolveModalState.isOpen && resolveModalState.record && <ResolutionModal onClose={() => setResolveModalState({ isOpen: false, record: null })} record={resolveModalState.record} />}
    </div>
  );
}

function ResolutionModal({ onClose, record }: { onClose: () => void, record: any }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resolveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await supabase.from('timesheets').update({
        clock_in_time: payload.clock_in_time,
        clock_out_time: payload.clock_out_time,
        status: 'COMPLETED',
        hr_resolution_notes: payload.notes
      }).eq('id', record.id);
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['missing_timesheets'] }),
    onError: (err: any) => setErrorMsg(err.message || 'Failed to resolve record.')
  });

  const baseDate = record.shift_date || new Date().toISOString().split('T')[0];
  const getInitialTime = (timeStr: string | null) => timeStr ? format(parseISO(timeStr), 'HH:mm') : '';

  const form = useForm({
    defaultValues: { clock_in: getInitialTime(record.clock_in_time), clock_out: getInitialTime(record.clock_out_time), notes: '' },
    onSubmit: ({ value }) => {
      setErrorMsg(null);
      if (!value.clock_in || !value.clock_out) {
        setErrorMsg('Both Clock In and Clock Out times are required for resolution.');
        return;
      }

      // ENTERPRISE FIX: Strict ISO format parsing merging local date and time inputs safely
      const clockInDate = parse(`${baseDate} ${value.clock_in}`, 'yyyy-MM-dd HH:mm', new Date());
      const clockOutDate = parse(`${baseDate} ${value.clock_out}`, 'yyyy-MM-dd HH:mm', new Date());

      // MODAL HANG FIX: Fire and forget
      resolveMutation.mutate({
        clock_in_time: formatISO(clockInDate),
        clock_out_time: formatISO(clockOutDate),
        notes: value.notes
      });
      onClose();
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2"><Clock size={16} className="text-rose-600"/> Resolve Discrepancy</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg"><XCircle size={16}/></button>
        </div>
        
        <div className="p-5 bg-rose-50/50 border-b border-slate-100">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Member</p>
          <p className="text-sm font-bold text-slate-900">{record.users?.name}</p>
          <p className="text-[10px] font-bold text-rose-700 mt-1 uppercase">{record.anomaly_reason}</p>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-5">
          {errorMsg && <div className="p-3 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-200">{errorMsg}</div>}

          <div className="grid grid-cols-2 gap-4">
            <form.Field name="clock_in" children={(field) => (<div><label className={labelClass}>Confirmed Clock In</label><input type="time" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} /></div>)} />
            <form.Field name="clock_out" children={(field) => (<div><label className={labelClass}>Confirmed Clock Out</label><input type="time" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} /></div>)} />
          </div>

          <form.Field name="notes" children={(field) => (<div><label className={labelClass}>HR Audit Notes</label><textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="Reason for manual override..." /></div>)} />

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-100 rounded-xl">Cancel</button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <button type="submit" disabled={!canSubmit || isSubmitting as boolean} className="px-6 py-2 bg-rose-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 disabled:opacity-50 shadow-sm flex items-center gap-2">
                  {isSubmitting && <Loader2 size={14} className="animate-spin"/>} Commit Resolution
                </button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </div>
  );
}