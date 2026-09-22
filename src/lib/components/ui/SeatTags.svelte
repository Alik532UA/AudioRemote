<script lang="ts">
	/**
	 * ХТО САМЕ НА ЗВʼЯЗКУ — іменами, а не лише числом.
	 *
	 * «Підключено помічників: 2» відповідає на «скільки», і цього досить рівно
	 * доти, доки їх один. На двох і більше наступне питання виникає одразу — хто
	 * це, — а відповіді на екрані не було ніде, хоч підписи їдуть присутністю й
	 * лежать поруч невикористані.
	 *
	 * ## Показуються лише НАЗВАНІ
	 *
	 * Анонімний не дістає мітки «без імені»: така мітка не відповідає ні на що,
	 * а місце в рядку забирає. Скільки їх усього, каже число поруч — і різниця
	 * між числом і кількістю міток і є відповідь «решта не називалася».
	 */
	interface Props {
		/** Підписи тих, хто назвався. Порожньо — мітки не показуються зовсім. */
		names: readonly string[];
		testid: string;
	}

	let { names, testid }: Props = $props();
</script>

{#if names.length > 0}
	<p class="tags" data-testid={testid}>
		{#each names as name (name)}
			<span class="tag">{name}</span>
		{/each}
	</p>
{/if}

<style>
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gap-xs);
		margin: 0;
	}

	/* Та сама мітка, що й у журналі: одне питання — один вигляд відповіді. */
	.tag {
		padding: 0 6px;
		border: 1px solid currentcolor;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		font-size: 0.7rem;
		font-weight: 600;
		white-space: nowrap;
	}
</style>
