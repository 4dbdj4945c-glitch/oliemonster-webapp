import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// GET - Lijst van alle taken (met optionele zoekfunctie)
// Doorzoekt jobnaam, taakomschrijving, installatie en de gecachte laatste opmerking + jobnummer.
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');

    const whereClause = search
      ? {
          OR: [
            { jobName: { contains: search, mode: 'insensitive' as const } },
            { taskDescription: { contains: search, mode: 'insensitive' as const } },
            { installation: { contains: search, mode: 'insensitive' as const } },
            { lastComment: { contains: search, mode: 'insensitive' as const } },
            { lastJobNumber: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const tasks = await prisma.ultimoTask.findMany({
      where: whereClause,
      orderBy: [
        { lastDate: 'desc' },
        { updatedAt: 'desc' },
      ],
      include: {
        _count: {
          select: { comments: true },
        },
      },
    });

    // Exposeer commentsCount als top-level veld voor de UI.
    const response = tasks.map(({ _count, ...rest }) => ({
      ...rest,
      commentsCount: _count.comments,
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching ultimo tasks:', error);
    return NextResponse.json({ error: 'Fout bij ophalen van taken' }, { status: 500 });
  }
}

// POST - Nieuwe taak toevoegen (alleen admin)
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
    }

    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Alleen admins kunnen taken toevoegen' }, { status: 403 });
    }

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

    const task = await prisma.ultimoTask.create({
      data: {
        jobName: jobName.trim(),
        taskDescription: taskDescription.trim(),
        installation: installation?.trim() || null,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_ULTIMO_TASK,
      details: { id: task.id, jobName: task.jobName, taskDescription: task.taskDescription },
      request,
    });

    return NextResponse.json({ ...task, commentsCount: 0 }, { status: 201 });
  } catch (error) {
    console.error('Error creating ultimo task:', error);
    return NextResponse.json({ error: 'Fout bij aanmaken van taak' }, { status: 500 });
  }
}
