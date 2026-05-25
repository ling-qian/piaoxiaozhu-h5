import { View, Text, Button, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useStore } from '../../store';
import './index.scss';

const PLAN_NAMES: Record<string, string> = {
  free: '免费版',
  pro: '专业版',
  enterprise: '企业版',
};

const DEFAULT_AVATAR = 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI9FhqR6no4pKIrgIbEDk0YqIjYzS7JNibb2nZcTiaS6xFupbGBy1QcBcQ2Q';

export default function Mine() {
  const { userInfo, quota, logout, fetchUserInfo, fetchQuota } = useStore();

  const planName = userInfo?.plan_code
    ? PLAN_NAMES[userInfo.plan_code] || userInfo.plan_code
    : '免费版';

  const handleLogin = () => {
    Taro.login({
      success: (res) => {
        if (res.code) {
          useStore.getState().login(res.code);
        }
      },
    });
  };

  const handleLogout = () => {
    Taro.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          logout();
          Taro.showToast({ title: '已退出登录', icon: 'success' });
        }
      },
    });
  };

  const handleMenuClick = (action: string) => {
    switch (action) {
      case 'member':
        Taro.navigateTo({ url: '/pages/member/index' });
        break;
      case 'quota':
        showQuotaInfo();
        break;
      case 'toolkit':
        Taro.navigateTo({ url: '/pages/toolkit/index' });
        break;
      case 'about':
        showAboutInfo();
        break;
      default:
        break;
    }
  };

  const showQuotaInfo = () => {
    if (!quota) {
      Taro.showToast({ title: '暂无配额信息', icon: 'none' });
      return;
    }
    const total = quota.quota_total === -1 ? '无限' : String(quota.quota_total);
    Taro.showModal({
      title: '使用配额',
      content: `已使用：${quota.quota_used}张\n总配额：${total}张\n剩余：${quota.quota_remaining}张`,
      showCancel: false,
      confirmText: '知道了',
    });
  };

  const showAboutInfo = () => {
    Taro.showModal({
      title: '关于票小助',
      content: '票小助 - 智能票据管理助手\n版本：1.0.0\n为您提供便捷的票据识别、分类和管理服务，助力企业高效财税管理。',
      showCancel: false,
      confirmText: '知道了',
    });
  };

  return (
    <View className='mine-page'>
      <View className='user-header'>
        {userInfo ? (
          <View className='user-info'>
            <Image
              className='user-avatar'
              src={userInfo.avatar_url || DEFAULT_AVATAR}
              mode='aspectFill'
            />
            <View className='user-detail'>
              <Text className='user-name'>{userInfo.nickname || '用户'}</Text>
              <View className='user-plan-badge'>
                <Text className='plan-badge-text'>{planName}</Text>
              </View>
            </View>
          </View>
        ) : (
          <View className='login-entry'>
            <View className='login-avatar'>
              <Text className='login-icon'>👤</Text>
            </View>
            <Button className='login-btn' onClick={handleLogin}>
              点击登录
            </Button>
          </View>
        )}
      </View>

      <View className='menu-list'>
        <View className='menu-item' onClick={() => handleMenuClick('member')}>
          <View className='menu-left'>
            <Text className='menu-icon'>👑</Text>
            <Text className='menu-title'>我的方案</Text>
          </View>
          <Text className='menu-arrow'>›</Text>
        </View>

        <View className='menu-item' onClick={() => handleMenuClick('quota')}>
          <View className='menu-left'>
            <Text className='menu-icon'>📊</Text>
            <Text className='menu-title'>使用配额</Text>
          </View>
          <View className='menu-right'>
            {quota && (
              <Text className='menu-value'>
                {quota.quota_used}/{quota.quota_total === -1 ? '∞' : quota.quota_total}
              </Text>
            )}
            <Text className='menu-arrow'>›</Text>
          </View>
        </View>

        <View className='menu-item' onClick={() => handleMenuClick('toolkit')}>
          <View className='menu-left'>
            <Text className='menu-icon'>🧰</Text>
            <Text className='menu-title'>工具箱</Text>
          </View>
          <Text className='menu-arrow'>›</Text>
        </View>

        <View className='menu-item' onClick={() => handleMenuClick('about')}>
          <View className='menu-left'>
            <Text className='menu-icon'>ℹ️</Text>
            <Text className='menu-title'>关于票小助</Text>
          </View>
          <Text className='menu-arrow'>›</Text>
        </View>
      </View>

      {userInfo && (
        <Button className='logout-btn' onClick={handleLogout}>
          退出登录
        </Button>
      )}
    </View>
  );
}
