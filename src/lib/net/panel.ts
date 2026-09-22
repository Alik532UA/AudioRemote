import { boardPath } from '$lib/board/boardPath';
import { connect } from './firebase';
import { type Panel, type PanelState, type PanelVerdict, type VerdictKind } from './panelTypes';

/**
 * ПАНЕЛЬ ІНФОДОШКИ В БАЗІ: що на ній стоїть і в якому воно положенні.
 *
 * Окремо від `board.ts` з тієї самої причини, з якої там окремо живуть команди
 * й присутність: це інші дані з іншим письменником. `board.ts` знає бібліотеку
 * й стан плеєра — речі, яких в інфодошки немає взагалі. Спільною лишається
 * рівно адреса дошки.
 *
 * Обидва вузли пише ГОСПОДАР, і це не формальність, а те, на чому тримаються
 * правила доступу (див. докблок `panelTypes.ts`). Помічник надсилає НАМІР
 * командою, господар обчислює нове положення й кладе його назад.
 */

const panelNode = (key: string) => `${boardPath(key)}/panel`;
const stateNode = (key: string) => `${boardPath(key)}/panelState`;
const verdictNode = (key: string) => `${boardPath(key)}/panelVerdict`;

/**
 * Порожня панель — п'ятнадцять порожніх комірок.
 *
 * Окремою функцією, а не константою: об'єкт-константа один на застосунок, і
 * перший же редактор, що допише в нього комірку, змінив би «порожню панель»
 * для всіх наступних.
 */
export const emptyPanel = (): Panel => ({ rev: 0, cells: {} });

/** Викласти панель цілком. Номер редакції піднімає той, хто кличе. */
export async function publishPanel(key: string, panel: Panel): Promise<void> {
	const { db } = await connect();
	const { ref, set } = await import('firebase/database');
	await set(ref(db, panelNode(key)), panel);
}

/** Підписка на панель. `null` — панелі ще немає. Повертає відписку. */
export async function watchPanel(
	key: string,
	onPanel: (panel: Panel | null) => void
): Promise<() => void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');
	return onValue(ref(db, panelNode(key)), (snapshot) => onPanel(snapshot.val() as Panel | null));
}

/**
 * Викласти положення органів.
 *
 * `atServer` ставить САМА БАЗА, а не той, хто кличе: годинник пристрою в залі
 * розходиться з серверним, а правило звіряє мітку з `now`. Те саме рішення й з
 * тієї самої причини, що в `publishState` для аудіодошки.
 */
export async function publishPanelState(
	key: string,
	state: Omit<PanelState, 'atServer'>
): Promise<void> {
	const { db } = await connect();
	const { ref, serverTimestamp, set } = await import('firebase/database');
	/*
	 * Порожні мапи НЕ пишуться. RTDB не зберігає порожній об'єкт — вузол із ним
	 * просто не з'являється, — тож `levels: {}` дав би запис, який при читанні
	 * виглядає інакше, ніж при записі, і на це рано чи пізно хтось спирався б.
	 */
	const payload: Record<string, unknown> = { atServer: serverTimestamp() };
	if (state.levels && Object.keys(state.levels).length > 0) payload.levels = state.levels;
	if (state.flags && Object.keys(state.flags).length > 0) payload.flags = state.flags;
	/*
	 * Останнє натискання — щоб його побачили ВСІ, а не лише той, хто натиснув.
	 * `undefined` у полях RTDB не приймає взагалі, тож необов'язкове значення
	 * дописується окремо, а не лягає в об'єкт із дірою.
	 */
	if (state.press) {
		const { cell, type, value } = state.press;
		payload.press = { cell, type, ...(value === undefined ? {} : { value }) };
	}
	await set(ref(db, stateNode(key)), payload);
}

/** Підписка на положення органів. `null` — ще нічого не чіпали. */
export async function watchPanelState(
	key: string,
	onState: (state: PanelState | null) => void
): Promise<() => void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');
	return onValue(ref(db, stateNode(key)), (snapshot) =>
		onState(snapshot.val() as PanelState | null)
	);
}

/**
 * ВІДПОВІСТИ НА ПРОХАННЯ. Пише господар — той самий єдиний письменник.
 *
 * Час серверний, і це не педантизм: помічник по ньому вирішує, чи відповідь
 * стосується його прохання, чи висить із минулої вистави. Годинник планшета в
 * залі й годинник за пультом розходяться на хвилини.
 */
export async function publishVerdict(
	key: string,
	kind: VerdictKind,
	cell: string,
	caption: string
): Promise<void> {
	const { db } = await connect();
	const { ref, serverTimestamp, set } = await import('firebase/database');
	await set(ref(db, verdictNode(key)), { kind, cell, caption, at: serverTimestamp() });
}

export async function watchVerdict(
	key: string,
	onVerdict: (verdict: PanelVerdict | null) => void
): Promise<() => void> {
	const { db } = await connect();
	const { onValue, ref } = await import('firebase/database');
	return onValue(ref(db, verdictNode(key)), (snapshot) =>
		onVerdict(snapshot.val() as PanelVerdict | null)
	);
}
