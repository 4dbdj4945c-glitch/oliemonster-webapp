import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestCommentToTask } from '@/lib/ultimoTasks';

// PUT - Opmerking bijwerken (alleen admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen opmerkingen bewerken' }, { status: 403 });
    }

    const { id, commentId } = await params;
    const taskId = parseInt(id);

    const body = await request.json();
    const { date, jobNumber, text } = body as {
      date?: string | null;
      jobNumber?: string | null;
      text?: string;
    };

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Opmerking mag niet leeg zijn' }, { status: 400 });
    }

    const comment = await prisma.ultimoComment.update({
      where: { id: parseInt(commentId) },
      data: {
        date: date ? new Date(date) : null,
        jobNumber: jobNumber?.trim() || null,
        text: text.trim(),
      },
    });

    await syncLatestCommentToTask(taskId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_ULTIMO_COMMENT,
      details: { taskId, commentId: parseInt(commentId) },
      request,
    });

    return NextResponse.json(comment);
  } catch (error) {
    console.error('Error updating ultimo comment:', error);
    return NextResponse.json({ error: 'Fout bij bijwerken van opmerking' }, { status: 500 });
  }
}

// DELETE - Opmerking verwijderen (alleen admin)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen opmerkingen verwijderen' }, { status: 403 });
    }

    const { id, commentId } = await params;
    const taskId = parseInt(id);

    await prisma.ultimoComment.delete({ where: { id: parseInt(commentId) } });

    await syncLatestCommentToTask(taskId);

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_ULTIMO_COMMENT,
      details: { taskId, commentId: parseInt(commentId) },
      request,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting ultimo comment:', error);
    return NextResponse.json({ error: 'Fout bij verwijderen van opmerking' }, { status: 500 });
  }
}
