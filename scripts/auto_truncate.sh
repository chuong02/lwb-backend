#!/bin/sh

INTERVAL="${CLEAN_INTERVAL_SECONDS:-1800}"
EXCLUDE_TABLES="${EXCLUDE_TABLES:-'django_migrations'}"

echo "[Auto-Clean] Cleaner daemon started."
echo "[Auto-Clean] Target DB: ${POSTGRES_DB}, User: ${POSTGRES_USER}"
echo "[Auto-Clean] Interval: ${INTERVAL}s. Excluded tables: ${EXCLUDE_TABLES}"

while true; do
  sleep "$INTERVAL"
  echo "[Auto-Clean] [$(date '+%Y-%m-%d %H:%M:%S')] ${INTERVAL}s elapsed. Initiating TRUNCATE..."

  if pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -q; then
    PGPASSWORD="${POSTGRES_PASSWORD}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "
      DO \$\$ 
      DECLARE 
          tbls TEXT; 
      BEGIN 
          SELECT string_agg(quote_ident(tablename), ', ') 
          INTO tbls 
          FROM pg_tables 
          WHERE schemaname = 'public' 
            AND tablename NOT IN (${EXCLUDE_TABLES}); 

          IF tbls IS NOT NULL THEN 
              EXECUTE 'TRUNCATE TABLE ' || tbls || ' RESTART IDENTITY CASCADE;'; 
              RAISE NOTICE 'Truncated tables: %', tbls;
          ELSE
              RAISE NOTICE 'No user tables to truncate.';
          END IF; 
      END \$\$;
    "
    if [ $? -eq 0 ]; then
      echo "[Auto-Clean] [$(date '+%Y-%m-%d %H:%M:%S')] Successfully truncated all data."
    else
      echo "[Auto-Clean] [$(date '+%Y-%m-%d %H:%M:%S')] Warning: TRUNCATE execution failed."
    fi
  else
    echo "[Auto-Clean] [$(date '+%Y-%m-%d %H:%M:%S')] Database is not ready, skipping cycle."
  fi
done
