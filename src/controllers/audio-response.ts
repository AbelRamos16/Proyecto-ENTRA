import type { IncomingMessage, ServerResponse } from 'node:http';

export function sendAudio(request: IncomingMessage, response: ServerResponse, bytes: Uint8Array): void {
    const rangeHeader = request.headers.range;
    const range = rangeHeader
      ? rangeHeader.match(/^bytes=(\d*)-(\d*)$/)
      : null;

    // Un encabezado Range inválido no se puede procesar.
    if (rangeHeader && !range) {
      response.writeHead(416, {
        'Content-Range': `bytes */${bytes.length}`,
      });
      response.end();
      return;
    }

    let start = 0;
    let end = bytes.length - 1;

    if (range) {
      // No se admiten rangos múltiples ni rangos sin límites.
      if (!range[1] && !range[2]) {
        response.writeHead(416, {
          'Content-Range': `bytes */${bytes.length}`,
        });
        response.end();
        return;
      }

      // Permite solicitar los últimos N bytes.
      if (!range[1]) {
        const suffixLength = Number(range[2]);

        if (
          !Number.isSafeInteger(suffixLength) ||
          suffixLength <= 0
        ) {
          response.writeHead(416, {
            'Content-Range': `bytes */${bytes.length}`,
          });
          response.end();
          return;
        }

        start = Math.max(0, bytes.length - suffixLength);
      } else {
        start = Number(range[1]);

        if (range[2]) {
          end = Number(range[2]);
        }
      }

      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        start >= bytes.length ||
        end < start
      ) {
        response.writeHead(416, {
          'Content-Range': `bytes */${bytes.length}`,
        });
        response.end();
        return;
      }

      end = Math.min(end, bytes.length - 1);
    }

    const partial = Boolean(range);
    const content = bytes.subarray(start, end + 1);

    response.writeHead(partial ? 206 : 200, {
      'Content-Type': 'audio/mpeg',
      'Accept-Ranges': 'bytes',
      'Content-Length': content.length,
      ...(partial
        ? {
            'Content-Range': `bytes ${start}-${end}/${bytes.length}`,
          }
        : {}),
    });

    response.end(Buffer.from(content));
    return;
}
