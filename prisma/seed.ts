import { prisma } from '../src/lib/prisma';
import { seedAdmin } from '../src/utils/seedAdmin';

try {
	await seedAdmin();
} finally {
	await prisma.$disconnect();
}
