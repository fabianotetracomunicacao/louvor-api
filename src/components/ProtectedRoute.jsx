import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function ProtectedRoute({ children }) {
    const { user, loading, subscriptionStatus } = useAuth();
    const location = useLocation();

    // Show nothing while checking auth
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    <p className="text-slate-600 dark:text-slate-400">Verificando autenticação...</p>
                </div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Check subscription status
    // If the status is explicit OVERDUE or CANCELED, restrict access to the dashboard/app.
    const isOverdue = subscriptionStatus === 'OVERDUE' || subscriptionStatus === 'CANCELED';
    const isPaymentPage = location.pathname === '/payment-required';

    if (isOverdue && !isPaymentPage) {
        return <Navigate to="/payment-required" replace />;
    }

    if (!isOverdue && isPaymentPage) {
        return <Navigate to="/dashboard" replace />;
    }

    // User is authenticated and active, render the protected content
    return children;
}

export function AdminRoute({ children }) {
    const { isChurchAdmin, isSuperAdmin, loading } = useAuth();

    if (loading) return null;

    if (!isChurchAdmin && !isSuperAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}

export function SuperAdminRoute({ children }) {
    const { isSuperAdmin, loading } = useAuth();

    if (loading) return null;

    if (!isSuperAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
}
