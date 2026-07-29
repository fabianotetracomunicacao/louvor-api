import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MainLayout } from './components/MainLayout';
import { HomePage } from './pages/HomePage';
import { RepertoirePage } from './pages/RepertoirePage';
import { PlayerPage } from './pages/PlayerPage';
import { EditorPage } from './pages/EditorPage';
import { DataProvider } from './contexts/DataContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { VideoPlayerProvider } from './contexts/VideoPlayerContext';
import { FloatingVideoPlayer } from './components/FloatingVideoPlayer';
import { PlaylistPage } from './pages/PlaylistPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { SuperAdminChurchesPage } from './pages/SuperAdminChurchesPage';
import { SuperAdminPlansPage } from './pages/SuperAdminPlansPage';
import { AdminMetadataPage } from './pages/AdminMetadataPage';
import { AdminTrashPage } from './pages/AdminTrashPage';
import { AdminReportsPage } from './pages/AdminReportsPage';
import { AdminFinancialsPage } from './pages/AdminFinancialsPage';
import { ChurchAdminPage } from './pages/ChurchAdminPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { AuthProvider } from './contexts/AuthContext';
import { AdminContentReviewPage } from './pages/AdminContentReviewPage';
import ProjectorControlPage from './pages/ProjectorControlPage';
import { LoginPage } from './pages/LoginPage';
import { EmailConfirmationPage } from './pages/EmailConfirmationPage';
import { ProtectedRoute, AdminRoute, SuperAdminRoute } from './components/ProtectedRoute';
import { ReloadPrompt } from './components/ReloadPrompt';
import ProjectorPage from './pages/ProjectorPage';
import { SchedulesPage } from './pages/SchedulesPage';
import RemoteControlPage from './pages/RemoteControlPage';
import { InvitationAcceptPage } from './pages/InvitationAcceptPage';
import { PaymentRequiredPage } from './pages/PaymentRequiredPage';
import { CompleteProfilePage } from './pages/CompleteProfilePage';
import { UpdatePasswordPage } from './pages/UpdatePasswordPage';
import { LandingPage } from './pages/LandingPage';
import { VisualEditorPage } from './pages/VisualEditorPage';
import { AdminDiagnosticsPage } from './pages/AdminDiagnosticsPage';
import { AdminCifraclubImportPage } from './pages/AdminCifraclubImportPage';

import { LiveSessionProvider } from './contexts/LiveSessionContext';
import { MaintenanceGuard } from './components/MaintenanceGuard';

function App() {
  React.useEffect(() => {
    const handleInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing
      e.preventDefault();
      // Stash the event so it can be triggered later if needed
    };

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);

  return (
    <Router>
      <AuthProvider>
        <DataProvider>
          <NotificationProvider>
            <LiveSessionProvider>
              <VideoPlayerProvider>
                <MaintenanceGuard>
                <Routes>
                  {/* Public Routes */}
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/confirm-email" element={<EmailConfirmationPage />} />
                  <Route path="/join/:token" element={<InvitationAcceptPage />} />
                  <Route path="/update-password" element={<UpdatePasswordPage />} />

                  {/* Protected Routes - Using a Layout Route to wrap internal pages */}
                  <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
                    <Route path="/dashboard" element={<HomePage />} />
                    <Route path="/payment-required" element={<PaymentRequiredPage />} />
                    <Route path="/repertoire" element={<RepertoirePage />} />
                    <Route path="/escalas" element={<SchedulesPage />} />

                    <Route path="/player/:id" element={<PlayerPage />} />
                    <Route path="/editor" element={<EditorPage />} />
                    <Route path="/editor/:id" element={<EditorPage />} />
                    <Route path="/visual-editor" element={<VisualEditorPage />} />
                    <Route path="/playlists" element={<PlaylistPage />} />
                    <Route path="/playlist/:id" element={<PlaylistPage />} />
                    <Route path="/projector" element={<ProjectorControlPage />} />
                    <Route path="/profile" element={<ProfileSettingsPage />} />
                    <Route path="/completar-cadastro" element={<CompleteProfilePage />} />

                    {/* Admin Routes */}
                    <Route path="/admin/diagnostics" element={<SuperAdminRoute><AdminDiagnosticsPage /></SuperAdminRoute>} />
                    <Route path="/admin/cifraclub-imports" element={<SuperAdminRoute><AdminCifraclubImportPage /></SuperAdminRoute>} />
                    <Route path="/admin/users" element={<AdminRoute><AdminUsersPage /></AdminRoute>} />
                    <Route path="/admin/churches" element={<SuperAdminRoute><SuperAdminChurchesPage /></SuperAdminRoute>} />
                    <Route path="/admin/plans" element={<SuperAdminRoute><SuperAdminPlansPage /></SuperAdminRoute>} />
                    <Route path="/admin/reports" element={<SuperAdminRoute><AdminReportsPage /></SuperAdminRoute>} />
                    <Route path="/admin/review" element={<SuperAdminRoute><AdminContentReviewPage /></SuperAdminRoute>} />
                    <Route path="/admin/financials" element={<SuperAdminRoute><AdminFinancialsPage /></SuperAdminRoute>} />
                    <Route path="/admin/metadata" element={<SuperAdminRoute><AdminMetadataPage /></SuperAdminRoute>} />
                    <Route path="/admin/trash" element={<SuperAdminRoute><AdminTrashPage /></SuperAdminRoute>} />
                    <Route path="/admin/church" element={<AdminRoute><ChurchAdminPage /></AdminRoute>} />
                  </Route>

                  {/* Projector Route - Independent of MainLayout */}
                  <Route path="/projector-display" element={<ProtectedRoute><ProjectorPage /></ProtectedRoute>} />
                  <Route path="/remote/:sessionId" element={<RemoteControlPage />} />

                  {/* Redirect any unknown routes to dashboard (which will redirect to login if not authenticated) */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
                </MaintenanceGuard>

                {/* Global Components */}
                <FloatingVideoPlayer />
                <ReloadPrompt />
              </VideoPlayerProvider>
            </LiveSessionProvider>
          </NotificationProvider>
        </DataProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
