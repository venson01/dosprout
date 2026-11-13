/** Profile pictures are stored as squares this many pixels wide (sharp enough for any size we show). */
export const AVATAR_SIZE = 256;

/** Bigger files than this aren't worth opening (phone photos are usually 2 to 10 MB). */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Turns any picture the user picks into a small square JPEG, as a data URL
 * ("data:image/jpeg;base64,..."), ready for api.setAvatar().
 * Shrinking it here, in the browser, means a 5 MB photo uploads as about 20 KB.
 * The middle of the picture is kept (a centered square crop).
 * Throws an Error with a friendly message if the file can't be used.
 */
export async function squareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("That file isn't a picture. Choose a photo or image (JPEG, PNG or WebP).");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("That picture is very large (over 25 MB). Choose a smaller one.");
  }

  let image: ImageBitmap;
  try {
    // Decodes the file. Browsers also turn phone photos the right way up here.
    image = await createImageBitmap(file);
  } catch {
    throw new Error("This browser couldn't open that picture. Try a JPEG or PNG.");
  }

  const side = Math.min(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't resize pictures.");

  // JPEG has no see-through parts, so fill them with white (they'd turn black otherwise).
  // This is image content, not page styling, so it doesn't use a color token.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  context.imageSmoothingQuality = "high";
  // Copy the centered square of the picture onto the whole canvas, shrinking it.
  context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  image.close();

  return canvas.toDataURL("image/jpeg", 0.85);
}
