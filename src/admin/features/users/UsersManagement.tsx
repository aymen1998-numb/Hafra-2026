import React, { useState, useEffect } from 'react';
import { collection, query, getDocs, orderBy, updateDoc, doc, limit, addDoc } from 'firebase/firestore';
import { db } from '../../../firebase';
import { Search, Shield, User, AlertCircle, RefreshCw, MoreHorizontal, Ban, Mail, Plus, X } from 'lucide-react';
import { format } from 'date-fns';

export default function UsersManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [newAdminRole, setNewAdminRole] = useState('National Admin');

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      // In a real application we would have a users collection syncing with auth or managed via functions
      const q = query(collection(db, 'users'), limit(500));
      const snap = await getDocs(q);
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleRoleToggle = async (id: string, currentRole: string) => {
    if(!confirm("Are you sure you want to change this user's role?")) return;
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await updateDoc(doc(db, 'users', id), { role: newRole });
      setUsers(prev => prev.map(u => u.id === id ? { ...u, role: newRole } : u));
    } catch (e) {
      console.error(e);
      alert('Failed to update role. This may require an Admin function depending on rules.');
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail) return;
    try {
      await addDoc(collection(db, 'users'), {
        email: newAdminEmail,
        role: 'admin',
        adminLevel: newAdminRole,
        createdAt: new Date().toISOString(),
        displayName: 'Invited Admin',
      });
      setShowAddModal(false);
      setNewAdminEmail('');
      fetchUsers();
    } catch (e) {
      console.error(e);
      alert('Failed to add admin.');
    }
  };

  const filteredUsers = users.filter(u => {
    const term = searchTerm.toLowerCase();
    return (u.email || '').toLowerCase().includes(term) || (u.displayName || '').toLowerCase().includes(term);
  });

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden">
      <div className="p-4 md:p-6 border-b border-slate-200 dark:border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50 dark:bg-white/[0.02]">
         <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Users & Admins</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage user roles, access, and accounts.</p>
         </div>
         <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
               onClick={() => setShowAddModal(true)}
               className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-orange-600 text-white hover:bg-orange-700 transition-all shadow-lg shadow-orange-500/20"
            >
               <Plus className="w-4 h-4" />
               Invite Admin
            </button>
            <div className="relative w-full sm:w-64">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
               <input 
                  type="text" 
                  placeholder="Search users..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all dark:text-white"
               />
            </div>
            <button
               onClick={fetchUsers} 
               className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white dark:bg-black/50 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all focus:ring-2 focus:ring-orange-500"
            >
               <RefreshCw className="w-4 h-4" />
               Refresh
            </button>
         </div>
      </div>

      <div className="flex-1 overflow-auto">
         <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-white/5 sticky top-0 z-10 backdrop-blur-md">
               <tr>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">User</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">Role</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">Joined</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10">Platform Activity</th>
                  <th className="px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-white/10 text-right">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
               {loading ? (
                  <tr>
                     <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        <div className="animate-pulse w-8 h-8 rounded-full bg-orange-500 mx-auto mb-4"></div>
                        Fetching users...
                     </td>
                  </tr>
               ) : filteredUsers.length === 0 ? (
                  <tr>
                     <td colSpan={5} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                        <AlertCircle className="w-8 h-8 mx-auto mb-4 opacity-50" />
                        No users found. Note: Ensure 'users' collection exists and rules allow listing.
                     </td>
                  </tr>
               ) : (
                  filteredUsers.map((user) => (
                     <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                        <td className="px-6 py-4 whitespace-nowrap">
                           <div className="flex items-center">
                              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mr-4 text-slate-600 dark:text-slate-300 font-bold uppercase overflow-hidden">
                                 {user.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                 ) : (user.displayName?.[0] || user.email?.[0] || 'U')}
                              </div>
                              <div>
                                 <div className="text-sm font-medium text-slate-900 dark:text-white">
                                    {user.displayName || 'Unnamed User'}
                                 </div>
                                 <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {user.email || 'No email provided'}
                                 </div>
                              </div>
                           </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                           <button 
                             onClick={(e) => { e.stopPropagation(); handleRoleToggle(user.id, user.role || 'user'); }}
                             className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                              user.role === 'admin' 
                                 ? 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20 dark:hover:bg-orange-500/20' 
                                 : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-white/5 dark:text-slate-300 dark:border-white/10 dark:hover:bg-white/10'
                           }`}>
                              {user.role === 'admin' ? <Shield className="w-3 h-3 mr-1.5" /> : <User className="w-3 h-3 mr-1.5" />}
                              {user.role === 'admin' ? 'Administrator' : 'Citizen'}
                           </button>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">
                           {user.createdAt ? format(new Date(user.createdAt), 'MMM dd, yyyy') : 'Unknown'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">
                           {user.reportsCount || 0} Reports
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                           <div className="flex items-center justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-1.5 text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 rounded-md hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors" title="Contact User">
                                 <Mail className="w-4 h-4" />
                              </button>
                              <button className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-md hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors" title="Suspend User">
                                 <Ban className="w-4 h-4" />
                              </button>
                              <button className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-white/10 transition-colors" title="More options">
                                 <MoreHorizontal className="w-4 h-4" />
                              </button>
                           </div>
                        </td>
                     </tr>
                  ))
               )}
            </tbody>
         </table>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#121826] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
              <h3 className="font-semibold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                 <Shield className="w-5 h-5 text-orange-500" />
                 Invite New Administrator
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 p-2 rounded-full transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddAdmin} className="p-6 space-y-4">
               <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="admin@hafra.dz"
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all dark:text-white"
                  />
               </div>
               <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Admin Role</label>
                  <select
                    value={newAdminRole}
                    onChange={(e) => setNewAdminRole(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all dark:text-white appearance-none"
                  >
                     <option>Super Admin</option>
                     <option>National Admin</option>
                     <option>Wilaya Admin</option>
                     <option>Municipality Admin</option>
                     <option>Moderator</option>
                     <option>Analyst</option>
                  </select>
               </div>
               <div className="pt-4 flex gap-3">
                  <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-300 rounded-xl font-medium hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                     Cancel
                  </button>
                  <button type="submit" className="flex-1 py-2.5 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-colors shadow-lg shadow-orange-500/20">
                     Send Invitation
                  </button>
               </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
