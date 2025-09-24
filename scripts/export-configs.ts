// scripts/export-configs.ts
import fs from "fs";
import path from "path";
import { glob } from "glob";

// 🔧 URL de ton bucket R2
const R2_BASE_URL = "https://webdioramas.r2.cloudflarestorage.com";

// 🔧 Dossier racine de tes dioramas
const CONTENT_DIR = path.resolve("src/content/webdioramas");

// 🔧 Dossier de sortie
const OUT_DIR = path.resolve("dist/manifests");

// 🔄 Réécriture récursive des chemins locaux -> URLs R2
function rewritePaths(config: any): any {
  const replacer = (value: any) => {
    if (typeof value === "string") {
      if (
        value.startsWith("/models") ||
        value.startsWith("/icons") ||
        value.startsWith("/sounds") ||
        value.startsWith("/videos")
      ) {
        return `${R2_BASE_URL}${value}`;
      }
    }
    return value;
  };

  if (Array.isArray(config)) {
    return config.map(rewritePaths);
  } else if (typeof config === "object" && config !== null) {
    const out: any = {};
    for (const [k, v] of Object.entries(config)) {
      out[k] = rewritePaths(v);
    }
    return out;
  } else {
    return replacer(config);
  }
}

// 🚀 Générer les JSON
async function exportConfigs() {
  // Transforme les backslashes en slashes pour glob
  const pattern = path.join(CONTENT_DIR, "**/*.ts").replace(/\\/g, "/");
  const files = glob.sync(pattern, { windowsPathsNoEscape: true });

  console.log("Pattern :", pattern);
  console.log("Fichiers trouvés :", files);

  for (const file of files) {
    const relPath = path.relative(CONTENT_DIR, file).replace(/\\/g, "/"); // force /
    const parts = relPath.split("/"); // split sur /
    if (parts.length < 2) {
      console.warn(`⚠️ Chemin inattendu : ${relPath}`);
      continue;
    }
    const [bookId, dioramaFile] = parts;
    if (dioramaFile === "index.ts") continue;
    const dioramaId = path.basename(dioramaFile, ".ts");

    try {
      // Import dynamique en ESM (Windows compatible)
      const mod = await import(`file://${path.resolve(file)}`);

      // Cherche export nommé ou default
      const config = mod[dioramaId] ?? mod.default;

      if (!config) {
        console.warn(`⚠️ Pas de config trouvée dans ${file}`);
        continue;
      }

      // Réécriture des chemins
      const rewritten = rewritePaths(config);

      // Création du dossier de sortie
      const outDir = path.join(OUT_DIR, bookId); // /dist/manifests/1
      fs.mkdirSync(outDir, { recursive: true });

      // Sauvegarde en JSON
      const outPath = path.join(outDir, `${dioramaId}.json`);
      fs.writeFileSync(outPath, JSON.stringify(rewritten, null, 2));

      console.log(`✅ Exporté: ${outPath}`);
    } catch (err) {
      console.error(`❌ Erreur export ${file}:`, err);
    }
  }
}

exportConfigs();
