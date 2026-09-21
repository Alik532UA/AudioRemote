<script lang="ts">
	import { asset } from '$app/paths';
	import { t } from '$lib/i18n/i18n.svelte';

	/**
	 * ЯК ЗІ МНОЮ ЗВʼЯЗАТИСЯ — і навіщо це в застосунку для залу.
	 *
	 * Застосунок стоїть у школі, а робив його одна людина. Коли щось не працює,
	 * або коли в сусідній школі питають «а нам такий самий зробите», питання
	 * впирається в те, що написати нема куди: у застосунку не було ЖОДНОЇ
	 * адреси. Лист «а хто це взагалі зробив» не пишуть — його просто не пишуть.
	 *
	 * ## Чому месенджери, а не форма
	 *
	 * Форма зворотного звʼязку вимагала б сервера, куди вона пише, і поштової
	 * скриньки, яку хтось читає. Месенджер уже відкритий у того, хто питає, і
	 * відповідь у ньому приходить того самого дня.
	 *
	 * ## Значки — ФАЙЛАМИ, а не інлайновим SVG
	 *
	 * Чотири значки — це близько семи кілобайтів розмітки. Вбудовані в сторінку,
	 * вони їхали б у кожну збірку разом із бюджетом, у якому зараз чотири
	 * кілобайти запасу (`check:bundle`). Файлами вони тягнуться лише тоді, коли
	 * людина відкрила налаштування, — тобто майже ніколи.
	 *
	 * Адреси взяті з сусіднього проєкту тієї самої людини
	 * (`teatralo4ka.odesa.ua`, `ContactMenuBody.svelte`) — щоб не завести другий
	 * перелік, який розійдеться з першим.
	 */
	const CONTACTS = [
		{ name: 'Telegram', url: 'https://t.me/alik532', icon: 'telegram.svg' },
		{ name: 'Viber', url: 'viber://chat?number=%2B380937251208', icon: 'viber.svg' },
		{ name: 'WhatsApp', url: 'https://wa.me/380937251208', icon: 'whatsapp.svg' },
		{ name: 'LinkedIn', url: 'https://linkedin.com/in/alik-qa-engineer', icon: 'linkedin.svg' }
	];
</script>

<section class="card stack" data-testid="contact-section">
	<h2 class="subtitle">{t('contact.title')}</h2>
	<p class="muted">{t('contact.lead')}</p>

	<ul class="what">
		<li>{t('contact.what1')}</li>
		<li>{t('contact.what2')}</li>
		<li>{t('contact.what3')}</li>
	</ul>

	<div class="links">
		{#each CONTACTS as contact (contact.name)}
			<!--
				`rel="noopener noreferrer"` обовʼязкове при `target="_blank"`: без
				`noopener` відкрита сторінка дістає посилання на цю вкладку.
			-->
			<a
				class="link"
				href={contact.url}
				target="_blank"
				rel="external noopener noreferrer"
				title={contact.name}
				aria-label={contact.name}
				data-testid="contact-{contact.name.toLowerCase()}-link"
			>
				<!--
					Без `loading="lazy"`: чотири значки разом важать сім кілобайтів, а
					відкладене завантаження в прокрутному вікні означає, що нижні два
					зʼявляться аж тоді, коли до них домотають. Заощадити тут нема на
					чому, а порожні квадрати до прокрутки видно одразу.
				-->
				<img src={asset(`/social/${contact.icon}`)} alt="" width="28" height="28" />
			</a>
		{/each}
	</div>
</section>

<style>
	.subtitle {
		font-size: 1.05rem;
	}

	.what {
		display: flex;
		flex-direction: column;
		gap: var(--gap-xs);
		margin: 0;
		padding-inline-start: var(--gap);
		color: var(--text-secondary);
		font-size: 0.9rem;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-sm);
	}

	/* Ціль — 44×44, хоч сам значок і 28: тиснуть у це пальцем на планшеті. */
	.link {
		display: grid;
		place-items: center;
		width: var(--tap);
		height: var(--tap);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg-surface-raised);
		transition: border-color var(--transition-fast);
	}

	.link:hover,
	.link:focus-visible {
		border-color: var(--accent);
	}

	@media (prefers-reduced-motion: reduce) {
		.link {
			transition: none;
		}
	}
</style>
