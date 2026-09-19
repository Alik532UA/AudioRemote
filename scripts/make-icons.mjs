/**
 * Значки застосунку — згенеровані, а не намальовані.
 *
 * ЦЕ ЗАГЛУШКА, І ВОНА НАЗВАНА ЗАГЛУШКОЮ. Малюнок простий навмисно: поки в
 * проєкту немає справжнього значка, краще мати відтворюваний файл із відомим
 * походженням, ніж випадковий PNG, про який через півроку ніхто не скаже, звідки
 * він і як його перемалювати. Замінити — покласти свої `static/icon-*.png` і
 * прибрати цей скрипт разом із рядком у `package.json`.
 *
 * Чому свій кодувальник PNG, а не бібліотека: єдина потреба — суцільні кольори
 * без прозорості в межах трьох файлів. Тягнути заради цього `sharp` (двійкові
 * збірки під кожну платформу, окремий крок у CI) було б дорожче за сорок рядків
 * тут (DEPENDENCIES-v9).
 *
 * Запуск: node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const BG = [16, 20, 24];
const FG = [231, 236, 241];
const ACCENT = [87, 170, 255];

const crcTable = Array.from({ length: 256 }, (_, index) => {
	let value = index;
	for (let bit = 0; bit < 8; bit++) {
		value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
	}
	return value >>> 0;
});

const crc32 = (buffer) => {
	let crc = 0xffffffff;
	for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
};

/** @param {(x: number, y: number) => number[]} shade */
function png(size, shade) {
	const stride = size * 3 + 1;
	const raw = Buffer.alloc(stride * size);
	for (let y = 0; y < size; y++) {
		raw[y * stride] = 0; // фільтр рядка: None
		for (let x = 0; x < size; x++) {
			const [r, g, b] = shade(x, y);
			const at = y * stride + 1 + x * 3;
			raw[at] = r;
			raw[at + 1] = g;
			raw[at + 2] = b;
		}
	}

	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8; // 8 біт на канал
	header[9] = 2; // truecolor RGB
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

/**
 * Знак: трикутник «грати» і дві хвилі праворуч.
 *
 * Координати в частках розміру, тож малюнок однаковий на 192 і на 512. Поле
 * навколо — 20%: значок із `purpose: maskable` обрізають до кола, і все, що
 * ближче до краю, зникає.
 */
const draw = (size) => (x, y) => {
	const u = x / size;
	const v = y / size;
	const cx = u - 0.42;
	const cy = v - 0.5;

	// Трикутник: вершина праворуч, основа ліворуч.
	const inTriangle = u > 0.3 && u < 0.5 && Math.abs(cy) < (0.5 - u) * 1.1;
	if (inTriangle) return FG;

	// Дві дуги — кільця навколо центру трикутника, лише правий сектор.
	const distance = Math.hypot(cx, cy);
	const rightSide = cx > 0.02 && Math.abs(cy) < cx * 1.6;
	for (const radius of [0.17, 0.25]) {
		if (rightSide && Math.abs(distance - radius) < 0.022) return ACCENT;
	}

	return BG;
};

for (const size of [192, 512, 180]) {
	writeFileSync(`static/icon-${size}.png`, png(size, draw(size)));
	console.log(`static/icon-${size}.png`);
}

/*
 * SVG для вкладки: той самий знак, але вектором — favicon масштабують до 16px,
 * і растр там перетворюється на кашу.
 */
writeFileSync(
	'static/favicon.svg',
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
	<rect width="64" height="64" rx="14" fill="rgb(${BG})"/>
	<path d="M19 18 L19 46 L33 32 Z" fill="rgb(${FG})"/>
	<g fill="none" stroke="rgb(${ACCENT})" stroke-width="3.2" stroke-linecap="round">
		<path d="M38 24 A 12 12 0 0 1 38 40"/>
		<path d="M44 18 A 20 20 0 0 1 44 46"/>
	</g>
</svg>
`
);
console.log('static/favicon.svg');
