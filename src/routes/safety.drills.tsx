import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { supabase } from '../lib/supabase';
import { format, parseISO, formatISO } from 'date-fns';
import { ShieldAlert, Plus, Loader2, Clock, AlertTriangle, CheckCircle, X, Search } from 'lucide-react';
import { SafetyDrill } from '../types';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const safetyDrillsOptions = queryOptions({
  queryKey: ['safety_drills'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('safety_drills')
      .select('*')
      .eq('is_deleted', false)
      .order('drill_date', { ascending: false });
    if (error) throw error;
    return (data || []) as SafetyDrill[];
  },
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/safety/drills')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    await queryClient.ensureQueryData(safetyDrillsOptions);
  },
  component: SafetyDrillsPage,
});

// ------------------------------------------------------------------
// MAIN COMPONENT
// ------------------------------------------------------------------
export function SafetyDrillsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    const channel = supabase.channel('safety-drills-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'safety_drills' }, () => {
        queryClient.invalidateQueries({ queryKey: ['safety_drills'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: drills = [], isLoading } = useQuery(safetyDrillsOptions);

  const filteredDrills = useMemo(() => {
    if (!searchQuery) return drills;
    const lower = searchQuery.toLowerCase();
    return drills.filter(d => 
      (d.drill_type || '').toLowerCase().includes(lower) ||
      (d.scenario_description || '').toLowerCase().includes(lower) ||
      (d.areas_involved || '').toLowerCase().includes(lower)
    );
  }, [drills, searchQuery]);

  const rowVirtualizer = useWindowVirtualizer({
    count: filteredDrills.length,
    estimateSize: () => 200, 
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div className="max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-300 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-slate-200 pb-6">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight flex items-center gap-3 text-slate-900">
            <ShieldAlert className="text-amber-500" /> ZLA Safety Drills
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Emergency Simulation & Response Audits</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search simulations..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-sm" 
            />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="w-full sm:w-auto bg-slate-900 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-all shadow-md shrink-0"
          >
            <Plus size={14} /> Log Simulation
          </button>
        </div>
      </div>

      <div className="min-h-[500px] relative">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="animate-spin text-amber-500" size={32} /></div>
        ) : filteredDrills.length === 0 ? (
          <div className="py-16 text-center text-slate-400 bg-white border-2 border-dashed border-slate-200 rounded-2xl">
            <ShieldAlert size={48} className="mx-auto mb-3 opacity-20 text-amber-500" />
            <p className="text-xs font-black uppercase tracking-widest">No Drills Logged</p>
          </div>
        ) : (
          <div className="w-full relative" style={{ height: rowVirtualizer.getTotalSize() }}>
            {virtualItems.map((virtualRow) => {
              const drill = filteredDrills[virtualRow.index];
              return (
                <div 
                  key={drill.id} 
                  ref={rowVirtualizer.measureElement} 
                  data-index={virtualRow.index} 
                  className="absolute top-0 left-0 w-full py-3"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 hover:border-amber-300 transition-all shadow-sm">
                    <div className="flex flex-col lg:flex-row justify-between gap-6">
                      
                      <div className="space-y-4 lg:w-1/3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 px-2 py-1 rounded inline-block mb-2">
                              {drill.drill_type}
                            </span>
                            <h3 className="text-base font-black text-slate-900 leading-tight">{drill.scenario_description}</h3>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                            <Clock size={14} className="text-slate-400" /> {format(new Date(drill.drill_date), 'dd MMM yyyy HH:mm')}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                            <AlertTriangle size={14} className="text-slate-400" /> {drill.areas_involved}
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 space-y-4 lg:border-l lg:border-slate-100 lg:pl-6">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                           <div>
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Duration</p>
                             <p className="text-sm font-bold text-slate-900">{drill.duration_seconds}s</p>
                           </div>
                           <div>
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Roll Call</p>
                             <p className={`text-sm font-bold flex items-center gap-1 ${drill.roll_call_completed ? 'text-emerald-600' : 'text-rose-600'}`}>
                               {drill.roll_call_completed ? <CheckCircle size={14} /> : <X size={14} />} {drill.roll_call_completed ? 'Cleared' : 'Failed'}
                             </p>
                           </div>
                           <div>
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                             <p className="text-sm font-bold text-slate-900">{drill.status}</p>
                           </div>
                           <div>
                             <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Simulation</p>
                             <p className="text-sm font-bold text-slate-900">{drill.is_simulation ? 'Yes' : 'No - Live Incident'}</p>
                           </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Issues Observed</p>
                            <p className="text-xs font-medium text-slate-600 bg-white p-3 rounded-xl border border-slate-200 min-h-[60px]">{drill.issues_observed || 'None logged.'}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Corrective Actions</p>
                            <p className="text-xs font-medium text-slate-600 bg-white p-3 rounded-xl border border-slate-200 min-h-[60px]">{drill.corrective_actions || 'None required.'}</p>
                          </div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isModalOpen && <DrillModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}

// ------------------------------------------------------------------
// TANSTACK FORM MODAL
// ------------------------------------------------------------------
function DrillModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      // ENTERPRISE FIX: Use strictly formatted ISO string with local timezone offset
      const payloadToSubmit = {
        ...payload,
        drill_date: formatISO(parseISO(payload.drill_date)),
      };
      
      const { error } = await supabase.from('safety_drills').insert([payloadToSubmit]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['safety_drills'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to save drill.')
  });

  const form = useForm({
    defaultValues: { 
      drill_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      drill_type: 'Code Red - Dangerous Animal Escape', 
      scenario_description: '', 
      areas_involved: '',
      duration_seconds: 0,
      roll_call_completed: true,
      issues_observed: '',
      corrective_actions: '',
      status: 'COMPLETED',
      is_simulation: true
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      await saveMutation.mutateAsync(value);
    }
  });

  const inputClass = "w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-sm";
  const labelClass = "block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-50 rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-slate-200 bg-white flex justify-between items-center">
          <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2 text-lg">
            <ShieldAlert className="text-amber-500" /> Log Safety Drill
          </h3>
          <button onClick={onClose} className="p-2 bg-slate-100 text-slate-400 hover:text-slate-700 rounded-full transition-colors"><X size={18} /></button>
        </div>
        
        <div className="p-6 overflow-y-auto max-h-[75vh]">
          <form onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="space-y-6">
            {errorMsg && <div className="p-4 bg-rose-50 text-rose-700 text-xs font-bold rounded-xl border border-rose-200">{errorMsg}</div>}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <form.Field name="drill_type" children={(field) => (
                <div>
                  <label className={labelClass}>Drill Type *</label>
                  <select required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="Code Red - Dangerous Animal Escape">Code Red - Dangerous Animal Escape</option>
                    <option value="Code Green - Non-Dangerous Animal Escape">Code Green - Non-Dangerous Animal Escape</option>
                    <option value="Fire Evacuation">Fire Evacuation</option>
                    <option value="First Aid / Medical Emergency">First Aid / Medical Emergency</option>
                    <option value="Intruder / Lockdown">Intruder / Lockdown</option>
                  </select>
                </div>
              )} />
              <form.Field name="drill_date" children={(field) => (
                <div>
                  <label className={labelClass}>Date & Time *</label>
                  <input type="datetime-local" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )} />
            </div>

            <form.Field name="scenario_description" children={(field) => (
              <div>
                <label className={labelClass}>Scenario Description *</label>
                <input required placeholder="Briefly describe the simulated event..." value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
              </div>
            )} />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <form.Field name="areas_involved" children={(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Areas Involved *</label>
                  <input required placeholder="e.g. Aviary A, Main Walkway" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )} />
              <form.Field name="duration_seconds" children={(field) => (
                <div>
                  <label className={labelClass}>Duration (Seconds) *</label>
                  <input type="number" required min="0" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(Number(e.target.value))} className={inputClass} />
                </div>
              )} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-5 rounded-2xl border border-slate-200">
              <form.Field name="roll_call_completed" children={(field) => (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={field.state.value} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-amber-500 focus:ring-amber-500" />
                  <div>
                    <span className="block text-sm font-bold text-slate-900">Roll Call Cleared</span>
                    <span className="block text-[10px] font-medium text-slate-500 uppercase tracking-widest">All staff & visitors accounted for</span>
                  </div>
                </label>
              )} />
              <form.Field name="is_simulation" children={(field) => (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={field.state.value} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-slate-300 text-indigo-500 focus:ring-indigo-500" />
                  <div>
                    <span className="block text-sm font-bold text-slate-900">This was a Simulation</span>
                    <span className="block text-[10px] font-medium text-slate-500 uppercase tracking-widest">Uncheck if real incident</span>
                  </div>
                </label>
              )} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <form.Field name="issues_observed" children={(field) => (
                <div>
                  <label className={labelClass}>Issues Observed</label>
                  <textarea placeholder="Any failures or delays during the response?" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} h-24 resize-none`} />
                </div>
              )} />
              <form.Field name="corrective_actions" children={(field) => (
                <div>
                  <label className={labelClass}>Corrective Actions</label>
                  <textarea placeholder="Steps taken to improve future response..." value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} h-24 resize-none`} />
                </div>
              )} />
            </div>
            
            <div className="pt-6 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-3">
               <button type="button" onClick={onClose} className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
              <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
                {([canSubmit, isSubmitting]) => (
                  <button type="submit" disabled={!canSubmit || isSubmitting as boolean || saveMutation.isPending} className="flex items-center justify-center gap-2 bg-amber-500 text-white px-8 py-3 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-amber-600 transition-all shadow-md disabled:opacity-50">
                    {(isSubmitting || saveMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : 'Save Report'}
                  </button>
                )}
              </form.Subscribe>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}