import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Map as MapIcon, FileText, BarChart3, Users, Settings, Bell, Search, Menu, X, LogOut, Sun, Moon, ShieldAlert, Activity, Code } from 'lucide-react';
import { auth } from '../../../firebase';
import { signOut } from 'firebase/auth';

const navGroups = [
  {
    title: 'MAIN',
    items: [
      { name: 'Overview', path: '/', icon: LayoutDashboard },
      { name: 'Live Map', path: '/map', icon: MapIcon },
      { name: 'Reports', path: '/reports', icon: FileText },
      { name: 'Analytics', path: '/analytics', icon: BarChart3 },
    ]
  },
  {
    title: 'MANAGEMENT',
    items: [
      { name: 'Admins & Users', path: '/users', icon: Users },
      { name: 'Municipalities', path: '/municipalities', icon: MapIcon },
      { name: 'Categories', path: '/categories', icon: FileText },
      { name: 'Moderation', path: '/moderation', icon: ShieldAlert },
    ]
  },
  {
    title: 'SYSTEM',
    items: [
      { name: 'Notifications', path: '/notifications', icon: Bell },
      { name: 'Audit Logs', path: '/audit-logs', icon: Activity },
      { name: 'API / Open Data', path: '/api', icon: Code },
      { name: 'Settings', path: '/settings', icon: Settings },
    ]
  }
];

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('hafra-admin-theme');
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  React.useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('hafra-admin-theme', 'dark');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      localStorage.setItem('hafra-admin-theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(!isDark);
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090C12] text-slate-900 dark:text-slate-50 flex overflow-hidden selection:bg-orange-500/30">
      {/* Sidebar */}
      <aside 
        className={`fixed md:relative z-40 inset-y-0 left-0 bg-white dark:bg-[#0A0E17] border-r border-slate-200 dark:border-white/5 w-64 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-20'}`}
      >
        <div className="h-16 flex items-center justify-between px-4 md:justify-center">
          <div className={`font-bold tracking-tight text-lg flex items-center space-x-2 ${!sidebarOpen && 'md:hidden'}`}>
             <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white">
                <span className="font-bold text-sm">H</span>
             </div>
             <span>Hafra<span className="text-orange-600 dark:text-orange-400">Admin</span></span>
          </div>
          <button className="md:hidden p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-md" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-3 py-4 flex-1 space-y-6 overflow-y-auto custom-scrollbar">
          {navGroups.map((group) => (
             <div key={group.title}>
                <h4 className={`text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 px-3 ${!sidebarOpen && 'md:hidden'}`}>
                   {group.title}
                </h4>
                <div className="space-y-1">
                   {group.items.map((item) => (
                      <NavLink
                         key={item.name}
                         to={item.path}
                         className={({ isActive }) => 
                            `flex items-center px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 ease-out group relative border-l-2 ${
                              isActive 
                                ? 'border-orange-500 bg-orange-500/5 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 shadow-[inset_1px_0_0_rgba(249,115,22,0.1)]' 
                                : 'border-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.02] hover:text-slate-900 dark:hover:text-slate-50'
                            }`
                         }
                         title={!sidebarOpen ? item.name : undefined}
                      >
                         <item.icon className={`w-5 h-5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110 ${sidebarOpen ? 'mr-3' : 'md:mr-0 md:mx-auto'}`} />
                         <span className={`${!sidebarOpen && 'md:hidden'}`}>{item.name}</span>
                      </NavLink>
                   ))}
                </div>
             </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-white/10">
          <button 
             onClick={handleSignOut}
             className={`flex items-center w-full px-3 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors ${!sidebarOpen && 'md:justify-center'}`}
             title={!sidebarOpen ? 'Sign out' : undefined}
          >
             <LogOut className={`w-5 h-5 flex-shrink-0 ${sidebarOpen ? 'mr-3' : 'md:mr-0'}`} />
             <span className={`${!sidebarOpen && 'md:hidden'}`}>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        <header className="h-16 bg-white/80 dark:bg-[#0A0E17]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/5 flex items-center justify-between px-4 z-30 sticky top-0">
           <div className="flex items-center">
              <button 
                className="p-2 mr-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-md md:hidden" 
                onClick={() => setSidebarOpen(true)}
              >
                 <Menu className="w-5 h-5" />
              </button>
              <button 
                className="hidden md:block p-2 mr-4 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-md" 
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                 <Menu className="w-5 h-5" />
              </button>
              
              <div className="hidden sm:flex relative max-w-md w-full">
                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Search className="h-4 w-4" />
                 </div>
                 <input 
                    type="text" 
                    placeholder="Search reports, users, locations..." 
                    className="block w-64 md:w-80 pl-10 pr-3 py-2 border border-transparent dark:border-white/5 rounded-xl bg-slate-100 dark:bg-[#121826] text-slate-900 dark:text-slate-50 text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all focus:w-96 placeholder:text-slate-500"
                 />
              </div>
           </div>

           <div className="flex items-center space-x-3">
              <button onClick={toggleTheme} className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors relative">
                 {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>
              <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full transition-colors relative">
                 <Bell className="w-5 h-5" />
                 <span className="absolute top-1.5 right-1.5 block h-2 w-2 rounded-full bg-orange-500 ring-2 ring-white dark:ring-[#0A0A0A]" />
              </button>
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center font-medium overflow-hidden ring-2 ring-transparent cursor-pointer hover:ring-orange-500 transition-all">
                 <span className="text-xs">AD</span>
              </div>
           </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 scroll-smooth">
           <Outlet />
        </main>
      </div>
    </div>
  );
}
