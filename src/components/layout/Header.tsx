import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Menu, UserCircle, PlayCircle, StopCircle, Loader2, CloudOff, CloudUpload, Wifi } from 'lucide-react';
import { format, formatISO } from 'date-fns';
import { useAuth } from '../../lib/auth';
import { timesheetService } from '../../services/timesheetService';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  
  // ENTERPRISE FIX: Offline Queue Telemetry
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pausedCount, setPausedCount] = useState(0);

  useEffect(() => {
    // 1. Network event listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // 2. Direct subscription to the TanStack Mutation Cache to track offline payloads
    const mutationCache = queryClient.getMutationCache();
    
    const updatePausedCount = () => {
      const count = mutationCache.getAll().filter(m => m.state.isPaused).length;
      setPausedCount(count);
    };

    updatePausedCount(); // Initial check
    const unsubscribe = mutationCache.subscribe(updatePausedCount);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, [queryClient]);

  const { data: activeShift, isLoading: isLoadingShift } = useQuery({
    queryKey: ['my_active_shift', user?.id],
    queryFn: () => timesheetService.getMyActiveShift(user!.id),
    enabled: !!user?.id,
  });

  const clockInMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      await timesheetService.clockIn({
        shift_date: format(now, 'yyyy-MM-dd'),
        clock_in_time: formatISO(now) 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my_active_shift'] });
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['active_timesheets_rollcall'] });
    }
  });

  const clockOutMutation = useMutation({
    mutationFn: async (id: string) => {
      await timesheetService.clockOut(id, formatISO(new Date()));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my_active_shift'] });
      queryClient.invalidateQueries({ queryKey: ['timesheets'] });
      queryClient.invalidateQueries({ queryKey: ['active_timesheets_rollcall'] });
    }
  });

  return (
    <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 text-slate-500 hover:text-slate-900 transition-colors rounded-lg hover:bg-slate-100"
        >
          <Menu size={24} />
        </button>
      </div>

      <div className="flex items-center gap-4">
        
        {/* ENTERPRISE FIX: Telemetry Gauge */}
        <div className="hidden sm:flex items-center mr-2">
          {!isOnline ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm transition-all duration-300">
              <CloudOff size={14} /> Offline
              {pausedCount > 0 && (
                <span className="ml-1 bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  {pausedCount} <span className="hidden md:inline">Queued</span>
                </span>
              )}
            </div>
          ) : pausedCount > 0 ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-sm transition-all duration-300">
              <CloudUpload size={14} className="animate-pulse" /> Syncing
              <span className="ml-1 bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{pausedCount}</span>
            </div>
          ) : null}
        </div>

        <div className="hidden sm:flex items-center">
          {isLoadingShift ? (
            <div className="px-4 py-1.5 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-center min-w-[120px]">
               <Loader2 size={14} className="animate-spin text-slate-400" />
            </div>
          ) : activeShift ? (
            <button 
              onClick={() => clockOutMutation.mutate(activeShift.id)}
              disabled={clockOutMutation.isPending}
              className="group flex items-center gap-2 px-4 py-1.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-600 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm disabled:opacity-50"
            >
              {clockOutMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} className="group-hover:animate-pulse" />}
              Clock Out
            </button>
          ) : (
            <button 
              onClick={() => clockInMutation.mutate()}
              disabled={clockInMutation.isPending}
              className="group flex items-center gap-2 px-4 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm disabled:opacity-50"
            >
              {clockInMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
              Clock In
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
          <div className="hidden md:block text-right">
            <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{profile?.name || 'Loading...'}</p>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{profile?.role?.replace('_', ' ') || 'Staff'}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 overflow-hidden">
            <UserCircle size={32} strokeWidth={1} />
          </div>
        </div>
      </div>
    </header>
  );
}