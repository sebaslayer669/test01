import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const web = path.join(root, "web")
const pub = path.join(root, "public")
fs.mkdirSync(pub, { recursive: true })
for (const name of ["index.html", "app.js", "styles.css"]) {
  fs.copyFileSync(path.join(web, name), path.join(pub, name))
}
console.log("public/ sincronizado desde web/")
