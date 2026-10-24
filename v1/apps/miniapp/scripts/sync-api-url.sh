#!/usr/bin/env bash
# 一条命令解决「换网络后真机连不上后端」。
#
# 做的事：取 Mac 当前局域网 IP → 写进 .env → 重新构建 weapp → 校验产物里确实是新 IP。
# 用法：  cd v1/apps/miniapp && bash scripts/sync-api-url.sh
#
# 为什么需要它：TARO_APP_API_URL 是编译期常量（config/index.ts 的 defineConstants），
# 光改 .env 不重建，包里还是旧地址；而换一次网络 IP 就变一次。
# 这个脚本最后一步的「校验产物」就是专门抓那种「以为改了、其实没生效」的情况。

set -euo pipefail

cd "$(dirname "$0")/.."

IP="$(ipconfig getifaddr en0 || true)"
if [ -z "$IP" ]; then
  echo "❌ 没取到 en0 的 IP，请检查 Wi-Fi 是否已连接"
  exit 1
fi
URL="http://${IP}:8000"

echo "==> Mac 当前局域网 IP：${IP}"

# 记录构建前的产物地址，好看出变化
BEFORE="$(grep -ohE 'http://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+' dist/app.js 2>/dev/null | head -1 || true)"
echo "==> 构建前产物里的地址：${BEFORE:-（无，可能还没构建过）}"

# 更新 .env。注意：BSD sed 的空备份后缀必须写成 -i''（连着写）；
# 写成 -i ''（带空格）在本机环境下会被吞掉空参数，导致把替换表达式当成文件名而报错。
if grep -q '^TARO_APP_API_URL=' .env 2>/dev/null; then
  sed -i'' "s|^TARO_APP_API_URL=.*|TARO_APP_API_URL=${URL}|" .env
else
  printf '\nTARO_APP_API_URL=%s\n' "$URL" >> .env
fi
echo "==> .env 已更新为：$(grep '^TARO_APP_API_URL=' .env)"

echo "==> 重新构建 weapp……"
npm run build:weapp

# 关键：校验产物里真的是新地址，而不是「构建失败但没注意」
if grep -q "$URL" dist/app.js 2>/dev/null; then
  echo ""
  echo "✅ 构建成功，产物已指向 ${URL}"
  echo "   （${BEFORE:-无} → ${URL}）"
  echo "   最后一步：回微信开发者工具点「编译」——外部构建后工具不会自动刷新。"
else
  echo ""
  echo "❌ 产物里没找到 ${URL}，构建很可能失败了。请看上面的构建输出。"
  echo "   常见原因：端口被占用、node_modules 缺失、本机构建权限问题。"
  exit 1
fi
