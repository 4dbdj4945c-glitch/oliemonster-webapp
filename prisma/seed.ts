import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';

async function main() {
  // Maak een standaard admin gebruiker
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      role: 'admin',
    },
  });

  console.log('✓ Admin gebruiker aangemaakt:', admin.username);

  // Optioneel: voeg een voorbeeld gebruiker toe
  const hashedUserPassword = await bcrypt.hash('user123', 10);
  
  const user = await prisma.user.upsert({
    where: { username: 'gebruiker' },
    update: {},
    create: {
      username: 'gebruiker',
      password: hashedUserPassword,
      role: 'user',
    },
  });

  console.log('✓ Voorbeeld gebruiker aangemaakt:', user.username);

  // Voeg voorbeeld oliemonsters toe
  const samples = [
    {
      oNumber: 'O-001',
      sampleDate: new Date('2025-01-15'),
      location: 'Locatie A - Machine 1',
      description: 'Hydraulische olie hoofdcilinder',
      isTaken: true,
    },
    {
      oNumber: 'O-002',
      sampleDate: new Date('2025-01-20'),
      location: 'Locatie B - Machine 2',
      description: 'Motorolie dieselmotor',
      isTaken: false,
    },
    {
      oNumber: 'O-003',
      sampleDate: new Date('2025-01-25'),
      location: 'Locatie A - Machine 3',
      description: 'Smeervet lagers',
      isTaken: true,
    },
  ];

  for (const sample of samples) {
    await prisma.oilSample.upsert({
      where: { oNumber: sample.oNumber },
      update: {},
      create: sample,
    });
  }

  console.log('✓ Voorbeeld oliemonsters aangemaakt');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
