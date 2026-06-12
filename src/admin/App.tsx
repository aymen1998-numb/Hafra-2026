import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

import LoginScreen from "./features/auth/LoginScreen";
import DashboardLayout from "./components/layout/DashboardLayout";
import OverviewDashboard from "./features/dashboard/OverviewDashboard";
import MapDashboard from "./features/map/MapDashboard";
import ReportsManagement from "./features/reports/ReportsManagement";
import AnalyticsPage from "./features/analytics/AnalyticsPage";
import UsersManagement from "./features/users/UsersManagement";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        try {
          const adminRef = doc(db, "admins", currentUser.uid);
          let adminSnap = await getDoc(adminRef);
          
          // Auto-bootstrap the admin based on email
          if (!adminSnap.exists() && (currentUser.email === 'spaelfath16@gmail.com' || currentUser.email === 'admin@hafra.dz')) {
             await setDoc(adminRef, {
                 username: "Admin",
                 role: "admin",
                 email: currentUser.email
             });
             adminSnap = await getDoc(adminRef);
          }

          if (adminSnap.exists() && adminSnap.data().role === "admin") {
             setIsAdmin(true);
          } else {
             // Not admin
             setIsAdmin(false);
          }
        } catch (e) {
          console.error("Error verifying admin status:", e);
          setIsAdmin(false);
        }
      } else {
        setUser(null);
        setIsAdmin(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900 dark:border-slate-50"></div>
      </div>
    );
  }

  if (!user || isAdmin === false) {
    return <LoginScreen error={user && isAdmin === false ? "Access Denied. You are not an administrator." : undefined} />;
  }

  return (
    <Routes>
      <Route path="/" element={<DashboardLayout />}>
        <Route index element={<OverviewDashboard />} />
        <Route path="map" element={<MapDashboard />} />
        <Route path="reports" element={<ReportsManagement />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="users" element={<UsersManagement />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
