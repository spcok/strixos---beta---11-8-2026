import React, { useState, useMemo, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ShieldAlert, Plus, X, Search, Save, Loader2, AlertTriangle, CheckCircle2, FileText, Clock, BriefcaseMedical, UserCircle, Activity, Ambulance } from 'lucide-react';
import { format, parseISO, formatISO } from 'date-fns';
import { useAuth } from '../lib/auth';
import { incidentService } from '../services/incidentService';
import { firstAidService, StaffMember } from '../services/firstAidService';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const incidentsOptions = queryOptions({
  queryKey: ['incidents'],
  queryFn: () => incidentService.getIncidents(),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const staffMembersOptions = queryOptions({
  queryKey: ['staff_members'],
  queryFn: () => firstAidService.getStaffMembers(),
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/safety/incidents')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) {
      // @ts-ignore
      await queryClient.ensureQueryData(incidentsOptions);
      // @ts-ignore
      await queryClient.ensureQueryData(staffMembersOptions);
    }
  },
  component: IncidentsPage,
});

export function IncidentsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [resolvingIncident, setResolvingIncident] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');

  const { data: incidents = [], isLoading } = useQuery(incidentsOptions);
  const { data: staffMembers = [] } = useQuery(staffMembersOptions);

  const filteredIncidents = useMemo(() => {
    let filtered = incidents;
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter((inc: any) => inc.status === statusFilter);
    }
    if (searchQuery) {
      const lower = searchQuery.toLowerCase();
      filtered = filtered.filter((inc: any) => 
        (inc.title || '').toLowerCase().includes(lower) ||
        (inc.description || '').toLowerCase().includes(lower)
      );
    }
    return filtered;
  }, [incidents, searchQuery, statusFilter]);

  // ------------------------------------------------------------------
  // VIRTUALIZER ENGINE (DOM Protection)
  // ------------------------------------------------------------------
  const rowVirtualizer = useVirtualizer({
    count: filteredIncidents.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 100, 
    overscan: 5,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string, notes: string }) => {
      await incidentService.resolveIncident(id, notes);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setResolvingIncident(null);
    }
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-rose-100 text-rose-800 border-rose-300';
      case 'HIGH': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'MEDIUM': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-slate-100 text-slate-800 border-slate-300';
    }
  };

  const inputClass = "bg-transparent text-[10px] font-black text-slate-700 uppercase tracking-widest border-none focus:ring-0 cursor-pointer outline-none py-1 pr-2 w-32 truncate";

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <ShieldAlert className="text-amber-600" size={24} /> Operational Incidents
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">ZLA Compliance & Breach Logging</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className={inputClass}>
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open Actions</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search breaches..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm" 
            />
          </div>
          
          <button 
            onClick={() => setIsNewModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(217,119,6,0.15)]"
          >
            <Plus size={16} /> Log Incident
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
        <div className="w-full overflow-x-auto relative flex-1">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <Loader2 className="animate-spin text-amber-600 w-8 h-8" />
            </div>
          )}

          {/* Virtualized Grid Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[900px]">
            <div className="col-span-3">Date & Time</div>
            <div className="col-span-3">Incident Classification</div>
            <div className="col-span-4">Operational Description</div>
            <div className="col-span-2 text-right">Status / Action</div>
          </div>

          <div ref={scrollParentRef} className="overflow-auto h-[calc(100%-53px)] custom-scrollbar min-w-[900px]">
            {filteredIncidents.length === 0 && !isLoading ? (
              <div className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                No operational breaches found.
              </div>
            ) : (
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const inc = filteredIncidents[virtualRow.index];
                  const dateObj = new Date(inc.incident_date);
                  const isOpen = inc.status === 'OPEN';

                  return (
                    <div
                      key={virtualRow.key}
                      className="absolute top-0 left-0 w-full transition-colors border-b border-slate-100 hover:bg-slate-50/60"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="grid grid-cols-12 gap-4 px-6 py-3 items-center h-full">
                        <div className="col-span-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            <Clock size={12} /> {format(dateObj, 'dd MMM yyyy')} | {format(dateObj, 'HH:mm')}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <div className="flex flex-col gap-1.5 items-start">
                            <p className="text-xs font-black text-slate-900 uppercase tracking-tight leading-tight truncate w-full">{inc.title}</p>
                            <div className="flex gap-2">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${getSeverityColor(inc.severity)}`}>
                                {inc.severity}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border bg-slate-100 text-slate-600 border-slate-300">
                                {inc.incident_type.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="col-span-4">
                          <div className="space-y-1 py-1">
                            <p className="text-[11px] font-medium text-slate-600 line-clamp-2 leading-relaxed">{inc.description}</p>
                            {inc.immediate_action_taken && (
                              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-start gap-1">
                                <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-500" /> 
                                <span className="line-clamp-1 truncate">Action: {inc.immediate_action_taken}</span>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2 flex justify-end">
                          {isOpen ? (
                            <button 
                              onClick={() => setResolvingIncident(inc)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-[10px] font-black text-amber-700 uppercase tracking-widest hover:bg-amber-100 transition-colors shadow-sm"
                            >
                              <FileText size={14} /> Resolve & Close
                            </button>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-emerald-200 bg-emerald-50 text-[9px] font-black text-emerald-700 uppercase tracking-widest shadow-sm">
                                <CheckCircle2 size={12} /> Resolved
                              </span>
                              {inc.resolution_notes && (
                                <span className="text-[9px] font-bold text-slate-400 w-full text-right truncate" title={inc.resolution_notes}>
                                  {inc.resolution_notes}
                                </span>
                              )}
                            </div>
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
      </div>

      {isNewModalOpen && (
        <CompoundIncidentModal onClose={() => setIsNewModalOpen(false)} userId={user?.id} staffMembers={staffMembers} />
      )}
      
      {resolvingIncident && (
        <ResolutionModal incident={resolvingIncident} onClose={() => setResolvingIncident(null)} mutation={resolveMutation} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMPOUND INCIDENT MODAL 
// ---------------------------------------------------------------------------
function CompoundIncidentModal({ onClose, userId, staffMembers }: { onClose: () => void, userId?: string, staffMembers: StaffMember[] }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payloads: { incident: any, firstAid?: any }) => {
      await incidentService.commitIncident(payloads.incident, payloads.firstAid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      queryClient.invalidateQueries({ queryKey: ['first_aid_logs'] });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to sync incident record.');
    }
  });

  const form = useForm({
    defaultValues: {
      incident_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      title: '', incident_type: 'ESCAPE', severity: 'MEDIUM', description: '', immediate_action_taken: '',
      requires_first_aid: false, person_involved_name: '', person_type: 'KEEPER', administered_by: userId || '',
      injury_description: '', treatment_provided: '', referral_needed: false, referral_details: ''
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      
      // ENTERPRISE FIX: Strict ISO output with timezone offset retained
      const parsedDate = formatISO(parseISO(value.incident_date));

      const incidentPayload = {
        title: value.title, incident_date: parsedDate, incident_type: value.incident_type,
        severity: value.severity, description: value.description, immediate_action_taken: value.immediate_action_taken, status: 'OPEN'
      };

      let firstAidPayload = undefined;
      if (value.requires_first_aid) {
        firstAidPayload = {
          incident_date: parsedDate, person_involved_name: value.person_involved_name, person_type: value.person_type,
          administered_by: value.administered_by, injury_description: value.injury_description, treatment_provided: value.treatment_provided,
          referral_needed: value.referral_needed, referral_details: value.referral_needed ? value.referral_details : null,
        };
      }
      await saveMutation.mutateAsync({ incident: incidentPayload, firstAid: firstAidPayload });
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl relative overflow-hidden my-auto">
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <ShieldAlert size={20} className="text-amber-600" /> Log Operational Breach
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        <form id="incident-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-6">
          {errorMsg && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm">{errorMsg}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
            <form.Field name="title">{(field) => (<div className="md:col-span-2"><label className={labelClass}>Incident Title</label><input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. Sub-adult Eagle Owl Enclosure Breach" className={inputClass} /></div>)}</form.Field>
            <form.Field name="incident_date">{(field) => (<div><label className={labelClass}>Date & Time of Discovery</label><input type="datetime-local" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} /></div>)}</form.Field>
            <form.Field name="severity">{(field) => (<div><label className={labelClass}>Severity Matrix</label><select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required><option value="LOW">LOW - Minor disruption</option><option value="MEDIUM">MEDIUM - Controlled breach</option><option value="HIGH">HIGH - Severe incident / Escape</option><option value="CRITICAL">CRITICAL - Emergency protocol initiated</option></select></div>)}</form.Field>
            
            <form.Field name="incident_type">
              {(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Incident Classification</label>
                  <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm flex-wrap gap-1">
                    {['ESCAPE', 'ANIMAL_BEHAVIOR', 'INFRASTRUCTURE', 'SLIP_TRIP_FALL', 'OTHER'].map((type) => (
                      <button key={type} type="button" onClick={() => field.handleChange(type)} className={`flex-1 min-w-[120px] py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${field.state.value === type ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                        {type.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form.Field>
          </div>

          <div className="space-y-5">
            <form.Field name="description">{(field) => (<div><label className={labelClass}>Operational Description</label><textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={3} className={`${inputClass} resize-none h-24`} placeholder="Detailed breakdown of how the breach occurred..." /></div>)}</form.Field>
            <form.Field name="immediate_action_taken">{(field) => (<div><label className={`${labelClass} text-amber-700 flex items-center gap-1.5`}><AlertTriangle size={14} /> Immediate Corrective Actions Taken</label><textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none h-20 bg-amber-50/30 border-amber-200 focus:border-amber-500`} placeholder="E.g., Perimeter locked down..." /></div>)}</form.Field>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <form.Field name="requires_first_aid">
              {(field) => (
                <label className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer hover:bg-emerald-100 transition-colors shadow-sm">
                  <input type="checkbox" checked={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 bg-white" />
                  <div className="flex flex-col"><span className="text-xs font-black text-emerald-800 uppercase tracking-widest flex items-center gap-2"><BriefcaseMedical size={16} /> Human Injury Sustained</span><span className="text-[10px] font-bold text-emerald-600 mt-0.5">Check this if the incident resulted in an injury requiring first aid or medical referral.</span></div>
                </label>
              )}
            </form.Field>

            <form.Subscribe selector={(state) => state.values.requires_first_aid}>
              {(needsFirstAid) => needsFirstAid && (
                <div className="mt-4 p-5 bg-white border-2 border-emerald-200 rounded-2xl shadow-sm space-y-5 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center gap-2 mb-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><h3 className="text-xs font-black text-slate-900 uppercase tracking-widest">Linked Clinical Report</h3></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <form.Field name="person_type">{(field) => (<div><label className={labelClass}>Patient Category</label><select value={field.state.value} onChange={e => field.handleChange(e.target.value)} className={`${inputClass} border-emerald-200 focus:border-emerald-500`} required><option value="KEEPER">Staff / Keeper</option><option value="PUBLIC">Public / Visitor</option><option value="CONTRACTOR">Contractor</option><option value="OTHER">Other</option></select></div>)}</form.Field>
                    <form.Field name="person_involved_name">{(field) => (<div><label className={labelClass}>Patient Full Name</label><input type="text" required value={field.state.value} onChange={e => field.handleChange(e.target.value)} placeholder="e.g. John Doe" className={`${inputClass} border-emerald-200 focus:border-emerald-500 focus:ring-emerald-500/20`} /></div>)}</form.Field>
                    <form.Field name="injury_description">{(field) => (<div className="md:col-span-2"><label className={labelClass}>Nature of Injury / Symptoms</label><textarea required value={field.state.value} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none border-emerald-200 focus:border-emerald-500`} placeholder="E.g., Laceration on left index finger..." /></div>)}</form.Field>
                    <form.Field name="treatment_provided">{(field) => (<div className="md:col-span-2"><label className={`${labelClass} flex items-center gap-2`}><Activity size={14} className="text-emerald-600" /> Treatment Administered</label><textarea required value={field.state.value} onChange={e => field.handleChange(e.target.value)} rows={2} className={`${inputClass} resize-none border-emerald-200 focus:border-emerald-500`} placeholder="E.g., Cleaned wound..." /></div>)}</form.Field>
                    <form.Field name="administered_by">
                      {(field) => (
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 md:col-span-2">
                          <label className={`${labelClass} text-emerald-700`}><UserCircle size={14} className="inline mr-1 mb-0.5" /> Attending First Aider</label>
                          <select value={field.state.value} onChange={e => field.handleChange(e.target.value)} required className={`${inputClass} border-emerald-200 focus:border-emerald-500`}>
                            <option value="">-- Select First Aider --</option>
                            {staffMembers.map((staff: StaffMember) => (<option key={staff.id} value={staff.id}>{staff.name || staff.email} {staff.initials ? `(${staff.initials})` : ''}</option>))}
                          </select>
                        </div>
                      )}
                    </form.Field>
                    <div className="md:col-span-2 space-y-4 pt-2">
                      <form.Field name="referral_needed">{(field) => (<label className="flex items-center gap-3 p-3 bg-rose-50 border border-rose-200 rounded-xl cursor-pointer hover:bg-rose-100 transition-colors shadow-sm"><input type="checkbox" checked={field.state.value} onChange={e => field.handleChange(e.target.checked)} className="w-5 h-5 rounded border-rose-300 text-rose-600 focus:ring-rose-500 bg-white" /><span className="text-xs font-black text-rose-800 uppercase tracking-widest flex items-center gap-2"><Ambulance size={16} /> External Medical Care Required</span></label>)}</form.Field>
                      <form.Subscribe selector={(state) => state.values.referral_needed}>{(referralNeeded) => referralNeeded && (<form.Field name="referral_details">{(field) => (<div className="animate-in fade-in slide-in-from-top-2"><label className={labelClass}>Hospital / Paramedic Details</label><input type="text" required value={field.state.value} onChange={e => field.handleChange(e.target.value)} placeholder="E.g., Ambulance called..." className={`${inputClass} border-rose-200 focus:border-rose-500 focus:ring-rose-500/20`} /></div>)}</form.Field>)}</form.Subscribe>
                    </div>
                  </div>
                </div>
              )}
            </form.Subscribe>
          </div>
        </form>
        
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting, state.values.requires_first_aid]}>
            {([canSubmit, isSubmitting, hasFirstAid]) => (
              <button type="submit" form="incident-form" disabled={!canSubmit || isSubmitting as boolean || saveMutation.isPending} className={`px-8 py-2.5 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg disabled:opacity-50 ${hasFirstAid ? 'bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-800 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-amber-600 hover:bg-amber-500 disabled:bg-amber-800 shadow-[0_0_15px_rgba(217,119,6,0.15)]'}`}>
                {isSubmitting || saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {hasFirstAid ? 'Commit Linked Reports' : 'Commit Incident'}
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RESOLUTION MODAL COMPONENT
// ---------------------------------------------------------------------------
function ResolutionModal({ incident, onClose, mutation }: { incident: any, onClose: () => void, mutation: any }) {
  const form = useForm({
    defaultValues: { notes: '' },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync({ id: incident.id, notes: value.notes });
    }
  });

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md flex flex-col shadow-2xl relative overflow-hidden">
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600" /> Resolve Action
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors">
            <X size={18} />
          </button>
        </div>

        <form id="resolution-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
            <p className="text-xs font-black text-blue-900 uppercase tracking-tight line-clamp-1">{incident.title}</p>
            <p className="text-[10px] font-bold text-blue-600 mt-1">Provide formal resolution sign-off notes to close this compliance record.</p>
          </div>

          <form.Field name="notes">
            {(field) => (
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Resolution Notes</label>
                <textarea 
                  required 
                  value={field.state.value} 
                  onBlur={field.handleBlur}
                  onChange={e => field.handleChange(e.target.value)} 
                  rows={4} 
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-inner resize-none" 
                  placeholder="E.g., Padlock replaced on Aviary B, perimeter deemed secure. Protocols updated..." 
                />
              </div>
            )}
          </form.Field>
        </form>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors">
            Cancel
          </button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button 
                type="submit" 
                form="resolution-form"
                disabled={!canSubmit || isSubmitting as boolean || mutation.isPending} 
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm"
              >
                {isSubmitting || mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Close Incident
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}