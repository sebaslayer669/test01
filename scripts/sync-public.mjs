import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const web = path.join(root, "web")
const pub = path.join(root, "public")
fs.mkdirSync(pub, { recursive: true })

for (const name of ["index.html", "app.js", "styles.css"]) {
  const from = path.join(web, name)
  fs.copyFileSync(from, path.join(pub, name))
  // Copia también a la raíz: en algunos proyectos Vercel sirve `/` desde ahí.
  fs.copyFileSync(from, path.join(root, name))
}

console.log("public/ y raíz sincronizados desde web/")
