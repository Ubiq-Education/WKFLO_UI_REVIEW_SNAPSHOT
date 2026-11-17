// Matches the AI API's per-image limit (CommonImageAttachmentConsts.MaxSingleImageSizeBytes), in
// decimal bytes - a 5 MiB limit here let 5.0-5.24 MB images through only to be rejected on send.
export const MAX_IMAGE_SIZE_BYTES = 5_000_000;

export function isImageTooLarge(file: File): boolean {
  return file.type.startsWith('image/') && file.size > MAX_IMAGE_SIZE_BYTES;
}

// Decimal MB, so the limit reads "5.0 MB" like the backend counts it.
export function formatFileSize(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
