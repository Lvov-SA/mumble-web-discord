# Запуск с существующим global-caddy

Основной Compose запускает только Mumble Web + websockify. Портов на хосте он
не занимает. HTTPS и WebSocket обслуживает существующий Caddy из `~/lamast`.

## 1. Создать общую сеть один раз

На машине, где будут работать оба проекта:

```sh
docker network inspect caddy-proxy >/dev/null 2>&1 || docker network create caddy-proxy
```

## 2. Подключить существующий Caddy

В `~/lamast/compose.yaml` добавь сервису `caddy`:

```yaml
    networks:
      - default
      - caddy-proxy
```

На верхнем уровне добавь:

```yaml
networks:
  caddy-proxy:
    external: true
    name: caddy-proxy
```

Полный пример на основе твоего Compose: `docker/global-caddy.compose.example.yaml`.
Не удаляй существующие volumes, ports и переменные окружения.

Домен сайта: `voice.calcfit.ru`. Новые переменные для Caddy не нужны.

DNS этого домена должен указывать на сервер с `global-caddy`, а не обязательно
на Mumble-сервер. Сам Mumble может находиться на другой машине.

В конец **существующего** `~/lamast/Caddyfile` добавь блок из `docker/Caddyfile`:

```caddy
voice.calcfit.ru {
    encode zstd gzip
    reverse_proxy mumble-web:8080
}
```

Остальные блоки Snikket и лендингов сохрани. Копировать наш фрагмент поверх
полного Caddyfile не нужно.

## 3. Запустить Mumble Web

В этой рабочей копии `.env` уже настроен на твой Mumble. При переносе проекта
скопируй его отдельно: `.env` исключён из Git и контекста Docker.
Если файла нет, создай его из `.env.example` и укажи свой Mumble:

```dotenv
MUMBLE_SERVER=your-mumble-host:64738
CADDY_NETWORK=caddy-proxy
WEB_SIMPLE_LOGIN=true
WEB_ADDRESS=
WEB_PORT=
```

Из папки Mumble Web:

```sh
docker compose config --quiet
docker compose up -d --build --wait
```

### Простое подключение посетителей

По умолчанию посетитель вводит только имя и пароль Mumble и нажимает Connect.
Адрес и порт сайта подставляются автоматически, поля токенов и адреса скрыты.
В URL не нужно передавать настройки сервера. Пароль не хранится в конфигурации.

- `WEB_SIMPLE_LOGIN=true` — простая форма и фиксированный сервер; параметры
  `address`, `port` и `webrtc` из URL игнорируются.
- `WEB_ADDRESS=` — пустое значение берёт домен из адресной строки браузера.
- `WEB_PORT=` — пустое значение берёт порт из адресной строки, по умолчанию 443.
- При необходимости задай `WEB_ADDRESS=voice.calcfit.ru`, `WEB_PORT=443`.
  Это публичный адрес **сайта**, не IP и порт самого Mumble.
- `WEB_SIMPLE_LOGIN=false` возвращает расширенную форму подключения.

Переменные `WEB_*` публичны: контейнер генерирует из них `config.local.js` при
старте. Изменения `.env` применяются командой `docker compose up -d --wait`, без
пересборки образа. Пароли в эти переменные не записываются.

## 4. Применить настройки global-caddy

Добавление сети требует пересоздания контейнера. Одного reload
на этом шаге недостаточно. Существующие сертификаты останутся в volumes.
Короткий перезапуск затронет все сайты, обслуживаемые этим Caddy.

```sh
cd ~/lamast
docker compose config --quiet
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose up -d --no-deps caddy
docker compose logs --tail=50 caddy
```

В дальнейшем для изменений только Caddyfile достаточно:

```sh
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## 5. Подключиться

Открой `https://voice.calcfit.ru`. В диалоге введи только своё имя и пароль Mumble — адрес и порт подставятся автоматически. Адрес голосового сервера уже задан в `.env`.
Пароль вводится в браузере и не публикуется в статических файлах. WebRTC выключен.

Дополнительные внешние порты и проброс UDP для Mumble Web не нужны.
Если сайт вернул 502, проверь, что оба контейнера подключены к `caddy-proxy`,
а `mumble-web` запущен и healthy. Если сайт открывается, но подключение не проходит,
проверь адрес Mumble и его TCP-порт из контейнера.

## Проверка и остановка

Из папки Mumble Web:

```sh
docker compose ps
docker compose logs --tail=100 mumble-web
docker compose down
```

`down` останавливает только Mumble Web; внешний Caddy и общая сеть сохраняются.
Healthcheck проверяет выдачу сайта. Внешний Mumble и пароль проверяются входом
из браузера. Node.js и сборочные зависимости есть только в стадии сборки образа.

## Перенос готового образа: сборка на сервере не требуется

На малом сервере подготовка Git-зависимостей npm может быть завершена сигналом
SIGKILL. Возможная причина — нехватка памяти; её подтверждают системные логи OOM.
Можно перенести образ, собранный и проверенный на рабочей машине. Архитектура
образа должна совпадать с сервером (подготовленный архив — Linux amd64).

В текущей рабочей копии подготовлен файл
`artifacts/mumble-web-discord-amd64.tar.gz`. Отправь его и новый Compose:

```sh
scp artifacts/mumble-web-discord-amd64.tar.gz compose.yaml \
  lvov@81.17.154.81:~/mumble-web-discord/
```

На сервере:

```sh
cd ~/mumble-web-discord
docker load -i mumble-web-discord-amd64.tar.gz
docker-compose up -d --no-build
docker-compose ps
docker-compose logs --tail=30 mumble-web
```

Compose использует загруженный образ `mumble-web-discord:local` и существующий
`.env`. Параметр `--no-build` исключает повторную сборку на сервере. Дальнейшее
подключение Caddy выполняется как описано выше.

Для подготовки нового архива после изменений на рабочей машине:

```sh
docker compose build
docker save mumble-web-discord:local | gzip > artifacts/mumble-web-discord-amd64.tar.gz
```

При обновлении перенеси архив, выполни `docker load`, затем
`docker-compose up -d --no-build`.
