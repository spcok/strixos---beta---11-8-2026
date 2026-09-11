import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Settings, ShieldCheck } from 'lucide-react';

export function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 1. Wait for Supabase to authenticate and store the token
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return; // Stop if there's an error
    }

    // 2. THE FIX: The token is now securely in Local Storage.
    // Force the browser to do a clean boot directly to the dashboard.
    // This perfectly bypasses all TanStack/React state loops.
    window.location.href = '/'; 
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[50%] -left-[10%] w-[70%] h-[70%] rounded-full bg-emerald-500/10 blur-[120px] mix-blend-screen animate-pulse"></div>
        <div className="absolute top-[60%] -right-[20%] w-[80%] h-[80%] rounded-full bg-blue-500/10 blur-[150px] mix-blend-screen animate-pulse" style={{ animationDelay: '2s' }}></div>
      </div>

      <div className="max-w-md w-full relative z-10">
        <div className="text-center mb-10 animate-in slide-in-from-bottom-4 fade-in duration-700">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-500 text-white mb-6 shadow-2xl shadow-emerald-500/20">
            <Settings size={40} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">StrixOS</h1>
          <p className="text-slate-400 font-medium mt-2">Facility Management System</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl p-8 border border-slate-700 shadow-2xl animate-in slide-in-from-bottom-8 fade-in duration-1000 delay-150 fill-both">
          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="bg-rose-500/10 text-rose-400 p-4 rounded-xl text-sm font-bold border border-rose-500/20 text-center animate-in fade-in zoom-in-95">
                {error}
              </div>
            )}
            
            <div className="space-y-2 group">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-focus-within:text-emerald-400 transition-colors">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium placeholder:text-slate-600"
                placeholder="keeper@facility.com"
                required
              />
            </div>

            <div className="space-y-2 group">
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-focus-within:text-emerald-400 transition-colors">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900/80 border border-slate-700 text-white px-4 py-3 rounded-xl focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-medium placeholder:text-slate-600"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black uppercase tracking-widest p-4 rounded-xl transition-all active:scale-95 disabled:opacity-50 mt-4 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 group"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Authenticating...
                </>
              ) : (
                <>
                  <ShieldCheck size={20} className="group-hover:scale-110 transition-transform" />
                  Secure Sign In
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}