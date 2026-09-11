import React, { useState, useMemo, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Search, MapPin, Loader2, FileDown, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '../lib/supabase';

// Helper to get formatted dates
const getLocalDateString = (dateObj: Date) => {
  return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
};

export const Route = createFileRoute('/logistics/internal-movements')({
  component: InternalMovementsPage,
});

export function InternalMovementsPage() {
  const queryClient = useQueryClient();
  const [globalFilter, setGlobalFilter] = useState('');
  
  // Date Filtering State (Default: Last 30 Days)
  const [endDate, setEndDate] = useState<string>(getLocalDateString(new Date()));
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return getLocalDateString(d);
  });

  // 1. DATA FETCHING (Now governed by the Date Controls)
  const { data: movements = [], isLoading, error } = useQuery({
    queryKey: ['internal_movements', startDate, endDate],
    queryFn: async () => {
      const { data, err } = await supabase
        .from('internal_movements')
        .select('id, movement_date, from_location, to_location, animals(id, name, species)')
        .eq('is_deleted', false) // Ensures we don't fetch soft-deleted rows
        .gte('movement_date', `${startDate}T00:00:00Z`)
        .lte('movement_date', `${endDate}T23:59:59.999Z`)
        .order('movement_date', { ascending: false });
      
      if (err) throw err;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
    networkMode: 'offlineFirst',
  });

  // 2. REALTIME SUBSCRIPTION
  useEffect(() => {
    const channel = supabase
      .channel('internal-movements-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_movements' }, () => {
        queryClient.invalidateQueries({ queryKey: ['internal_movements'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // 3. SOFT DELETE MUTATION (This fixes the delete issue)
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('internal_movements')
        .update({ is_deleted: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['internal_movements'] });
      toast.success('Movement record deleted successfully.');
    },
    onError: (err: any) => {
      toast.error(`Deletion failed: ${err.message}`);
    }
  });

  // 4. FILTERING ENGINE
  const filtered = useMemo(() => {
    if (!globalFilter) return movements;
    const q = globalFilter.toLowerCase();
    return movements.filter((m: any) => 
      (m.animals?.name || '').toLowerCase().includes(q) ||
      (m.animals?.species || '').toLowerCase().includes(q) ||
      (m.from_location || '').toLowerCase().includes(q) ||
      (m.to_location || '').toLowerCase().includes(q)
    );
  }, [movements, globalFilter]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 px-2 sm:px-0">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 bg-white p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none opacity-50" />
        <div className="relative z-10">
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            Internal Movements
          </h1>
          <p className="text-[10px] md:text-xs font-black text-slate-500 mt-2 uppercase tracking-widest">
            Logistical tracking of on-site entity relocations
          </p>
        </div>
        
        {/* DATE & SEARCH CONTROLS */}
        <div className="flex flex-col sm:flex-row items-center gap-3 relative z-10 w-full lg:w-auto mt-4 lg:mt-0">
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="flex-1 sm:w-36">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">From</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex-1 sm:w-36">
              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">To</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </div>

          <div className="relative flex-1 w-full sm:w-64 mt-2 sm:mt-0 pt-3 sm:pt-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 sm:mt-0 mt-1.5" size={16} />
            <input 
              type="text" placeholder="Search by name, location..." 
              value={globalFilter} onChange={e => setGlobalFilter(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] relative">
        {isLoading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex justify-center items-center">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Querying Matrix...</span>
            </div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex justify-center items-center">
            <div className="bg-rose-50 text-rose-600 px-6 py-4 rounded-xl border border-rose-200 text-sm font-bold">
               Error loading data. Check connection.
            </div>
          </div>
        )}
        
        <div className="w-full overflow-x-auto custom-scrollbar flex-1 relative">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="px-4 sm:px-6 py-4 w-1/6 whitespace-nowrap">Date</th>
                <th className="px-4 sm:px-6 py-4 w-1/4">Animal</th>
                <th className="px-4 sm:px-6 py-4 w-2/4">From → To</th>
                <th className="px-4 sm:px-6 py-4 text-right w-[100px] whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 relative">
              {filtered.length === 0 && !isLoading ? (
                <tr><td colSpan={4} className="p-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No movements found.</td></tr>
              ) : (
                filtered.map((m: any) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-4 sm:px-6 py-4 text-[10px] font-black text-slate-400 whitespace-nowrap align-top">
                      {m.movement_date ? format(parseISO(m.movement_date), 'dd MMM yyyy') : '--'}
                    </td>
                    <td className="px-4 sm:px-6 py-4 align-top">
                       <span className="text-sm font-black text-slate-900 block leading-tight mb-1">{m.animals?.name || 'Unknown Animal'}</span>
                       <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{m.animals?.species || '--'}</span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 align-top">
                       <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-[11px] font-black text-slate-700 uppercase tracking-tight whitespace-normal">
                         {/* FIX: Text is now allowed to fully break-words. Removed 'truncate' entirely. */}
                         <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                             <MapPin size={12} className="text-slate-400 shrink-0"/>
                             <span className="text-slate-500 break-words whitespace-normal">{m.from_location || 'N/A'}</span>
                         </div>
                         <ArrowLeftRight size={14} className="text-indigo-400 shrink-0 hidden sm:block rotate-90 sm:rotate-0"/> 
                         <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                             <MapPin size={12} className="text-indigo-500 shrink-0"/>
                             <span className="text-indigo-700 break-words whitespace-normal">{m.to_location || 'N/A'}</span>
                         </div>
                       </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right align-top">
                       <button 
                         onClick={() => {
                           if (window.confirm("Are you sure you want to delete this movement record?")) {
                             deleteMutation.mutate(m.id);
                           }
                         }}
                         disabled={deleteMutation.isPending}
                         className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50 inline-block"
                         title="Delete Record"
                       >
                         {deleteMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}