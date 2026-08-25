#!/usr/bin/env bash
#
# Serverni bir martalik tayyorlash (Ubuntu, root).
#
# ISHLATISH: repo klonlangandan keyin, repo ichidan turib:
#   cd /var/www/e-commerse-back
#   bash scripts/server-setup.sh
#
# Skript idempotent - bir necha marta ishlatsa ham zarar qilmaydi.
set -euo pipefail

DOMAIN="api.oco.uz"
APP_DIR="/var/www/e-commerse-back"
APP_NAME="e-commerse-back"

die() { echo "XATO: $*" >&2; exit 1; }
ok()  { echo "  ✓ $*"; }

# ---------------------------------------------------------------------------
# 0. Preflight - kerakli narsalar bormi
# ---------------------------------------------------------------------------
echo "==> 0/7  Tekshiruv"
[ "$(id -u)" -eq 0 ] || die "root bo'lib ishga tushiring"
[ -f "$APP_DIR/package.json" ] || die "$APP_DIR da loyiha yo'q. Avval git clone qiling."

command -v node >/dev/null || die "node o'rnatilmagan"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node 20+ kerak, hozir: $(node -v)"
ok "node $(node -v)"

command -v pm2 >/dev/null || die "pm2 o'rnatilmagan (npm i -g pm2)"
ok "pm2 $(pm2 -v)"

systemctl is-active --quiet mongod || die "mongod ishlamayapti (systemctl start mongod)"
ok "mongod ishlayapti"

# mongosh mongodb-org bilan doim kelavermaydi - alohida paket.
if ! command -v mongosh >/dev/null; then
  echo "  mongosh topilmadi, o'rnatilmoqda..."
  apt-get install -y mongodb-mongosh || die "mongosh o'rnatilmadi - qo'lda o'rnating"
fi
ok "mongosh $(mongosh --version)"

# ---------------------------------------------------------------------------
# 1. Paketlar
# ---------------------------------------------------------------------------
echo "==> 1/7  nginx + certbot"
apt-get update -qq
apt-get install -y nginx certbot python3-certbot-nginx
ok "nginx + certbot"

# ---------------------------------------------------------------------------
# 2. MongoDB -> single-node replica set
#
# MAJBURIY. Prisma interactive transaction'lari (orders.checkout,
# payments.payOrder) faqat replica set'da ishlaydi. Standalone mongod'da
# checkout "Transactions are not supported by this deployment" beradi.
# ---------------------------------------------------------------------------
echo "==> 2/7  MongoDB replica set (rs0)"
if ! grep -q "replSetName" /etc/mongod.conf; then
  cp /etc/mongod.conf "/etc/mongod.conf.bak.$(date +%s)"
  cat >>/etc/mongod.conf <<'EOF'

replication:
  replSetName: "rs0"
EOF
  systemctl restart mongod
  # mongod qayta ko'tarilishini kutamiz
  for _ in $(seq 1 30); do
    mongosh --quiet --eval 'db.adminCommand({ping:1})' >/dev/null 2>&1 && break
    sleep 1
  done
  ok "mongod.conf yangilandi va qayta ishga tushdi"
else
  ok "replSetName allaqachon sozlangan"
fi

# host'ni aniq 127.0.0.1 qilamiz - aks holda rs.initiate() mashina hostname'ini
# oladi va u DNS'da resolve bo'lmasa Prisma ulana olmaydi.
mongosh --quiet --eval '
  try {
    rs.status();
    print("  ✓ replica set allaqachon ishlayapti");
  } catch (e) {
    rs.initiate({_id:"rs0", members:[{_id:0, host:"127.0.0.1:27017"}]});
    print("  ✓ replica set yaratildi");
  }
'

# PRIMARY bo'lishini kutamiz - bo'lmasa keyingi `prisma db push` yiqiladi.
echo -n "  PRIMARY kutilmoqda"
for _ in $(seq 1 30); do
  if mongosh --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null | grep -q true; then
    echo " - tayyor"; break
  fi
  echo -n "."; sleep 2
done
mongosh --quiet --eval 'db.hello().isWritablePrimary' | grep -q true \
  || die "replica set PRIMARY bo'lmadi. Tekshiring: mongosh --eval 'rs.status()'"

# ---------------------------------------------------------------------------
# 3. .env
# ---------------------------------------------------------------------------
echo "==> 3/7  .env"
cd "$APP_DIR"
if [ ! -f .env ]; then
  cat >.env <<EOF
DATABASE_URL="mongodb://127.0.0.1:27017/e-commerse?replicaSet=rs0"

NODE_ENV=production
PORT=3000

JWT_ACCESS_SECRET="$(openssl rand -base64 48)"
JWT_REFRESH_SECRET="$(openssl rand -base64 48)"
JWT_ACCESS_EXPIRATION="15m"
JWT_REFRESH_EXPIRATION="7d"

# <<< QO'LDA TO'LDIRING: yangi Google App Password >>>
MAIL_USER=""
MAIL_PASS=""

OTP_TTL_MINUTES=10
OTP_RESEND_COOLDOWN_SECONDS=60

UPLOAD_PATH="./uploads"
EOF
  chmod 600 .env
  ok ".env yaratildi (JWT secretlar tasodifiy generatsiya qilindi)"
  echo "     ⚠  MAIL_USER va MAIL_PASS bo'sh - keyin to'ldiring"
else
  ok ".env allaqachon bor, tegilmadi"
fi

# ---------------------------------------------------------------------------
# 4. Build
# ---------------------------------------------------------------------------
echo "==> 4/7  Build"
# devDependencies kerak: nest CLI ham, prisma CLI ham o'sha yerda.
npm ci
npx prisma generate
npx prisma db push --skip-generate
npm run build
[ -f dist/main.js ] || die "build muvaffaqiyatsiz - dist/main.js yo'q"
ok "dist/main.js tayyor"

# ---------------------------------------------------------------------------
# 5. pm2
# ---------------------------------------------------------------------------
echo "==> 5/7  pm2"
mkdir -p /var/log/pm2
mkdir -p "$APP_DIR/uploads"

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js
fi
pm2 save
# server qayta yuklanganda pm2 avtomatik ko'tarilsin
pm2 startup systemd -u root --hp /root 2>/dev/null | grep '^sudo' | bash || true
ok "pm2 ishga tushdi"

# ---------------------------------------------------------------------------
# 6. nginx
# ---------------------------------------------------------------------------
echo "==> 6/7  nginx"
cp "$APP_DIR/nginx.conf.example" "/etc/nginx/sites-available/${DOMAIN}.conf"
ln -sf "/etc/nginx/sites-available/${DOMAIN}.conf" "/etc/nginx/sites-enabled/${DOMAIN}.conf"
# default sayt 80-portni egallab turmasin
rm -f /etc/nginx/sites-enabled/default
nginx -t || die "nginx konfiguratsiyasida xato"
systemctl reload nginx
ok "nginx sozlandi"

# ---------------------------------------------------------------------------
# 7. Firewall
# ---------------------------------------------------------------------------
echo "==> 7/7  Firewall"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 'Nginx Full' >/dev/null
  ok "ufw: 80/443 ochildi"
else
  ok "ufw faol emas - o'tkazib yuborildi"
fi

# MongoDB tashqariga ochiq emasligini tekshiramiz
if ss -tlnp 2>/dev/null | grep -q '0.0.0.0:27017'; then
  echo "  ⚠  DIQQAT: MongoDB 0.0.0.0:27017 da tinglayapti - internetga ochiq!"
  echo "     /etc/mongod.conf da bindIp: 127.0.0.1 qiling."
fi

echo
echo "════════════════════════════════════════════"
echo "Tayyor. Lokal tekshiruv:"
echo "  curl -i http://127.0.0.1:3000/api/products"
echo
echo "Keyingi qadamlar:"
echo "  1) nano $APP_DIR/.env   → MAIL_USER / MAIL_PASS"
echo "  2) pm2 restart $APP_NAME"
echo "  3) DNS A yozuvi: $DOMAIN → $(curl -s -4 ifconfig.me 2>/dev/null || echo '<server-ip>')"
echo "  4) certbot --nginx -d $DOMAIN"
echo "════════════════════════════════════════════"
