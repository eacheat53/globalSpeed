import { SvgFilter } from "@/types"
import { lerp } from "@/utils/helper"
import { SvgFilterName } from "./filters"

export const SVG_FILTER_ADDITIONAL: {
	[key in SvgFilterName]: {
		format: (filter: SvgFilter) => string
		isValid?: (filter: SvgFilter) => boolean
	}
} = {
	mosaic: {
		format: (filter) => {
			const init = filter.mosaic

			// All should be odd.
			let blockX = Math.round(2 * init.blockX - 1)
			let blockY = Math.round(2 * init.blockY - 1)

			let sampleX = Math.round(lerp(1, blockX, init.sampleNormalX))
			if (sampleX % 2 === 0) sampleX = Math.round(sampleX + 1)

			let sampleY = Math.round(lerp(1, blockY, init.sampleNormalY))
			if (sampleY % 2 === 0) sampleY = Math.round(sampleY + 1)

			const morphIdealX = Math.round((blockX - sampleX) / 2)
			const morphIdealY = Math.round((blockY - sampleY) / 2)

			const morphX = Math.round(morphIdealX * init.scalingNormalX)
			const morphY = Math.round(morphIdealY * init.scalingNormalY)

			let flood = `<feFlood flood-color="red" x="0" y="0" width="${sampleX}" height="${sampleY}"/> `
			let compA = `<feComposite width="${blockX}" height="${blockY}"/><feTile result="a"/><feComposite in="SourceGraphic" in2="a" operator="in"/>`
			let morph = `<feMorphology operator="dilate" radius="${morphX} ${morphY}"></feMorphology>`

			return formatSvgFilter(`${flood}${compA}${morph}`)
		},
	},
	custom: {
		format: (filter) => {
			return filter.text
		},
	},
	colorMatrix: {
		format: (filter) => {
			const matrix = Array(20).fill(0) as number[]
			for (let i = 0; i < 3; i++) {
				matrix[i * 5 + 0] = filter.colorMatrix[i * 4 + 0]
				matrix[i * 5 + 1] = filter.colorMatrix[i * 4 + 1]
				matrix[i * 5 + 2] = filter.colorMatrix[i * 4 + 2]
				matrix[i * 5 + 4] = filter.colorMatrix[i * 4 + 3]
			}
			matrix[18] = 1

			return formatSvgFilter(`<feColorMatrix type="matrix" values="${matrix.map((m) => m.toFixed(3)).join(" ")}"/>`)
		},
	},
	rgb: {
		format: (filter) => {
			const matrix = Array(20).fill(0) as number[]
			for (let i = 0; i < 3; i++) {
				matrix[i * 5 + i] = filter.rgb[i]
			}
			matrix[18] = 1

			return formatSvgFilter(`<feColorMatrix type="matrix" values="${matrix.map((m) => m.toFixed(3)).join(" ")}"/>`)
		},
		isValid: (filter) => {
			return filter.rgb && (filter.rgb[0] !== 1 || filter.rgb[1] !== 1 || filter.rgb[2] !== 1)
		},
	},
	posterize: {
		format: (filter) => {
			if (!filter.posterize) return
			const steps = Math.round(filter.posterize - 1)
			const values = Array(steps)
				.fill(0)
				.map((v, i) => (i / steps).toFixed(4))
			values.push(`1.0`)
			const tableValues = values.join(" ")

			return formatSvgFilter(`<feComponentTransfer>
               <feFuncR type="discrete" tableValues="${tableValues}"/>
               <feFuncG type="discrete" tableValues="${tableValues}"/>
               <feFuncB type="discrete" tableValues="${tableValues}"/>
            </feComponentTransfer>`)
		},
	},
	blur: {
		format: (filter) => {
			return formatSvgFilter(`<feGaussianBlur stdDeviation="${filter.blur.x} ${filter.blur.y}"/>`)
		},
		isValid: (filter) => {
			return filter.blur.x > 0 || filter.blur.y > 0
		},
	},
	sharpen: {
		format: (filter) => {
			if (!filter.sharpen) return
			const neg = `-${filter.sharpen.toFixed(2)}`
			const center = (1 + 4 * filter.sharpen).toFixed(6)
			const values = `0 ${neg} 0 ${neg} ${center} ${neg} 0 ${neg} 0`
			return formatSvgFilter(`<feConvolveMatrix order="3" kernelMatrix="${values}" edgeMode="duplicate" preserveAlpha="true"/>`)
		},
		isValid: (filter) => filter.sharpen > 0,
	},
	noise: {
		format: (filter) => {
			if (!filter.noise) return
			const size = 1 - filter.noise.size

			return formatSvgFilter(`<feTurbulence id="turb" type="fractalNoise" baseFrequency="${size}" numOctaves="1" seed="0" result="n">
	         <animate attributeName="seed" values="${Array(25)
					.fill(0)
					.map((v, i) => i)
					.join(";")}" dur="${1 / filter.noise.speed}s" repeatCount="indefinite"/>
         </feTurbulence>
	      <feColorMatrix type="saturate" values="0" in="n" result="gn"/>
	      <feBlend in="SourceGraphic" in2="gn" mode="${filter.noise.mode || "hard-light"}"/>`)
		},
		isValid: (filter) => filter.noise && filter.noise.speed !== 0 && filter.noise.size % 1 !== 0,
	},
	distortion: {
		format: (filter) => {
			const d = filter.distortion

			// Larger size means larger, smoother blobs, so a lower base frequency.
			const baseFrequency = (0.1 * (1 - d.size)).toFixed(5)

			// Static unless a speed is dialed in, since re-seeding recomputes the noise field every frame.
			const animate = d.speed
				? `<animate attributeName="seed" values="${Array(25)
						.fill(0)
						.map((v, i) => i)
						.join(";")}" dur="${1 / d.speed}s" repeatCount="indefinite"/>`
				: ""

			return formatSvgFilter(`<feTurbulence type="fractalNoise" baseFrequency="${baseFrequency}" numOctaves="2" seed="3" result="n">${animate}</feTurbulence>
	      <feDisplacementMap in="SourceGraphic" in2="n" scale="${d.amount}" xChannelSelector="R" yChannelSelector="G"/>`)
		},
		isValid: (filter) => filter.distortion && filter.distortion.amount !== 0 && filter.distortion.size < 1,
	},
	levels: {
		format: (filter) => {
			const l = filter.levels
			const passes: string[] = []

			if (l.black !== 0 || l.white !== 1) {
				// Guard against an inverted or collapsed range, which would divide by zero.
				const span = Math.max(l.white - l.black, 0.001)
				const slope = (1 / span).toFixed(4)
				const intercept = (-l.black / span).toFixed(4)
				passes.push(rgbComponentTransfer(`type="linear" slope="${slope}" intercept="${intercept}"`))
			}

			if (l.gamma !== 1) {
				passes.push(rgbComponentTransfer(`type="gamma" exponent="${l.gamma.toFixed(3)}"`))
			}

			// An empty filter element would hide the video outright, so bail instead.
			if (!passes.length) return

			return formatSvgFilter(passes.join(""))
		},
		isValid: (filter) => filter.levels && (filter.levels.black !== 0 || filter.levels.white !== 1 || filter.levels.gamma !== 1),
	},
	glow: {
		format: (filter) => {
			const g = filter.glow

			// Fold the intensity into the threshold pass, since the blur that follows is linear.
			const span = Math.max(1 - g.threshold, 0.01)
			const slope = (g.amount / span).toFixed(4)
			const intercept = ((-g.amount * g.threshold) / span).toFixed(4)

			return formatSvgFilter(`${rgbComponentTransfer(`type="linear" slope="${slope}" intercept="${intercept}"`, `in="SourceGraphic" result="bright"`)}
	      <feGaussianBlur in="bright" stdDeviation="${g.radius}" result="glow"/>
	      <feBlend in="SourceGraphic" in2="glow" mode="screen"/>`)
		},
		isValid: (filter) => filter.glow && filter.glow.amount > 0 && filter.glow.radius > 0,
	},
	chromatic: {
		format: (filter) => {
			const c = filter.chromatic
			const radians = (c.angle * Math.PI) / 180
			const x = c.amount * Math.cos(radians)
			const y = c.amount * Math.sin(radians)
			const dx = x.toFixed(3)
			const dy = y.toFixed(3)
			const negDx = (-x).toFixed(3)
			const negDy = (-y).toFixed(3)

			// Red and blue are pushed apart along the angle, green stays put, then screen puts them back together.
			return formatSvgFilter(`<feOffset in="SourceGraphic" dx="${dx}" dy="${dy}" result="ro"/>
	      <feColorMatrix in="ro" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="rc"/>
	      <feOffset in="SourceGraphic" dx="${negDx}" dy="${negDy}" result="bo"/>
	      <feColorMatrix in="bo" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="bc"/>
	      <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="gc"/>
	      <feBlend in="rc" in2="gc" mode="screen" result="rg"/>
	      <feBlend in="rg" in2="bc" mode="screen"/>`)
		},
		isValid: (filter) => filter.chromatic && filter.chromatic.amount !== 0,
	},
	scanlines: {
		format: (filter) => {
			const s = filter.scanlines
			const spacing = Math.max(Math.round(s.spacing), 2)

			// One dark row in a 1 by spacing tile, tiled across the region, multiplied over the source.
			return formatSvgFilter(`<feFlood flood-color="black" flood-opacity="${s.amount}" x="0" y="0" width="1" height="1"/>
	      <feComposite width="1" height="${spacing}"/>
	      <feTile result="lines"/>
	      <feBlend in="lines" in2="SourceGraphic" mode="multiply"/>`)
		},
		isValid: (filter) => filter.scanlines && filter.scanlines.amount > 0 && filter.scanlines.spacing >= 2,
	},
	motion: {
		format: (filter) => {
			const m = filter.motion
			let duration = 1 / m.speed

			let output: string[] = []
			if (m.x !== 0) output.push(`<animate attributeName="dx" values="-${m.x};${m.x};-${m.x}" dur="${duration}s" repeatCount="indefinite"/>`)
			if (m.y !== 0) output.push(`<animate attributeName="dy" values="-${m.y};${m.y};-${m.y}" dur="${duration}s" repeatCount="indefinite"/>`)

			return formatSvgFilter(`<feOffset dx="0" dy="0">${output.join("")}</feOffset>`)
		},
		isValid: (filter) => filter.motion && filter.motion.speed > 0 && (filter.motion.x > 0 || filter.motion.y > 0),
	},
	special: {
		format: (filter) => {
			return formatSvgFilter(filter.text)
		},
		isValid: (filter) => !!filter.text,
	},
}

function rgbComponentTransfer(func: string, attrs?: string) {
	return `<feComponentTransfer${attrs ? ` ${attrs}` : ""}>
	      <feFuncR ${func}/>
	      <feFuncG ${func}/>
	      <feFuncB ${func}/>
	   </feComponentTransfer>`
}

function formatSvgFilter(core: string) {
	return `<filter x="0%" y="0%" width="100%" height="100%">${core}</filter>`
}
