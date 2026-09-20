// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './engine.svelte';
import { MemorySource } from './source';
import type { AudioSource, SourceTrack } from './source';

/**
 * ПЕРЕМАГАЄ ОСТАННІЙ НАМІР, А НЕ ТОЙ, ЧИЙ ФАЙЛ ВІДКРИВСЯ ШВИДШЕ.
 *
 * ## Клас дефекту
 *
 * `play()` має всередині два `await`: читання файлу з диска й сам `play()`
 * елемента. Наміри приходять із ТРЬОХ місць одночасно — натискання на плеєрі,
 * команда з пульта мережею й запуск за зовнішнім API, — і жодне з них не
 * чекає на інші.
 *
 * Без номера наміру порядок вирішувала швидкість читання файлу. Наслідків два,
 * і другий гірший за «не той трек»: пізній запуск кличе `releaseUrl()` й
 * відкликає адресу Blob, за якою В ЦЮ МИТЬ грає інший трек, — тобто обриває
 * звук у залі посеред відтворення.
 *
 * Окремий випадок — вихід із дошки: запуск, що був у дорозі, тримає своє
 * посилання на елемент і починає грати вже після `destroy()`. Зупинити його
 * нема чим, рушія більше немає.
 *
 * ## Чому джерело підставне
 *
 * Гонка тут вимірюється саме затримкою читання файлу, і керувати нею можна
 * лише ззовні. `MemorySource` віддає файл одразу, тож перекриття не виникло б
 * жодного разу — тест був би зелений і без будь-якого захисту.
 *
 * ## Межа перевірки
 *
 * jsdom не програє звуку: `HTMLMediaElement.play()` у ньому нічого не робить.
 * Тому тут перевіряється РІШЕННЯ рушія — який трек він визнав поточним і чи
 * відкликав чужу адресу, — а не те, що чути в залі.
 */

/** Джерело, у якому кожне читання файлу тримається, доки його не відпустять. */
class SlowSource implements AudioSource {
	readonly supported = true;
	label: string | null = 'проба';

	private readonly inner = new MemorySource();
	private waiting = new Map<string, () => void>();

	add(path: string, content: string): void {
		this.inner.add(path, content);
	}

	async status() {
		return this.inner.status();
	}

	async pick() {
		return true;
	}

	async scan() {
		return this.inner.scan();
	}

	async readConfig() {
		return this.inner.readConfig();
	}

	async writeConfig(config: Parameters<MemorySource['writeConfig']>[0]) {
		return this.inner.writeConfig(config);
	}

	open(path: string): Promise<File> {
		return new Promise((resolve, reject) => {
			this.waiting.set(path, () => {
				this.inner.open(path).then(resolve, reject);
			});
		});
	}

	/** Відпустити читання саме цього файлу. */
	release(path: string): void {
		const pending = this.waiting.get(path);
		if (!pending) throw new Error(`ніхто не читає ${path} — проба сама зламана`);
		this.waiting.delete(path);
		pending();
	}
}

const TRACKS: SourceTrack[] = [
	{ id: 'a', title: 'Перший', path: 'a.mp3' },
	{ id: 'b', title: 'Другий', path: 'b.mp3' }
];

/** Скільки адрес Blob відкликано — саме цим пізній запуск глушив чужий звук. */
let revoked: string[] = [];

function build() {
	const source = new SlowSource();
	source.add('a.mp3', 'AAA');
	source.add('b.mp3', 'BBB');

	revoked = [];
	vi.stubGlobal('URL', {
		...URL,
		createObjectURL: (file: Blob) => `blob:${(file as File).name}`,
		revokeObjectURL: (url: string) => revoked.push(url)
	});

	const engine = new AudioEngine(source);
	engine.setOrder(TRACKS);
	// Озброєння тут не перевіряється: у jsdom `play()` нічого не робить, а
	// вікно дозволу — це вже екран, а не рушій.
	engine.armed = true;
	return { engine, source };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('гонка запусків (engine.svelte.ts)', () => {
	it('перевірка жива: звичайний запуск доходить до кінця', async () => {
		const { engine, source } = build();
		const started = engine.play('a');
		source.release('a.mp3');
		await started;

		expect(engine.trackId, 'рушій не визнав трек поточним — далі все дарма').toBe('a');
	});

	it('пізній запуск не перебиває той, що вже грає', async () => {
		const { engine, source } = build();

		// Натиснули «a», потім, не дочекавшись, «b» — і «b» відкрився першим.
		const first = engine.play('a');
		const second = engine.play('b');

		source.release('b.mp3');
		await second;
		expect(engine.trackId).toBe('b');

		source.release('a.mp3');
		await first;

		expect(engine.trackId, 'заграв трек, який натиснули РАНІШЕ').toBe('b');
		expect(revoked, 'відкликано адресу звуку, який саме грає').not.toContain('blob:b.mp3');
	});

	it('«стоп» скасовує запуск, що був у дорозі', async () => {
		const { engine, source } = build();

		const started = engine.play('a');
		engine.stop();
		source.release('a.mp3');
		await started;

		expect(engine.trackId, 'після «стоп» трек однаково заграв').toBeNull();
	});

	it('вихід із дошки скасовує запуск, що був у дорозі', async () => {
		const { engine, source } = build();

		const started = engine.play('a');
		engine.destroy();
		source.release('a.mp3');
		await started;

		expect(engine.trackId, 'запуск пережив вихід із дошки').toBeNull();
		expect(engine.playing).toBe(false);
	});
});
