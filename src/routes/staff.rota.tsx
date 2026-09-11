import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Calendar as CalendarIcon, Loader2, ChevronLeft, ChevronRight, Search, Plus, Umbrella, Trash2, Clock, MapPin } from 'lucide-react';
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, parseISO } from 'date-fns';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { rotaService } from '../services/rotaService';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const getRotaOptions = (start: string, end: string) => queryOptions({
  queryKey: ['rota_matrix', start, end],
  queryFn: () => rotaService.getRotaData(start, end),
  staleTime: 1000 * 60 * 15,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION (Pre-fetching)
// ------------------------------------------------------------------
export const Route = createFileRoute('/staff/rota')({
  loader: async ({ context: { queryClient } }) => {
    const today = new Date();
    const start = startOfWeek(today, { weekStartsOn: 1 });
    const end = endOfWeek(today, { weekStartsOn: 1 });
    const queryBufferStart = format(addDays(start, -14), 'yyyy-MM-dd');
    const queryBufferEnd = format(addDays(end, 14), 'yyyy-MM-dd');
    
    // @ts-ignore
    if (queryClient) await queryClient.ensureQueryData(getRotaOptions(queryBufferStart, queryBufferEnd));
  },
  component: RotaPage,
});

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function RotaPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const isManager = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.role === 'HR';

  const [view, setView] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [baseDate, setBaseDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [modalState, setModalState] = useState<'NONE' | 'SHIFT' | 'LEAVE'>('NONE');

  const dateRange = useMemo(() => {
    if (view === 'DAILY') return { start: baseDate, end: baseDate };
    if (view === 'WEEKLY') return { start: startOfWeek(baseDate, { weekStartsOn: 1 }), end: endOfWeek(baseDate, { weekStartsOn: 1 }) };
    return { start: startOfMonth(baseDate), end: endOfMonth(baseDate) };
  }, [view, baseDate]);

  const matrixDays = useMemo(() => eachDayOfInterval(dateRange), [dateRange]);
  
  const monthlyGridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(baseDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(baseDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [baseDate]);

  const queryBufferStart = format(addDays(dateRange.start, -14), 'yyyy-MM-dd');
  const queryBufferEnd = format(addDays(dateRange.end, 14), 'yyyy-MM-dd');

  // ------------------------------------------------------------------
  // SUPABASE REALTIME CACHE INVALIDATION
  // ------------------------------------------------------------------
  useEffect(() => {
    const shiftsChannel = supabase.channel('shifts-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
        queryClient.invalidateQueries({ queryKey: ['rota_matrix'] });
      }).subscribe();
      
    const leaveChannel = supabase.channel('leave-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave' }, () => {
        queryClient.invalidateQueries({ queryKey: ['rota_matrix'] });
      }).subscribe();

    return () => {
      supabase.removeChannel(shiftsChannel);
      supabase.removeChannel(leaveChannel);
    };
  }, [queryClient]);

  const { data, isLoading } = useQuery(getRotaOptions(queryBufferStart, queryBufferEnd));

  const deleteShiftMutation = useMutation({
    mutationFn: (id: string) => rotaService.deleteShift(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rota_matrix'] })
  });

  const { shiftMap, leaveMap } = useMemo(() => {
    if (!data) return { shiftMap: {}, leaveMap: {} };
    const sMap: Record<string, any> = {};
    const lMap: Record<string, any> = {};

    data.shifts.forEach((s: any) => {
      const dateKey = s.start_time.split('T')[0];
      sMap[`${s.user_id}_${dateKey}`] = s;
    });

    data.leave.forEach((l: any) => {
      eachDayOfInterval({ start: parseISO(l.start_date), end: parseISO(l.end_date) }).forEach(d => {
        lMap[`${l.user_id}_${format(d, 'yyyy-MM-dd')}`] = l;
      });
    });

    return { shiftMap: sMap, leaveMap: lMap };
  }, [data]);

  // ENTERPRISE FIX: Filter staff accurately for the grid matrix
  const filteredStaff = useMemo(() => {
    if (!data?.staff) return [];
    
    // Only display staff on the grid if they are active, OR if they are deleted but had a shift/leave assigned in this exact view window
    let visibleStaff = data.staff.filter((s: any) => {
      if (!s.is_deleted && s.is_active !== false) return true;
      
      return matrixDays.some(date => {
        const lookupKey = `${s.id}_${format(date, 'yyyy-MM-dd')}`;
        return shiftMap[lookupKey] || leaveMap[lookupKey];
      });
    });

    if (!searchQuery.trim()) return visibleStaff;
    
    const query = searchQuery.toLowerCase();
    return visibleStaff.filter((s: any) => 
      (s.name || '').toLowerCase().includes(query) || 
      (s.role || '').toLowerCase().includes(query)
    );
  }, [data?.staff, searchQuery, matrixDays, shiftMap, leaveMap]);

  const handlePrev = () => {
    if (view === 'DAILY') setBaseDate(addDays(baseDate, -1));
    if (view === 'WEEKLY') setBaseDate(addDays(baseDate, -7));
    if (view === 'MONTHLY') setBaseDate(addDays(startOfMonth(baseDate), -1));
  };

  const handleNext = () => {
    if (view === 'DAILY') setBaseDate(addDays(baseDate, 1));
    if (view === 'WEEKLY') setBaseDate(addDays(baseDate, 7));
    if (view === 'MONTHLY') setBaseDate(addDays(endOfMonth(baseDate), 1));
  };

  // ------------------------------------------------------------------
  // 4. VIRTUALIZER ENGINE (DOM PROTECTION)
  // ------------------------------------------------------------------
  const rowVirtualizer = useVirtualizer({
    count: filteredStaff.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 64, 
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-20 font-sans">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3 w-48">
            <CalendarIcon className="text-indigo-600" /> Staff Rota
          </h1>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Filter by name..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm" 
            />
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-slate-100 p-1 rounded-xl flex">
            {(['DAILY', 'WEEKLY', 'MONTHLY'] as const).map(v => (
              <button 
                key={v} 
                onClick={() => setView(v)} 
                className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${view === v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                {v}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
             <button onClick={handlePrev} className="p-2 hover:bg-slate-50 border-r border-slate-200 text-slate-600"><ChevronLeft size={16}/></button>
             <span className="px-4 text-[11px] font-black uppercase tracking-widest text-slate-700 w-36 text-center">
                {view === 'DAILY' ? format(baseDate, 'dd MMM yyyy') : view === 'WEEKLY' ? `W/C ${format(dateRange.start, 'dd MMM')}` : format(baseDate, 'MMMM yyyy')}
             </span>
             <button onClick={handleNext} className="p-2 hover:bg-slate-50 border-l border-slate-200 text-slate-600"><ChevronRight size={16}/></button>
          </div>

          {isManager && (
            <div className="flex gap-2 border-l border-slate-200 pl-4">
              <button onClick={() => setModalState('SHIFT')} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-indigo-200 shadow-sm">
                <Plus size={14} /> Add Shift
              </button>
              <button onClick={() => setModalState('LEAVE')} className="flex items-center gap-1.5 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all border border-rose-200 shadow-sm">
                <Umbrella size={14} /> Log Absence
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-[calc(100vh-16rem)] min-h-[600px] flex flex-col relative overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/60 backdrop-blur-sm">
            <Loader2 className="animate-spin text-indigo-600" size={32} />
          </div>
        )}
        
        {view === 'MONTHLY' ? (
          <div className="flex-1 flex flex-col bg-slate-50">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-white shadow-sm shrink-0">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                <div key={day} className="py-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-100 last:border-0">{day}</div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 flex-1 auto-rows-fr">
              {monthlyGridDays.map((date, i) => {
                const dateKey = format(date, 'yyyy-MM-dd');
                const isCurrentMonth = isSameMonth(date, baseDate);
                const isToday = isSameDay(date, new Date());
                
                const workingStaff = filteredStaff.filter(s => shiftMap[`${s.id}_${dateKey}`]);
                const absentStaff = filteredStaff.filter(s => leaveMap[`${s.id}_${dateKey}`]);

                return (
                  <div key={i} className={`border-r border-b border-slate-200 p-2 flex flex-col gap-1 overflow-hidden ${!isCurrentMonth ? 'bg-slate-100 opacity-50' : 'bg-white'} ${isToday ? 'ring-2 ring-inset ring-indigo-500' : ''}`}>
                    <div className={`text-right text-[10px] font-black ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {format(date, 'd')}
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 pr-1">
                      {absentStaff.map(staff => {
                        const l = leaveMap[`${staff.id}_${dateKey}`];
                        return (
                          <div key={staff.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded border truncate text-rose-700 bg-rose-50 border-rose-200" title={`${staff.name} - ${l.leave_type}`}>
                            {staff.name.split(' ')[0]} (Abs)
                          </div>
                        )
                      })}
                      
                      {workingStaff.map(staff => {
                        const s = shiftMap[`${staff.id}_${dateKey}`];
                        const start = s.start_time.split('T')[1].substring(0, 5);
                        const end = s.end_time.split('T')[1].substring(0, 5);
                        return (
                          <div key={staff.id} className="text-[9px] font-bold px-1.5 py-0.5 rounded border truncate text-slate-700 bg-white border-slate-200 shadow-sm" title={`${staff.name}: ${start} - ${end}`}>
                            <span className="font-black text-indigo-600 mr-1">{start}</span> 
                            {staff.name.split(' ')[0]}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto custom-scrollbar" ref={scrollParentRef}>
            <div className="w-full min-w-[800px] flex flex-col h-full relative">
              
              <div className="flex sticky top-0 z-30 bg-slate-50 border-b border-slate-200 shadow-sm">
                <div className="w-56 shrink-0 p-4 border-r border-slate-200 sticky left-0 bg-slate-50 z-40 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] flex items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Staff Member</span>
                </div>
                {matrixDays.map((d, i) => {
                  const isToday = isSameDay(d, new Date());
                  return (
                    <div key={i} className={`flex-1 p-3 flex flex-col items-center justify-center border-r border-slate-200 transition-colors ${isToday ? 'bg-indigo-50/50' : ''}`}>
                      <span className={`text-[9px] font-black uppercase tracking-widest ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>{format(d, 'EEE')}</span>
                      <span className={`text-sm font-black tracking-tight ${isToday ? 'text-indigo-700' : 'text-slate-900'}`}>{format(d, 'dd MMM')}</span>
                    </div>
                  );
                })}
              </div>

              <div className="divide-y divide-slate-100 flex-1 relative">
                {filteredStaff.length === 0 && !isLoading ? (
                  <div className="p-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400">No staff found matching criteria.</div>
                ) : (
                  <>
                    {paddingTop > 0 && <div style={{ height: paddingTop }} />}
                    {virtualItems.map((virtualRow) => {
                      const staff = filteredStaff[virtualRow.index];
                      return (
                        <div key={staff.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="flex hover:bg-slate-50/50 transition-colors group/row">
                          <div className="w-56 shrink-0 p-3 border-r border-slate-200 bg-white sticky left-0 z-20 flex flex-col justify-center shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)] group-hover/row:bg-slate-50/50 transition-colors">
                            <span className="text-xs font-black text-slate-900 truncate">{staff.name || 'Unnamed'}</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest truncate">{staff.role}</span>
                          </div>

                          {matrixDays.map((date, i) => {
                            const lookupKey = `${staff.id}_${format(date, 'yyyy-MM-dd')}`;
                            const leave = leaveMap[lookupKey];
                            const shift = shiftMap[lookupKey];

                            return (
                              <div key={i} className="flex-1 p-1.5 border-r border-slate-100 min-h-[64px] flex items-stretch justify-center relative">
                                {leave ? (
                                  <div className={`w-full p-2 rounded-xl border flex flex-col items-center justify-center text-center shadow-sm ${leave.leave_type === 'SICK' ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                                    <span className="text-[9px] font-black uppercase tracking-widest">{leave.leave_type.replace(/_/g, ' ')}</span>
                                    <span className="text-[8px] font-bold mt-0.5 truncate w-full opacity-70">{leave.reason || 'Approved'}</span>
                                  </div>
                                ) : shift ? (
                                  <div className="w-full p-2 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col items-center justify-center text-center relative group/cell hover:border-indigo-300 hover:shadow-md transition-all">
                                    <span className="text-[10px] font-black text-slate-900 tracking-tight flex items-center gap-1">
                                      <Clock size={10} className="text-slate-400" />
                                      {shift.start_time.split('T')[1].substring(0, 5)} - {shift.end_time.split('T')[1].substring(0, 5)}
                                    </span>
                                    {shift.assigned_area && (
                                      <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1 truncate w-full flex justify-center items-center gap-1">
                                        <MapPin size={8} /> {shift.assigned_area}
                                      </span>
                                    )}
                                    {isManager && (
                                      <button onClick={() => deleteShiftMutation.mutate(shift.id)} className="absolute -top-1.5 -right-1.5 bg-white border border-rose-200 text-rose-500 p-1 rounded-full opacity-0 group-hover/cell:opacity-100 transition-all shadow-sm hover:bg-rose-500 hover:text-white" title="Delete Shift"><Trash2 size={10} /></button>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )
                    })}
                    {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {modalState === 'SHIFT' && <ShiftModal onClose={() => setModalState('NONE')} staff={data?.staff || []} />}
      {modalState === 'LEAVE' && <LeaveModal onClose={() => setModalState('NONE')} staff={data?.staff || []} />}
    </div>
  );
}

// ============================================================================
// MODAL: ADD AD-HOC SHIFT (TANSTACK FORM)
// ============================================================================
function ShiftModal({ onClose, staff }: { onClose: () => void, staff: any[] }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => rotaService.saveShift(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rota_matrix'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to save shift.')
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
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2"><Clock size={16} className="text-indigo-600"/> Add Ad-Hoc Shift</h2>
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
                  {/* ENTERPRISE FIX: Prevent assigning new shifts to deleted staff */}
                  {staff
                    .filter((s: any) => !s.is_deleted && s.is_active !== false)
                    .map((s: any) => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
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
                <input type="text" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. Birds of Prey Section" className={inputClass} />
              </div>
            )}
          </form.Field>

          <form.Field name="notes">
            {(field) => (
              <div>
                <label className={labelClass}>Shift Notes (Optional)</label>
                <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="Specific instructions for this shift..." />
              </div>
            )}
          </form.Field>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-100 rounded-xl">Cancel</button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <button type="submit" disabled={!canSubmit || isSubmitting as boolean || saveMutation.isPending} className="px-6 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-500 disabled:opacity-50 shadow-sm flex items-center gap-2">
                  {(isSubmitting || saveMutation.isPending) && <Loader2 size={14} className="animate-spin"/>} Save Shift
                </button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// MODAL: LOG ABSENCE (TANSTACK FORM)
// ============================================================================
function LeaveModal({ onClose, staff }: { onClose: () => void, staff: any[] }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => rotaService.saveLeave(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rota_matrix'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to save absence.')
  });

  const form = useForm({
    defaultValues: {
      user_id: '',
      start_date: format(new Date(), 'yyyy-MM-dd'),
      end_date: format(new Date(), 'yyyy-MM-dd'),
      leave_type: 'ANNUAL_LEAVE',
      reason: ''
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      await saveMutation.mutateAsync({
        user_id: value.user_id,
        start_date: value.start_date,
        end_date: value.end_date,
        leave_type: value.leave_type,
        reason: value.reason,
        status: 'APPROVED'
      });
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2"><Umbrella size={16} className="text-rose-600"/> Log Absence</h2>
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
                  {/* ENTERPRISE FIX: Prevent assigning new leave to deleted staff */}
                  {staff
                    .filter((s: any) => !s.is_deleted && s.is_active !== false)
                    .map((s: any) => <option key={s.id} value={s.id}>{s.name || s.email}</option>)}
                </select>
              </div>
            )}
          </form.Field>

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
                <label className={labelClass}>Reason / Notes</label>
                <textarea value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none`} placeholder="Optional notes..." />
              </div>
            )}
          </form.Field>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-100 rounded-xl">Cancel</button>
            <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
              {([canSubmit, isSubmitting]) => (
                <button type="submit" disabled={!canSubmit || isSubmitting as boolean || saveMutation.isPending} className="px-6 py-2 bg-rose-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 disabled:opacity-50 shadow-sm flex items-center gap-2">
                  {(isSubmitting || saveMutation.isPending) && <Loader2 size={14} className="animate-spin"/>} Save Absence
                </button>
              )}
            </form.Subscribe>
          </div>
        </form>
      </div>
    </div>
  );
}