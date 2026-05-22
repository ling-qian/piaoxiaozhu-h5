import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useState } from 'react';
import { userApi } from '../../services/api';
import { useStore } from '../../store';
import './index.scss';

interface PlanItem {
  id: string;
  name: string;
  price: number;
  quota: number;
  features: string[];
  recommended: boolean;
}

const PLANS: PlanItem[] = [
  {
    id: 'free',
    name: '免费版',
    price: 0,
    quota: 10,
    features: ['每月10次识别', '基础票据类型', '单项目支持', '手动录入'],
    recommended: false,
  },
  {
    id: 'pro',
    name: '专业版',
    price: 29.9,
    quota: 200,
    features: ['每月200次识别', '全票据类型', '无限项目', '批量上传', '数据导出', '分类统计'],
    recommended: true,
  },
  {
    id: 'enterprise',
    name: '企业版',
    price: 99,
    quota: -1,
    features: ['无限次识别', '全票据类型', '无限项目', '批量上传', '数据导出', '分类统计', '团队协作', '专属客服', 'API接口'],
    recommended: false,
  },
];

export default function Member() {
  const { quota, userInfo } = useStore();
  const [upgrading, setUpgrading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('pro');

  const handleUpgrade = async (planId: string) => {
    if (planId === 'free') {
      Taro.showToast({ title: '当前已是免费版', icon: 'none' });
      return;
    }
    setUpgrading(true);
    try {
      await userApi.upgradePlan(planId);
      Taro.showToast({ title: '升级成功', icon: 'success' });
      useStore.getState().fetchQuota();
    } catch {
      Taro.showToast({ title: '升级失败', icon: 'none' });
    } finally {
      setUpgrading(false);
    }
  };

  const currentPlan = userInfo?.plan || 'free';

  return (
    <View className='member-page'>
      <View className='member-header'>
        <Text className='header-title'>会员中心</Text>
        <Text className='header-sub'>解锁更多功能，提升工作效率</Text>
      </View>

      <View className='current-plan'>
        <View className='plan-badge'>
          <Text className='badge-icon'>👑</Text>
          <Text className='badge-text'>当前方案：{PLANS.find((p) => p.id === currentPlan)?.name || '免费版'}</Text>
        </View>
        {quota && (
          <Text className='quota-text'>
            剩余识别次数：{quota.remaining} / {quota.total === -1 ? '无限' : quota.total}
          </Text>
        )}
      </View>

      <View className='plan-list'>
        {PLANS.map((plan) => (
          <View
            key={plan.id}
            className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''} ${plan.recommended ? 'recommended' : ''}`}
            onClick={() => setSelectedPlan(plan.id)}
          >
            {plan.recommended && <View className='recommend-tag'>推荐</View>}
            <View className='plan-header'>
              <Text className='plan-name'>{plan.name}</Text>
              <View className='plan-price-wrap'>
                <Text className='plan-price'>¥{plan.price}</Text>
                <Text className='plan-period'>/月</Text>
              </View>
            </View>
            <Text className='plan-quota'>
              {plan.quota === -1 ? '无限次识别' : `每月${plan.quota}次识别`}
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
              className={`plan-btn ${currentPlan === plan.id ? 'current' : ''}`}
              disabled={currentPlan === plan.id}
              onClick={(e) => {
                e.stopPropagation();
                handleUpgrade(plan.id);
              }}
              loading={upgrading && selectedPlan === plan.id}
            >
              {currentPlan === plan.id ? '当前方案' : '立即升级'}
            </Button>
          </View>
        ))}
      </View>
    </View>
  );
}
