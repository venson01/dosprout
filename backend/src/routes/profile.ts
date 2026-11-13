import type { FastifyInstance } from "fastify";
import type { AccountStore, Avatar } from "../account-store.js";
import type { AvatarInput } from "../types.js";

/** The biggest picture we keep. The app shrinks pictures to 256 x 256 first (about 20 KB). */
export const MAX_AVATAR_BYTES = 200 * 1024;

// base64 makes data a third bigger, plus a little room for "data:image/jpeg;base64,".
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 50;

const NOT_AN_IMAGE = "That file isn't a picture we can use. Choose a JPEG, PNG or WebP image.";

/**
 * What kind of picture these bytes really are, by their first bytes ("magic numbers").
 * We don't trust the "data:image/..." label alone, so nothing else (like an SVG with a
 * script in it, or an HTML page) can be stored and later served as someone's picture.
 */
function imageType(bytes: Buffer): string | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return undefined;
}

/** "data:image/png;base64,iVBOR..." -> the picture, or undefined if it isn't a usable one. */
export function parseAvatar(dataUrl: string): Avatar | undefined {
  const data = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
  const contentType = imageType(data);
  if (!contentType || data.length > MAX_AVATAR_BYTES) return undefined;
  return { contentType, data };
}

export interface ProfileRouteOptions {
  accounts: AccountStore;
}

/** Your profile picture: upload, remove, and showing people's pictures. */
export async function profileRoutes(app: FastifyInstance, { accounts }: ProfileRouteOptions) {
  app.put<{ Body: AvatarInput }>(
    "/me/avatar",
    {
      schema: {
        body: {
          type: "object",
          required: ["image"],
          additionalProperties: false,
          properties: {
            image: {
              type: "string",
              maxLength: MAX_DATA_URL_LENGTH,
              pattern: "^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$",
            },
          },
        },
      },
    },
    async (request, reply) => {
      const avatar = parseAvatar(request.body.image);
      if (!avatar) return reply.code(400).send({ statusCode: 400, error: "Bad Request", message: NOT_AN_IMAGE });
      return accounts.setAvatar(request.user.id, avatar);
    },
  );

  app.delete("/me/avatar", async (request) => accounts.removeAvatar(request.user.id));

  // The picture itself, for <img src="/api/users/5/avatar?v=...">. The browser sends the
  // login cookie with it, so only people who share a team or organization see it.
  app.get<{ Params: { id: number } }>(
    "/users/:id/avatar",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "integer", minimum: 1 } } },
      },
    },
    async (request, reply) => {
      const avatar = await accounts.avatarFor(request.params.id, request.user.id);
      if (!avatar) {
        return reply.code(404).send({ statusCode: 404, error: "Not Found", message: "No picture" });
      }
      return (
        reply
          .header("content-type", avatar.contentType)
          // Never guess another type than the one we checked (see imageType).
          .header("x-content-type-options", "nosniff")
          // The address changes (?v=...) whenever the picture does, so the browser may keep
          // this one for good. "private": only this person's browser, not shared caches.
          .header("cache-control", "private, max-age=31536000, immutable")
          .send(avatar.data)
      );
    },
  );
}
