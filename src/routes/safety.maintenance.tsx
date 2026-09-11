import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useForm } from '@tanstack/react-form';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Wrench, Plus, X, Search, Save, Loader2, AlertCircle, HardHat, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { maintenanceService } from '../services/maintenanceService';

// ------------------------------------------------------------------
// 1. STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const ticketsOptions = queryOptions({
  queryKey: ['maintenance_tickets'],
  queryFn: () => maintenanceService.getTickets(),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const staffOptions = queryOptions({
  queryKey: ['staff_members'],
  queryFn: () => maintenanceService.getStaffMembers(),
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

// ------------------------------------------------------------------
// 2. ROUTE CONFIGURATION (Pre-fetching Loaders)
// ------------------------------------------------------------------
export const Route = createFileRoute('/safety/maintenance')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) {
      // @ts-ignore
      await Promise.all([
        queryClient.ensureQueryData(ticketsOptions),
        queryClient.ensureQueryData(staffOptions)
      ]);
    }
  },
  component: MaintenanceTicketsPage,
});

// ------------------------------------------------------------------
// 3. MAIN COMPONENT
// ------------------------------------------------------------------
export function MaintenanceTicketsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollParentRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // SUPABASE REALTIME CACHE INVALIDATION
  // ------------------------------------------------------------------
  useEffect(() => {
    const channel = supabase
      .channel('maintenance-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'maintenance_tickets' },
        (payload) => {
          console.log('[Sync Engine] External mutation detected. Purging local cache:', payload);
          queryClient.invalidateQueries({ queryKey: ['maintenance_tickets'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const { data: tickets = [], isLoading } = useQuery(ticketsOptions);
  const { data: staffMembers = [] } = useQuery(staffOptions);

  const filteredTickets = useMemo(() => {
    if (!searchQuery) return tickets;
    const lower = searchQuery.toLowerCase();
    return tickets.filter((ticket: any) => 
      (ticket.title || '').toLowerCase().includes(lower) ||
      (ticket.location || '').toLowerCase().includes(lower) ||
      (ticket.description || '').toLowerCase().includes(lower)
    );
  }, [tickets, searchQuery]);

  const getStaffName = (id: string | null | undefined) => {
    if (!id) return 'Unassigned';
    const staff = staffMembers.find((s: any) => s.id === id);
    return staff ? (staff.name || staff.email) : 'Unknown';
  };

  // ------------------------------------------------------------------
  // 4. WINDOW VIRTUALIZER (DOM PROTECTION WITHOUT UI/UX SHIFT)
  // ------------------------------------------------------------------
  const rowVirtualizer = useWindowVirtualizer({
    count: filteredTickets.length,
    estimateSize: () => 80, 
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Wrench className="text-blue-600" size={24} /> Maintenance Log
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Enclosure Repairs & Infrastructure</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Search by title, location..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm" 
            />
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.15)]"
          >
            <Plus size={16} /> Submit Ticket
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)] min-h-[500px]">
        <div className="w-full overflow-x-auto relative flex-1">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <Loader2 className="animate-spin text-blue-600 w-8 h-8" />
            </div>
          )}

          <table className="w-full text-left min-w-[900px]">
            <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Date Logged</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest w-1/3">Issue Title & Location</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Target Due</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Priority</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Assigned To</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTickets.length === 0 && !isLoading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No matching tickets found.</td></tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={6} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const ticket = filteredTickets[virtualRow.index];
                    const dateObj = new Date(ticket.created_at);
                    const dueDateObj = ticket.due_date ? new Date(ticket.due_date) : null;
                    
                    return (
                      <tr key={ticket.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                           {dateObj.toLocaleDateString('en-GB')} {dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-xs font-black text-slate-900">{ticket.title}</p>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{ticket.location}</p>
                        </td>
                        <td className="px-6 py-4">
                          {dueDateObj ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[9px] font-black text-slate-600 uppercase tracking-widest shadow-sm">
                              <Calendar size={10} /> {dueDateObj.toLocaleDateString('en-GB')}
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">No Target</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest border shadow-sm ${
                            ticket.priority === 'CRITICAL' ? 'text-rose-700 bg-rose-50 border-rose-200' :
                            ticket.priority === 'HIGH' ? 'text-orange-700 bg-orange-50 border-orange-200' :
                            ticket.priority === 'MEDIUM' ? 'text-amber-700 bg-amber-50 border-amber-200' :
                            'text-emerald-700 bg-emerald-50 border-emerald-200'
                          }`}>
                            {ticket.priority}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-slate-600">
                          {getStaffName(ticket.assigned_to)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-black uppercase tracking-widest ${
                            ticket.status === 'RESOLVED' ? 'text-emerald-600' : 
                            ticket.status === 'IN_PROGRESS' ? 'text-blue-600' :
                            ticket.status === 'WAITING_ON_PARTS' ? 'text-amber-600' :
                            'text-slate-500'
                          }`}>
                            {ticket.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {paddingBottom > 0 && <tr><td colSpan={6} style={{ height: `${paddingBottom}px` }} /></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && <MaintenanceModal onClose={() => setIsModalOpen(false)} staffMembers={staffMembers} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// NEW TICKET MODAL COMPONENT
// ---------------------------------------------------------------------------
function MaintenanceModal({ onClose, staffMembers }: { onClose: () => void, staffMembers: any[] }) {
  const queryClient = useQueryClient();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (payload: any) => maintenanceService.saveTicket(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance_tickets'] });
      onClose();
    },
    onError: (err: any) => setErrorMsg(err.message || 'Failed to sync ticket.')
  });

  const form = useForm({
    defaultValues: {
      title: '', 
      location: '', 
      category: 'ENCLOSURE REPAIR', 
      priority: 'MEDIUM',
      due_date: '', 
      assigned_to: '', 
      description: '', 
      status: 'OPEN'
    },
    onSubmit: async ({ value }) => {
      setErrorMsg(null);
      await saveMutation.mutateAsync({
         title: value.title,
         location: value.location,
         category: value.category,
         priority: value.priority,
         due_date: value.due_date ? new Date(value.due_date).toISOString() : null,
         assigned_to: value.assigned_to || null,
         description: value.description,
         status: value.status
      });
    }
  });

  const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm";
  const labelClass = "text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block";

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans overflow-y-auto custom-scrollbar">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl flex flex-col shadow-2xl relative overflow-hidden my-auto">
        
        <div className="bg-slate-50 border-b border-slate-100 p-5 flex justify-between items-center z-20 shrink-0">
          <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Wrench size={20} className="text-blue-600" /> Maintenance Request
          </h2>
          <button type="button" onClick={onClose} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-xl transition-colors"><X size={20} /></button>
        </div>

        <form id="maintenance-form" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); form.handleSubmit(); }} className="p-6 space-y-6">
          {errorMsg && <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold shadow-sm">{errorMsg}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-sm">
            <form.Field name="title">
              {(field) => (
                <div className="md:col-span-2">
                  <label className={labelClass}>Issue Title</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="E.g., Broken hinge on Aviary Gate 3" className={inputClass} />
                </div>
              )}
            </form.Field>
            
            <form.Field name="location">
              {(field) => (
                <div>
                  <label className={labelClass}>Location / Enclosure</label>
                  <input type="text" required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} placeholder="E.g., Penguin Pool" className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="due_date">
              {(field) => (
                <div>
                  <label className={labelClass}>Target Due Date (Optional)</label>
                  <input type="date" value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} />
                </div>
              )}
            </form.Field>

            <form.Field name="category">
              {(field) => (
                <div>
                  <label className={labelClass}>Category</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required>
                    <option value="ENCLOSURE REPAIR">Enclosure Repair</option>
                    <option value="PLUMBING">Plumbing & Water Systems</option>
                    <option value="ELECTRICAL">Electrical & Heating</option>
                    <option value="LANDSCAPING">Landscaping & Fencing</option>
                    <option value="VEHICLE">Vehicle Maintenance</option>
                    <option value="GENERAL">General / Facility</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="priority">
              {(field) => (
                <div>
                  <label className={`${labelClass} flex items-center gap-1.5`}><AlertCircle size={14} className="text-amber-500" /> Priority Level</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass} required>
                    <option value="LOW">LOW (Cosmetic / Non-Urgent)</option>
                    <option value="MEDIUM">MEDIUM (Standard Repair)</option>
                    <option value="HIGH">HIGH (Affects Operations)</option>
                    <option value="CRITICAL">CRITICAL (Animal Security / Health Risk)</option>
                  </select>
                </div>
              )}
            </form.Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start pt-4 border-t border-slate-100">
            <form.Field name="assigned_to">
              {(field) => (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm">
                  <label className={`${labelClass} text-blue-700 flex items-center gap-1.5`}><HardHat size={14} /> Assign Technician</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="">-- Unassigned (Open Queue) --</option>
                    {staffMembers
                      .filter((staff: any) => !staff.is_deleted && staff.is_active !== false) // ENTERPRISE FIX: Hide deleted staff from new assignments
                      .map((staff: any) => (
                      <option key={staff.id} value={staff.id}>{staff.name || staff.email}</option>
                    ))}
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="status">
              {(field) => (
                <div>
                  <label className={labelClass}>Current Status</label>
                  <select value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} className={inputClass}>
                    <option value="OPEN">OPEN - New Ticket</option>
                    <option value="IN_PROGRESS">IN PROGRESS - Working</option>
                    <option value="WAITING_ON_PARTS">WAITING ON PARTS</option>
                    <option value="RESOLVED">RESOLVED - Completed</option>
                  </select>
                </div>
              )}
            </form.Field>
          </div>

          <form.Field name="description">
            {(field) => (
              <div className="pt-2">
                <label className={labelClass}>Full Description of Required Work</label>
                <textarea required value={field.state.value} onBlur={field.handleBlur} onChange={e => field.handleChange(e.target.value)} rows={4} className={`${inputClass} resize-none`} placeholder="Provide precise details of the malfunction or repair required..." />
              </div>
            )}
          </form.Field>
        </form>
        
        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 z-20 shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors">Cancel</button>
          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <button type="submit" form="maintenance-form" disabled={!canSubmit || isSubmitting as boolean || saveMutation.isPending} className="px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 flex items-center gap-2 text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.15)]">
                {isSubmitting || saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Submit Ticket
              </button>
            )}
          </form.Subscribe>
        </div>
      </div>
    </div>
  );
}