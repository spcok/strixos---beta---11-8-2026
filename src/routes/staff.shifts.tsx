import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { CalendarClock, Search, Plus, Loader2, Clock, MapPin, Trash2, Calendar as CalendarIcon, UserCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { rotaService } from '../services/rotaService';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const getShiftsListOptions = (activeTab: 'MY_SHIFTS' | 'TEAM_SHIFTS', userId: string | undefined, isManager: boolean) => queryOptions({
  queryKey: ['shifts_list', activeTab, userId],
  queryFn: async () => {
    let query = supabase
      .from('shifts')
      .select('*, users:user_id(name, email, role)')
      .order('start_time', { ascending: false });

    if (activeTab === 'MY_SHIFTS' && userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  enabled: !!userId,
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const getStaffOptions = () => queryOptions({
  queryKey: ['staff_members_minimal'],
  queryFn: async () => {
    const { data, error } = await supabase.from('users').select('id, name, email, role');
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/staff/shifts')({
  component: ShiftsLedgerPage,
});

// ------------------------------------------------------------------
// 2. MAIN COMPONENT
// ------------------------------------------------------------------
export function ShiftsLedgerPage() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const isManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.role === 'HR';

  const [activeTab, setActiveTab] = useState<'MY_SHIFTS' | 'TEAM_SHIFTS'>('MY_SHIFTS');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // ------------------------------------------------------------------
  // SUPABASE REALTIME CACHE INVALIDATION
  // ------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('shifts-list-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        (payload) => {
          console.log('[Sync Engine] External mutation detected. Purging local cache:', payload);
          queryClient.invalidateQueries({ queryKey: ['shifts_list'] });
          queryClient.invalidateQueries({ queryKey: ['rota_matrix'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: shifts = [], isLoading: isLoadingShifts } = useQuery(getShiftsListOptions(activeTab, user?.id, isManager));
  const { data: staffMembers = [] } = useQuery(getStaffOptions());

  const deleteShiftMutation = useMutation({
    mutationFn: (id: string) => rotaService.deleteShift(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts_list'] });
      queryClient.invalidateQueries({ queryKey: ['rota_matrix'] });
    }
  });

  const filteredShifts = useMemo(() => {
    if (!searchQuery) return shifts;
    const lower = searchQuery.toLowerCase();
    return shifts.filter((s: any) => 
      (s.assigned_area || '').toLowerCase().includes(lower) ||
      (s.users?.name || '').toLowerCase().includes(lower) ||
      (s.notes || '').toLowerCase().includes(lower)
    );
  }, [shifts, searchQuery]);

  // ------------------------------------------------------------------
  // 3. WINDOW VIRTUALIZER (DOM PROTECTION WITHOUT UI/UX SHIFT)
  // ------------------------------------------------------------------
  const rowVirtualizer = useWindowVirtualizer({
    count: filteredShifts.length,
    estimateSize: () => 76, // Estimated pixel height of a shift row
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
            <CalendarClock className="text-indigo-600" /> Shift Planner
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Shift Allocations & Assignments</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          {isManager && (
            <div className="bg-slate-100 p-1 rounded-xl flex w-full sm:w-auto">
              <button onClick={() => setActiveTab('MY_SHIFTS')} className={`flex-1 sm:flex-none px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'MY_SHIFTS' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>My Shifts</button>
              <button onClick={() => setActiveTab('TEAM_SHIFTS')} className={`flex-1 sm:flex-none px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'TEAM_SHIFTS' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'}`}>Team Ledger</button>
            </div>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search area or staff..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" 
            />
          </div>

          {isManager && (
            <button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-sm">
              <Plus size={14} /> Assign Shift
            </button>
          )}
        </div>
      </div>

      {/* Ledger */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="overflow-x-auto w-full flex-1">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Time Window</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Assignment</th>
                {activeTab === 'TEAM_SHIFTS' && <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Member</th>}
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingShifts ? (
                <tr><td colSpan={activeTab === 'TEAM_SHIFTS' ? 5 : 4} className="p-10 text-center"><Loader2 className="animate-spin text-indigo-600 mx-auto" /></td></tr>
              ) : filteredShifts.length === 0 ? (
                <tr><td colSpan={activeTab === 'TEAM_SHIFTS' ? 5 : 4} className="p-10 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No shift records found.</td></tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={activeTab === 'TEAM_SHIFTS' ? 5 : 4} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const shift = filteredShifts[virtualRow.index];
                    const sTime = parseISO(shift.start_time);
                    const eTime = parseISO(shift.end_time);
                    
                    return (
                      <tr key={shift.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-[10px] font-black text-slate-700 uppercase tracking-widest">
                            <CalendarIcon size={12} className="text-indigo-600" /> {format(sTime, 'dd MMM yyyy')}
                          </span>
                        </td>
                        
                        <td className="px-6 py-4">
                          <p className="text-xs font-black text-slate-900 flex items-center gap-2">
                            <Clock size={12} className="text-slate-400"/>
                            {format(sTime, 'HH:mm')} - {format(eTime, 'HH:mm')}
                          </p>
                        </td>

                        <td className="px-6 py-4">
                          {shift.assigned_area ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                <MapPin size={12} className="text-rose-500" /> {shift.assigned_area}
                              </span>
                              {shift.notes && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-xs">{shift.notes}</span>}
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">General Duties</span>
                          )}
                        </td>
                        
                        {activeTab === 'TEAM_SHIFTS' && (
                          <td className="px-6 py-4">
                            <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                              <UserCircle size={14} className="text-slate-400" /> {shift.users?.name || 'Unknown'}
                            </p>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5 pl-5">{shift.users?.role}</p>
                          </td>
                        )}

                        <td className="px-6 py-4 text-right">
                          {isManager && (
                            <button 
                              onClick={() => deleteShiftMutation.mutate(shift.id)} 
                              disabled={deleteShiftMutation.isPending}
                              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50" 
                              title="Delete Shift"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && <tr><td colSpan={activeTab === 'TEAM_SHIFTS' ? 5 : 4} style={{ height: `${paddingBottom}px` }} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <AddShiftModal onClose={() => setIsModalOpen(false)} staffMembers={staffMembers} />}
    </div>
  );
}

// ============================================================================
// MODAL: ADD SHIFT (TANSTACK FORM ARCHITECTURE)
// ============================================================================
function AddShiftModal({ onClose, staffMembers }: { onClose: () => void, staffMembers: any[] }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => rotaService.saveShift(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shifts_list'] });
      queryClient.invalidateQueries({ queryKey: ['rota_matrix'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to assign shift.')
  });

  const form = useForm({
    defaultValues: {
      user_id: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      start_time: '09:00',
      end_time: '17:00',
      assigned_area: '',
      notes: ''
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      await saveMutation.mutateAsync({
        user_id: value.user_id,
        start_time: `${value.date}T${value.start_time}:00Z`,
        end_time: `${value.date}T${value.end_time}:00Z`,
        assigned_area: value.assigned_area,
        notes: value.notes,
        status: 'SCHEDULED'
      });
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2"><Clock size={16} className="text-indigo-600"/> Assign Shift</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-900 rounded-lg"><Trash2 size={16}/></button>
        </div>
        
        <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-5">
          {errorMsg && <div className="p-3 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-200">{errorMsg}</div>}
          
          <form.Field name="user_id">
            {(field) => (
              <div>
                <label className={labelClass}>Staff Member</label>
                <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                  <option value="">Select Staff...</option>
                  {staffMembers.map((s: any) => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
                </select>
              </div>
            )}
          </form.Field>

          <form.Field name="date">
            {(field) => (
              <div>
                <label className={labelClass}>Shift Date</label>
                <input type="date" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-4">
            <form.Field name="start_time">
              {(field) => (
                <div>
                  <label className={labelClass}>Start Time</label>
                  <input type="time" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>
            <form.Field name="end_time">
              {(field) => (
                <div>
                  <label className={labelClass}>End Time</label>
                  <input type="time" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="assigned_area">
            {(field) => (
              <div>
                <label className={labelClass}>Assigned Area (Optional)</label>
                <input type="text" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. Flight Yard" className={inputClass} />
              </div>
            )}
          </form.Field>

          <form.Field name="notes">
            {(field) => (
              <div>
                <label className={labelClass}>Shift Notes (Optional)</label>
                <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="Specific instructions..." />
              </div>
            )}
          </form.Field>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-100 rounded-xl">Cancel</button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <button type="submit" disabled={!canSubmit || isSubmitting as boolean || saveMutation.isPending} className="px-6 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-500 disabled:opacity-50 shadow-sm flex items-center gap-2">
                  {(isSubmitting || saveMutation.isPending) && <Loader2 size={14} className="animate-spin"/>} Assign Shift
                </button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </div>
  );
}