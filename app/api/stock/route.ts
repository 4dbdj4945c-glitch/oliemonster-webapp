import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// GET - Haal alle voorraadmutaties op
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('productId');
    const limit = parseInt(searchParams.get('limit') || '50');

    const where: any = {};
    if (productId) {
      where.productId = parseInt(productId);
    }

    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        product: {
          select: {
            name: true,
            unit: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json(movements);
  } catch (error) {
    console.error('Error fetching stock movements:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen van voorraadmutaties' },
      { status: 500 }
    );
  }
}

// POST - Voeg een voorraadmutatie toe (IN of OUT)
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { productId, type, quantity, location = 'Hoofdmagazijn', reason } = body;

    if (!productId || !type || !quantity) {
      return NextResponse.json(
        { error: 'Product, type en aantal zijn verplicht' },
        { status: 400 }
      );
    }

    if (!['IN', 'OUT'].includes(type)) {
      return NextResponse.json(
        { error: 'Type moet IN of OUT zijn' },
        { status: 400 }
      );
    }

    if (quantity <= 0) {
      return NextResponse.json(
        { error: 'Aantal moet groter zijn dan 0' },
        { status: 400 }
      );
    }

    // Haal of maak stock item voor deze locatie
    let stockItem = await prisma.stockItem.findFirst({
      where: {
        productId: parseInt(productId),
        location,
      },
    });

    if (!stockItem) {
      stockItem = await prisma.stockItem.create({
        data: {
          productId: parseInt(productId),
          quantity: 0,
          location,
        },
      });
    }

    // Check of er genoeg voorraad is bij OUT
    if (type === 'OUT' && stockItem.quantity < quantity) {
      return NextResponse.json(
        { error: `Onvoldoende voorraad. Huidige voorraad: ${stockItem.quantity}` },
        { status: 400 }
      );
    }

    // Update voorraad
    const newQuantity = type === 'IN' 
      ? stockItem.quantity + quantity 
      : stockItem.quantity - quantity;

    await prisma.stockItem.update({
      where: { id: stockItem.id },
      data: { quantity: newQuantity },
    });

    // Maak beweging aan
    const movement = await prisma.stockMovement.create({
      data: {
        productId: parseInt(productId),
        type,
        quantity,
        location,
        reason: reason || null,
        userId: session.userId,
        username: session.username,
      },
      include: {
        product: {
          select: { name: true },
        },
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: type === 'IN' ? AuditActions.STOCK_IN : AuditActions.STOCK_OUT,
      details: { 
        productId, 
        productName: movement.product.name,
        quantity, 
        location, 
        reason,
        newStock: newQuantity,
      },
      request,
    });

    return NextResponse.json({
      ...movement,
      newStock: newQuantity,
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating stock movement:', error);
    return NextResponse.json(
      { error: 'Fout bij aanmaken van voorraadmutatie' },
      { status: 500 }
    );
  }
}
