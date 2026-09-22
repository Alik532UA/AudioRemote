/**
 * ЗНАЧКИ ЗАСТОСУНКУ — З ОДНОГО ДЖЕРЕЛА Й ВІДТВОРЮВАНО.
 *
 * Джерело: `src-tauri/icons/source.png`. Воно лежить у репозиторії навмисно —
 * без нього через півроку ніхто не скаже, звідки взялися ці PNG і як їх
 * перемалювати. Доти тут була ЗАГЛУШКА, яка малювала трикутник і дві хвилі
 * кодом, і сама себе так і називала: «поки в проєкту немає справжнього значка».
 * Значок зʼявився.
 *
 * ## Чому свій кодувальник І декодувальник PNG, а не бібліотека
 *
 * Потрібні рівно три дії: прочитати один RGBA-PNG, зменшити його й записати.
 * `sharp` заради цього тягне двійкові збірки під кожну платформу й окремий крок
 * у CI (DEPENDENCIES-v9); тут вистачає `zlib`, який у Node вже є. Декодувальник
 * розуміє саме той підвид, у якому лежить джерело, — 8 біт, RGBA, без
 * інтерлейсу, — і голосно відмовляється від будь-якого іншого замість того, щоб
 * тихо намалювати сміття.
 *
 * ## Чому зменшення СЕРЕДНІМ ПО ОБЛАСТІ, і чому з ЧАСТКОВИМ ПОКРИТТЯМ
 *
 * Найближчий сусід на значку в 32 пікселі зʼїдає тонкі лінії повзунків: вони
 * то є, то немає, залежно від того, куди впала сітка. Середнє по області бере
 * всі пікселі, що потрапили в цільовий, — тобто лінія слабшає, але не зникає.
 *
 * Частки пікселів рахуються ЧЕСНО, а не округленням меж до цілих. Різниця
 * вилазить саме там, де масштаб близький до одиниці: 528 → 512 це 1.03, тож із
 * цілими межами один цільовий піксель бере один сусідній, а кожен тридцять
 * другий — два. По круглому краю логотипа це дає сходинки, які добре видно при
 * збільшенні, — рівний край перетворюється на рубаний. З частковим покриттям
 * кожен вихідний піксель входить рівно тією часткою, яку займає.
 *
 * Змішування йде з ПОМНОЖЕНОЮ НА АЛЬФУ яскравістю: інакше по краю логотипа,
 * де прозорі пікселі мають випадковий колір, зʼявляється темна або біла
 * облямівка.
 *
 * ## Чого цей скрипт НЕ робить
 *
 * Значків застосунку для компʼютера (`src-tauri/icons/`): там потрібні ще
 * `.ico` й `.icns`, тобто два контейнерні формати, і для них є офіційний
 * інструмент — `npx tauri icon src-tauri/icons/source.png`. Дублювати його
 * власним кодом означало б підтримувати два формати заради одного запуску на
 * рік.
 *
 * Запуск: node scripts/make-icons.mjs
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'src-tauri/icons/source.png';

/** Куди й у якому розмірі. Розміри — ті, що названі в `app.html` і в маніфесті. */
const TARGETS = [
	['static/favicon.png', 48],
	['static/icon-180.png', 180],
	['static/icon-192.png', 192],
	['static/icon-512.png', 512]
];

// ─── PNG: читання ──────────────────────────────────────────────────────────

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

/**
 * Прочитати PNG у плоский RGBA.
 *
 * @param {Buffer} file
 * @returns {{ size: number, rgba: Buffer }}
 */
function decode(file) {
	const width = file.readUInt32BE(16);
	const height = file.readUInt32BE(20);
	const [depth, color, , , interlace] = [file[24], file[25], file[26], file[27], file[28]];

	if (depth !== 8 || color !== 6 || interlace !== 0) {
		throw new Error(
			`${SOURCE}: очікується 8-бітний RGBA без інтерлейсу, а тут depth=${depth} ` +
				`color=${color} interlace=${interlace}. Перезбережіть джерело в цьому вигляді.`
		);
	}
	if (width !== height) throw new Error(`${SOURCE}: значок мусить бути квадратним`);

	// Даних може бути кілька шматків IDAT — їх склеюють ДО розпакування.
	const parts = [];
	for (let at = 8; at < file.length;) {
		const length = file.readUInt32BE(at);
		const type = file.toString('ascii', at + 4, at + 8);
		if (type === 'IDAT') parts.push(file.subarray(at + 8, at + 8 + length));
		at += 12 + length;
	}

	const raw = inflateSync(Buffer.concat(parts));
	const stride = width * 4;
	const rgba = Buffer.alloc(stride * height);

	/*
	 * Зняти фільтри рядків. PNG зберігає не самі байти, а їхню різницю з
	 * сусідами — по одному способу на рядок, і без цього кроку зображення
	 * виглядає як похилі кольорові смуги.
	 */
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)];
		const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
		for (let x = 0; x < stride; x++) {
			const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
			const up = y > 0 ? rgba[(y - 1) * stride + x] : 0;
			const corner = x >= 4 && y > 0 ? rgba[(y - 1) * stride + x - 4] : 0;
			let value = line[x];
			if (filter === 1) value += left;
			else if (filter === 2) value += up;
			else if (filter === 3) value += (left + up) >> 1;
			else if (filter === 4) {
				const guess = left + up - corner;
				const dl = Math.abs(guess - left);
				const du = Math.abs(guess - up);
				const dc = Math.abs(guess - corner);
				value += dl <= du && dl <= dc ? left : du <= dc ? up : corner;
			} else if (filter !== 0) throw new Error(`${SOURCE}: невідомий фільтр рядка ${filter}`);
			rgba[y * stride + x] = value & 0xff;
		}
	}

	return { size: width, rgba };
}

// ─── PNG: запис ────────────────────────────────────────────────────────────

const chunk = (type, data) => {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
};

/**
 * ФІЛЬТР ДОБИРАЄТЬСЯ НА КОЖЕН РЯДОК, А НЕ БЕРЕТЬСЯ «NONE».
 *
 * Фільтр PNG — це те, ЯК рядок описано через сусідів; сам він нічого не
 * стискає, але від нього залежить, чи буде що стискати `deflate`. Заміряно на
 * цьому значку: 512 без фільтрів — 270 КБ, з добором — 231 КБ. Небагато, бо
 * плавний градієнт із напівпрозорими краями стискається погано будь-як, але
 * сорок кілобайтів їдуть у передкеш воркера, тобто на диск кожного, хто
 * встановив застосунок.
 *
 * Добір — стандартна евристика: пробуємо чотири способи й беремо той, чия сума
 * абсолютних відхилень найменша. Менші числа стискаються краще.
 *
 * @param {Buffer} line поточний рядок
 * @param {Buffer} prev попередній рядок або нулі
 */
function filterRow(line, prev) {
	const stride = line.length;
	const candidates = [];

	for (const type of [0, 1, 2, 4]) {
		const out = Buffer.alloc(stride);
		let cost = 0;
		for (let x = 0; x < stride; x++) {
			const left = x >= 4 ? line[x - 4] : 0;
			const up = prev[x];
			const corner = x >= 4 ? prev[x - 4] : 0;
			let predicted = 0;
			if (type === 1) predicted = left;
			else if (type === 2) predicted = up;
			else if (type === 4) {
				const guess = left + up - corner;
				const dl = Math.abs(guess - left);
				const du = Math.abs(guess - up);
				const dc = Math.abs(guess - corner);
				predicted = dl <= du && dl <= dc ? left : du <= dc ? up : corner;
			}
			const value = (line[x] - predicted) & 0xff;
			out[x] = value;
			cost += value < 128 ? value : 256 - value;
		}
		candidates.push({ type, out, cost });
	}

	return candidates.reduce((best, next) => (next.cost < best.cost ? next : best));
}

function encode(size, rgba) {
	const stride = size * 4;
	const raw = Buffer.alloc((stride + 1) * size);
	const zero = Buffer.alloc(stride);
	for (let y = 0; y < size; y++) {
		const line = rgba.subarray(y * stride, y * stride + stride);
		const prev = y > 0 ? rgba.subarray((y - 1) * stride, y * stride) : zero;
		const picked = filterRow(line, prev);
		raw[y * (stride + 1)] = picked.type;
		picked.out.copy(raw, y * (stride + 1) + 1);
	}

	const header = Buffer.alloc(13);
	header.writeUInt32BE(size, 0);
	header.writeUInt32BE(size, 4);
	header[8] = 8; // біт на канал
	header[9] = 6; // RGBA

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

// ─── Зменшення ─────────────────────────────────────────────────────────────

/**
 * Середнє по області з помноженою на альфу яскравістю.
 *
 * @param {{ size: number, rgba: Buffer }} source
 * @param {number} size
 */
function resize(source, size) {
	const out = Buffer.alloc(size * size * 4);
	const scale = source.size / size;

	for (let y = 0; y < size; y++) {
		const top = y * scale;
		const bottom = (y + 1) * scale;
		for (let x = 0; x < size; x++) {
			const left = x * scale;
			const right = (x + 1) * scale;

			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			let area = 0;

			for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) {
				// Скільки цього рядка джерела потрапило у цільовий піксель.
				const dy = Math.min(bottom, sy + 1) - Math.max(top, sy);
				if (dy <= 0) continue;
				for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
					const dx = Math.min(right, sx + 1) - Math.max(left, sx);
					if (dx <= 0) continue;

					const weight = dx * dy;
					const at = (sy * source.size + sx) * 4;
					const alpha = source.rgba[at + 3] * weight;
					r += source.rgba[at] * alpha;
					g += source.rgba[at + 1] * alpha;
					b += source.rgba[at + 2] * alpha;
					a += alpha;
					area += weight;
				}
			}

			const at = (y * size + x) * 4;
			// Колір ділиться на суму АЛЬФИ, а не на площу: так прозорий сусід не
			// тягне колір до чорного. Сама альфа — на площу.
			out[at] = a > 0 ? Math.round(r / a) : 0;
			out[at + 1] = a > 0 ? Math.round(g / a) : 0;
			out[at + 2] = a > 0 ? Math.round(b / a) : 0;
			out[at + 3] = Math.round(a / area);
		}
	}

	return out;
}

// ─── Запуск ────────────────────────────────────────────────────────────────

const source = decode(readFileSync(SOURCE));
console.log(`джерело ${SOURCE} — ${source.size}×${source.size}`);

for (const [path, size] of TARGETS) {
	writeFileSync(path, encode(size, resize(source, size)));
	console.log(`${path} — ${size}×${size}`);
}

if (existsSync('src-tauri/icons/icon.ico')) {
	copyFileSync('src-tauri/icons/icon.ico', 'static/favicon.ico');
	console.log('static/favicon.ico — скопійовано з src-tauri/icons/icon.ico');
}

console.log('\nЗначки застосунку для компʼютера — окремо, офіційним інструментом:');
console.log(`  npx tauri icon ${SOURCE}`);
