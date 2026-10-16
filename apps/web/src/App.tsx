import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useSession } from './lib/session';
import { Admin } from './views/Admin';
import { Annexures } from './views/Annexures';
import { ClientPortal } from './views/ClientPortal';
import { CourtBundle } from './views/CourtBundle';
import { Dashboard } from './views/Dashboard';
import { DetailedOcr } from './views/DetailedOcr';
import { DocumentPreview } from './views/DocumentPreview';
import { Documents } from './views/Documents';
import { Login } from './views/Login';
import { MatterDetail } from './views/MatterDetail';
import { NewMatter } from './views/NewMatter';
import { Practice } from './views/Practice';
import { Review } from './views/Review';
import { Settings } from './views/Settings';
import { TemplateDesigner } from './views/TemplateDesigner';
import { Templates } from './views/Templates';
import { Upload } from './views/Upload';

export default function App() {
  const { user, loading } = useSession();
  const onPortal = window.location.pathname.startsWith('/portal/');

  // Clients arriving on a portal link have no account and must never be bounced to
  // the firm's login screen.
  if (onPortal) {
    return (
      <Routes>
        <Route path="/portal/:token" element={<ClientPortal />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <div className="flex items-center gap-3 text-slate-500">
          <div className="size-5 animate-spin rounded-full border-2 border-slate-300 border-t-gold-500" />
          Loading…
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/matters/new" element={<NewMatter />} />
        <Route path="/matters/:id" element={<MatterDetail />} />
        <Route path="/matters/:id/upload" element={<Upload />} />
        <Route path="/matters/:id/review" element={<Review />} />
        <Route path="/matters/:id/ocr" element={<DetailedOcr />} />
        <Route path="/matters/:id/annexures" element={<Annexures />} />
        <Route path="/matters/:id/documents" element={<Documents />} />
        <Route path="/matters/:id/bundle" element={<CourtBundle />} />
        <Route path="/matters/:id/practice" element={<Practice />} />
        <Route path="/matters/:id/documents/:documentId" element={<DocumentPreview />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/templates/designer" element={<TemplateDesigner />} />
        <Route path="/templates/designer/:templateId" element={<TemplateDesigner />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
