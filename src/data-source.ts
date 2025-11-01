import path from 'path';
import { fileURLToPath } from 'url';
import { DataSource } from 'typeorm';
import { FileEntity } from './entities/FileEntity.js';
import { APIKeyEntity } from './entities/APIKeyEntity.js';
import { ShareLinkEntity } from './entities/ShareLinkEntity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: path.join(__dirname, 'data', 'database.sqlite'),
  entities: [FileEntity, APIKeyEntity, ShareLinkEntity],
  synchronize: true,
  logging: false,
});
