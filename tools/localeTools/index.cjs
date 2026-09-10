const { readdirSync, readFileSync, writeFileSync, mkdirSync } = require("fs")
const { join, parse } = require("path")

const action = process.argv[2]

if (action === "build") {
	const firefox = process.env.FIREFOX === "true"
	const root = join(firefox ? "buildFf" : "build", "unpacked")
	const localesDir = join(root, "locales")
	const formalRoot = join(root, "_locales")
	mkdirSync(formalRoot, { recursive: true })

	const files = readdirSync(localesDir).filter((file) => file.endsWith(".json"))
	for (const file of files) {
		const lang = parse(file).name
		const content = JSON.parse(readFileSync(join(localesDir, file), "utf8"))
		const formalObj = {}
		for (const key of Object.keys(content)) {
			if (key.startsWith(":") && !key.startsWith("!:")) {
				formalObj[key.slice(1)] = { message: content[key] }
			}
		}
		const langDir = join(formalRoot, lang)
		mkdirSync(langDir, { recursive: true })
		writeFileSync(join(langDir, "messages.json"), JSON.stringify(formalObj, null, 2))
	}
}
