import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Clock, CheckCircle2, AlertCircle, Loader2, Calendar, Filter } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../lib/auth';
import { timesheetService } from '../services/timesheetService';

// ------------------------------------------------------------------
// STRICT OFFLINE QUERY OPTIONS
// ------------------------------------------------------------------
const staffMembersOptions = queryOptions({
  queryKey: ['staff_members'],
  queryFn: () => timesheetService.getStaffMembers(),
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

const timesheetsOptions = (userId: string) => queryOptions({
  queryKey: ['timesheets', userId],
  queryFn: () => timesheetService.getTimesheets(userId),
  enabled: !!userId,
  staleTime: 1000 * 60 * 5,
  gcTime: 1000 * 60 * 60 * 24 * 15,
  networkMode: 'offlineFirst',
  meta: { persist: true }
});

export const Route = createFileRoute('/staff/timesheets')({
  loader: async ({ context: { queryClient } }) => {
    // @ts-ignore
    if (queryClient) await queryClient.ensureQueryData(staffMembersOptions);
  },
  component: TimesheetsPage,
});

export function TimesheetsPage() {
  const { user, profile } = useAuth();
  const scrollParentRef = useRef<HTMLDivElement>(null);
  
  const canViewAll = profile?.role === 'ADMIN' || profile?.role === 'MANAGER' || profile?.role === 'HR';
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  useEffect(() => {
    if (user?.id && !selectedUserId) {
      setSelectedUserId(user.id);
    }
  }, [user?.id, selectedUserId]);

  const { data: timesheets = [], isLoading } = useQuery(timesheetsOptions(selectedUserId));
  const { data: staffMembers = [] } = useQuery(staffMembersOptions);

  const staffMap = useMemo(() => new Map(staffMembers.map((s: any) => [s.id, s])), [staffMembers]);

  // ------------------------------------------------------------------
  // VIRTUALIZER ENGINE (DOM Protection)
  // ------------------------------------------------------------------
  const rowVirtualizer = useVirtualizer({
    count: timesheets.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => 72, // Fixed height for timesheet rows
    overscan: 5,
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-32">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-3">
            <Clock className="text-indigo-600" size={24} /> Timesheets
          </h1>
          <p className="text-[10px] font-black text-slate-500 mt-1 uppercase tracking-widest">Attendance & Shift Tracking</p>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm w-full md:w-auto">
          <Filter size={14} className="text-slate-400 ml-2" />
          <select 
            value={selectedUserId} 
            onChange={(e) => setSelectedUserId(e.target.value)} 
            disabled={!canViewAll} 
            className="bg-transparent text-[10px] font-black text-slate-700 uppercase tracking-widest border-none focus:ring-0 cursor-pointer outline-none py-1 pr-2 w-full sm:w-64 truncate disabled:opacity-50"
          >
            {canViewAll && <option value="ALL">All Staff Members</option>}
            {staffMembers.map((staff: any) => (
              <option key={staff.id} value={staff.id}>
                {staff.name || staff.email} {staff.id === user?.id ? '(Me)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-14rem)] min-h-[500px]">
        <div className="w-full overflow-x-auto relative flex-1">
          {isLoading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <Loader2 className="animate-spin text-indigo-600 w-8 h-8" />
            </div>
          )}

          {/* Virtualized Grid Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest sticky top-0 z-10 min-w-[800px]">
            <div className="col-span-2">Date</div>
            <div className="col-span-3">Staff Member</div>
            <div className="col-span-2">Clock In</div>
            <div className="col-span-2">Clock Out</div>
            <div className="col-span-3 text-right">Status</div>
          </div>

          <div ref={scrollParentRef} className="overflow-auto h-[calc(100%-53px)] custom-scrollbar min-w-[800px]">
            {timesheets.length === 0 && !isLoading ? (
              <div className="px-6 py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">
                No timesheet records found for this selection.
              </div>
            ) : (
              <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, width: '100%', position: 'relative' }}>
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const record = timesheets[virtualRow.index];
                  const staff = staffMap.get(record.user_id);
                  const inTime = parseISO(record.clock_in_time);
                  const outTime = record.clock_out_time ? parseISO(record.clock_out_time) : null;
                  const isActive = !record.clock_out_time;

                  return (
                    <div
                      key={virtualRow.key}
                      className={`absolute top-0 left-0 w-full transition-colors border-b border-slate-100 ${isActive ? 'bg-indigo-50/30' : 'hover:bg-slate-50/60'}`}
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <div className="grid grid-cols-12 gap-4 px-6 items-center h-full">
                        <div className="col-span-2 whitespace-nowrap">
                          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            <Calendar size={12} /> {format(inTime, 'dd MMM yyyy')}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <span className="text-xs font-black text-slate-900 uppercase tracking-tight truncate block">
                            {staff?.name || staff?.email || 'Unknown User'}
                          </span>
                        </div>
                        <div className="col-span-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-bold text-slate-700 shadow-sm">
                            {format(inTime, 'HH:mm')}
                          </span>
                        </div>
                        <div className="col-span-2">
                          {outTime ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-[11px] font-bold text-slate-700 shadow-sm">
                              {format(outTime, 'HH:mm')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-[10px] font-black text-indigo-700 uppercase tracking-widest animate-pulse shadow-sm">
                              On Duty
                            </span>
                          )}
                        </div>
                        <div className="col-span-3 flex justify-end">
                          {record.status === 'APPROVED' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200">
                              <CheckCircle2 size={12} /> Approved
                            </span>
                          ) : isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 border border-indigo-200">
                              <Clock size={12} /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200">
                              <AlertCircle size={12} /> Pending
                            </span>
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
    </div>
  );
}