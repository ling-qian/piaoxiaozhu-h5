import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState, useEffect } from 'react';
import { plansApi, paymentApi } from '../../services/api';
import type { PlanItem } from '../../services/api';
import { PAYMENT_ENABLED } from '../../config/features';
import { waitForOrderPaid } from '../../utils/orderStatus';
import { useStore } from '../../store';
import './index.scss';
import { requireLogin } from '../../utils/authGate';

export default function Member() {
  const { quota, userInfo, fetchQuota } = useStore();
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [remindEnabled, setRemindEnabled] = useState(false);

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
  const purchasedPlanCode = quota?.purchased_plan_code || '';
  const planExpired = quota?.plan_expired ?? false;
  // 后端返回 UTC ISO 字符串，交给 Date 转成本地时间再展示
  const planExpiresAt = quota?.plan_expires_at ? new Date(quota.plan_expires_at) : null;
  const purchasedPlanName = plans.find((p) => p.code === purchasedPlanCode)?.name || '';

  const formatExpiry = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;

  const handleUpgrade = async (plan: PlanItem) => {
    // 免费套餐不可下单；付费套餐都允许下单——对已购套餐再次下单即为续费，
    // 到期时间由后端在原有到期日上顺延叠加（见 services/subscription.py）。
    if (plan.price_cents === 0) {
      Taro.showToast({ title: '当前已是免费方案', icon: 'none' });
      return;
    }
    if (!PAYMENT_ENABLED) {
      Taro.showToast({ title: '支付功能即将开放', icon: 'none' });
      return;
    }
    // 下单要绑定到账号，未正式登录先授权
    if (!(await requireLogin())) return;

    setLoading(true);
    try {
      const prepay = await paymentApi.createPrepay(plan.code, periodMonths);

      if (prepay.is_mock) {
        // 后端未配置微信支付参数，走本地联调通道
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

      // ⚠️ requestPayment 的返回不代表真实扣款（真机调试模式会限制支付但调用
      // 仍可能正常返回）。支付结果以服务器订单状态为准：paid 才算成功。
      const paid = await waitForOrderPaid(prepay.order_id);
      if (paid) {
        Taro.showToast({ title: '支付成功', icon: 'success' });
      } else {
        Taro.showToast({
          title: '支付结果确认中，可在「我的方案」稍后查看',
          icon: 'none',
          duration: 2500,
        });
      }
      fetchQuota();
    } catch (err: any) {
      const errMsg: string = err?.errMsg || err?.message || '';
      if (errMsg.includes('cancel')) {
        Taro.showToast({ title: '已取消支付', icon: 'none' });
      } else {
        // 透出后端原因（如「支付功能暂未开放，请稍后再试」）。若一律提示
        // 「支付失败」，商户参数没配好这种问题会被误判成网络问题。
        Taro.showToast({ title: err?.message || '支付失败，请重试', icon: 'none' });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (priceCents: number) => {
    return (priceCents / 100).toFixed(priceCents % 100 === 0 ? 0 : 2);
  };

  // 到期提醒：模板 id 由后端下发（未配模板时为 null），据此决定是否展示入口。
  // 订阅授权是微信客户端的一次性动作，只能靠用户点按钮触发，无法后端替代。
  const planDaysLeft = quota?.plan_days_left ?? null;
  const subscribeTemplateId = quota?.subscribe_template_id ?? null;
  const canRemind = Boolean(quota?.can_remind_renewal && subscribeTemplateId);

  const handleSubscribeReminder = async () => {
    if (!subscribeTemplateId) return;
    try {
      // Taro 3.6 把这个接口的类型声明写成了支付宝专用参数 entityIds 必填，
      // 微信端只需要 tmplIds，因此这里对入参做一次显式断言。
      const option = { tmplIds: [subscribeTemplateId] } as any;
      const res = (await Taro.requestSubscribeMessage(option)) as Record<string, string>;
      const choice = res?.[subscribeTemplateId];
      if (choice === 'accept') {
        setRemindEnabled(true);
        Taro.showToast({ title: '已开启到期提醒', icon: 'success' });
      } else if (choice === 'reject') {
        Taro.showToast({ title: '已拒绝提醒', icon: 'none' });
      } else {
        // 'ban' / 'filter' 等：微信侧不允许，后端发送时会拿到 43101 并跳过
        Taro.showToast({ title: '未能开启提醒，请稍后重试', icon: 'none' });
      }
    } catch {
      Taro.showToast({ title: '开启提醒失败', icon: 'none' });
    }
  };

  // 计费周期：1 / 3 / 12 个月。折扣只影响价格，不影响发放积分。
  const [periodMonths, setPeriodMonths] = useState(1);

  const periodOf = (plan: PlanItem) =>
    plan.periods?.find((p) => p.months === periodMonths) || {
      months: 1,
      label: '1 个月',
      discount: 1,
      price_cents: plan.price_cents,
      points: plan.points_per_month,
    };

  return (
    <View className='member-page'>
      <View className='member-header'>
        <Text className='header-title'>会员中心</Text>
        <Text className='header-sub'>
          {PAYMENT_ENABLED ? '解锁更多功能，提升工作效率' : '升级功能即将开放，当前免费版可正常使用'}
        </Text>
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
            <Text className='quota-used'>{quota?.points_balance ?? 0}</Text>
            <Text className='quota-sep'>分</Text>
          </View>
          <Text className='quota-label'>
            当前积分余额 · 本月已用 {quota?.points_used_this_month ?? 0} 分
          </Text>
          <Text className='plan-expiry' style={{ marginTop: '8px' }}>
            识别 {quota?.points_cost_ocr ?? 1} 分/张 · AI 分析 {quota?.points_cost_ai ?? 10} 分/次
          </Text>
          {planExpiresAt && !planExpired && (
            <Text className='plan-expiry'>有效期至 {formatExpiry(planExpiresAt)}</Text>
          )}
          {!planExpired && planDaysLeft !== null && (
            <Text className='plan-days-left'>还剩 {planDaysLeft} 天</Text>
          )}
          {planExpired && planExpiresAt && (
            <Text className='plan-expiry plan-expiry--expired'>
              {`${purchasedPlanName || '付费套餐'}已于 ${formatExpiry(planExpiresAt)} 到期，续费后可继续使用`}
            </Text>
          )}
          {canRemind && (
            <View className='remind-row'>
              <Text className='remind-text'>
                {planExpired
                  ? '开启提醒，到期后微信会通知你续费'
                  : '开启提醒，到期前微信会通知你续费'}
              </Text>
              <View
                className={`remind-btn ${remindEnabled ? 'remind-btn--on' : ''}`}
                onClick={remindEnabled ? undefined : handleSubscribeReminder}
              >
                <Text className={`remind-btn-text ${remindEnabled ? 'disabled' : ''}`}>
                  {remindEnabled ? '已开启' : '开启提醒'}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* 支付未开放时隐藏价格与套餐列表，只展示「即将开放」提示；开关打开后自动恢复。 */}
      {PAYMENT_ENABLED ? (
        <View className='plan-list'>
          {/* 计费周期：折扣只减价格，不影响发放积分 */}
          <View className='period-bar'>
            {[
              { m: 1, l: '按月' },
              { m: 3, l: '按季 9 折' },
              { m: 12, l: '按年 8 折' },
            ].map((o) => (
              <Text
                key={o.m}
                className={`period-chip ${periodMonths === o.m ? 'period-chip--active' : ''}`}
                onClick={() => setPeriodMonths(o.m)}
              >
                {o.l}
              </Text>
            ))}
          </View>
          {plans.map((plan) => {
            const isCurrent = plan.code === currentPlanCode;
            // 已是当前套餐也允许再次下单：这就是按月续费入口
            const isRenewal = plan.price_cents > 0 && plan.code === purchasedPlanCode;
            const isFreeCurrent = plan.code === 'free' && isCurrent;
            return (
              <View key={plan.code} className={`plan-card ${isCurrent ? 'current' : ''}`}>
                {isCurrent && <View className='current-tag'>当前方案</View>}
                <View className='plan-top'>
                  <Text className='plan-name'>{plan.name}</Text>
                  <View className='plan-price-wrap'>
                    <Text className='plan-price'>¥{formatPrice(periodOf(plan).price_cents)}</Text>
                    <Text className='plan-period'>/{periodOf(plan).label}</Text>
                  </View>
                </View>
                <Text className='plan-quota'>
                  {plan.points_per_month > 0 ? `${periodOf(plan).points} 积分` : '注册送 30 积分'}
                  {' · '}
                  {plan.project_limit === -1 ? '无限项目' : `${plan.project_limit}个项目`}
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
                  className={`plan-btn ${isFreeCurrent ? 'current' : ''}`}
                  disabled={isFreeCurrent || loading}
                  onClick={() => handleUpgrade(plan)}
                >
                  {plan.price_cents === 0
                    ? isCurrent
                      ? '当前方案'
                      : '免费开始'
                    : isRenewal
                      ? '续费'
                      : '升级'}
                </Button>
              </View>
            );
          })}
        </View>
      ) : (
        <View className='coming-soon-card'>
          <Text className='coming-soon-title'>升级功能即将开放</Text>
          <Text className='coming-soon-text'>
            当前为免费版，票据识别、自动分类与报表功能均可正常使用。付费方案上线后会在这里通知你。
          </Text>
          <Button className='contact-btn' openType='contact'>
            有需求？点这里联系我们
          </Button>
        </View>
      )}
    </View>
  );
}
