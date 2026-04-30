'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { NewProjectModal } from './NewProjectModal';

/**
 * "+ New project" button + modal owner. Lives in a small client island so
 * the rest of the Workshop page can stay a server component.
 */
export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="forge-btn forge-btn--primary"
        onClick={() => setOpen(true)}
      >
        <Plus size={14} /> New project
      </button>
      <NewProjectModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
