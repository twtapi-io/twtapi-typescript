/**
 * Media upload — `POST /upload_media`.
 *
 * The API uploads media on your behalf by downloading from a public URL.
 * Pass an `https://` URL; the server fetches it (up to 5 redirect hops,
 * refuses private / loopback hosts), then returns a `media_id` you can
 * attach to `tweets.create` or `tweets.comment`.
 *
 * Limits: 16 MiB. Supported types: jpg, png, gif, webp, bmp, mp4, mov,
 * webm. `media_id` expires within ~15 minutes if not consumed.
 */

import type { Transport } from "../transport.js";
import type { JsonObject } from "../types.js";

export class Media {
  constructor(private readonly transport: Transport) {}

  /**
   * Upload media from a public URL. Requires engagement cookies.
   *
   * Returns `{ status, media_id, size, media_type }`.
   */
  upload(mediaUrl: string): Promise<JsonObject> {
    return this.transport.request("POST", "/upload_media", {
      json: { media_url: mediaUrl },
      sendCookies: true,
    });
  }
}
