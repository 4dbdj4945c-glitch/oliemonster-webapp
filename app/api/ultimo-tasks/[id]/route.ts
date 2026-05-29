import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// PUT - Taak bijwerken (alleen admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen taken bewerken' }, { status: 403 });
    }

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
}

// DELETE - Taak verwijderen (alleen admin). Opmerkingen verdwijnen mee (cascade).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen taken verwijderen' }, { status: 403 });
    }

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
}
