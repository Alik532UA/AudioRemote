/**
 * ЗНАЧКИ — ОДИН ІМПОРТ НА ЗАСТОСУНОК, І ЛИШЕ ГЛИБОКИЙ.
 *
 * `import { X } from '@lucide/svelte'` — це імпорт БАРЕЛЯ, за яким стоїть
 * близько двох тисяч компонентів. Tree-shaking відкидає їх аж наприкінці, а
 * розібрати мусить усі: заміряно тут 2026-09-19 — збірка впала з
 * «FATAL ERROR: Zone Allocation failed - process out of memory» ще на етапі
 * `transforming`, і жодного рядка про значки в помилці не було.
 *
 * Глибокий шлях (`@lucide/svelte/icons/<файл>`) тягне рівно один компонент.
 * Імена файлів — kebab-case, і вони НЕ збігаються з іменами експортів бареля,
 * тож перелік тут заразом працює словником «як це називається насправді».
 *
 * Гейт `src/icon-imports.test.ts` червоніє на будь-якому барельному імпорті в
 * `src/` — інакше наступний доданий значок поверне ту саму помилку, а причина
 * знову не буде названа в жодному рядку логу.
 */
export { default as IconBoard } from '@lucide/svelte/icons/monitor-speaker';
export { default as IconPhone } from '@lucide/svelte/icons/smartphone';
export { default as IconTrash } from '@lucide/svelte/icons/trash-2';
export { default as IconPlay } from '@lucide/svelte/icons/play';
export { default as IconPause } from '@lucide/svelte/icons/pause';
export { default as IconStop } from '@lucide/svelte/icons/square';
export { default as IconNext } from '@lucide/svelte/icons/skip-forward';
export { default as IconPrev } from '@lucide/svelte/icons/skip-back';
export { default as IconVolume } from '@lucide/svelte/icons/volume-2';
export { default as IconMute } from '@lucide/svelte/icons/volume-x';
export { default as IconFolder } from '@lucide/svelte/icons/folder-open';
export { default as IconRefresh } from '@lucide/svelte/icons/refresh-cw';
export { default as IconEye } from '@lucide/svelte/icons/eye';
export { default as IconEyeOff } from '@lucide/svelte/icons/eye-off';
export { default as IconCopy } from '@lucide/svelte/icons/copy';
export { default as IconCheck } from '@lucide/svelte/icons/check';
export { default as IconDice } from '@lucide/svelte/icons/dices';
export { default as IconBack } from '@lucide/svelte/icons/arrow-left';
export { default as IconPower } from '@lucide/svelte/icons/power';
export { default as IconWarning } from '@lucide/svelte/icons/triangle-alert';
export { default as IconSettings } from '@lucide/svelte/icons/settings';
export { default as IconSun } from '@lucide/svelte/icons/sun';
export { default as IconMoon } from '@lucide/svelte/icons/moon';
export { default as IconKeyboard } from '@lucide/svelte/icons/keyboard';
export { default as IconUp } from '@lucide/svelte/icons/chevron-up';
export { default as IconDown } from '@lucide/svelte/icons/chevron-down';
export { default as IconSliders } from '@lucide/svelte/icons/sliders-horizontal';
export { default as IconInfo } from '@lucide/svelte/icons/info';
export { default as IconClose } from '@lucide/svelte/icons/x';
