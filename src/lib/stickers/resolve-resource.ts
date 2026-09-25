const blockedNames = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "0.0.0.0",
]);

// Postimages direct links use an eight-character image directory followed by
// the original filename. A manifest can omit the host, so verify at least one
// actual image before applying this provider rule to the pack.
const POSTIMAGES_BASE_URL = "https://i.postimg.cc/";
const postimagesReference = /^[a-z0-9]{8}\/[^/?#]+\.(?:png|jpe?g|webp|gif)$/i;

export function isPostimagesResourceReference(reference: string) {
  return postimagesReference.test(unwrapResourceReference(reference));
}

export async function discoverStickerResourceBase(
  references: string[],
  inspect: (url: string) => Promise<unknown>,
) {
  const matches = [...new Set(references.map(unwrapResourceReference))].filter(
    isPostimagesResourceReference,
  );
  // Check the first few entries, then sample the rest: this handles both
  // manifests with a few dead links up front and packs with older dead links.
  const spreadCount = Math.min(8, matches.length);
  const spread = Array.from(
    { length: spreadCount },
    (_, index) =>
      matches[Math.floor((index * (matches.length - 1)) / Math.max(1, spreadCount - 1))]!,
  );
  const candidates = [...new Set([...matches.slice(0, 8), ...spread])];
  for (let offset = 0; offset < candidates.length; offset += 4) {
    const results = await Promise.all(
      candidates.slice(offset, offset + 4).map(async (reference) => {
        const resolved = resolveStickerResource(reference, POSTIMAGES_BASE_URL);
        if (!("url" in resolved)) return false;
        try {
          await inspect(resolved.url);
          return true;
        } catch {
          return false;
        }
      }),
    );
    if (results.some(Boolean)) return POSTIMAGES_BASE_URL;
  }
  return null;
}

export function unwrapResourceReference(value: string) {
  let clean = value.trim().replace(/^https?\\:\/\//i, (match) => match.replace("\\", ""));
  const markdown = clean.match(/^\[[^\]]*\]\((https?:\/\/[^)]+)\)$/i);
  if (markdown?.[1]) clean = markdown[1];
  if (clean.startsWith("<") && clean.endsWith(">")) clean = clean.slice(1, -1).trim();
  return clean;
}

export function resolveStickerResource(reference: string, baseUrl?: string) {
  const clean = unwrapResourceReference(reference);
  if (!clean) return { error: "资源地址为空。" } as const;
  try {
    const absolute = /^https?:\/\//i.test(clean)
      ? new URL(clean)
      : baseUrl
        ? new URL(clean, baseUrl)
        : null;
    if (!absolute) return { error: "相对资源地址缺少 @base-url，暂时无法解析。" } as const;
    const safetyError = remoteUrlSafetyError(absolute);
    if (safetyError) return { error: safetyError } as const;
    return { url: absolute.toString() } as const;
  } catch {
    return { error: "资源地址格式无效。" } as const;
  }
}

export function assertSafeRemoteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("资源地址格式无效。");
  }
  const error = remoteUrlSafetyError(url);
  if (error) throw new Error(error);
  return url;
}

function remoteUrlSafetyError(url: URL) {
  if (!/^https?:$/.test(url.protocol)) return "只支持 HTTP 或 HTTPS 图片地址。";
  if (url.username || url.password) return "资源地址不能包含账号或密码。";
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    blockedNames.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".lan")
  )
    return "不允许访问本机或内网资源。";
  if (isBlockedIpv4(hostname) || isBlockedIpv6(hostname)) return "不允许访问本机或内网资源。";
  if (!hostname.includes(".") && !hostname.includes(":")) return "无法确认该资源地址属于公网。";
  return "";
}

function isBlockedIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((value) => value < 0 || value > 255)) return true;
  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(hostname: string) {
  if (!hostname.includes(":")) return false;
  const value = hostname.toLowerCase();
  if (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fe80:") ||
    /^[fd][0-9a-f]:/.test(value)
  )
    return true;
  const mapped = value.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped?.[1] ? isBlockedIpv4(mapped[1]) : false;
}
