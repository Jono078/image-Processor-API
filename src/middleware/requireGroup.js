function normalizeGroups(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") return value.split(/[,\s]+/).filter(Boolean);
  return [];
}

function extractFromClaims(claims = {}) {
  const candidates = [
    claims["cognito:groups"],
    claims.groups,
    claims.cognitoGroups,
    claims["custom:groups"],
  ];
  return [...new Set(candidates.flatMap(normalizeGroups))];
}

function decodeJwtNoVerify(token) {
  try {
    const part = token.split(".")[1];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function claimsFromHeader(req) {
  const h = req.headers.authorization || "";
  if (!h.startsWith("Bearer ") || h.length <= 7) return {};
  const jwt = h.slice(7);
  return decodeJwtNoVerify(jwt);
}

export default function requireGroup(groupName) {
  return (req, res, next) => {
    const attachedClaims = req.user || req.auth || req.claims || {};
    const headerClaims = claimsFromHeader(req);

    const groups = [
      ...extractFromClaims(attachedClaims),
      ...extractFromClaims(headerClaims),
    ];

    if (!groups.includes(groupName)) {
      return res.status(403).json({ error: "Forbidden", message: `Requires group: ${groupName}` });
    }
    next();
  };
}
