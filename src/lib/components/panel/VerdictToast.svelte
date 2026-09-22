<script lang="ts">
	import { t } from '$lib/i18n/i18n.svelte';
	import type { PanelVerdict } from '$lib/net/panelTypes';

	/**
	 * ВІДПОВІДЬ ЗВУКОРЕЖИСЕРА — ЗВЕРХУ ЕКРАНА, і це не смак.
	 *
	 * Помічник тримає планшет у руці й дивиться на сцену; коли він опускає очі,
	 * пальці вже лежать на панелі. Смуга внизу опинилася б під ними, а в
	 * центрі — поверх кнопок, тобто перекривала б рівно те, заради чого екран і
	 * відкритий. Угорі над панеллю вільно завжди.
	 *
	 * ## Три кольори й три слова
	 *
	 * «Зроблено» зелене, «не буде» червоне, «зараз не можу» жовте. Колір
	 * упізнається швидше за напис — але сам по собі він каже лише «щось
	 * сталося», тож слово лишається. Разом із ним лишається й підпис віджета:
	 * між проханням і відповіддю могло минути пів хвилини, і за цей час
	 * помічник міг попросити ще двічі.
	 *
	 * ## Зникає САМА
	 *
	 * Відповідь — новина, а не стан. Смуга, яку треба закрити рукою, коштувала б
	 * одного натискання в темряві щоразу, а висить вона над панеллю.
	 *
	 * ## …але не поки на неї дивляться (WCAG 2.2.1)
	 *
	 * «Зникає сама» і «зникає, поки читають» — різні речі. Успішний критерій
	 * 2.2.1 (рівень A) вимагає, щоб відлік, який людина не замовляла, можна було
	 * зупинити; NOTIFICATIONS § 3 називає це подвійним механізмом — курсор і
	 * фокус, обидва обовʼязкові. Курсор тут не примха: підпис віджета плюс
	 * відповідь — це два рядки, які читають, тримаючи планшет, і перше, що
	 * робить палець, — лягає на текст.
	 *
	 * Продовжується РЕШТА строку, а не повний: інакше палець, що двічі зачепив
	 * смугу, тримав би її на екрані півхвилини, а вона висить над кнопками.
	 *
	 * Другої половини механізму — паузи анімації прогрес-бара — тут немає, бо
	 * немає й бара: смуга не показує, скільки їй лишилося. Це свідомо. Бар над
	 * кнопками в темному залі — це рух у периферійному зорі там, де людина
	 * стежить за сценою.
	 */
	interface Props {
		verdict: PanelVerdict | null;
		/** Скільки тримати відповідь на екрані, мілісекунди. */
		shownMs: number;
		/** Строк вийшов — прибрати. Смуга себе не стирає: вердиктом володіє сторінка. */
		ondone: () => void;
	}

	let { verdict, shownMs, ondone }: Props = $props();

	/** Курсор або фокус усередині смуги. */
	let held = $state(false);

	/**
	 * Скільки ще показувати. Не реактивне: від нього не залежить жодна розмітка.
	 *
	 * Початковий нуль, а не `shownMs`: поза ефектом проп — це знімок першого
	 * кадру, і компілятор про це попереджає справедливо. Значення ставить сама
	 * поява відповіді, і рівно там воно й потрібне.
	 */
	let left = 0;
	/** Якій відповіді належить `left`. Нова відповідь дістає повний строк наново. */
	let counting: PanelVerdict | null = null;

	$effect(() => {
		if (verdict !== counting) {
			counting = verdict;
			left = shownMs;
		}
		if (!verdict || held) return;

		const from = Date.now();
		const timer = setTimeout(ondone, left);

		return () => {
			clearTimeout(timer);
			// Пауза й розмонтування — те саме прибирання; різниця лише в тому, чи
			// буде продовження. Тому решта строку рахується тут, а не в обробнику.
			left = Math.max(0, left - (Date.now() - from));
		};
	});
</script>

{#if verdict}
	<!--
		`aria-live="assertive"`, а не ввічливе `polite`: читалка мусить сказати це
		ПЕРЕБИВАЮЧИ — відповідь прийшла на те, чого людина зараз чекає.
	-->
	<!--
		`pointerenter`/`pointerleave`, а не `mouseenter`: на планшеті миші немає, а
		палець дає ту саму подію — і `pointerleave` браузер шле одразу за
		`pointerup`, коли палець піднімають. Тобто дотик ставить відлік на паузу
		рівно на час дотику й не лишає смугу висіти назавжди.

		`focusin`/`focusout` — для клавіатури: вони спливають, тож ловлять і фокус
		усередині смуги, якщо в ній колись зʼявиться посилання чи кнопка.
	-->
	<p
		class="toast toast--{verdict.kind}"
		role="status"
		aria-live="assertive"
		data-testid="info-verdict-text"
		onpointerenter={() => (held = true)}
		onpointerleave={() => (held = false)}
		onpointercancel={() => (held = false)}
		onfocusin={() => (held = true)}
		onfocusout={() => (held = false)}
	>
		{#if verdict.caption}<strong>{verdict.caption}</strong>{/if}
		<span>{t(`verdict.${verdict.kind}Said`)}</span>
	</p>
{/if}

<style>
	.toast {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--gap-xs);
		margin: 0;
		padding: var(--gap-sm) var(--gap);
		border: 1px solid currentcolor;
		border-radius: var(--radius-sm);
		font-size: 1.05rem;
		font-weight: 600;
		text-align: center;
	}

	.toast--done {
		color: var(--ok);
		background: color-mix(in oklab, var(--ok) 14%, var(--bg-surface));
	}

	.toast--no {
		color: var(--danger);
		background: color-mix(in oklab, var(--danger) 14%, var(--bg-surface));
	}

	.toast--wait {
		color: var(--warn);
		background: color-mix(in oklab, var(--warn) 14%, var(--bg-surface));
	}
</style>
