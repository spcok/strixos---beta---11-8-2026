import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useQueryClient, queryOptions } from '@tanstack/react-query';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Truck, Search, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';

// ENTERPRISE FIX: 14-Day RAM Cap for logistics
const transfersOptions = queryOptions({
  queryKey: ['external_transfers'],
  queryFn: async () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('external_transfers')
      .select('*, animals (name, species)')
      .gte('transfer_date', fourteenDaysAgo)
      .order('transfer_date', { ascending: false });
    if (error) throw error;
    return data;
  },
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/logistics/external-transfers')({
  loader: ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) queryClient.ensureQueryData(transfersOptions);
  },
  component: ExternalTransfersPage,
});

export function ExternalTransfersPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const channel = supabase.channel('transfers-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'external_transfers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['external_transfers'] });
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: transfers = [], isLoading } = useQuery(transfersOptions);
  
  const filtered = useMemo(() => {
    if (!searchQuery) return transfers;
    const q = searchQuery.toLowerCase();
    return transfers.filter((t: any) => 
      (t.animals?.name || '').toLowerCase().includes(q) || 
      (t.destination_name || '').toLowerCase().includes(q)
    );
  }, [transfers, searchQuery]);

  const rowVirtualizer = useWindowVirtualizer({
    count: filtered.length,
    estimateSize: () => 80,
    overscan: 5,
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0 ? rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Truck className="text-emerald-600" /> External Transfers
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Facility Imports & Exports</p>
        </div>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search manifests..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px] relative">
        {isLoading && <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex justify-center items-center"><Loader2 className="animate-spin text-emerald-600 w-8 h-8" /></div>}
        
        <div className="w-full overflow-x-auto custom-scrollbar flex-1 relative">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-500 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 w-1/6">Date</th>
                <th className="px-6 py-4 w-1/4">Animal</th>
                <th className="px-6 py-4">Destination</th>
                <th className="px-6 py-4 w-1/6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && !isLoading ? (
                <tr><td colSpan={4} className="p-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No recent transfers logged.</td></tr>
              ) : (
                <>
                  {paddingTop > 0 && <tr><td colSpan={4} style={{ height: `${paddingTop}px` }} /></tr>}
                  {virtualItems.map((virtualRow) => {
                    const t = filtered[virtualRow.index];
                    return (
                      <tr key={t.id} ref={rowVirtualizer.measureElement} data-index={virtualRow.index} className="hover:bg-slate-50">
                        {/* ENTERPRISE FIX: Safe strict parsing */}
                        <td className="px-6 py-4 text-[10px] font-black text-slate-400 whitespace-nowrap">{format(parseISO(t.transfer_date), 'dd MMM yyyy')}</td>
                        <td className="px-6 py-4">
                           <span className="text-xs font-black text-slate-900 block">{t.animals?.name}</span>
                           <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t.animals?.species}</span>
                        </td>
                        <td className="px-6 py-4 text-xs font-medium text-slate-700">{t.destination_name}</td>
                        <td className="px-6 py-4 text-right">
                           <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border shadow-sm ${t.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                              {t.status}
                           </span>
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
    </div>
  );
}