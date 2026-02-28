function parseHash() {
  const raw = window.location.hash || "#/";
  const body = raw.startsWith("#") ? raw.slice(1) : raw;
  const [path, query = ""] = body.split("?");
  const params = new URLSearchParams(query);
  return { path: path || "/", params };
}

function writeHash(path: string, params: URLSearchParams) {
  const q = params.toString();
  const next = `#${path}${q ? `?${q}` : ""}`;
  window.history.replaceState(null, "", next);
}

export function getHashParam(key: string, fallback = "") {
  const { params } = parseHash();
  return params.get(key) ?? fallback;
}

export function setHashParam(key: string, value?: string | null) {
  const { path, params } = parseHash();
  if (value === undefined || value === null || value === "") {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  writeHash(path, params);
}
