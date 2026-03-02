# Backend Staging Checklist

## Before Testing

- Потвърди, че staging/production ползва собствен `.env` и собствен `DB_PATH`, а не локалния test файл.
- Увери се, че примерните данни са изчистени и има поне 1 реален admin акаунт.
- Провери, че `public/uploads` има write права на сървъра.
- Потвърди, че Discord OAuth redirect URL сочи към staging/production домейна.

## OAuth Login

- Отвори `/login` и стартирай вход с Discord.
- Потвърди, че redirect-ът към Discord работи и връщането към `/auth/callback` завършва без `error` query param.
- Провери, че след login има валиден достъп до `/api/auth/me`.
- Направи logout и refresh на страницата, за да потвърдиш, че сесията е наистина затворена.
- Повтори login с banned акаунт и потвърди, че достъпът е блокиран.

## Upload Pipeline

- Качи `jpg` или `png` през admin upload endpoint или admin UI.
- Потвърди, че файлът се записва в `/uploads/...` и публичният URL връща `200`.
- Провери, че резултатът е оптимизиран до `.webp`, когато оптимизацията е включена.
- Качи невалиден тип файл, например `.txt`, и потвърди `400`.
- Качи файл над лимита и потвърди `413`.

## Payment Flow

- С потребител без активен план създай заявка за абонамент.
- Потвърди, че reference code, IBAN и price breakdown се връщат коректно.
- Валидирай промо код: един валиден, един невалиден и един изчерпан.
- Потвърди заявката като admin и провери, че:
- `payment_references.status` става `confirmed`
- потребителят получава `subscription_plan_id`
- `subscription_expires_at` се задава или удължава правилно
- Направи reject на отделна заявка и провери, че rejection reason се пази.
- Експортирай users и payments CSV и отвори файла в spreadsheet приложение.

## Support And Notifications

- Създай support ticket като user.
- Отговори като admin и потвърди, че user получава notification.
- Маркирай едно notification като прочетено и после тествай `read all`.
- Провери, че audit log съдържа действията за support reply/status update.

## After Go-Live

- Потвърди, че базата е на сървъра и е извън git workflow-а.
- Потвърди, че има backup стратегия за SQLite файла и `-wal`/`-shm` файловете.
- Провери, че `data/*.db`, `data/*.db-wal` и `data/*.db-shm` остават игнорирани от git.
