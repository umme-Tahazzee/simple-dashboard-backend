import app from './app';
import config from './config';
import { prisma } from './lib/prisma';
import { seedAdmin } from './utils/seedAdmin';

try {
	await seedAdmin()
	console.log(`seed active successfully`);
	
	await prisma.$connect();
	console.log('Connected to the database successfully.');
} catch (error) {
	console.error('Error starting the server:', error);
	await prisma.$disconnect();
	process.exit(1);
}

const server = app.listen(config.port, () => {
	console.log(`Server is running on port ${config.port}`);
});

export default app