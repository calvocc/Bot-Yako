#!/bin/sh
# Corre las migraciones antes de levantar el bot, igual que hacia el
# "pre-deploy command" de Railway: si una migracion falla, el contenedor
# no arranca y Dokploy no promueve el despliegue.
set -e

echo "Aplicando migraciones..."
node_modules/.bin/tsx src/db/migrate.ts

exec node dist/main
