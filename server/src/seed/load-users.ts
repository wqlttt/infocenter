/**
 * 压测用户 seed：批量创建 loadtest000001 … 并导出 receiverIds 到 load-test/data/
 *
 * 用法：
 *   cd server && yarn seed:load -- --count 500
 *   cd server && yarn seed:load -- --count 10000
 */
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import { User, UserDocument } from '../users/schemas/user.schema';

const DEMO_PASSWORD = 'demo123';
const PREFIX = 'loadtest';

function parseCount(): number {
  const idx = process.argv.indexOf('--count');
  const raw = idx >= 0 ? process.argv[idx + 1] : '100';
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 50000) {
    throw new Error('--count 须在 1～50000 之间');
  }
  return n;
}

async function main() {
  const count = parseCount();
  const pad = String(count).length;
  const app = await NestFactory.createApplicationContext(AppModule);
  const userModel = app.get<Model<UserDocument>>(getModelToken(User.name));
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const dataDir = path.resolve(__dirname, '../../../load-test/data');
  fs.mkdirSync(dataDir, { recursive: true });

  const batchSize = 500;
  const ids: string[] = [];
  let created = 0;
  let existing = 0;

  for (let start = 1; start <= count; start += batchSize) {
    const end = Math.min(start + batchSize - 1, count);
    const ops = [];
    for (let i = start; i <= end; i++) {
      const username = `${PREFIX}${String(i).padStart(pad, '0')}`;
      ops.push({
        updateOne: {
          filter: { username },
          update: {
            $setOnInsert: {
              username,
              passwordHash,
              role: 'member',
              teamId: null,
              status: 'active',
              refreshTokenHash: null,
            },
          },
          upsert: true,
        },
      });
    }
    const result = await userModel.bulkWrite(ops, { ordered: false });
    created += result.upsertedCount ?? 0;
    existing += end - start + 1 - (result.upsertedCount ?? 0);

    const usernames = Array.from({ length: end - start + 1 }, (_, j) =>
      `${PREFIX}${String(start + j).padStart(pad, '0')}`,
    );
    const docs = await userModel.find({ username: { $in: usernames } }, { _id: 1 }).exec();
    for (const doc of docs) {
      ids.push(doc._id.toString());
    }
    process.stdout.write(`\r进度 ${end}/${count}`);
  }

  console.log('\n');
  const outFile = path.join(dataDir, 'receiver-ids.json');
  fs.writeFileSync(outFile, JSON.stringify(ids));
  fs.writeFileSync(path.join(dataDir, 'load-users-meta.json'), JSON.stringify({
    count: ids.length,
    pad,
    password: DEMO_PASSWORD,
    usernamePattern: `${PREFIX}${'0'.padStart(pad, '0')}`,
    exportedAt: new Date().toISOString(),
  }, null, 2));

  console.log(`load 用户：新建 ${created}，已存在 ${existing}`);
  console.log(`已导出 ${ids.length} 个 userId → ${outFile}`);
  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
