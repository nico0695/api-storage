import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('files')
export class FileEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  key!: string;

  @Column()
  mime!: string;

  @Column()
  size!: number;

  @CreateDateColumn()
  createdAt!: Date;
}
