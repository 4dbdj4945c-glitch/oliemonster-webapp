import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { prisma } from '@/lib/prisma';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { createAuditLog, AuditActions } from '@/lib/auditLog';

// GET - Lijst van alle producten met hun huidige voorraad
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
    const search = searchParams.get('search');
    const category = searchParams.get('category');

    const where: any = { isActive: true };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (category) {
      where.category = category;
    }

    const products = await prisma.product.findMany({
      where,
      include: {
        stockItems: true,
      },
      orderBy: { name: 'asc' },
    });

    // Bereken totale voorraad per product
    const productsWithStock = products.map(product => {
      const currentStock = product.stockItems.reduce((sum, item) => sum + item.quantity, 0);
      return {
        ...product,
        currentStock,
        isLowStock: currentStock <= product.minStock,
      };
    });

    return NextResponse.json(productsWithStock);
  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Fout bij ophalen van producten' },
      { status: 500 }
    );
  }
}

// POST - Nieuw product toevoegen (alleen admin)
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

    if (session.role !== 'admin') {
      return NextResponse.json(
        { error: 'Alleen admins kunnen producten toevoegen' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, category, unit, minStock, description } = body;

    if (!name || !category) {
      return NextResponse.json(
        { error: 'Naam en categorie zijn verplicht' },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name,
        category,
        unit: unit || 'stuks',
        minStock: minStock || 0,
        description: description || null,
      },
    });

    // Maak automatisch een stock item aan voor het hoofdmagazijn
    await prisma.stockItem.create({
      data: {
        productId: product.id,
        quantity: 0,
        location: 'Hoofdmagazijn',
      },
    });

    await createAuditLog({
      userId: session.userId,
      username: session.username || 'unknown',
      action: AuditActions.CREATE_PRODUCT || 'CREATE_PRODUCT',
      details: { name, category },
      request,
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error('Error creating product:', error);
    return NextResponse.json(
      { error: 'Fout bij aanmaken van product' },
      { status: 500 }
    );
  }
}

// GET categories - Haal alle unieke categorieën op
export async function OPTIONS() {
  return NextResponse.json({ message: 'OK' });
}
