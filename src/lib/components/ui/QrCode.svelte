<script lang="ts">
	import qrcode from 'qrcode-generator';
	import { t } from '$lib/i18n/i18n.svelte';

	interface Props {
		value: string;
		/** Що це за код — для тих, хто його не бачить. */
		label: string;
	}

	let { value, label }: Props = $props();

	/**
	 * QR — ЄДИНИЙ СПОСІБ ПЕРЕДАТИ ПОСИЛАННЯ НА ТЕЛЕФОН, ЯКИЙ ПОРУЧ.
	 *
	 * Скопіювати посилання можна лише туди, куди воно й так дійде: у месенджер,
	 * у пошту. А телефон стоїть за метр від екрана, і переписувати з нього
	 * шістдесят символів ключа руками не буде ніхто. Камера читає це за секунду.
	 *
	 * ## Чому одна фігура, а не дві тисячі квадратиків
	 *
	 * У коді на це посилання 49×49 модулів. Кожен окремим `<rect>` — це під
	 * дві з половиною тисячі вузлів DOM у вікні, яке відкривають на секунду.
	 * Тому всі темні модулі складаються в ОДИН контур `<path>`: браузер малює
	 * його за один прохід, а розмітка лишається на три рядки.
	 *
	 * ## Чому не `{@html}`
	 *
	 * Бібліотека вміє віддати готовий `<svg>` рядком, і це найкоротший шлях. Але
	 * вставляти в сторінку сирий HTML заради картинки, яку ми й так описуємо
	 * самі, — зайва звичка: одного дня в такий рядок потрапить чужий текст.
	 * Тут з бібліотеки береться лише мапа «темний / світлий».
	 */
	const code = $derived.by(() => {
		// `0` — автоматичний розмір: бібліотека сама добере найменший, у який
		// влізе рядок. `M` — середня стійкість до пошкоджень: екран не папір,
		// рвати його нема чому, а нижча стійкість дає дрібнішу сітку.
		const qr = qrcode(0, 'M');
		qr.addData(value);
		qr.make();

		const size = qr.getModuleCount();
		const parts: string[] = [];
		for (let row = 0; row < size; row += 1) {
			for (let column = 0; column < size; column += 1) {
				if (qr.isDark(row, column)) parts.push(`M${column} ${row}h1v1h-1z`);
			}
		}

		return { size, path: parts.join('') };
	});
</script>

<svg
	class="qr"
	viewBox="-1 -1 {code.size + 2} {code.size + 2}"
	role="img"
	aria-label={label}
	data-testid="qr-code"
>
	<title>{label} — {t('player.connectQuick')}</title>
	<!--
		Тло біле завжди, і це не забутий токен теми: код читає КАМЕРА, а вона
		чекає темного на світлому. На темній темі інверсія ламає розпізнавання в
		половини телефонів.
	-->
	<rect x="-1" y="-1" width={code.size + 2} height={code.size + 2} fill="#ffffff" />
	<path d={code.path} fill="#000000" />
</svg>

<style>
	.qr {
		display: block;
		width: 100%;
		max-width: 220px;
		height: auto;
		border-radius: var(--radius-sm);
		/* Тиха рамка: на світлій темі білий код інакше зливається з карткою. */
		box-shadow: 0 0 0 1px var(--border);
	}
</style>
