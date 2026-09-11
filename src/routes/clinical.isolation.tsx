import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { format, parseISO, formatISO } from 'date-fns';
import { ShieldAlert, Plus, X, Search, Save, Loader2, UserCircle, Calendar, Lock } from 'lucide-react';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS & 14-DAY RAM CAP
// ------------------------------------------------------------------
const isolationLogsOptions = queryOptions({
  queryKey: ['isolation_logs'],
  queryFn: async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('isolation_logs')
      // Join to get animal details and authorizing user details
      .select('*, animals(name, species), users:authorized_by(name, initials)')
      .eq('is_deleted', false)
      // Keep active logs (null end_date) forever, otherwise clear after 14 days
      .or(`end_date.is.null,start_date.gte.${fourteenDaysAgo}`)
      .order('start_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 15,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const activeAnimalsOptions = queryOptions({
  queryKey: ['active_animals'],
  queryFn: async () => {
    const { data, error } = await supabase.from('animals').select('id, name, species').eq('is_deleted', false).order('name');
    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const staffMembersOptions = queryOptions({
  queryKey: ['staff_members'],
  queryFn: async () => {
    const { data, error } = await supabase.from('users').select('id, name, initials, is_deleted, is_active').order('name');
    if (error) throw error;
    return data || [];
  },
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/clinical/isolation')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) {
      // @ts-ignore
      await Promise.all([ 
        queryClient.ensureQueryData(isolationLogsOptions), 
        queryClient.ensureQueryData(activeAnimalsOptions),
        queryClient.ensureQueryData(staffMembersOptions)
      ]);
    }
  },
  component: IsolationLogsPage,
});

export function IsolationLogsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'CLEARED'>('ALL');
  const scrollParentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase.channel('isolation-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'isolation_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['isolation_logs'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: logs = [], isLoading } = useQuery(isolationLogsOptions);
  const { data: animals = [] } = useQuery(activeAnimalsOptions);
  const { data: staffMembers = [] } = useQuery(staffMembersOptions);

  const filteredLogs = useMemo(() => {
    let filtered = logs;
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((l: any) => statusFilter === 'ACTIVE' ? !l.end_date : !!l.end_date);
    }
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter((l: any) => 
        (l.animals?.name || '').toLowerCase().includes(lower) ||
        (l.reason || '').toLowerCase().includes(lower) ||
        (l.users?.name || '').toLowerCase().includes(lower) // Search by authorizing staff name
      );
    }
    return filtered;
  }, [logs, searchQuery, statusFilter]);

  const rowVirtualizer = useWindowVirtualizer({
    count: filteredLogs.length,
    estimateSize: () => 140, 
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  const completeIsolationMutation = useMutation({
    mutationFn: async (id: string) => {
      // SCHEMA FIX: Supply modified_by to clear the quarantine safely
      const { error } = await supabase.from('isolation_logs').update({ 
        end_date: new Date().toISOString(),
        modified_by: user!.id 
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['isolation_logs'] })
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Lock className="text-violet-600" size={24} /> Quarantine & Isolation
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Biosecurity Tracking</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="bg-slate-50 border border-slate-200 text-[10px] font-black text-slate-700 uppercase tracking-widest rounded-xl px-4 py-2 focus:outline-none focus:border-violet-500 shadow-sm w-full sm:w-auto">
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Currently Isolated</option>
            <option value="CLEARED">Cleared / Released</option>
          </select>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input type="text" placeholder="Search isolation logs..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20 transition-all shadow-sm" />
          </div>
          <button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(124,58,237,0.15)]">
            <Plus size={16} /> Isolate Animal
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
        {isLoading && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm"><Loader2 className="animate-spin text-violet-600 w-8 h-8" /></div>}
        
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
          <div className="col-span-3">Patient & Status</div>
          <div className="col-span-4">Reason for Isolation</div>
          <div className="col-span-3">Timeframe</div>
          <div className="col-span-2 text-right">Action</div>
        </div>

        <div className="overflow-auto h-[calc(100%-53px)] custom-scrollbar min-w-[900px]" ref={scrollParentRef}>
          {filteredLogs.length === 0 && !isLoading ? (
            <div className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No isolation records found.</div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
              {virtualItems.map((virtualRow) => {
                const log = filteredLogs[virtualRow.index];
                const startDateObj = new Date(log.start_date);
                const endDateObj = log.end_date ? new Date(log.end_date) : null;
                const isActive = !log.end_date;

                return (
                  <div key={log.id} className="absolute top-0 left-0 w-full transition-colors border-b border-slate-100 hover:bg-slate-50/60" style={{ height: `${virtualRow.size}px`, transform: `translateY(${virtualRow.start}px)` }}>
                    <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center h-full">
                      <div className="col-span-3">
                        <p className="text-sm font-black text-slate-900 uppercase tracking-tight truncate">{log.animals?.name || 'Unknown'}</p>
                        <div className="flex gap-2 mt-1">
                          <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-slate-100 text-slate-500 border-slate-300 truncate max-w-[120px]">
                            {log.animals?.species || 'Unknown'}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${isActive ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                            {isActive ? 'ACTIVE' : 'CLEARED'}
                          </span>
                        </div>
                      </div>
                      <div className="col-span-4 space-y-1 pr-4">
                        <div className="flex items-center gap-1.5">
                           <ShieldAlert size={12} className={isActive ? 'text-rose-500' : 'text-slate-400'} />
                           <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded shadow-sm">{log.isolation_type.replace(/_/g, ' ')}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-900 line-clamp-1">{log.reason}</p>
                        <p className="text-[10px] font-medium text-slate-600 line-clamp-2">{log.notes || 'No additional notes provided.'}</p>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1"><UserCircle size={10} className="inline mr-1" /> Auth: {log.users?.name || 'Unknown'}</p>
                      </div>
                      <div className="col-span-3 flex flex-col gap-1.5">
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[9px] font-black text-slate-600 uppercase tracking-widest w-fit">
                          <Calendar size={10} /> Start: {format(startDateObj, 'dd MMM yyyy')}
                        </span>
                        {endDateObj ? (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest w-fit ${isActive ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                            <Calendar size={10} /> Cleared: {format(endDateObj, 'dd MMM yyyy')}
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Indefinite Quarantine</span>
                        )}
                      </div>
                      <div className="col-span-2 flex justify-end">
                        {isActive ? (
                          <button onClick={() => completeIsolationMutation.mutate(log.id)} disabled={completeIsolationMutation.isPending} className="px-4 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-black text-[10px] uppercase tracking-widest rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-2">
                            {completeIsolationMutation.isPending && <Loader2 size={12} className="animate-spin" />} Clear Quarantine
                          </button>
                        ) : (
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Completed</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {isModalOpen && <IsolationModal onClose={() => setIsModalOpen(false)} animals={animals} staffMembers={staffMembers} userId={user!.id} />}
    </div>
  );
}

function IsolationModal({ onClose, animals, staffMembers, userId }: { onClose: () => void, animals: any[], staffMembers: any[], userId: string }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('isolation_logs').insert([payload]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['isolation_logs'] });
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to save isolation log.')
  });

  const form = useForm({
    defaultValues: {
      animal_id: '',
      isolation_type: 'QUARANTINE',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: '',
      reason: '',
      notes: '',
      authorized_by: ''
    },
    onSubmit: ({ value }) => {
      setErrorMsg(null);
      
      const parsedStartDate = formatISO(parseISO(value.start_date));
      const parsedEndDate = value.end_date ? formatISO(parseISO(value.end_date)) : null;

      // SCHEMA FIX: Supplied created_by and modified_by, matching NOT NULL constraints
      const payload = {
        id: crypto.randomUUID(), 
        animal_id: value.animal_id,
        isolation_type: value.isolation_type,
        start_date: parsedStartDate,
        end_date: parsedEndDate,
        reason: value.reason,
        notes: value.notes || null,
        authorized_by: value.authorized_by || null,
        is_deleted: false,
        created_by: userId,
        modified_by: userId
      };

      saveMutation.mutate(payload);
      onClose();
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl relative my-auto">
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Lock size={20} className="text-violet-600" /> Initiate Quarantine
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"><X size={20} /></button>
        </div>

        <form id="isolation-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-5">
          {errorMsg && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm">{errorMsg}</div>}

          <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-3">
             <ShieldAlert size={20} className="text-rose-600 shrink-0 mt-0.5" />
             <div>
                <p className="text-xs font-black text-rose-900 uppercase tracking-tight">Biosecurity Alert</p>
                <p className="text-[10px] font-bold text-rose-700 mt-1">Initiating this log flags the animal across the entire StrixOS system as isolated. General keepers will be warned.</p>
             </div>
          </div>

          <form.Field name="animal_id">
            {(field) => (
              <div>
                <label className={labelClass}>Patient (Animal)</label>
                <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="">-- Select Patient --</option>
                  {animals.map((a: any) => <option key={a.id} value={a.id}>{a.name} ({a.species})</option>)}
                </select>
              </div>
            )}
          </form.Field>

          <form.Field name="isolation_type">
            {(field) => (
              <div>
                <label className={labelClass}>Isolation Protocol Type</label>
                <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="QUARANTINE">Full Quarantine (Inbound/Contagion)</option>
                  <option value="MEDICAL_OBSERVATION">Medical Observation</option>
                  <option value="BEHAVIORAL_SEPARATION">Behavioral Separation</option>
                  <option value="DIETARY_RESTRICTION">Dietary Restriction</option>
                </select>
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-5">
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
                  <label className={labelClass}>Target End (Optional)</label>
                  <input type="date" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="reason">
            {(field) => (
              <div>
                <label className={labelClass}>Primary Reason</label>
                <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. Suspected Avian Influenza" className={inputClass} />
              </div>
            )}
          </form.Field>

          <form.Field name="notes">
            {(field) => (
              <div>
                <label className={labelClass}>Additional Notes / Restrictions</label>
                <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="e.g. Full PPE required. Foot dip must be used..." />
              </div>
            )}
          </form.Field>

          <form.Field name="authorized_by">
            {(field) => (
              <div>
                <label className={labelClass}>Authorized By (Manager/Vet)</label>
                <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="">-- Select Authorizing Staff --</option>
                  {staffMembers
                    .filter((s: any) => !s.is_deleted && s.is_active !== false)
                    .map((s: any) => <option key={s.id} value={s.id}>{s.name} {s.initials ? `(${s.initials})` : ''}</option>)
                  }
                </select>
              </div>
            )}
          </form.Field>
        </form>

        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button type="submit" form="isolation-form" disabled={!canSubmit || isSubmitting as boolean} className="px-8 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-md">
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Commit Isolation
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}