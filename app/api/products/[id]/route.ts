import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// GET - Haal een specifiek product op
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const productId = parseInt(id);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        stockItems: true,
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: 'Product niet gevonden' },
        { status: 404 }
      );
    }

    const currentStock = product.stockItems.reduce((sum, item) => sum + item.quantity, 0);

    return NextResponse.json({
      ...product,
      currentStock,
      isLowStock: currentStock <= product.minStock,
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen van product' },
      { status: 500 }
    );
  }
}

// PUT - Update een product (alleen admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    if (session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Alleen admins kunnen producten bewerken' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const productId = parseInt(id);
    const body = await request.json();
    const { brand, type, articleNumber, category, location, unit, minStock, description, isActive } = body;

    const product = await prisma.product.update({
      where: { id: productId },
      data: {
        brand,
        type,
        articleNumber,
        category,
        location,
        unit,
        minStock,
        description,
        isActive,
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.UPDATE_PRODUCT,
      details: { productId, brand, type },
      request,
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error('Error updating product:', error);
    return NextResponse.json(
      { error: 'Fout bij bewerken van product' },
      { status: 500 }
    );
  }
}

// DELETE - Verwijder een product (alleen admin, soft delete)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

    if (!session.isLoggedIn) {
      return NextResponse.json(
        { error: 'Niet geautoriseerd' },
        { status: 401 }
      );
    }

    if (session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Alleen admins kunnen producten verwijderen' },
        { status: 403 }
      );
    }

    const { id } = await params;
    const productId = parseInt(id);

    // Soft delete - zet isActive op false
    const product = await prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.DELETE_PRODUCT,
      details: { productId, name: product.name },
      request,
    });

    return NextResponse.json({ message: 'Product verwijderd' });
  } catch (error) {
    console.error('Error deleting product:', error);
    return NextResponse.json(
      { error: 'Fout bij verwijderen van product' },
      { status: 500 }
    );
  }
}
