import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '../../../firebase';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import { motion } from 'framer-motion';
import { AlertCircle, Clock, CheckCircle, ShieldAlert, Map, BrainCircuit, Calendar, TrendingUp, Download, Filter, Search } from 'lucide-react';
import { format, subDays } from 'date-fns';

export default function AnalyticsPage() {
  const [data, setData] = useState({
     categoryData: [] as any[],
     statusData: [] as any[],
     trendData: [] as any[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
       try {
          const snap = await getDocs(query(collection(db, 'reports'), limit(1000)));
          const docs = snap.docs.map(d => d.data());
          
          const catCount: Record<string, number> = {};
          const statCount: Record<string, number> = { active: 0, fixed: 0, archived: 0 };
          
          docs.forEach(doc => {
             const cat = doc.category || 'unknown';
             catCount[cat] = (catCount[cat] || 0) + 1;
             
             const st = doc.status || 'active';
             if (statCount[st] !== undefined) {
                statCount[st]++;
             }
          });

          // Mock trend data for demonstration since we don't have enough real history
          const trendData = Array.from({length: 14}).map((_, i) => ({
             date: format(subDays(new Date(), 13 - i), 'MMM dd'),
             reports: Math.floor(Math.random() * 50) + 10,
             resolved: Math.floor(Math.random() * 30) + 5
          }));

          setData({
             categoryData: Object.keys(catCount).map(k => ({ name: k, count: catCount[k] })).sort((a,b) => b.count - a.count),
             statusData: Object.keys(statCount).map(k => ({ name: k, value: statCount[k] })),
             trendData
          });
       } catch (error) {
          console.error(error);
       } finally {
          setLoading(false);
       }
    }
    loadData();
  }, []);

  const COLORS = ['#f97316', '#10b981', '#f43f5e', '#6366f1', '#0ea5e9'];

  if (loading) return (
     <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center">
           <div className="w-10 h-10 border-4 border-orange-500/30 border-t-orange-500 rounded-full animate-spin"></div>
           <span className="mt-4 text-slate-500 font-medium">Crunching analytics...</span>
        </div>
     </div>
  );

  const kpis = [
     { name: 'Total Reports', value: '4,289', icon: AlertCircle, color: 'text-blue-500', bg: 'bg-blue-500/10', trend: '+12%' },
     { name: 'Active Incidents', value: '1,104', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10', trend: '+3%' },
     { name: 'Resolved', value: '3,185', icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', trend: '+18%' },
     { name: 'Critical Hazards', value: '156', icon: ShieldAlert, color: 'text-rose-500', bg: 'bg-rose-500/10', trend: '-5%' },
     { name: 'Avg. Resolution', value: '2.4 days', icon: TrendingUp, color: 'text-indigo-500', bg: 'bg-indigo-500/10', trend: '-1 day' },
     { name: 'AI Confidence', value: '94.2%', icon: BrainCircuit, color: 'text-purple-500', bg: 'bg-purple-500/10', trend: '+1.2%' },
  ];

  return (
    <div className="space-y-8 pb-12">
       {/* Header & Filter Bar */}
       <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
          <div>
             <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Command Center Analytics</h1>
             <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Enterprise infrastructure intelligence and operational metrics.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
             <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" placeholder="Search Wilaya..." className="pl-9 pr-4 py-2 bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/5 rounded-xl text-sm outline-none focus:ring-2 focus:ring-orange-500" />
             </div>
             <button className="px-4 py-2 bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/5 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                <Calendar className="w-4 h-4" /> This Month
             </button>
             <button className="px-4 py-2 bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/5 rounded-xl text-sm font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                <Filter className="w-4 h-4" /> More Filters
             </button>
             <button className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-lg shadow-orange-500/20 transition-all">
                <Download className="w-4 h-4" /> Export Report
             </button>
          </div>
       </div>

       {/* KPIs */}
       <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {kpis.map((kpi, idx) => (
             <motion.div 
               key={kpi.name}
               initial={{ opacity: 0, y: 20 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: idx * 0.05 }}
               className="bg-white dark:bg-[#121826] p-5 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group"
             >
                <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${kpi.bg} ${kpi.color} mb-4 group-hover:scale-110 transition-transform`}>
                   <kpi.icon className="w-5 h-5" />
                </div>
                <h3 className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">{kpi.name}</h3>
                <div className="flex items-end justify-between">
                   <span className="text-2xl font-bold text-slate-900 dark:text-white">{kpi.value}</span>
                   <span className={`text-xs font-semibold ${kpi.trend.startsWith('+') ? 'text-emerald-500' : 'text-rose-500'}`}>{kpi.trend}</span>
                </div>
             </motion.div>
          ))}
       </div>

       {/* Charts Grid */}
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Trend Chart */}
          <div className="bg-white dark:bg-[#121826] p-6 text-slate-100 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm lg:col-span-2 flex flex-col">
             <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-base font-semibold text-slate-900 dark:text-white">Reports vs Resolutions</h3>
                    <p className="text-xs text-slate-500 mt-1">14-day operational throughput</p>
                 </div>
             </div>
             <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                   <AreaChart data={data.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                     <defs>
                        <linearGradient id="colorReports" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" strokeOpacity={0.2} />
                     <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                     <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(10,14,23,0.95)', backdropFilter: 'blur(10px)', color: '#fff', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)' }} 
                        itemStyle={{ color: '#e2e8f0' }}
                     />
                     <Area type="monotone" dataKey="reports" name="New Reports" stroke="#f97316" strokeWidth={3} fillOpacity={1} fill="url(#colorReports)" />
                     <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorResolved)" />
                   </AreaChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Status Breakdown */}
          <div className="bg-white dark:bg-[#121826] p-6 rounded-2xl text-slate-100 border border-slate-200 dark:border-white/5 shadow-sm flex flex-col">
             <div className="mb-6">
                 <h3 className="text-base font-semibold text-slate-900 dark:text-white">Resolution Status</h3>
                 <p className="text-xs text-slate-500 mt-1">Current state of active database</p>
             </div>
             <div className="flex-1 min-h-[300px] flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                     <Pie
                       data={data.statusData}
                       cx="50%"
                       cy="50%"
                       innerRadius={80}
                       outerRadius={110}
                       paddingAngle={5}
                       dataKey="value"
                       stroke="none"
                     >
                       {data.statusData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                       ))}
                     </Pie>
                     <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(10,14,23,0.95)', backdropFilter: 'blur(10px)', color: '#fff' }} 
                     />
                   </PieChart>
                </ResponsiveContainer>
             </div>
          </div>

          {/* Categories Bar Chart */}
          <div className="bg-white dark:bg-[#121826] p-6 text-slate-100 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm lg:col-span-3 flex flex-col">
             <div className="mb-6">
                 <h3 className="text-base font-semibold text-slate-900 dark:text-white">Incidents by Category</h3>
                 <p className="text-xs text-slate-500 mt-1">Distribution across infrastructure types</p>
             </div>
             <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={data.categoryData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" strokeOpacity={0.2} />
                     <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                     <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} />
                     <Tooltip 
                        cursor={{fill: 'rgba(255,255,255,0.02)'}}
                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(10,14,23,0.95)', backdropFilter: 'blur(10px)', color: '#fff' }} 
                     />
                     <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]}>
                       {data.categoryData.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                       ))}
                     </Bar>
                   </BarChart>
                </ResponsiveContainer>
             </div>
          </div>

       </div>
    </div>
  );
}
