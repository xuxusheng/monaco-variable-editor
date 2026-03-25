#!/bin/sh
set -e

if [ -z "$SKIP_MIGRATE" ]; then
  echo "正在执行数据库迁移..."
  MAX_RETRIES=3
  RETRY_COUNT=0

  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    MIGRATE_OUTPUT=$(bunx prisma migrate deploy 2>&1)
    MIGRATE_EXIT_CODE=$?
    
    if [ $MIGRATE_EXIT_CODE -eq 0 ]; then
      break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
      echo "迁移失败 (第 $RETRY_COUNT/$MAX_RETRIES 次)，错误信息:"
      echo "$MIGRATE_OUTPUT"
      echo "5秒后重试..."
      sleep 5
    else
      echo "错误: 迁移在 $MAX_RETRIES 次尝试后仍然失败，应用启动中止"
      echo "最后的错误信息:"
      echo "$MIGRATE_OUTPUT"
      exit 1
    fi
  done
else
  echo "跳过数据库迁移"
fi

echo "正在启动应用..."
exec "$@"
