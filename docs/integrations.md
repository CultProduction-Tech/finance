# Интеграции дашборда — где что лежит и как менять

> Справка. Секретов здесь нет — только адреса, имена переменных и ID (не секретные).
> Все значения переменных живут в `.env.local` (локально и на сервере), в гит НЕ коммитятся.

## Где лежат секреты

| Где | Путь |
|---|---|
| Локально | `<repo>/.env.local` |
| Прод | `201.34.133.194:/opt/finance/.env.local` (VPS, хост `msk-1-vm-sgvd`, root) |

> Адрес сменился между 29.07 и 10.08 (был `85.239.54.247` — сейчас недоступен).
> Если снова не пускает: `dig +short financial-dashboard.ru A`.

Значения локально и на проде совпадают. Посмотреть имена: `grep -oE '^[A-Z_]+' .env.local`.

---

## amoCRM

- **Портал:** https://cultteam.amocrm.ru (аккаунт «Cult», id 31629542)
- **API:** v4, эндпоинт `/api/v4/leads`. Код: [`src/lib/amocrm-client.ts`](../src/lib/amocrm-client.ts), конфиг воронок/полей: [`src/lib/entity-config.ts`](../src/lib/entity-config.ts).

### Переменные

| Переменная | Что | Значение (ID — не секрет) |
|---|---|---|
| `AMOCRM_BASE_URL` | адрес портала | `https://cultteam.amocrm.ru` |
| `AMOCRM_ACCESS_TOKEN` | **долгосрочный токен** (Bearer) — единственный секрет | скрыт; действует **до 21.04.2030** |
| `AMOCRM_PIPELINE_ID` | воронка Бластера | `10647114` |
| `AMOCRM_PIPELINE_ID_CULT` | воронка Култа | `7917842` |
| `AMOCRM_ACT_DATE_FIELD_ID` | поле «Дата акта» | `1253977` |
| `AMOCRM_PROJECT_STATUS_FIELD_ID` | поле статуса проекта | `1647625` |

> ID статусов воронки (Бриф передан, Подготовка КП, Реализовано и т.д.) и custom-полей («Бриф получен», «Маржа», «Взяли в работу») захардкожены в [`entity-config.ts`](../src/lib/entity-config.ts) — если в amoCRM пересоберут воронку, править там.

### Как заменить токен (когда протухнет / отзовут)

1. `cultteam.amocrm.ru` → **Настройки** → **Интеграции** → приватная интеграция дашборда → вкладка **«Ключи и доступы»** → сгенерировать новый **долгосрочный токен**.
2. Заменить `AMOCRM_ACCESS_TOKEN` в `/opt/finance/.env.local` на сервере (и в локальном `.env.local`).
3. `ssh root@201.34.133.194 'cd /opt/finance && pm2 restart finance'`.

### Как понять, что токен протух

- На дашборде загорится **красный бейдж «amoCRM недоступен — воронка не загружена»** (fail-loud, не тихие нули).
- Проверить вручную: `node --env-file=.env.local -e 'fetch(process.env.AMOCRM_BASE_URL+"/api/v4/account",{headers:{Authorization:"Bearer "+process.env.AMOCRM_ACCESS_TOKEN}}).then(r=>console.log(r.status))'` → `200` рабочий, `401` протух.
- ⚠️ Не путать с `429 Too Many Requests` — это rate-limit (частые запросы), токен при этом валиден. amoCRM банит за burst; в клиенте стоит семафор на 4 одновременных.

---

## PlanFact (финансы)

- **API:** `https://api.planfact.io`, v1. Код: [`src/lib/planfact-client.ts`](../src/lib/planfact-client.ts).
- Переменные: `PLANFACT_API_KEY` (Бластер), `PLANFACT_API_KEY_CULT` (Култ), `PLANFACT_API_URL`.
- Ключи — в личном кабинете PlanFact, у каждого юрлица свой. Замена — так же: env + `pm2 restart`.
- Кэш: 15 мин (сегодня/будущее) / 24ч (прошлые дни); кнопка «Обновить» сбрасывает. Семафор на 5 одновременных.
- ⚠️ `totalValuesByPeriod` в cashflow API всегда `null` — прогноз по дням берём через `/api/v1/operations` (плановые операции). Не полагаться на `standardPeriod`.

---

## Прочие переменные

| Переменная | Для чего |
|---|---|
| `AUTH_SECRET` | подпись сессий (magic-link). Обязателен в проде — без него приложение падает на старте (by design). |
| `RESEND_API_KEY` | отправка писем со ссылкой для входа (resend.com), домен `financial-dashboard.ru`. |
| `HUB_URL` / `HUB_SERVICE_TOKEN` | Feature Hub — проверка доступа к дашборду по email (опционально; нет → фолбэк на `AUTH_ALLOWED_DOMAINS`). |
| `AUTH_ALLOWED_DOMAINS` | домены, которым разрешён вход (cult.team, blasterstudio.ru). |
| `CRON_SECRET` | Bearer для `/api/cron/warmup-planfact` (прогрев снимков ПФ во вт/чт 23:50 МСК). Без него cron получит 401. |
| `INTERNAL_APP_URL` | опционально: origin для внутренних запросов прогрева (дефолт `http://127.0.0.1:3000`). |

### Прогрев PlanFact перед платёжными днями

Ср и пт–вс дашборд не обновляет деньги из ПФ (см. `planfact-freeze.ts`). Чтобы снимок был свежим:

1. Задать `CRON_SECRET` в `/opt/finance/.env.local`, `pm2 restart finance`.
2. Поставить crontab — пример: [`crontab-planfact-warmup.example`](./crontab-planfact-warmup.example) (вт/чт **23:50 Europe/Moscow**).
3. Проверка: `curl -sS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/cron/warmup-planfact`.

Эндпоинт греет KPI (текущий месяц + год) и cashflow для Бластера и Культа; в окно заморозки отвечает `skipped` и ничего не пишет.

Деплой и запуск — см. память проекта / `Dockerfile` не используется в проде (pm2 + `next start`, порт 3000).
