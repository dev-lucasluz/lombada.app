/**
 * Substituto de `demo.ts` no build de produção (ver `vite.config.ts`): o modo demonstração
 * e os dados de exemplo não entram no pacote publicado. Só existe em `npm run dev:demo`.
 */
export const isDemo = false;
export const demoDb = {} as typeof import("./demo").demoDb;
