<script lang="ts">
	import { untrack } from 'svelte';
	import { t } from '$lib/i18n/i18n.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import Switch from '$lib/components/ui/Switch.svelte';

	/**
	 * ТРЕТЯ РОЛЬ — окремою смугою, і окремим файлом теж.
	 *
	 * Вікно, у якому вона стоїть, відповідає на одне питання: «як підключити
	 * пульт». Це — інше питання й інше рішення: чи дозволяти з того пульта
	 * міняти саму дошку. Поставлене в ряд зі способами, воно читалося б як ще
	 * один спосіб, а це не спосіб.
	 *
	 * ЧОМУ ОКРЕМИЙ КОМПОНЕНТ. Бо третя роль є не в кожного виду дошки: в
	 * інфодошки адмінського каналу поки немає взагалі, і те саме вікно
	 * підключення відкривається там без цієї смуги. Гілка `{#if}` усередині
	 * вікна означала б, що кожна наступна правка адміністратора мусить питати,
	 * чи вона не про інфодошку.
	 *
	 * НАМІР І СТАН — РІЗНІ РЕЧІ, і саме тому тут два прапорці. `on` каже, чи
	 * канал відкритий насправді; `wanted` — чи людина зараз хоче його мати. Між
	 * ними живе введення пароля: перемикач уже увімкнено, поле показано, а
	 * каналу ще немає й бути не може, бо пароля ніхто не ввів.
	 */
	interface Props {
		/** Чи відкритий канал адміністратора зараз. */
		on: boolean;
		/** Другий пароль, якщо він уже заданий, — щоб було що показати. */
		password?: string;
		/** Увімкнути з цим паролем, або вимкнути зовсім (`null`). */
		onapply: (password: string | null) => Promise<void>;
	}

	let { on, password = '', onapply }: Props = $props();

	let wanted = $state(untrack(() => on));
	let draft = $state(untrack(() => password));
	let busy = $state(false);
</script>

<!--
	СМУГА ЗАГЛИБЛЕНА, як смуга адміністратора на самому пульті (`adminbar` у
	`remote/+page.svelte`): однакове рішення виглядає однаково на обох екранах,
	і жодного разу — як інструкція. Доти вона носила той самий заголовок, що й
	колонки способів, і не мала їхньої рамки — тобто позичала мову карток, не
	будучи карткою, і око не могло вирішити, це четверта секція чи підвал вікна.
-->
<section class="admin">
	<div class="admin__head">
		<h3 class="admin__title">{t('admin.title')}</h3>
		<Switch
			checked={wanted}
			label={t('admin.allow')}
			testid="admin-allow"
			onchange={(next) => {
				wanted = next;
				if (!next) void onapply(null);
			}}
		/>
	</div>

	{#if wanted}
		<div class="admin__form">
			<PasswordField
				id="admin-password"
				label={t('admin.password')}
				bind:value={draft}
				autocomplete="off"
			/>
			<button
				class="btn btn--primary"
				type="button"
				disabled={draft.trim().length === 0 || busy}
				onclick={async () => {
					busy = true;
					await onapply(draft);
					busy = false;
				}}
				data-testid="admin-apply"
			>
				{on ? t('admin.change') : t('admin.turnOn')}
			</button>
		</div>
		<p class="muted">{on ? t('admin.onHint') : t('admin.hint')}</p>
	{:else}
		<p class="muted">{t('admin.offHint')}</p>
	{/if}
</section>

<style>
	.admin {
		display: flex;
		flex-direction: column;
		gap: var(--gap-sm);
		padding: var(--gap);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-sunken);
	}

	.admin__head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--gap-sm) var(--gap);
	}

	/* Той самий зріст, що й у заголовків колонок сусіднього вікна. */
	.admin__title {
		font-size: 0.95rem;
	}

	/*
	 * Кнопка ПІД полем, а не поруч.
	 *
	 * Поруч вона з'їжджала: під полем пароля завжди є рядок підказок (Caps Lock,
	 * розкладка), і вирівняна по низу кнопка опинялася нижче за поле, а
	 * вирівняна по верху — вище за нього. Обидва варіанти читалися як збита
	 * верстка. Під полем вона стоїть там, куди веде погляд після набору.
	 *
	 * Поле при цьому вужче за смугу: у ньому пароль із кількох слів, а не абзац.
	 */
	.admin__form {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--gap-sm);
		max-width: 380px;
	}

	.admin__form :global(.field) {
		width: 100%;
	}
</style>
