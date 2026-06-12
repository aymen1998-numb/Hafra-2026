import React, { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../../../firebase';
import { AlertCircle, Lock, Mail } from 'lucide-react';

export default function LoginScreen({ error: initialError }: { error?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [loading, setLoading] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Please check your credentials.");
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized for OAuth operations. Please add ' + window.location.hostname + ' to your Firebase Authentication Authorized Domains.');
      } else if (err.code === 'auth/internal-error') {
         setError('Google login configuration error. Have you set the support email in your Firebase Project Settings? Also check Authorized Domains in Authentication -> Settings.');
      } else if (err.code !== 'auth/popup-closed-by-user') {
         setError(err.message || 'Google sign in failed (' + err.code + ')');
      }
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0A0A0A] p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-orange-500/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-amber-500/10 blur-[100px] pointer-events-none" />
      
      <div className="w-full max-w-md bg-white/70 dark:bg-white/[0.02] backdrop-blur-2xl border border-slate-200 dark:border-white/10 rounded-3xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.5)] p-8 relative z-10">
        <div className="text-center mb-10">
           <div className="mx-auto w-16 h-16 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
             <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white font-bold text-xl">H</div>
           </div>
           <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Admin Portal</h1>
           <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Sign in to manage Hafra.DZ platform</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-start space-x-3 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-5">
          <div>
             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="email">Email Address</label>
             <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                   <Mail className="h-5 w-5" />
                </div>
                <input 
                  id="email" 
                  type="email" 
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="block w-full pl-10 px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-black/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all sm:text-sm"
                  placeholder="admin@hafra.dz"
                />
             </div>
          </div>
          
          <div>
             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5" htmlFor="password">Password</label>
             <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                   <Lock className="h-5 w-5" />
                </div>
                <input 
                  id="password" 
                  type="password" 
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="block w-full pl-10 px-3 py-2.5 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-black/50 text-slate-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all sm:text-sm"
                  placeholder="••••••••"
                />
             </div>
          </div>

          <button 
             type="submit" 
             disabled={loading}
             className="w-full flex justify-center py-2.5 px-4 rounded-xl text-white font-medium bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 focus:ring-offset-slate-50 dark:focus:ring-offset-[#0A0A0A] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
             {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white/70 dark:bg-black/20 text-slate-500">Or continue with</span>
            </div>
          </div>

          <div className="mt-6">
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full flex justify-center items-center py-2.5 px-4 border border-slate-200 dark:border-white/10 rounded-xl bg-white dark:bg-white/5 text-slate-700 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-all disabled:opacity-50"
            >
              <svg className="h-5 w-5 mr-2" aria-hidden="true" viewBox="0 0 24 24">
                <path d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z" fill="#EA4335" />
                <path d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z" fill="#4285F4" />
                <path d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z" fill="#FBBC05" />
                <path d="M12.0004 24C15.2404 24 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.26537 14.29L1.27539 17.385C3.25539 21.31 7.3104 24 12.0004 24Z" fill="#34A853" />
              </svg>
              Google
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
