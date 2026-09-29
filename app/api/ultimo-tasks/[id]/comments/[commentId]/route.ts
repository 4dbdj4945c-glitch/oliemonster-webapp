import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog, AuditActions } from '@/lib/auditLog';
import { syncLatestCommentToTask } from '@/lib/ultimoTasks';

// PUT - Opmerking bijwerken (alleen admin)
export const PUT = withAuth({ rol: 'admin', module: 'ultimo', adminMelding: 'Alleen admins kunnen opmerkingen bewerken' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
  session
) => {
  try {
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
});

// DELETE - Opmerking verwijderen (alleen admin)
export const DELETE = withAuth({ rol: 'admin', module: 'ultimo', adminMelding: 'Alleen admins kunnen opmerkingen verwijderen' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
  session
) => {
  try {
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
});
