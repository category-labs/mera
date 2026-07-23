const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Astro does not prefix literal links with the configured base path.
function withBasePath(path: string): string {
  return path.startsWith("/") ? `${basePath}${path}` : path;
}

export { withBasePath };
