/**
 * Menu image picking + upload for the RN menu manager.
 *
 * Mirrors the web client's flow (compress → upload to the `menu-images`
 * Storage bucket → store the public URL on the menu row), but adapted for the
 * React Native runtime, where two web assumptions don't hold:
 *
 *   1. There's no <input type=file> / Blob+canvas. We pick with
 *      `expo-image-picker` and downscale + re-encode with
 *      `expo-image-manipulator` (mirroring web's `compressImage`:
 *      longest edge 1600px, ~0.8 quality, WEBP so the stored object matches
 *      what web produces and the storefront's Supabase image transforms work).
 *
 *   2. supabase-js storage `upload()` does NOT accept an RN file URI. The
 *      documented RN pattern is to upload an ArrayBuffer. We get base64 straight
 *      out of the manipulator and `decode()` it with `base64-arraybuffer`, then
 *      upload with an explicit `contentType` so the object is served correctly
 *      in BOTH the web dashboard and the public storefront.
 *
 * Path scheme is IDENTICAL to web — `${restaurantId}/${Date.now()}-<name>.webp`
 * — so objects land in the same bucket/prefix and render everywhere.
 */
import * as ImagePicker from "expo-image-picker";
import {
  manipulateAsync,
  SaveFormat,
  type ImageResult,
} from "expo-image-manipulator";
import { decode } from "base64-arraybuffer";

import type { TypedSupabaseClient } from "@foodo/database";

export const MENU_IMAGE_BUCKET = "menu-images";

/** Mirrors web `compressImage`: scale longest edge to 1600px, never up. */
const MAX_EDGE = 1600;
const QUALITY = 0.8;

export interface PickedImage {
  /** Local file URI for previewing in the form before upload. */
  uri: string;
  width: number;
  height: number;
}

/**
 * Opens the OS photo library and returns the picked image (or null if the
 * picker was cancelled or permission was denied). Permission is requested
 * lazily, the first time the merchant taps the photo field.
 */
export async function pickMenuImage(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 1,
    // We do our own compression below; this just bounds the picker's own output.
    allowsEditing: false,
  });

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, width: asset.width, height: asset.height };
}

/**
 * Downscales + re-encodes the picked image to WEBP and uploads it to the
 * `menu-images` bucket, returning the public URL to store on the row. Throws on
 * upload failure (the caller surfaces the message).
 *
 * Options let the settings screen reuse this for store logo/banner uploads
 * (mirroring the web settings client) without a second copy of the
 * pick→downscale→ArrayBuffer→upload→getPublicUrl flow:
 *   - `prefix` tags the object name (web uses `logo-`/`banner-`); default none.
 *   - `maxEdge` overrides the downscale cap (web uses 2000px for the hero
 *     banner vs the default 1600px); never upscales.
 */
export async function uploadMenuImage(
  supabase: TypedSupabaseClient,
  restaurantId: string,
  picked: PickedImage,
  options?: { prefix?: string; maxEdge?: number }
): Promise<string> {
  const maxEdge = options?.maxEdge ?? MAX_EDGE;
  // Downscale to fit maxEdge on the longest side (mirrors web compressImage).
  const longest = Math.max(picked.width || 0, picked.height || 0);
  const resizeActions =
    longest > maxEdge && longest > 0
      ? [
          picked.width >= picked.height
            ? { resize: { width: maxEdge } }
            : { resize: { height: maxEdge } },
        ]
      : [];

  const processed: ImageResult = await manipulateAsync(picked.uri, resizeActions, {
    compress: QUALITY,
    format: SaveFormat.WEBP,
    base64: true,
  });

  if (!processed.base64) {
    throw new Error("Could not read the selected image.");
  }

  const arrayBuffer = decode(processed.base64);
  const prefix = options?.prefix ?? "";
  const path = `${restaurantId}/${prefix}${Date.now()}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(MENU_IMAGE_BUCKET)
    .upload(path, arrayBuffer, { contentType: "image/webp", upsert: true });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path);
  return publicUrl;
}
