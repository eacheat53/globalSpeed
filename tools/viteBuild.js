// /// <reference types="@types/node" />

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { parse, resolve } from "node:path"
import { build } from "vite"
import { pageConfig, scriptConfig } from "../vite.config.js"

const projectRoot = resolve(import.meta.dirname, "..")
const firefox = process.env.FIREFOX === "true"
const production = process.env.NODE_ENV === "production"
const buildRoot = resolve(projectRoot, firefox ? "buildFf" : "build")
const outDir = resolve(buildRoot, "unpacked")

function buildLocales(outDir) {
	const localesDir = resolve(outDir, "locales")
	const formalRoot = resolve(outDir, "_locales")
	mkdirSync(formalRoot, { recursive: true })

	const files = readdirSync(localesDir).filter((file) => file.endsWith(".json"))
	for (const file of files) {
		const lang = parse(file).name
		const content = JSON.parse(readFileSync(resolve(localesDir, file), "utf8"))
		const formalObj = {}
		for (const key of Object.keys(content)) {
			if (key.startsWith(":") && !key.startsWith("!:")) {
				formalObj[key.slice(1)] = { message: content[key] }
			}
		}
		const langDir = resolve(formalRoot, lang)
		mkdirSync(langDir, { recursive: true })
		writeFileSync(resolve(langDir, "messages.json"), JSON.stringify(formalObj, null, 2))
	}
}

async function main() {
	if (![resolve(projectRoot, "build"), resolve(projectRoot, "buildFf")].includes(buildRoot)) {
		throw new Error(`Refusing to clear unexpected build path: ${buildRoot}`)
	}

	rmSync(buildRoot, { recursive: true, force: true })
	mkdirSync(outDir, { recursive: true })
	cpSync(resolve(projectRoot, "static"), outDir, { recursive: true })
	cpSync(resolve(projectRoot, firefox ? "staticFf" : "staticCh"), outDir, { recursive: true })
	buildLocales(outDir)

	const mode = production ? "production" : "development"
	const run = (config) => build({ ...config, configFile: false, mode })

	await run(pageConfig({ firefox, outDir, production }))
	if (!firefox) await run(pageConfig({ firefox, outDir, production, chromiumOffscreen: true }))

	const names = ["isolated", "background", "main", "pageDraw", "pane", "itcPanel"]
	if (firefox) names.push("mainLoader")
	else names.push("sound-touch-processor", "reverse-sound-processor")

	for (const name of names) {
		await run(scriptConfig({ name, firefox, outDir, production }))
	}
}

main().catch((error) => {
	console.error(error)
	process.exitCode = 1
})
