import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// PUT - Taak bijwerken (alleen admin)
export const PUT = withAuth({ rol: 'admin', module: 'ultimo', adminMelding: 'Alleen admins kunnen taken bewerken' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
  try {
    const { id } = await params;
    const body = await request.json();
    const { jobName, taskDescription, installation } = body as {
      jobName?: string;
      taskDescription?: string;
      installation?: string | null;
    };

    if (!jobName?.trim() || !taskDescription?.trim()) {
      return NextResponse.json(
        { error: 'Jobnaam en taakomschrijving zijn verplicht' },
        { status: 400 }
      );
    }

    const task = await prisma.ultimoTask.update({
      where: { id: parseInt(id) },
      data: {
        jobName: jobName.trim(),
        taskDescription: taskDescription.trim(),
        installation: installation?.trim() || null,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_ULTIMO_TASK,
      details: { id: task.id, jobName: task.jobName },
      request,
    });

    return NextResponse.json(task);
  } catch (error) {
    console.error('Error updating ultimo task:', error);
    return NextResponse.json({ error: 'Fout bij bijwerken van taak' }, { status: 500 });
  }
});

// DELETE - Taak verwijderen (alleen admin). Opmerkingen verdwijnen mee (cascade).
export const DELETE = withAuth({ rol: 'admin', module: 'ultimo', adminMelding: 'Alleen admins kunnen taken verwijderen' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
  try {
    const { id } = await params;

    const task = await prisma.ultimoTask.findUnique({ where: { id: parseInt(id) } });

    await prisma.ultimoTask.delete({ where: { id: parseInt(id) } });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_ULTIMO_TASK,
      details: { id: parseInt(id), jobName: task?.jobName, taskDescription: task?.taskDescription },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ultimo task:', error);
    return NextResponse.json({ error: 'Fout bij verwijderen van taak' }, { status: 500 });
  }
});
