import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { FileEntity } from './FileEntity.js';

@Entity('share_links')
export class ShareLinkEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'text', unique: true })
  token!: string;

  @Column({ type: 'integer' })
  fileId!: number;

  @ManyToOne(() => FileEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'fileId' })
  file!: FileEntity;

  @Column({ type: 'datetime' })
  expiresAt!: Date;

  @Column({ type: 'text', nullable: true })
  password!: string | null;

  @Column({ type: 'integer', default: 0 })
  accessCount!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
