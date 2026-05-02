'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function untypedSupabase(): Promise<any> {
  return createClient();
}

export type ActionResult = { ok: true; id: string } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// project_tasks
// ---------------------------------------------------------------------------

const CreateTaskSchema = z.object({
  project_id: z.string().uuid(),
  body: z.string().trim().min(1, 'Write something first.').max(280),
  due_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function createProjectTask(formData: FormData): Promise<ActionResult> {
  const due = formData.get('due_at');
  const parsed = CreateTaskSchema.safeParse({
    project_id: formData.get('project_id'),
    body: formData.get('body'),
    ...(typeof due === 'string' && due.length > 0 ? { due_at: due } : {}),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = await untypedSupabase();

  // Compute next position — append to bottom of the open list.
  const { data: maxRow } = await supabase
    .from('project_tasks')
    .select('position')
    .eq('project_id', parsed.data.project_id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow as { position: number } | null)?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from('project_tasks')
    .insert({
      owner_id: user.id,
      project_id: parsed.data.project_id,
      body: parsed.data.body,
      position: nextPosition,
      ...(parsed.data.due_at ? { due_at: parsed.data.due_at } : {}),
    })
    .select('id')
    .single();
  if (error || !data) {
    logger.error('project.task.create.failed', { err: error?.message });
    return { ok: false, error: 'Could not create task.' };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true, id: data.id };
}

const ToggleTaskSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  done: z.boolean(),
});

export async function toggleProjectTask(input: {
  id: string;
  project_id: string;
  done: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ToggleTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };

  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('project_tasks')
    .update({
      status: parsed.data.done ? 'done' : 'open',
      completed_at: parsed.data.done ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id);
  if (error) {
    logger.error('project.task.toggle.failed', { id: parsed.data.id, err: error.message });
    return { ok: false, error: 'Could not update task.' };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true };
}

const DeleteTaskSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
});

export async function deleteProjectTask(input: {
  id: string;
  project_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DeleteTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const supabase = await untypedSupabase();
  const { error } = await supabase.from('project_tasks').delete().eq('id', parsed.data.id);
  if (error) {
    logger.error('project.task.delete.failed', { id: parsed.data.id, err: error.message });
    return { ok: false, error: 'Could not delete task.' };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// project_parts
// ---------------------------------------------------------------------------

const CreatePartSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1, 'A part needs a title.').max(140),
  note: z.string().trim().max(2000).optional().default(''),
});

export async function createProjectPart(formData: FormData): Promise<ActionResult> {
  const parsed = CreatePartSchema.safeParse({
    project_id: formData.get('project_id'),
    title: formData.get('title'),
    note: formData.get('note') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = await untypedSupabase();
  const { data: maxRow } = await supabase
    .from('project_parts')
    .select('position')
    .eq('project_id', parsed.data.project_id)
    .is('deleted_at', null)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow as { position: number } | null)?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from('project_parts')
    .insert({
      owner_id: user.id,
      project_id: parsed.data.project_id,
      title: parsed.data.title,
      ...(parsed.data.note.length > 0 ? { note: parsed.data.note } : {}),
      position: nextPosition,
    })
    .select('id')
    .single();
  if (error || !data) {
    logger.error('project.part.create.failed', { err: error?.message });
    return { ok: false, error: 'Could not create part.' };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true, id: data.id };
}

const UpdatePartSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  status: z.enum(['planned', 'in_progress', 'done']),
});

export async function updateProjectPartStatus(input: {
  id: string;
  project_id: string;
  status: 'planned' | 'in_progress' | 'done';
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = UpdatePartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('project_parts')
    .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
    .eq('id', parsed.data.id);
  if (error) {
    logger.error('project.part.update.failed', { id: parsed.data.id, err: error.message });
    return { ok: false, error: 'Could not update part.' };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true };
}

const DeletePartSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
});

export async function deleteProjectPart(input: {
  id: string;
  project_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DeletePartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('project_parts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', parsed.data.id);
  if (error) {
    logger.error('project.part.delete.failed', { id: parsed.data.id, err: error.message });
    return { ok: false, error: 'Could not delete part.' };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// project_deadlines
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CreateDeadlineSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().trim().min(1, 'A deadline needs a label.').max(140),
  due_at: z.string().regex(DATE_RE, 'Pick a valid date.'),
  notes: z.string().trim().max(1000).optional().default(''),
});

export async function createProjectDeadline(formData: FormData): Promise<ActionResult> {
  const parsed = CreateDeadlineSchema.safeParse({
    project_id: formData.get('project_id'),
    title: formData.get('title'),
    due_at: formData.get('due_at'),
    notes: formData.get('notes') ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const authClient = await createClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const supabase = await untypedSupabase();
  const { data, error } = await supabase
    .from('project_deadlines')
    .insert({
      owner_id: user.id,
      project_id: parsed.data.project_id,
      title: parsed.data.title,
      due_at: parsed.data.due_at,
      ...(parsed.data.notes.length > 0 ? { notes: parsed.data.notes } : {}),
    })
    .select('id')
    .single();
  if (error || !data) {
    logger.error('project.deadline.create.failed', { err: error?.message });
    return { ok: false, error: 'Could not create deadline.' };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true, id: data.id };
}

const ToggleDeadlineSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
  hit: z.boolean(),
});

export async function toggleProjectDeadline(input: {
  id: string;
  project_id: string;
  hit: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ToggleDeadlineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('project_deadlines')
    .update({
      status: parsed.data.hit ? 'hit' : 'pending',
      completed_at: parsed.data.hit ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.id);
  if (error) {
    logger.error('project.deadline.toggle.failed', { id: parsed.data.id, err: error.message });
    return { ok: false, error: 'Could not update deadline.' };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true };
}

const DeleteDeadlineSchema = z.object({
  id: z.string().uuid(),
  project_id: z.string().uuid(),
});

export async function deleteProjectDeadline(input: {
  id: string;
  project_id: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = DeleteDeadlineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid input.' };
  const supabase = await untypedSupabase();
  const { error } = await supabase
    .from('project_deadlines')
    .delete()
    .eq('id', parsed.data.id);
  if (error) {
    logger.error('project.deadline.delete.failed', { id: parsed.data.id, err: error.message });
    return { ok: false, error: 'Could not delete deadline.' };
  }
  revalidatePath(`/projects/${parsed.data.project_id}`);
  return { ok: true };
}
