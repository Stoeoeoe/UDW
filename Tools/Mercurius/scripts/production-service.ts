import { createHash, randomUUID } from 'node:crypto';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  productionId,
  productionSchema,
  type Production,
} from '../src/playground/production/model';

export type ProductionRecord = { value: Production; revision: string };
export const saveProductionSchema = z
  .object({ value: productionSchema, revision: z.string().nullable() })
  .strict();
export class ProductionService {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly directory = resolve('productions')) {}
  async list(): Promise<ProductionRecord[]> {
    await mkdir(this.directory, { recursive: true });
    return Promise.all(
      (await readdir(this.directory))
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map(async (name) => {
          const record = await this.read(name.slice(0, -5));
          if (!record) throw new Error(`Production disappeared: ${name}`);
          return record;
        }),
    );
  }
  private async read(id: string): Promise<ProductionRecord | null> {
    const file = resolve(this.directory, `${productionId.parse(id)}.json`);
    let content: string;
    try {
      content = await readFile(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const value = productionSchema.parse(JSON.parse(content));
    if (value.id !== id)
      throw new Error(`Production identity differs from filename: ${id}`);
    return {
      value,
      revision: createHash('sha256').update(content).digest('hex'),
    };
  }
  save(input: unknown): Promise<ProductionRecord> {
    const request = saveProductionSchema.parse(input);
    const operation = this.pending.then(async () => {
      await mkdir(this.directory, { recursive: true });
      const current = await this.read(request.value.id);
      if ((current?.revision ?? null) !== request.revision)
        throw new Error(
          'This episode changed on disk. Download your changes, then reload before saving.',
        );
      const content = `${JSON.stringify(request.value, null, 2)}\n`;
      const file = resolve(this.directory, `${request.value.id}.json`);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, content, { flag: 'wx' });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
      return {
        value: request.value,
        revision: createHash('sha256').update(content).digest('hex'),
      };
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
}
