import React from 'react';
import { Link, Outlet, createFileRoute, useLocation } from '@tanstack/react-router';
import { 
  ShieldCheck, Users, FileText, 
  List, Building, History, Activity, Lock, Settings, ChevronRight
} from 'lucide-react';
import { useAuth } from '../lib/auth';

export const Route = createFileRoute('/settings')({
  component: SettingsLayout,
});

function SettingsLayout() {
  const { profile } = useAuth();
  const location = useLocation();
  const currentTab = location.pathname.split('/').pop() || 'organization';
  
  // 5-Tier Role-Based Access Control for Settings Navigation
  const isSeniorOrAbove = ['SENIOR_KEEPER', 'DIRECTOR', 'ADMIN'].includes(profile?.role || '');
  const isDirectorOrAdmin = ['DIRECTOR', 'ADMIN'].includes(profile?.role || '');

  const tabs = [
    { id: 'organization', label: 'Organisation Profile', icon: Building, show: true },
    { id: 'directory', label: 'Directory', icon: Users, show: isSeniorOrAbove },
    { id: 'lists', label: 'Operational Lists', icon: List, show: true },
    { id: 'health', label: 'System Health', icon: Activity, show: true },
    { id: 'access', label: 'Access Control', icon: ShieldCheck, show: isDirectorOrAdmin },
    { id: 'rbac', label: 'RBAC Matrix', icon: Lock, show: isDirectorOrAdmin },
    { id: 'zla', label: 'ZLA Documents', icon: FileText, show: isSeniorOrAbove },
    { id: 'changelog', label: 'Changelog', icon: History, show: true },
  ];

  const visibleTabs = tabs.filter(t => t.show);

  return (
    <div className="flex h-[calc(100vh-64px)] bg-slate-50 font-sans">
      
      {/* Sidebar Navigation (Matching Reports Module Structure) */}
      <div className="w-72 bg-white border-r border-slate-200 flex flex-col shrink-0 relative z-10 shadow-[10px_0_15px_-5px_rgba(0,0,0,0.02)]">
        
        {/* Sidebar Header */}
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3 mb-1">
            <div className="bg-emerald-100 p-2 rounded-lg border border-emerald-200">
              <Settings className="w-5 h-5 text-emerald-600" />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">System Settings</h2>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Configuration & Security</p>
        </div>

        {/* Sidebar Links */}
        <nav className="flex-grow p-4 space-y-2 overflow-y-auto custom-scrollbar pb-24">
          {visibleTabs.map((t) => {
            const isActive = currentTab === t.id;
            return (
              <Link
                key={t.id}
                to={`/settings/${t.id}` as any}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group border outline-none ${
                  isActive 
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-md' 
                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-3">
                  <t.icon size={16} className={isActive ? 'text-white' : 'text-slate-400 group-hover:text-emerald-500'} />
                  <span className="text-[11px] font-black uppercase tracking-wide text-left line-clamp-1">
                    {t.label}
                  </span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-emerald-200 shrink-0" />}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Main Content Pane */}
      <div className="flex-grow overflow-y-auto custom-scrollbar bg-slate-50">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto min-h-full">
          <Outlet />
        </div>
      </div>
      
    </div>
  );
}