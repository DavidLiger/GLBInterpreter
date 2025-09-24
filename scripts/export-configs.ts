import fs from "fs";
import path from "path";
import { glob } from "glob";

// Dossier racine des TS
const CONTENT_DIR = path.resolve("src/content/webdioramas");

// Dossier de sortie pour les JSON de prod
const OUT_DIR = path.resolve("dist/manifests");

function rewritePaths(config: any): any {
  if (Array.isArray(config)) return config.map(rewritePaths);
  if (typeof config === "object" && config !== null) {
    const out: any = {};
    for (const [k, v] of Object.entries(config)) {
      out[k] = rewritePaths(v);
    }
    return out;
  }
  return config; // ici, pas besoin de réécriture pour R2
}

async function exportConfigs() {
  const pattern = path.join(CONTENT_DIR, "**/*.ts").replace(/\\/g, "/");
  const files = glob.sync(pattern, { windowsPathsNoEscape: true });
  console.log("Pattern :", pattern);
  console.log("Fichiers trouvés :", files);

  for (const file of files) {
    const relPath = path.relative(CONTENT_DIR, file).replace(/\\/g, "/");
    const parts = relPath.split("/");
    if (parts.length < 2) continue;
    const [bookId, dioramaFile] = parts;
    if (dioramaFile === "index.ts") continue;
    const dioramaId = path.basename(dioramaFile, ".ts");

    try {
      const mod = await import(`file://${path.resolve(file)}`);
      const config = mod[dioramaId] ?? mod.default;
      if (!config) continue;

      const outDir = path.join(OUT_DIR, bookId);
      fs.mkdirSync(outDir, { recursive: true });

      const outPath = path.join(outDir, `${dioramaId}.json`);
      fs.writeFileSync(outPath, JSON.stringify(config, null, 2));

      console.log(`✅ Exporté: ${outPath}`);
    } catch (err) {
      console.error(`❌ Erreur export ${file}:`, err);
    }
  }
}

exportConfigs();
