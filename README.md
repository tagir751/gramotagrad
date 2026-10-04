# Грамотаград v2

Журнал / ученики / отчёты / воспитание — Next.js 16 + Prisma + SQLite.

## Быстрый старт (5 команд)

```bash
git clone https://github.com/tagir751/gramotagrad.git
cd gramotagrad
npm install
cp .env.example .env
npm run dev
```

Открой http://localhost:3000 → редирект на `/journal`.

## ENV

- Локально: `DATABASE_URL="file:./dev.db"`
- На Beget (SQLite ВНЕ DocumentRoot): `DATABASE_URL="file:../private/gramotagrad.db"`
- См. `.env.example`. Реальные `.env*`, `*.db`, `backup/` в git не хранятся.

## Тесты

```bash
npm run build
node scripts/test-seed.mjs
node scripts/test-run.mjs
```

Тестовые логины — только для локалки (см. `scripts/test-seed.mjs`, `scripts/local-passwords.mjs`).

## Гайд для агентов

- `AGENTS.md` — обязательные правила (Next.js 16 breaking changes).
- `DESIGN_PACK.md` — визуальный слепок для редизайна.
- `TEST_REPORT.md` — последний локальный прогон.

`main` = стабильный базлайн; фичи — ветки `feat/<name>`; гейт перед релизом — build + тесты.
