import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useEffect } from 'react';
import { plansApi, paymentApi } from '../../services/api';
import { useStore } from '../../store';
import './index.scss';

interface PlanItem {
  code: string;
  name: string;
  quota: number;
  price_cents: number;
  features: string[];
}

export default function Member() {
  const { quota, userInfo, fetchQuota } = useStore();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchQuota();
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const data = await plansApi.getList();
      setPlans(data.items || []);
    } catch {
      Taro.showToast({ title: '获取方案列表失败', icon: 'none' });
    }
  };

  const currentPlanCode = quota?.plan_code || userInfo?.plan_code || 'free';

  const handleUpgrade = async (plan: PlanItem) => {
    if (plan.code === currentPlanCode) return;
    if (plan.price_cents === 0) {
      Taro.showToast({ title: '当前已是免费方案', icon: 'none' });
      return;
    }

    setLoading(true);
    try {
      const prepay = await paymentApi.createPrepay(plan.code);
      await Taro.requestPayment({
        timeStamp: prepay.timeStamp,
        nonceStr: prepay.nonceStr,
        package: prepay.package,
        signType: prepay.signType || 'MD5',
        paySign: prepay.paySign,
      });
      Taro.showToast({ title: '支付成功', icon: 'success' });
      fetchQuota();
    } catch (err: any) {
      if (err.errMsg?.includes('cancel')) {
        Taro.showToast({ title: '已取消支付', icon: 'none' });
      } else {
        Taro.showToast({ title: '支付失败，请重试', icon: 'none' });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (priceCents: number) => {
    return (priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2);
  };

  const quotaUsed = quota?.quota_used ?? 0;
  const quotaTotal = quota?.quota_total ?? 0;
  const progress = quotaTotal > 0 ? Math.min((quotaUsed / quotaTotal) * 100, 100) : 0;

  return (
    <View className='member-page'>
      <View className='member-header'>
        <Text className='header-title'>会员中心</Text>
        <Text className='header-sub'>解锁更多功能，提升工作效率</Text>
      </View>

      {quota && (
        <View className='current-plan-card'>
          <View className='current-plan-top'>
            <View className='current-plan-badge'>
              <Text className='badge-icon'>👑</Text>
              <Text className='badge-text'>{quota.plan_name || '免费版'}</Text>
            </View>
            <Text className='current-plan-label'>当前方案</Text>
          </View>
          <View className='quota-row'>
            <Text className='quota-used'>{quotaUsed}</Text>
            <Text className='quota-sep'>/</Text>
            <Text className='quota-total'>{quotaTotal === -1 ? '无限' : quotaTotal}张</Text>
          </View>
          <Text className='quota-label'>本月已使用 / 总配额</Text>
          <View className='progress-track'>
            <View className='progress-fill' style={{ width: `${progress}%` }} />
          </View>
        </View>
      )}

      <View className='plan-list'>
        {plans.map((plan) => {
          const isCurrent = plan.code === currentPlanCode;
          return (
            <View key={plan.code} className={`plan-card ${isCurrent ? 'current' : ''}`}>
              {isCurrent && <View className='current-tag'>当前方案</View>}
              <View className='plan-top'>
                <Text className='plan-name'>{plan.name}</Text>
                <View className='plan-price-wrap'>
                  <Text className='plan-price'>¥{formatPrice(plan.price_cents)}</Text>
                  <Text className='plan-period'>/月</Text>
                </View>
              </View>
              <Text className='plan-quota'>
                {plan.quota === -1 ? '无限张/月' : `${plan.quota}张/月`}
              </Text>
              <View className='plan-features'>
                {plan.features.map((feature, idx) => (
                  <View key={idx} className='feature-item'>
                    <Text className='feature-check'>✓</Text>
                    <Text className='feature-text'>{feature}</Text>
                  </View>
                ))}
              </View>
              <Button
                className={`plan-btn ${isCurrent ? 'current' : ''}`}
                disabled={isCurrent || loading}
                onClick={() => handleUpgrade(plan)}
              >
                {isCurrent ? '当前方案' : plan.price_cents === 0 ? '免费开始' : '升级'}
              </Button>
            </View>
          );
        })}
      </View>
    </View>
  );
}
