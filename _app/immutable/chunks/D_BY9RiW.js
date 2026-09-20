import{r as a,w as o}from"./BGNo18ys.js";const n="trail",c="trail.prev",i=30,l=Date.now();function f(t){try{const s=a(n,[]);s.push({at:Date.now()-l,step:t}),o(n,s.slice(-i))}catch{}}function h(){try{const t=a(n,[]);t.length>0&&o(c,t),o(n,[])}catch{}}const p=()=>a(n,[]),u=()=>a(c,[]);function T(){const t=(s,r)=>r.length===0?[]:[s,...r.map(e=>`  +${e.at}ms  ${e.step}`)];return["AudioRemote 0.0.39",navigator.userAgent,...t("— попередній сеанс (обривається там, де впало) —",u()),...t("— цей сеанс —",p())].join(`
`)}export{p as c,f as m,u as p,h as r,T as t};
//# sourceMappingURL=D_BY9RiW.js.map
