import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/toegang';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/auditLog';
import { tabelOntbreekt } from '@/lib/kolommen';
import { maakUitnodiging, linkVoor, originVan, KOLOM_ONTBREEKT_FASE0, UITNODIGING_GELDIG_UREN } from '@/lib/uitnodiging';

// POST - Reset wachtwoord, of een nieuwe link voor wie nog geen wachtwoord heeft.
// Het oude wachtwoord vervalt en de beheerder krijgt een eenmalige link terug
// (72 uur geldig) die hij zelf naar de gebruiker stuurt.
export const POST = withAuth({ rol: 'admin', module: 'beheer', adminMelding: 'Geen toegang' }, async (
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  session
) => {
  try {
    const { id } = await params;
    const userId = parseInt(id);

    // Haal gebruiker op
    const user = isNaN(userId)
      ? null
      : await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true },
        });

    if (!user) {
      return NextResponse.json(
        { error: 'Gebruiker niet gevonden' },
        { status: 404 }
      );
    }

    // Eerst de link. Kan dat niet (tabel ontbreekt nog), dan resetten we ook
    // niet: anders zit de gebruiker buiten zonder manier om terug te komen.
    let uitnodiging: { token: string; verlooptOp: Date };
    try {
      uitnodiging = await maakUitnodiging(userId, session.username);
    } catch (error) {
      if (tabelOntbreekt(error)) {
        return NextResponse.json({ error: KOLOM_ONTBREEKT_FASE0, tabelOntbreekt: true }, { status: 503 });
      }
      throw error;
    }

    // Oude wachtwoord vervalt; inloggen kan pas weer na de link.
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: null,
        requiresPasswordChange: true,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: 'RESET_USER_PASSWORD',
      details: { targetUserId: userId, targetUsername: user.username },
      request,
    });

    return NextResponse.json({
      success: true,
      uitnodiging: {
        link: linkVoor(originVan(request), uitnodiging.token),
        verlooptOp: uitnodiging.verlooptOp,
        geldigUren: UITNODIGING_GELDIG_UREN,
      },
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    return NextResponse.json(
      { error: 'Fout bij resetten wachtwoord' },
      { status: 500 }
    );
  }
});
