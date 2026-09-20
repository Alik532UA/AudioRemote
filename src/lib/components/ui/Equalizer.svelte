<script lang="ts">
	/**
	 * СМУЖКИ, ЩО РУХАЮТЬСЯ, ПОКИ ЙДЕ ЗВУК.
	 *
	 * Це НЕ візуалізація звуку й не прикидається нею: смужки живуть за своїм
	 * циклом і нічого не міряють. Завдання в них одне — відповісти на питання
	 * «воно взагалі грає?» з відстані, з якої тексту не видно. Доти рядок, що
	 * звучить, відрізнявся лише рамкою, а рамка стоїть і на паузі.
	 *
	 * Справжній аналіз через `AudioContext` тут коштував би дорого й дав би
	 * менше: щоб побачити смужки, які справді стрибають у такт, треба дивитися
	 * на екран — а в залі на нього не дивляться.
	 *
	 * Колір — `currentColor`: смужки стоять там само, де стояв би значок, і
	 * мусять бути того ж кольору, що й усе навколо.
	 */
	interface Props {
		/** Висота в пікселях. Типова підібрана під значок на 18px. */
		size?: number;
	}

	let { size = 16 }: Props = $props();
</script>

<span class="eq" style="--eq-size: {size}px" aria-hidden="true" data-testid="equalizer">
	<i></i><i></i><i></i>
</span>

<style>
	.eq {
		display: inline-flex;
		align-items: flex-end;
		gap: 2px;
		height: var(--eq-size);
	}

	.eq i {
		width: 3px;
		height: 40%;
		border-radius: 1px;
		background: currentColor;
		animation: eq 900ms ease-in-out infinite;
	}

	/*
	 * Різні затримки — інакше три смужки стрибали б як одна, і це читалося б
	 * радше як блимання помилки, ніж як звук.
	 */
	.eq i:nth-child(1) {
		animation-delay: -600ms;
	}

	.eq i:nth-child(2) {
		animation-delay: -300ms;
	}

	@keyframes eq {
		0%,
		100% {
			height: 30%;
		}
		50% {
			height: 100%;
		}
	}

	/*
	 * Хто вимкнув рух — той вимкнув і це. Смужки лишаються на місці й далі
	 * кажуть «тут звук», просто не стрибають: прибрати їх зовсім означало б
	 * забрати в такої людини єдину відмінність між «грає» і «на паузі».
	 */
	@media (prefers-reduced-motion: reduce) {
		.eq i {
			height: 70%;
			animation: none;
		}

		.eq i:nth-child(2) {
			height: 100%;
		}
	}
</style>
