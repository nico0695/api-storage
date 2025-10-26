import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { APIKeyEntity } from '../entities/APIKeyEntity.js';
import { FileEntity } from '../entities/FileEntity.js';
import { generateAPIKey } from '../utils/generate-key.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database connection
const AppDataSource = new DataSource({
  type: 'sqlite',
  database: path.join(__dirname, '..', 'data', 'database.sqlite'),
  entities: [FileEntity, APIKeyEntity],
  synchronize: true,
  logging: false,
});

async function initializeDB() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
}

async function addKey(name: string) {
  await initializeDB();
  const keyRepo = AppDataSource.getRepository(APIKeyEntity);

  const key = generateAPIKey();
  const apiKey = keyRepo.create({ key, name, isActive: true });
  await keyRepo.save(apiKey);

  console.log('\n✅ API Key created successfully!\n');
  console.log('━'.repeat(70));
  console.log(`Key:      ${key}`);
  console.log(`Name:     ${name}`);
  console.log(`ID:       ${apiKey.id}`);
  console.log(`Status:   Active`);
  console.log(`Created:  ${apiKey.createdAt.toISOString()}`);
  console.log('━'.repeat(70));
  console.log('\n⚠️  Save this key securely. It cannot be retrieved later.\n');

  await AppDataSource.destroy();
}

async function listKeys() {
  await initializeDB();
  const keyRepo = AppDataSource.getRepository(APIKeyEntity);
  const keys = await keyRepo.find({ order: { createdAt: 'DESC' } });

  if (keys.length === 0) {
    console.log('\n📭 No API keys found.\n');
    await AppDataSource.destroy();
    return;
  }

  console.log('\n📋 API Keys:\n');
  console.log('━'.repeat(100));
  console.log(
    'ID'.padEnd(6) + 'Name'.padEnd(20) + 'Key (Last 8)'.padEnd(20) + 'Status'.padEnd(12) + 'Created'
  );
  console.log('━'.repeat(100));

  keys.forEach((key) => {
    const lastEight = '...' + key.key.slice(-8);
    const status = key.isActive ? '✅ Active' : '❌ Inactive';
    const created = key.createdAt.toISOString().split('T')[0];

    console.log(
      String(key.id).padEnd(6) +
        key.name.padEnd(20) +
        lastEight.padEnd(20) +
        status.padEnd(12) +
        created
    );
  });

  console.log('━'.repeat(100));
  console.log(`\nTotal: ${keys.length} key(s)\n`);

  await AppDataSource.destroy();
}

async function disableKey(id: number) {
  await initializeDB();
  const keyRepo = AppDataSource.getRepository(APIKeyEntity);
  const key = await keyRepo.findOne({ where: { id } });

  if (!key) {
    console.log(`\n❌ API key with ID ${id} not found.\n`);
    await AppDataSource.destroy();
    return;
  }

  if (!key.isActive) {
    console.log(`\n⚠️  API key "${key.name}" (ID: ${id}) is already inactive.\n`);
    await AppDataSource.destroy();
    return;
  }

  key.isActive = false;
  await keyRepo.save(key);

  console.log(`\n✅ API key "${key.name}" (ID: ${id}) has been disabled.\n`);
  await AppDataSource.destroy();
}

async function enableKey(id: number) {
  await initializeDB();
  const keyRepo = AppDataSource.getRepository(APIKeyEntity);
  const key = await keyRepo.findOne({ where: { id } });

  if (!key) {
    console.log(`\n❌ API key with ID ${id} not found.\n`);
    await AppDataSource.destroy();
    return;
  }

  if (key.isActive) {
    console.log(`\n⚠️  API key "${key.name}" (ID: ${id}) is already active.\n`);
    await AppDataSource.destroy();
    return;
  }

  key.isActive = true;
  await keyRepo.save(key);

  console.log(`\n✅ API key "${key.name}" (ID: ${id}) has been enabled.\n`);
  await AppDataSource.destroy();
}

async function deleteKey(id: number) {
  await initializeDB();
  const keyRepo = AppDataSource.getRepository(APIKeyEntity);
  const key = await keyRepo.findOne({ where: { id } });

  if (!key) {
    console.log(`\n❌ API key with ID ${id} not found.\n`);
    await AppDataSource.destroy();
    return;
  }

  await keyRepo.remove(key);
  console.log(`\n✅ API key "${key.name}" (ID: ${id}) has been permanently deleted.\n`);
  await AppDataSource.destroy();
}

function printHelp() {
  console.log(`
API Key Management CLI

Usage:
  npm run key:add -- --name <consumer-name>    Create a new API key
  npm run key:list                             List all API keys
  npm run key:disable -- --id <key-id>         Disable an API key
  npm run key:enable -- --id <key-id>          Enable an API key
  npm run key:delete -- --id <key-id>          Delete an API key
  npm run key:help                             Show this help

Examples:
  npm run key:add -- --name "nextjs-app"
  npm run key:add -- --name "node-server"
  npm run key:list
  npm run key:disable -- --id 1
  npm run key:enable -- --id 1
  npm run key:delete -- --id 2
`);
}

// Parse command-line arguments
const args = process.argv.slice(2);
const command = args[0];

(async () => {
  try {
    switch (command) {
      case 'add': {
        const nameIndex = args.indexOf('--name');
        if (nameIndex === -1 || !args[nameIndex + 1]) {
          console.error('\n❌ Error: --name argument required\n');
          console.log('Usage: npm run key:add -- --name <consumer-name>\n');
          process.exit(1);
        }
        await addKey(args[nameIndex + 1]);
        break;
      }

      case 'list':
        await listKeys();
        break;

      case 'disable': {
        const idIndex = args.indexOf('--id');
        if (idIndex === -1 || !args[idIndex + 1]) {
          console.error('\n❌ Error: --id argument required\n');
          console.log('Usage: npm run key:disable -- --id <key-id>\n');
          process.exit(1);
        }
        await disableKey(parseInt(args[idIndex + 1], 10));
        break;
      }

      case 'enable': {
        const idIndex = args.indexOf('--id');
        if (idIndex === -1 || !args[idIndex + 1]) {
          console.error('\n❌ Error: --id argument required\n');
          console.log('Usage: npm run key:enable -- --id <key-id>\n');
          process.exit(1);
        }
        await enableKey(parseInt(args[idIndex + 1], 10));
        break;
      }

      case 'delete': {
        const idIndex = args.indexOf('--id');
        if (idIndex === -1 || !args[idIndex + 1]) {
          console.error('\n❌ Error: --id argument required\n');
          console.log('Usage: npm run key:delete -- --id <key-id>\n');
          process.exit(1);
        }
        await deleteKey(parseInt(args[idIndex + 1], 10));
        break;
      }

      case 'help':
      case '--help':
      case '-h':
        printHelp();
        break;

      default:
        console.error(`\n❌ Unknown command: ${command}\n`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
})();
