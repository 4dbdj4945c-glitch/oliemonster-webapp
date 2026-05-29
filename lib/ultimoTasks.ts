import { prisma } from './prisma';

/**
 * Synchroniseer de cache-velden op UltimoTask met de meest recente opmerking.
 * "Meest recent" = hoogste date; bij gelijkspel (of ontbrekende date) hoogste createdAt.
 *
 * - Is er géén opmerking meer over → reset cache-velden naar null.
 * - Is er wel een opmerking → spiegel date / text / jobNumber naar de taak.
 *
 * Volgt hetzelfde patroon als syncLatestAttemptToSample (hermonstering).
 */
export async function syncLatestCommentToTask(taskId: number) {
  const latest = await prisma.ultimoComment.findFirst({
    where: { taskId },
    orderBy: [
      { date: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  if (!latest) {
    await prisma.ultimoTask.update({
      where: { id: taskId },
      data: {
        lastDate: null,
        lastComment: null,
        lastJobNumber: null,
      },
    });
    return;
  }

  await prisma.ultimoTask.update({
    where: { id: taskId },
    data: {
      lastDate: latest.date,
      lastComment: latest.text,
      lastJobNumber: latest.jobNumber,
    },
  });
}
