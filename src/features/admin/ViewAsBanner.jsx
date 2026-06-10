import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { Eye, X } from 'lucide-react';

const ROLE_LABELS = {
  athlete: 'Athlete',
  parent: 'Parent / Guardian',
  guardian: 'Parent / Guardian',
  coach: 'Coach',
  organization: 'Organization',
};

// Persistent bar shown while an admin is previewing the app as another role.
// One click returns them to the admin portal and exits preview.
export default function ViewAsBanner() {
  const { viewAsRole, clearViewAs } = useAuth();
  const navigate = useNavigate();
  if (!viewAsRole) return null;

  const exit = () => {
    clearViewAs();
    navigate('/admin');
  };

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-3 bg-accent px-4 py-2 text-accent-foreground" role="status">
      <Eye className="h-4 w-4" aria-hidden="true" />
      <span className="text-sm font-semibold">
        Viewing as <span className="uppercase tracking-wide">{ROLE_LABELS[viewAsRole] || viewAsRole}</span> — this is a preview of their experience.
      </span>
      <button
        type="button"
        onClick={exit}
        className="ml-2 inline-flex items-center gap-1 rounded-md bg-accent-foreground/15 px-2.5 py-1 text-xs font-bold uppercase tracking-wide hover:bg-accent-foreground/25"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" /> Exit to admin
      </button>
    </div>
  );
}
