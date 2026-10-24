import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useEffect, useState } from 'react';
import { paymentApi, pointsApi } from '../../services/api';
import { PAYMENT_ENABLED } from '../../config/features';
import { waitForOrderPaid } from '../../utils/orderStatus';
import './index.scss';
import { requireLogin } from '../../utils/authGate';

interface LogItem {
  action: string;
  delta: number;
  reason: string;
  created_at: string;
}

interface PackageItem {
  code: string;
  label: string;
  points: number;
  price_cents: number;
  unit_price_yuan: number;
}

/** 流水 action → 展示名与图标。后端改名时要同步这里。 */
const ACTION_META: Record<string, { label: string; icon: string }> = {
  signup_bonus: { label: '注册赠送', icon: '🎁' },
  daily_checkin: { label: '每日签到', icon: '📅' },
  purchase_grant: { label: '购买套餐', icon: '💳' },
  consume_invoice_ocr: { label: '票据识别', icon: '🧾' },
  consume_ai_analysis: { label: 'AI 经营分析', icon: '✨' },
  purchase_legacy: { label: '历史记录（不计积分）', icon: '📜' },
};

function formatTime(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PointsDetail() {
  const [items, setItems] = useState<LogItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [buying, setBuying] = useState(false);

  const loadAll = async () => {
    try {
      const [logs, info, pkgs] = await Promise.all([
        pointsApi.getLogs(50),
        pointsApi.getPoints(),
        pointsApi.getPackages(),
      ]);
      setItems(logs.items || []);
      setBalance(info.balance);
      setPackages(pkgs.items || []);
    } catch {
      // 加载失败保持空列表，由空态提示
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  /** 购买积分包：与套餐共用 prepay → requestPayment 流程，回调里只发积分、不改套餐 */
  const handleBuy = async (pkg: PackageItem) => {
    if (!PAYMENT_ENABLED) {
      Taro.showToast({ title: '支付功能即将开放', icon: 'none' });
      return;
    }
    if (!(await requireLogin())) return;
    if (buying) return;
    setBuying(true);
    try {
      const prepay = await paymentApi.createPrepay(pkg.code, 1);
      if (prepay.is_mock) {
        await paymentApi.mockComplete(prepay.order_id);
      } else {
        await Taro.requestPayment({
          timeStamp: prepay.timeStamp,
          nonceStr: prepay.nonceStr,
          package: prepay.package,
          signType: prepay.signType || 'RSA',
          paySign: prepay.paySign,
        });
      }
      // 支付结果以服务器订单状态为准（requestPayment 返回不可信）
      const paid = await waitForOrderPaid(prepay.order_id);
      if (paid) {
        Taro.showToast({ title: `已到账 ${pkg.points} 积分`, icon: 'success' });
      } else {
        Taro.showToast({ title: '支付结果确认中，可稍后在积分明细查看', icon: 'none', duration: 2500 });
      }
      await loadAll();
    } catch (err: any) {
      const errMsg: string = err?.errMsg || err?.message || '';
      Taro.showToast({
        title: errMsg.includes('cancel') ? '已取消支付' : err?.message || '支付失败',
        icon: 'none',
      });
    } finally {
      setBuying(false);
    }
  };

  return (
    <ScrollView scrollY className='points-page'>
      <View className='points-hero'>
        <Text className='hero-label'>当前积分</Text>
        <Text className='hero-value'>{balance ?? '—'}</Text>
        <Text className='hero-hint'>签到每日 +2 · 识别 1 分/张 · AI 分析 10 分/次</Text>
      </View>

      {packages.length > 0 && (
        <View className='log-card'>
          <Text className='log-title'>购买积分</Text>
          {packages.map((pkg) => (
            <View className='pkg-row' key={pkg.code} onClick={() => handleBuy(pkg)}>
              <View className='pkg-main'>
                <Text className='pkg-label'>{pkg.label}</Text>
                <Text className='pkg-desc'>约 ¥{pkg.unit_price_yuan}/分</Text>
              </View>
              <Text className='pkg-price'>¥{(pkg.price_cents / 100).toFixed(2)}</Text>
            </View>
          ))}
          {!PAYMENT_ENABLED && (
            <Text className='pkg-hint'>支付功能即将开放，届时可直接购买</Text>
          )}
        </View>
      )}

      <View className='log-card'>
        <Text className='log-title'>积分明细</Text>
        {loading && <Text className='log-empty'>加载中…</Text>}
        {!loading && items.length === 0 && <Text className='log-empty'>还没有积分记录</Text>}
        {items.map((item, idx) => {
          const meta = ACTION_META[item.action] || { label: item.action, icon: '•' };
          const isPlus = item.delta > 0;
          const isZero = item.delta === 0;
          return (
            <View className='log-row' key={`${item.created_at}-${idx}`}>
              <Text className='log-icon'>{meta.icon}</Text>
              <View className='log-main'>
                <Text className='log-label'>{meta.label}</Text>
                <Text className='log-time'>{formatTime(item.created_at)}</Text>
              </View>
              <Text className={`log-delta ${isZero ? 'zero' : isPlus ? 'plus' : 'minus'}`}>
                {isZero ? '0' : isPlus ? `+${item.delta}` : item.delta}
              </Text>
            </View>
          );
        })}
      </View>

      <View className='points-foot'>
        <Text className='foot-text'>
          积分获取：注册赠送 30 分、每日签到 +2 分、购买套餐按月发放。积分用于识别票据与 AI 经营分析。
        </Text>
      </View>
      <View className='bottom-gap' />
    </ScrollView>
  );
}
