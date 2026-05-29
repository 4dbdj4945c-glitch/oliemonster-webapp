import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestCommentToTask } from '@/lib/ultimoTasks';

// GET - Alle opmerkingen voor een taak (nieuwste eerst)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    const { id } = await params;
    const taskId = parseInt(id);

    const comments = await prisma.ultimoComment.findMany({
      where: { taskId },
      orderBy: [
        { date: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    return NextResponse.json(comments);
  } catch (error) {
    console.error('Error fetching ultimo comments:', error);
    return NextResponse.json({ error: 'Fout bij ophalen van opmerkingen' }, { status: 500 });
  }
}

// POST - Nieuwe opmerking toevoegen (alleen admin)
export async function POST(
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
      return NextResponse.json({ error: 'Alleen admins kunnen opmerkingen toevoegen' }, { status: 403 });
    }

    const { id } = await params;
    const taskId = parseInt(id);

    const task = await prisma.ultimoTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { date, jobNumber, text } = body as {
      date?: string | null;
      jobNumber?: string | null;
      text?: string;
    };

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Opmerking mag niet leeg zijn' }, { status: 400 });
    }

    const comment = await prisma.ultimoComment.create({
      data: {
        taskId,
        date: date ? new Date(date) : null,
        jobNumber: jobNumber?.trim() || null,
        text: text.trim(),
        userId: session.userId,
        username: session.username || null,
      },
    });

    await syncLatestCommentToTask(taskId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_ULTIMO_COMMENT,
      details: { taskId, commentId: comment.id, jobName: task.jobName },
      request,
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    console.error('Error creating ultimo comment:', error);
    return NextResponse.json({ error: 'Fout bij aanmaken van opmerking' }, { status: 500 });
  }
}
