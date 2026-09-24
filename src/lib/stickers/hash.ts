export async function sha256Hex(value: Blob | ArrayBuffer) {
  const buffer = value instanceof Blob ? await value.arrayBuffer() : value;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
