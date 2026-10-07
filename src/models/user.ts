import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type AuthSession = {
  id: string;
  userId: number;
  username: string;
  csrfToken: string;
};

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');

  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(':');

  if (!salt || !hash) {
    return false;
  }

  const storedBuffer = Buffer.from(hash, 'hex');
  const derivedBuffer = scryptSync(password, salt, 64);

  if (storedBuffer.length !== derivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(storedBuffer, derivedBuffer);
}

export class UserModel {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }

    this.db = new DatabaseSync(path);

    this.db.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        passwordHash TEXT NOT NULL,
        createdAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        userId INTEGER NOT NULL,
        csrfToken TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    this.createDevelopmentUser();
  }

  private createDevelopmentUser(): void {
    const existingUser = this.db
      .prepare('SELECT id FROM users WHERE username = ?')
      .get('example') as { id: number } | undefined;

    if (existingUser) {
      return;
    }

    this.db
      .prepare(
        'INSERT INTO users (username, passwordHash, createdAt) VALUES (?, ?, ?)',
      )
      .run(
        'example',
        hashPassword('1234'),
        new Date().toISOString(),
      );
  }

  authenticate(username: string, password: string): boolean {
    const user = this.db
      .prepare(
        'SELECT passwordHash FROM users WHERE username = ?',
      )
      .get(username) as { passwordHash: string } | undefined;

    if (!user) {
      return false;
    }

    return verifyPassword(password, user.passwordHash);
  }

  register(username: string, password: string): boolean {
    const result = this.db.prepare(
      'INSERT INTO users (username, passwordHash, createdAt) VALUES (?, ?, ?) ON CONFLICT(username) DO NOTHING',
    ).run(username, hashPassword(password), new Date().toISOString());
    return result.changes === 1;
  }

  createSession(username: string): AuthSession | undefined {
    const user = this.db
      .prepare(
        'SELECT id, username FROM users WHERE username = ?',
      )
      .get(username) as
      | { id: number; username: string }
      | undefined;

    if (!user) {
      return undefined;
    }

    this.removeExpiredSessions();

    const sessionId = randomBytes(32).toString('hex');
    const csrfToken = randomBytes(32).toString('hex');
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    this.db
      .prepare(
        'INSERT INTO sessions (id, userId, csrfToken, expiresAt) VALUES (?, ?, ?, ?)',
      )
      .run(
        sessionId,
        user.id,
        csrfToken,
        expiresAt,
      );

    return {
      id: sessionId,
      userId: user.id,
      username: user.username,
      csrfToken,
    };
  }

  getSession(sessionId: string): AuthSession | undefined {
    this.removeExpiredSessions();

    const session = this.db
      .prepare(`
        SELECT
          sessions.id,
          sessions.userId,
          users.username,
          sessions.csrfToken
        FROM sessions
        INNER JOIN users ON users.id = sessions.userId
        WHERE sessions.id = ?
          AND sessions.expiresAt > ?
      `)
      .get(sessionId, Date.now()) as AuthSession | undefined;

    return session;
  }

  deleteSession(sessionId: string): void {
    this.db
      .prepare('DELETE FROM sessions WHERE id = ?')
      .run(sessionId);
  }

  private removeExpiredSessions(): void {
    this.db
      .prepare('DELETE FROM sessions WHERE expiresAt <= ?')
      .run(Date.now());
  }
  
  close(): void {
  this.db.close();
}
}
