import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';

export const filmcraftExe = () =>
  process.env.FILMCRAFT_EXE ??
  'C:/Program Files/ArtCraft/FilmCraft/filmcraft.exe';
export const filmcraftCli = () =>
  process.env.FILMCRAFT_CLI ??
  resolve(filmcraftExe(), '..', 'filmcraft-cli.exe');

export class Filmcraft {
  constructor(
    readonly port: number,
    private readonly token: string,
  ) {}
  request<T = Record<string, unknown>>(
    method: string,
    params: unknown = {},
  ): Promise<T> {
    return new Promise((accept, reject) => {
      let sent = false;
      let buffer = '';
      const socket = createConnection({ host: '127.0.0.1', port: this.port });
      socket.setEncoding('utf8');
      const fail = (error: Error) => {
        socket.destroy();
        reject(
          new Error(
            `${error.message}${sent ? ' The command may have been applied; inspect FilmCraft before retrying.' : ''}`,
          ),
        );
      };
      socket.setTimeout(15000, () =>
        fail(new Error('FilmCraft did not answer in 15 seconds.')),
      );
      socket.on('error', fail);
      socket.on('connect', () => {
        sent = true;
        socket.write(
          JSON.stringify({ id: 1, token: this.token, method, params }) + '\n',
        );
      });
      socket.on('data', (data) => {
        buffer += data;
        const end = buffer.indexOf('\n');
        if (end < 0) return;
        socket.destroy();
        try {
          const reply = JSON.parse(buffer.slice(0, end));
          if (!reply.ok) reject(new Error(reply.error));
          else accept(reply.result as T);
        } catch (error) {
          reject(error);
        }
      });
      socket.on('end', () => {
        if (!buffer.includes('\n'))
          fail(new Error('FilmCraft closed the connection.'));
      });
    });
  }
  execute<T = Record<string, unknown>>(command: string, params: unknown = {}) {
    return this.request<T>('engine.execute', { command, params });
  }
}

export const runFilmcraftCli = (args: string[]) =>
  new Promise<string>((accept, reject) => {
    const child = spawn(filmcraftCli(), args, { windowsHide: true });
    let output = '';
    let error = '';
    child.stdout.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk) => {
      error += chunk;
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? accept(output)
        : reject(new Error(error || output || `FilmCraft CLI exited ${code}`)),
    );
  });
